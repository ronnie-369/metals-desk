// Reads today's price of a 10 gram 24K gold coin or bar from Indian online stores.
// Every seller has its own page layout, so each read is best effort and reports its own status.
// Marketplaces that render prices by script or block automated reads are listed with a link and no number.

const UA = { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', 'Accept-Language': 'en-IN,en;q=0.9' } };
const LO = 60000, HI = 300000;
// Optional: set SCRAPER_KEY in Vercel to route bot-protected sellers through ScraperAPI. Without it they are attempted directly.
const KEY = process.env.SCRAPER_KEY || '';
const via = (url, s) => (KEY && s.proxy) ? `https://api.scraperapi.com/?api_key=${KEY}&country_code=in&url=${encodeURIComponent(url)}` : url; // plausible range for a 10 g 24K coin, INR, guards against reading a 1 g or 100 g price

const SOURCES = [
  { id: 'grt',     name: 'GRT Jewellers', type: 'Jeweller', product: '24KT 10g Leaf coin (9.98 g)',
    url: 'https://www.grtjewels.com/24kt-10-grams-leaf-gold-coin-pgc10lf01.html', read: 'regex', rx: /Leaf Gold Coin[\s\S]{0,600}?₹\s*([\d,]{5,9})/ },
  { id: 'senco',   name: 'Senco Gold & Diamonds', type: 'Jeweller', product: '24K (995) 10g Precious bar', proxy: true,
    url: 'https://sencogoldanddiamonds.com/products/precious-10g-gold-bar', read: 'regex', rx: /Total:?\s*₹\s*([\d,]+)/ },
  { id: 'pcj',     name: 'PC Jeweller', type: 'Jeweller', product: '10g 24K Floral coin',
    url: 'https://www.pcjeweller.com/en/productreview/id/24305/', read: 'regex', proxy: true, rx: /M\.R\.P\s*:?\s*₹\s*([\d,]+)/ },
  { id: 'reliance', name: 'Reliance Jewels', type: 'Jeweller', product: '10g 24K Goddess Laxmi coin',
    url: 'https://www.reliancejewels.com/24-karat-yellow-finish-10-grams-goddess-laxmi-gold-coin/all-jewellery/coins/product:520583/cid:190/', read: 'regex', proxy: true, rx: /Price\s*:?\s*₹?\s*([\d,]{5,8})/ },
  { id: 'malabar', name: 'Malabar Gold & Diamonds', type: 'Jeweller', product: '10g 24K (999) coin, SKU MGBRS999P10G', proxy: true,
    url: 'https://malabargoldanddiamonds.com/gold-coins.html', read: 'sku', sku: 'MGBRS999P10G' },
  { id: 'tanishq', name: 'Tanishq', type: 'Jeweller', product: 'Cheapest 10g 24 Karat coin listed',
    url: 'https://www.tanishq.co.in/shop/10-gram?lang=en_IN', read: 'min24k', proxy: true },
  { id: 'png',     name: 'PNG Jewellers', type: 'Jeweller', product: '10 Gram 24 KT (995) coin',
    url: 'https://www.pngjewellers.com/collections/gold-coin/products.json', read: 'shopify', match: /10 Gram/i },
  { id: 'mmtc',    name: 'MMTC-PAMP', type: 'Refiner', product: 'Lotus 24K (999.9) 10g bar',
    url: 'https://shop.mmtcpamp.com/lotus-24k-9999-10-gm-gold-bar', read: 'jsonld', proxy: true },
  { id: 'bangalore', name: 'Bangalore Refinery', type: 'Refiner', product: '10g 24kt (999) coin',
    url: 'https://www.bangalorerefinery.com/products/10-gram-24kt-999-purity-gold-coin', read: 'jsonld' },
  // Listed, not read: script-rendered or bot-protected. Shown with a link so the reader can check by hand.
  { id: 'amazon',  name: 'Amazon.in', type: 'Marketplace', product: 'Search: 10 gram 24K gold coin', url: 'https://www.amazon.in/s?k=10+gram+24k+gold+coin', read: 'none' },
  { id: 'flipkart', name: 'Flipkart', type: 'Marketplace', product: 'Search: 10 g 24K gold coin', url: 'https://www.flipkart.com/search?q=10+gram+24k+gold+coin', read: 'none' },
  { id: 'myntra',  name: 'Myntra', type: 'Marketplace', product: 'Search: gold coin 10 gram', url: 'https://www.myntra.com/gold-coin-10-gram', read: 'none' },
  { id: 'tatacliq', name: 'Tata CLiQ', type: 'Marketplace', product: 'Search: 10 gram gold coin', url: 'https://www.tatacliq.com/search/?searchCategory=all&text=10%20gram%20gold%20coin', read: 'none' },
  { id: 'ajio',    name: 'Ajio', type: 'Marketplace', product: 'Search: 24k gold coin 10 gm', url: 'https://www.ajio.com/search/?text=24k%20gold%20coin%2010%20gm', read: 'none' },
  { id: 'caratlane', name: 'CaratLane', type: 'Jeweller', product: '10g 24Kt coins', url: 'https://www.caratlane.com/gold-coins/10+gram.html', read: 'none' },
  { id: 'bluestone', name: 'BlueStone', type: 'Jeweller', product: '10g 24Kt coins', url: 'https://www.bluestone.com/jewellery/10gram24ktgoldcoins.html', read: 'none' },
  { id: 'candere', name: 'Candere by Kalyan', type: 'Jeweller', product: '24K coins', url: 'https://www.candere.com/jewellery/gold-coins.html', read: 'none' },
  { id: 'joyalukkas', name: 'Joyalukkas', type: 'Jeweller', product: '24K coins and bars', url: 'https://www.joyalukkas.in/gold-coins', read: 'none' },
  { id: 'augmont', name: 'Augmont', type: 'Refiner', product: '10g 24K coins', url: 'https://www.augmont.com/buy-gold-coins', read: 'none' },
];

const num = s => { const n = parseFloat(String(s).replace(/[^\d.]/g, '')); return isFinite(n) ? n : null; };
const plausible = n => n != null && n >= LO && n <= HI;

function jsonldPrice(html) {
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1]);
      const nodes = Array.isArray(j) ? j : (j['@graph'] || [j]);
      for (const n of nodes) {
        const offers = n && n.offers ? (Array.isArray(n.offers) ? n.offers : [n.offers]) : [];
        for (const o of offers) { const p = num(o.price || o.lowPrice); if (plausible(p)) return p; }
      }
    } catch (e) { /* malformed block, keep looking */ }
  }
  return null;
}
function minRupee(html, near) {
  let best = null;
  for (const m of html.matchAll(/₹\s*([\d,]{5,9})/g)) {
    if (near && !near.test(html.slice(m.index, m.index + 300))) continue;
    const p = num(m[1]);
    if (plausible(p) && (best == null || p < best)) best = p;
  }
  return best;
}

async function readSource(s) {
  const out = { id: s.id, name: s.name, type: s.type, product: s.product, url: s.url, price: null, status: 'not read' };
  if (s.read === 'none') { out.status = 'manual'; return out; }
  out.viaProxy = !!(KEY && s.proxy);
  try {
    const r = await fetch(via(s.url, s), UA);
    if (!r.ok) { out.status = `http ${r.status}`; return out; }
    const body = await r.text();
    let p = null;
    if (s.read === 'shopify') {
      const j = JSON.parse(body);
      const prod = (j.products || []).find(x => s.match.test(x.title));
      p = prod ? num(prod.variants[0].price) : null;
      if (prod) out.product = prod.title;
    } else if (s.read === 'regex') { const m = body.match(s.rx); p = m ? num(m[1]) : null; }
    else if (s.read === 'min') p = minRupee(body);
    else if (s.read === 'sku') { const i = body.indexOf(s.sku); if (i > -1) { const win = body.slice(Math.max(0, i - 800), i + 800); p = minRupee(win); } }
    else if (s.read === 'min24k') p = minRupee(body, /24\s*Karat|24K/i);
    else if (s.read === 'jsonld') p = jsonldPrice(body) || minRupee(body);
    if (!plausible(p)) p = jsonldPrice(body) || null; // fallback for any type
    if (plausible(p)) { out.price = p; out.status = 'ok'; } else out.status = 'no price found';
  } catch (e) { out.status = 'error: ' + e.message.slice(0, 60); }
  return out;
}

// Optional: Google Shopping via SerpApi. Set SERPAPI_KEY in Vercel. One query returns merchants' own feed prices.
async function googleShopping() {
  const key = process.env.SERPAPI_KEY; if (!key) return [];
  const url = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent('10 gram 24k gold coin')}&gl=in&hl=en&location=India&num=40&api_key=${key}`;
  const r = await fetch(url); if (!r.ok) throw new Error('serpapi ' + r.status);
  const j = await r.json(); const out = [];
  for (const it of j.shopping_results || []) {
    const title = it.title || '', src = it.source || 'Google Shopping';
    if (!/10\s*(g|gm|gram)/i.test(title) || !/24\s*k|999|24kt|24 karat/i.test(title) || /pendant|chain|set|20\s*g|50\s*g|100\s*g|1\s*g\b/i.test(title)) continue;
    const p = num(it.extracted_price || it.price); if (!plausible(p)) continue;
    out.push({ id: 'gs-' + src.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: src, type: 'via Google Shopping', product: title.slice(0, 80), url: it.product_link || it.link || url, price: p, status: 'ok' });
  }
  // keep the cheapest listing per merchant
  const seen = {}; for (const o of out) if (!seen[o.name] || o.price < seen[o.name].price) seen[o.name] = o;
  return Object.values(seen);
}

// Normalise merchant names from the Google feed to the desk's seller names and types.
const MERCHANTS = [
  [/mmtc|pamp/i, 'MMTC-PAMP', 'Refiner', 'mmtc'], [/tanishq/i, 'Tanishq', 'Jeweller', 'tanishq'], [/malabar/i, 'Malabar Gold & Diamonds', 'Jeweller', 'malabar'],
  [/senco/i, 'Senco Gold & Diamonds', 'Jeweller', 'senco'], [/png/i, 'PNG Jewellers', 'Jeweller', 'png'], [/grt/i, 'GRT Jewellers', 'Jeweller', 'grt'],
  [/pc jeweller|p\.?c\.? jeweller/i, 'PC Jeweller', 'Jeweller', 'pcj'], [/reliance/i, 'Reliance Jewels', 'Jeweller', 'reliance'], [/bangalore refinery/i, 'Bangalore Refinery', 'Refiner', 'bangalore'],
  [/bluestone/i, 'BlueStone', 'Jeweller', 'bluestone'], [/caratlane/i, 'CaratLane', 'Jeweller', 'caratlane'], [/candere|kalyan/i, 'Candere by Kalyan', 'Jeweller', 'candere'],
  [/joyalukkas/i, 'Joyalukkas', 'Jeweller', 'joyalukkas'], [/augmont/i, 'Augmont', 'Refiner', 'augmont'],
  [/amazon/i, 'Amazon.in', 'Marketplace', 'amazon'], [/flipkart/i, 'Flipkart', 'Marketplace', 'flipkart'], [/myntra/i, 'Myntra', 'Marketplace', 'myntra'],
  [/tata cliq/i, 'Tata CLiQ', 'Marketplace', 'tatacliq'], [/ajio/i, 'Ajio', 'Marketplace', 'ajio'],
];
function normalise(o) {
  for (const [rx, name, type, id] of MERCHANTS) if (rx.test(o.name)) { o.name = name; o.type = type; o.matchId = id; break; }
  if (!o.matchId) o.type = /\.(in|com)/i.test(o.name) ? 'Marketplace' : 'Jeweller';
  o.via = 'Google Shopping';
  return o;
}

async function metal() {
  // Landed value of 10 g gold in India: spot x USDINR / 31.1035 x 10, plus 6% import duty. GST is added separately at 3%.
  const y = async s => { const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=5d&interval=1d`, UA); const j = await r.json(); return j.chart.result[0].meta.regularMarketPrice; };
  const r = await Promise.allSettled([y('GC=F'), y('INR=X'), y('GOLDBEES.NS')]);
  const [gold, fx, gb] = r.map(x => x.status === 'fulfilled' ? x.value : null);
  if (!gold || !fx) return null;
  const landed10g = gold * fx / 31.1035 * 10 * 1.06;
  return { goldUsd: gold, usdinr: fx, landed10g, landedWithGst: landed10g * 1.03, goldbees: gb };
}

export default async function handler(req, res) {
  const [direct, m, gs] = await Promise.all([Promise.all(SOURCES.map(readSource)), metal().catch(() => null), googleShopping().catch(e => [{ id: 'gs-error', name: 'Google Shopping', type: 'via Google Shopping', product: 'feed', url: '#', price: null, status: 'error: ' + e.message.slice(0, 40) }])]);
  // Merge: a Google listing replaces a direct row with no price, and the cheaper of the two wins when both have one.
  const byId = {}; for (const d of direct) byId[d.id] = d;
  for (const g of gs.map(normalise)) {
    const d = g.matchId ? byId[g.matchId] : null;
    if (d) { if (!d.price || g.price < d.price) { d.price = g.price; d.product = g.product; d.url = g.url; d.status = 'ok'; d.via = 'Google Shopping'; } }
    else byId[g.id] = g;
  }
  const sellers = Object.values(byId);
  const priced = sellers.filter(s => s.price).sort((a, b) => a.price - b.price);
  if (m) for (const s of priced) s.premium = (s.price / m.landedWithGst - 1) * 100;
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ fetched: Date.now(), metal: m, cheapest: priced[0] || null, sellers: [...priced, ...sellers.filter(s => !s.price)] });
}
