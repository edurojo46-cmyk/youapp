import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const dbPool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const pgClient = await dbPool.connect();
  const res = await pgClient.query("SELECT source_id, count(*) as cnt FROM public.atlas_search_outbox WHERE status IN ('PENDING', 'PROCESSING') GROUP BY source_id;");
  console.log(JSON.stringify(res.rows, null, 2));
  pgClient.release();
  await dbPool.end();
}
main().catch(console.error);
