// Returns the stored daily snapshots, oldest first, plus the latest IBJA fix.
import { kvGet, kvReady, ibja } from '../lib/desk.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const live = await ibja().catch(() => null);
  if (!kvReady()) return res.status(200).json({ configured: false, history: [], ibja: live });
  const history = (await kvGet('history').catch(() => null)) || [];
  const stored = await kvGet('ibja').catch(() => null);
  res.status(200).json({ configured: true, history, ibja: live || stored });
}
