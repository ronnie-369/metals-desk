// Shared helpers: IBJA benchmark read and a tiny key-value store on Upstash Redis (Vercel KV).
// No npm dependencies; everything is plain fetch.

export const UA = { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MetalsDesk/1.0)' } };

// IBJA (India Bullion and Jewellers Association) daily rates. Gold per 10 g, silver per kg, before GST.
// The page carries an AM table and a PM table; the last row for the latest date is the PM fix.
export async function ibja() {
  const r = await fetch('https://ibjarates.com/', UA);
  if (!r.ok) throw new Error('IBJA ' + r.status);
  const html = await r.text();
  const rows = [];
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/g) || []) {
    const cells = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(m => m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
    if (cells.length < 7 || !/^\d{2}\/\d{2}\/\d{4}$/.test(cells[0])) continue;
    const n = cells.slice(1).map(v => parseFloat(v.replace(/,/g, '')));
    if (!isFinite(n[0])) continue;
    rows.push({ date: cells[0], gold999_10g: n[0], gold995_10g: n[1], gold916_10g: n[2], silver999_kg: n[5] });
  }
  if (!rows.length) throw new Error('IBJA: no rows parsed');
  const key = d => d.split('/').reverse().join('');
  const latest = rows.reduce((a, b) => key(b.date) >= key(a.date) ? b : a); // later occurrence wins on ties, so PM beats AM
  return { ...latest, gold999_g: latest.gold999_10g / 10, silver999_g: latest.silver999_kg / 1000, session: 'PM or latest published', source: 'https://ibjarates.com/' };
}

// Upstash Redis REST (what Vercel KV provisions). Set KV_REST_API_URL and KV_REST_API_TOKEN in the project.
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
export const kvReady = () => !!(KV_URL && KV_TOKEN);

async function kv(cmd) {
  const r = await fetch(KV_URL, { method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  if (!r.ok) throw new Error('KV ' + r.status);
  const j = await r.json();
  if (j.error) throw new Error('KV ' + j.error);
  return j.result;
}
export async function kvGet(key) { const v = await kv(['GET', key]); return v == null ? null : JSON.parse(v); }
export async function kvSet(key, value) { return kv(['SET', key, JSON.stringify(value)]); }
