import { parseDbUrl } from './export_search_projection_v2.mjs';
import pg from 'pg';
const { Client } = pg;

async function main() {
  const c = new Client(parseDbUrl());
  await c.connect();
  const res = await c.query("SELECT * FROM public.atlas_people_live_metrics WHERE id = 'current'");
  console.log('SSOT:', res.rows[0]);
  await c.end();
}

main().catch(console.error);
