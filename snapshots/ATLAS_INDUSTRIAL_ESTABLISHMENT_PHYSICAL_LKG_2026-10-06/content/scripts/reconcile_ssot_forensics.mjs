import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const prodCfg = parseDbUrl();
  const prodPool = new pg.Pool({ ...prodCfg, max: 2 });
  const shadowCfg = { ...parseDbUrl(), database: 'atlas_shadow_cold_gate' };
  const shadowPool = new pg.Pool({ ...shadowCfg, max: 2 });

  const prodClient = await prodPool.connect();
  const shadowClient = await shadowPool.connect();
  await prodClient.query('SET statement_timeout = 0;');
  await shadowClient.query('SET statement_timeout = 0;');

  console.log('════════════════════════════════════════════════════════════════');
  console.log('RECONCILING GLOBAL HUMAN SSOT & EXACT SET THEORY INTERSECTION');
  console.log('════════════════════════════════════════════════════════════════');

  // 1. atlas_people_live_metrics
  const mRes = await prodClient.query('SELECT * FROM public.atlas_people_live_metrics LIMIT 1;');
  console.log('\n[1] atlas_people_live_metrics row:');
  console.log(mRes.rows[0]);

  // 2. Distinct atlas_person_id in identity map
  console.log('\n[2] Checking distinct atlas_person_id in identity map...');
  const idMapDistinct = await prodClient.query('SELECT count(distinct atlas_person_id) as count FROM public.atlas_person_identity_map;');
  console.log('Distinct atlas_person_id in identity map:', idMapDistinct.rows[0].count);

  // 3. Candidates atlas_person_id
  console.log('\n[3] Checking distinct atlas_person_id in candidates...');
  const candDistinct = await prodClient.query('SELECT count(distinct atlas_person_id) as count FROM public.atlas_people_discovery_candidates WHERE atlas_person_id IS NOT NULL;');
  console.log('Distinct atlas_person_id in candidates:', candDistinct.rows[0].count);

  // 4. Candidates without atlas_person_id (unresolved observations)
  const candNullId = await prodClient.query('SELECT count(*) as count FROM public.atlas_people_discovery_candidates WHERE atlas_person_id IS NULL;');
  console.log('Candidates with NULL atlas_person_id:', candNullId.rows[0].count);

  // 5. Total rows in atlas_authority.global_t0_identity_ledger
  console.log('\n[4] Checking atlas_authority.global_t0_identity_ledger...');
  const ledgerCount = await shadowClient.query('SELECT count(*) as total_rows, count(distinct canonical_identity_key) as distinct_canonical FROM atlas_authority.global_t0_identity_ledger;');
  console.log('Ledger stats:', ledgerCount.rows[0]);

  // 6. Check intersection between production atlas_person_identity_map and ledger
  // Stream or query canonical_identity_key in ledger that match atlas_person_id in production
  console.log('\n[5] Calculating exact intersection between Production Canonical and Prior Real Gate...');
  
  // Create temporary table or query in batches
  // In shadow DB, what does canonical_identity_key look like?
  const ledgerSample = await shadowClient.query('SELECT canonical_identity_key, normalized_name, raw_record_id FROM atlas_authority.global_t0_identity_ledger LIMIT 10;');
  console.log('Ledger sample:', ledgerSample.rows);

  await prodClient.release();
  await shadowClient.release();
  await prodPool.end();
  await shadowPool.end();
}

main().catch(console.error);
