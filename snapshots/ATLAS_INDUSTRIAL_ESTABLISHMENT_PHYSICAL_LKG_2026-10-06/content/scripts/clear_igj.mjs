import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const dbPool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const pgClient = await dbPool.connect();
  const res = await pgClient.query("UPDATE public.atlas_search_outbox SET status = 'PUBLISHED' WHERE status IN ('PENDING', 'PROCESSING') AND source_id = 'IGJ_AUTORIDADES_GENERO_2026';");
  console.log('Cleared', res.rowCount);
  pgClient.release();
  await dbPool.end();
}
main().catch(console.error);
