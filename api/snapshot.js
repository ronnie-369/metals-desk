// Daily snapshot. Runs on the Vercel cron in vercel.json (weekdays, after NSE close) and can be called by hand.
// Stores one record per day in the key-value store so the site can show history and trends.
import { ibja, kvGet, kvSet, kvReady } from '../lib/desk.js';

export default async function handler(req, res) {
  const base = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL}`;
  const [q, c, ib] = await Promise.all([
    fetch(`${base}/api/quotes?snap=1`).then(r => r.json()).catch(() => null),
    fetch(`${base}/api/coins?snap=1`).then(r => r.json()).catch(() => null),
    ibja().catch(() => null),
  ]);
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // yyyy-mm-dd
  const last = s => s && s.length ? s[s.length - 1][1] : null;
  const rec = {
    day,
    gb: q?.gb?.price ?? null, sb: q?.sb?.price ?? null,
    gbNav: q?.nav?.gb?.nav ?? null, sbNav: q?.nav?.sb?.nav ?? null,
    gold: q?.gold?.price ?? null, silver: q?.silver?.price ?? null, usdinr: q?.fx?.price ?? null, usdcny: q?.cny?.price ?? null,
    realYield: last(q?.realYield), nomYield: last(q?.nomYield), sge: last(q?.sge),
    ibjaGold10g: ib?.gold999_10g ?? null, ibjaSilverKg: ib?.silver999_kg ?? null, ibjaDate: ib?.date ?? null,
    cheapest: c?.cheapest ? { name: c.cheapest.name, price: c.cheapest.price } : null,
    pricedSellers: c ? c.sellers.filter(s => s.price).length : 0,
  };
  if (rec.gold && rec.usdcny && rec.sge) rec.shanghaiPremium = (rec.sge / (rec.gold * rec.usdcny / 31.1035) - 1) * 100;
  if (rec.cheapest && rec.ibjaGold10g) rec.coinPremium = (rec.cheapest.price / (rec.ibjaGold10g * 1.03) - 1) * 100;
  if (rec.gb && rec.gbNav) rec.gbPremium = (rec.gb / rec.gbNav - 1) * 100;
  if (rec.sb && rec.sbNav) rec.sbPremium = (rec.sb / rec.sbNav - 1) * 100;

  if (!kvReady()) return res.status(200).json({ stored: false, reason: 'KV not configured', rec });
  const hist = (await kvGet('history')) || [];
  const i = hist.findIndex(h => h.day === day);
  if (i > -1) hist[i] = rec; else hist.push(rec);
  while (hist.length > 400) hist.shift();
  await kvSet('history', hist);
  await kvSet('ibja', ib);
  res.status(200).json({ stored: true, days: hist.length, rec });
}
