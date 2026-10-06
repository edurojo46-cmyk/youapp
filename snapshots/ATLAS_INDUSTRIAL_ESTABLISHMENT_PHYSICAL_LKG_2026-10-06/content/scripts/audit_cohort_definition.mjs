import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 5 });
  const client = await pool.connect();

  console.log('--- 1. OVERALL CANONICAL COUNT ---');
  const resTotal = await client.query(`
    SELECT count(DISTINCT atlas_person_id) as total_canonical
    FROM public.atlas_person_identity_map
    WHERE atlas_person_id IS NOT NULL;
  `);
  console.log('Total Canonical:', resTotal.rows[0].total_canonical);

  console.log('\n--- 2. SOURCE RECORD COUNTS & DISTINCT PERSON COUNTS BY SOURCE ---');
  const resBySource = await client.query(`
    SELECT source_id, count(*) as total_rows, count(DISTINCT atlas_person_id) as distinct_canonical,
           count(DISTINCT source_person_id) as distinct_source_records,
           min(observed_at) as min_observed, max(observed_at) as max_observed
    FROM public.atlas_person_identity_map
    GROUP BY source_id
    ORDER BY total_rows DESC;
  `);
  console.log(resBySource.rows);

  console.log('\n--- 3. ARCA RECORDS CHRONOLOGY ---');
  const resArcaChron = await client.query(`
    SELECT date_trunc('minute', observed_at) as minute,
           count(*) as rows,
           count(DISTINCT atlas_person_id) as distinct_canonical
    FROM public.atlas_person_identity_map
    WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA'
    GROUP BY 1
    ORDER BY 1;
  `);
  console.log('Total minute buckets for ARCA:', resArcaChron.rows.length);
  console.log('First 5:', resArcaChron.rows.slice(0, 5));
  console.log('Last 10:', resArcaChron.rows.slice(-10));

  console.log('\n--- 4. RESOLUTION METHODS FOR ARCA ---');
  const resResolutions = await client.query(`
    SELECT resolution_method, count(*) as cnt, count(DISTINCT atlas_person_id) as distinct_canonical
    FROM public.atlas_person_identity_map
    WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA'
    GROUP BY 1;
  `);
  console.log(resResolutions.rows);

  client.release();
  await pool.end();
}

main().catch(console.error);
