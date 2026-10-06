import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const dbPool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const pgClient = await dbPool.connect();

  const res = await pgClient.query("UPDATE public.atlas_search_outbox SET status = 'PENDING', last_error = NULL WHERE status = 'QUARANTINED' AND last_error LIKE '%missing_document_id%';");
  console.log('Requeued', res.rowCount, 'records with missing_document_id');

  const res2 = await pgClient.query("UPDATE public.atlas_search_outbox SET status = 'PENDING', last_error = NULL WHERE status = 'QUARANTINED' AND last_error LIKE '%atlas_person_id%';");
  console.log('Requeued', res2.rowCount, 'records with atlas_person_id');
  
  const res3 = await pgClient.query("UPDATE public.atlas_search_outbox SET status = 'PENDING', last_error = NULL WHERE status = 'QUARANTINED' AND last_error LIKE '%discovery_id%';");
  console.log('Requeued', res3.rowCount, 'records with discovery_id');

  pgClient.release();
  await dbPool.end();
}

main().catch(console.error);
