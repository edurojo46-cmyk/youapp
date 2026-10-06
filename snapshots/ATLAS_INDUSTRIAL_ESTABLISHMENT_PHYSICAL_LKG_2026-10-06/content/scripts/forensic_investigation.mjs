import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 5 });
  const client = await pool.connect();

  console.log('--- 1. DATABASE CANONICAL COUNTS ---');
  const rCanonical = await client.query(`
    SELECT count(DISTINCT atlas_person_id) as canonical_count
    FROM public.atlas_person_identity_map
    WHERE atlas_person_id IS NOT NULL;
  `);
  console.log('Total Distinct Canonical IDs:', rCanonical.rows[0].canonical_count);

  console.log('\n--- 2. IDENTITY MAP SOURCES & TIMESTAMPS ---');
  const rSources = await client.query(`
    SELECT source_id, count(*) as count, count(DISTINCT atlas_person_id) as distinct_canonical, min(observed_at) as min_observed, max(observed_at) as max_observed
    FROM public.atlas_person_identity_map
    GROUP BY source_id;
  `);
  console.log(rSources.rows);

  console.log('\n--- 3. ARCA TIME BREAKDOWN ---');
  const rArcaTime = await client.query(`
    SELECT date_trunc('hour', observed_at) as hr, count(*) as cnt, count(DISTINCT atlas_person_id) as distinct_canonical
    FROM public.atlas_person_identity_map
    WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA'
    GROUP BY 1 ORDER BY 1;
  `);
  console.log(rArcaTime.rows);

  console.log('\n--- 4. OUTBOX STATUS BREAKDOWN ---');
  const rOutbox = await client.query(`
    SELECT source_id, status, count(*) as count, min(created_at) as min_created, max(created_at) as max_created
    FROM public.atlas_search_outbox
    GROUP BY source_id, status
    ORDER BY source_id, status;
  `);
  console.log(rOutbox.rows);

  console.log('\n--- 5. OUTBOX QUARANTINED DETAILS ---');
  const rQuarantine = await client.query(`
    SELECT source_id, status, count(*), substr(last_error, 1, 80) as err_sample
    FROM public.atlas_search_outbox
    WHERE status = 'QUARANTINED'
    GROUP BY source_id, status, substr(last_error, 1, 80);
  `);
  console.log(rQuarantine.rows);

  client.release();
  await pool.end();

  console.log('\n--- 6. MEILISEARCH INDEX & SETTINGS ---');
  try {
    const idxRes = await fetch('http://127.0.0.1:7700/indexes/atlas_people_discovery_gate32_delta');
    console.log('Index:', await idxRes.json());
    const statsRes = await fetch('http://127.0.0.1:7700/indexes/atlas_people_discovery_gate32_delta/stats');
    console.log('Stats:', await statsRes.json());
    const setRes = await fetch('http://127.0.0.1:7700/indexes/atlas_people_discovery_gate32_delta/settings');
    console.log('Settings:', await setRes.json());
  } catch (err) {
    console.error('Meilisearch error:', err.message);
  }
}

main().catch(console.error);
