import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 5 });
  const client = await pool.connect();

  console.log('--- FINDING EXACT TIMESTAMP OR POINT OF BASELINE 1,782,044 ---');
  // Order by observed_at, ctid or id
  // Let's check columns on atlas_person_identity_map
  const cols = await client.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'atlas_person_identity_map'
  `);
  console.log('Columns:', cols.rows.map(r => r.column_name));

  // Check the earliest ARCA records on 2026-09-20 after 18:31:35
  const earlyArca = await client.query(`
    SELECT observed_at, count(*), count(DISTINCT atlas_person_id)
    FROM public.atlas_person_identity_map
    WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA' AND observed_at >= '2026-09-20T18:31:35.322Z'
    GROUP BY observed_at
    ORDER BY observed_at ASC
    LIMIT 20;
  `);
  console.log('Early campaign batches:', earlyArca.rows);

  client.release();
  await pool.end();
}

main().catch(console.error);
