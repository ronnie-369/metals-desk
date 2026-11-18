// Vercel serverless function. Pulls prices from Yahoo Finance and fund NAVs from AMFI,
// returns one JSON payload for index.html. Cached at the edge for 15 minutes.

const SYMBOLS = {
  gb:     ['GOLDBEES.NS',   '2y'],
  sb:     ['SILVERBEES.NS', '2y'],
  gold:   ['GC=F',          '1y'],
  silver: ['SI=F',          '1y'],
  fx:     ['INR=X',         '1y'],
  cny:    ['CNY=X',         '1y'],
};
import { kvGet, kvSet, kvReady } from '../lib/desk.js';
const UA = { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MetalsDesk/1.0)' } };

async function yahoo(symbol, range) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const r = await fetch(url, UA);
  if (!r.ok) throw new Error(`${symbol} ${r.status}`);
  const j = await r.json();
  const res = j.chart.result[0];
  const t = res.timestamp || [], c = res.indicators.quote[0].close || [];
  const series = [];
  for (let i = 0; i < t.length; i++) if (c[i] != null) series.push([t[i] * 1000, +c[i].toFixed(4)]);
  // Yahoo's chartPreviousClose is the close before the whole range, not yesterday.
  const lastDay = series.length ? new Date(series[series.length - 1][0]).toDateString() : '';
  const mktDay = new Date((res.meta.regularMarketTime || 0) * 1000).toDateString();
  const prevClose = res.meta.regularMarketPreviousClose
    || (series.length > 1 ? (lastDay === mktDay ? series[series.length - 2][1] : series[series.length - 1][1]) : null);
  return {
    price: res.meta.regularMarketPrice,
    prevClose,
    time: (res.meta.regularMarketTime || 0) * 1000,
    series,
  };
}

async function amfi() {
  const r = await fetch('https://www.amfiindia.com/spages/NAVAll.txt', UA);
  if (!r.ok) throw new Error(`AMFI ${r.status}`);
  const txt = await r.text();
  const out = {};
  for (const line of txt.split('\n')) {
    const p = line.split(';');
    if (p.length < 6) continue; // header is 8 columns: Code;ISIN;ISIN;Name;Plan;Option;NAV;Date
    const name = p[3], nav = parseFloat(p[p.length - 2]), date = p[p.length - 1].trim();
    if (!isFinite(nav)) continue;
    if (!name.startsWith('Nippon India')) continue;
    if (/Gold BeES/i.test(name) && !/FoF|Fund of Fund/i.test(name)) out.gb = { nav, date };
    if (/Silver ETF/i.test(name) && !/FoF|Fund of Fund/i.test(name)) out.sb = { nav, date };
  }
  return out;
}

// FRED daily series as [ms, value] pairs. Blank observations are skipped.
async function fred(id, days) {
  const start = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${start}`, UA);
  if (!r.ok) throw new Error(`FRED ${id} ${r.status}`);
  const out = [];
  for (const line of (await r.text()).split('\n').slice(1)) {
    const [d, v] = line.trim().split(',');
    if (d && v && v !== '.') out.push([Date.parse(d + 'T00:00:00Z'), +v]);
  }
  return out;
}

// Shanghai Gold Exchange benchmark (SHAU). The last PM round of each day is the PM benchmark, CNY per gram.
// The page returns at most 20 rows (about three trading days) per request, so we fetch short windows,
// three at a time with a timeout, because the exchange drops bursts of parallel requests.
async function sge(days, diag) {
  const d = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const windows = [];
  for (let from = days; from > 0; from -= 4) windows.push([from, Math.max(from - 3, 0)]);
  windows.reverse(); // newest first, so the latest fix lands even if later windows fail
  const one = async ([a, b]) => {
    const url = `https://www.sge.com.cn/sjzx/shanghaiAuAuto?start_date=${d(a)}&end_date=${d(b)}`;
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(url, { ...UA, signal: ctl.signal });
      const txt = r.ok ? await r.text() : '';
      diag.push({ window: [d(a), d(b)], status: r.status, bytes: txt.length });
      return txt;
    } catch (e) { diag.push({ window: [d(a), d(b)], error: e.message }); return ''; }
    finally { clearTimeout(t); }
  };
  const pages = [];
  for (let i = 0; i < windows.length; i += 3) pages.push(...await Promise.all(windows.slice(i, i + 3).map(one)));
  const byDay = {};
  for (const html of pages) {
    for (const row of html.match(/<tr[\s\S]*?<\/tr>/g) || []) {
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
      if (cells.length < 6 || cells[2] !== 'SHAU' || cells[3] !== '午盘') continue;
      const date = cells[1], round = +cells[4], price = +cells[5];
      if (!isFinite(price)) continue;
      if (!byDay[date] || round > byDay[date].round) byDay[date] = { round, price };
    }
  }
  return Object.keys(byDay).sort().map(k => [Date.parse(k + 'T00:00:00Z'), byDay[k].price]);
}

// Next Shanghai PM benchmark: weekdays, about 11:45 IST (14:15 Shanghai). Chinese public holidays are not modelled.
function nextSgeFix() {
  const IST = 5.5 * 36e5, now = new Date(Date.now() + IST);
  const t = new Date(now); t.setUTCHours(11, 45, 0, 0);
  if (t <= now) t.setUTCDate(t.getUTCDate() + 1);
  while (t.getUTCDay() === 0 || t.getUTCDay() === 6) t.setUTCDate(t.getUTCDate() + 1);
  const dd = String(t.getUTCDate()).padStart(2, '0'), mm = String(t.getUTCMonth() + 1).padStart(2, '0');
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][t.getUTCDay()];
  return `${dow} ${dd}/${mm}, about 11:45 IST`;
}

export default async function handler(req, res) {
  const keys = Object.keys(SYMBOLS);
  const jobs = keys.map(k => yahoo(...SYMBOLS[k]));
  const sgeDiag = [];
  jobs.push(amfi(), fred('DFII10', 400), fred('DGS10', 400), sge(40, sgeDiag));
  const settled = await Promise.allSettled(jobs);
  const data = { fetched: Date.now(), errors: [] };
  keys.forEach((k, i) => {
    if (settled[i].status === 'fulfilled') data[k] = settled[i].value;
    else data.errors.push(`${k}: ${settled[i].reason.message}`);
  });
  const extra = ['nav', 'realYield', 'nomYield', 'sge'];
  extra.forEach((k, i) => {
    const r = settled[keys.length + i];
    if (r.status === 'fulfilled') data[k] = r.value; else data.errors.push(`${k}: ${r.reason.message}`);
  });
  // Shanghai: keep the last good series in the store; fall back to it when the exchange does not answer.
  if (data.sge && data.sge.length) {
    if (kvReady()) kvSet('sge', { series: data.sge, saved: Date.now() }).catch(() => {});
  } else {
    data.sgeStale = true;
    data.sgeNext = nextSgeFix();
    if (kvReady()) {
      try {
        const stored = await kvGet('sge');
        if (stored && stored.series && stored.series.length) {
          data.sge = stored.series;
          const l = stored.series[stored.series.length - 1];
          data.sgeLast = { day: new Date(l[0]).toISOString().slice(0, 10), value: l[1] };
        }
      } catch (e) { data.errors.push('sge store: ' + e.message); }
    }
  }
  if (req.query && req.query.debug === 'sge') data.sgeDiag = sgeDiag;
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json(data);
}
