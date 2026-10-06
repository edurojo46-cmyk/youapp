import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const dbPool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const pgClient = await dbPool.connect();

  const quarantined = await pgClient.query("SELECT last_error, count(*) as cnt FROM public.atlas_search_outbox WHERE status = 'QUARANTINED' GROUP BY last_error;");
  console.log(JSON.stringify(quarantined.rows, null, 2));

  pgClient.release();
  await dbPool.end();
}

main().catch(console.error);
