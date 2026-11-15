// Reads today's price of a 10 gram 24K gold coin or bar from Indian online stores.
// Every seller has its own page layout, so each read is best effort and reports its own status.
// Marketplaces that render prices by script or block automated reads are listed with a link and no number.

const UA = { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', 'Accept-Language': 'en-IN,en;q=0.9' } };
const LO = 60000, HI = 300000; // plausible range for a 10 g 24K coin, INR, guards against reading a 1 g or 100 g price

const SOURCES = [
  { id: 'senco',   name: 'Senco Gold & Diamonds', type: 'Jeweller', product: '10g Laxmi 24K (995) coin',
    url: 'https://sencogoldanddiamonds.com/products/precious-10g-laxmi-gold-coin', read: 'regex', rx: /Total:?\s*₹\s*([\d,]+)/ },
  { id: 'pcj',     name: 'PC Jeweller', type: 'Jeweller', product: '10g 24K Floral coin',
    url: 'https://www.pcjeweller.com/en/productreview/id/24305/', read: 'regex', rx: /M\.R\.P\s*:?\s*₹\s*([\d,]+)/ },
  { id: 'reliance', name: 'Reliance Jewels', type: 'Jeweller', product: '10g 24K Goddess Laxmi coin',
    url: 'https://www.reliancejewels.com/24-karat-yellow-finish-10-grams-goddess-laxmi-gold-coin/all-jewellery/coins/product:520583/cid:190/', read: 'regex', rx: /Price\s*:?\s*₹?\s*([\d,]{5,8})/ },
  { id: 'malabar', name: 'Malabar Gold & Diamonds', type: 'Jeweller', product: 'Cheapest 10g 24K (999) coin listed',
    url: 'https://malabargoldanddiamonds.com/gold-coins/type/999/10g.html', read: 'min' },
  { id: 'tanishq', name: 'Tanishq', type: 'Jeweller', product: 'Cheapest 10g 24 Karat coin listed',
    url: 'https://www.tanishq.co.in/shop/10-gram?lang=en_IN', read: 'min24k' },
  { id: 'png',     name: 'PNG Jewellers', type: 'Jeweller', product: '10 Gram 24 KT (995) coin',
    url: 'https://www.pngjewellers.com/collections/gold-coin/products.json', read: 'shopify', match: /10 Gram/i },
  { id: 'mmtc',    name: 'MMTC-PAMP', type: 'Refiner', product: 'Lotus 24K (999.9) 10g bar',
    url: 'https://shop.mmtcpamp.com/lotus-24k-9999-10-gm-gold-bar', read: 'jsonld' },
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
  try {
    const r = await fetch(s.url, UA);
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
    else if (s.read === 'min24k') p = minRupee(body, /24\s*Karat|24K/i);
    else if (s.read === 'jsonld') p = jsonldPrice(body) || minRupee(body);
    if (!plausible(p)) p = jsonldPrice(body) || null; // fallback for any type
    if (plausible(p)) { out.price = p; out.status = 'ok'; } else out.status = 'no price found';
  } catch (e) { out.status = 'error: ' + e.message.slice(0, 60); }
  return out;
}

async function metal() {
  // Landed value of 10 g gold in India: spot x USDINR / 31.1035 x 10, plus 6% import duty. GST is added separately at 3%.
  const y = async s => { const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=5d&interval=1d`, UA); const j = await r.json(); return j.chart.result[0].meta.regularMarketPrice; };
  const [gold, fx, gb] = await Promise.all([y('GC=F'), y('INR=X'), y('GOLDBEES.NS')]);
  const landed10g = gold * fx / 31.1035 * 10 * 1.06;
  return { goldUsd: gold, usdinr: fx, landed10g, landedWithGst: landed10g * 1.03, goldbees: gb };
}

export default async function handler(req, res) {
  const [sellers, m] = await Promise.all([Promise.all(SOURCES.map(readSource)), metal().catch(() => null)]);
  const priced = sellers.filter(s => s.price).sort((a, b) => a.price - b.price);
  if (m) for (const s of priced) s.premium = (s.price / m.landedWithGst - 1) * 100;
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ fetched: Date.now(), metal: m, cheapest: priced[0] || null, sellers: [...priced, ...sellers.filter(s => !s.price)] });
}
