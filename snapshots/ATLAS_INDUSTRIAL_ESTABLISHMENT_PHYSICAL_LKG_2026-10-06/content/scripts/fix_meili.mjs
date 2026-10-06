import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('Setting primary key...');
  const createRes = await fetch('http://127.0.0.1:7700/indexes/atlas_people_discovery_gate32_delta', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ primaryKey: 'source_record_id' })
  });
  console.log(await createRes.json());

  console.log('Requeuing records...');
  const dbPool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const pgClient = await dbPool.connect();

  const res = await pgClient.query("UPDATE public.atlas_search_outbox SET status = 'PENDING', last_error = NULL WHERE status = 'QUARANTINED' AND last_error LIKE '%missing_document_id%';");
  console.log('Requeued', res.rowCount, 'records');

  pgClient.release();
  await dbPool.end();
}

main().catch(console.error);
