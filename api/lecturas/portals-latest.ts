import { getLatestFromPortals } from '../../src/lib/tv/atlasComparaEngine';

// Vercel Serverless Function: 3 últimas notas por portal (RSS públicos · 0 cuota API)
export default async function handler(req: any, res: any) {
  const perPortal = Number(req.query?.perPortal || 3) || 3;
  try {
    const result = await getLatestFromPortals(perPortal);
    res.status(200).json(result);
  } catch {
    res.status(200).json({ ok: false, sections: [] });
  }
}
