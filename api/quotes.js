// Vercel serverless function. Pulls prices from Yahoo Finance and fund NAVs from AMFI,
// returns one JSON payload for index.html. Cached at the edge for 15 minutes.

const SYMBOLS = {
  gb:     ['GOLDBEES.NS',   '2y'],
  sb:     ['SILVERBEES.NS', '2y'],
  gold:   ['GC=F',          '1y'],
  silver: ['SI=F',          '1y'],
  fx:     ['INR=X',         '1y'],
};
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

export default async function handler(req, res) {
  const keys = Object.keys(SYMBOLS);
  const jobs = keys.map(k => yahoo(...SYMBOLS[k]));
  jobs.push(amfi());
  const settled = await Promise.allSettled(jobs);
  const data = { fetched: Date.now(), errors: [] };
  keys.forEach((k, i) => {
    if (settled[i].status === 'fulfilled') data[k] = settled[i].value;
    else data.errors.push(`${k}: ${settled[i].reason.message}`);
  });
  const nav = settled[keys.length];
  if (nav.status === 'fulfilled') data.nav = nav.value; else data.errors.push(`nav: ${nav.reason.message}`);
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json(data);
}
