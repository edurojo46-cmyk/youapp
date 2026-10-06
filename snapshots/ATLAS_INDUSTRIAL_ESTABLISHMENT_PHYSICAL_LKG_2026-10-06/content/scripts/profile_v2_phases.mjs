/**
 * scripts/profile_v2_phases.mjs
 * Precise profiling of every phase in V2 ingestion
 */

import pg from 'pg';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const dbConfig = parseDbUrl(process.env.DATABASE_URL);
const pool = new pg.Pool({ ...dbConfig, max: 2 });

const HMAC_SECRET = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY || '1e7b93df021b3394a11f95304b0dfb925b4ec91428a2a5df0db036af6b88950d';

function createHash(doc) {
  return crypto.createHmac('sha256', HMAC_SECRET).update(`AR_DNI:${doc}`).digest();
}

async function profile() {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = '60s'");

    const testBatchId = `PROF_${Date.now()}`;
    console.log(`Starting profiling with batch_id: ${testBatchId}`);

    // 1. Stage 1,000 records
    const t0 = performance.now();
    const rows = [];
    for (let i = 0; i < 1000; i++) {
      const doc = 80000000 + Math.floor(Math.random() * 10000000);
      const hash = createHash(doc);
      rows.push([
        testBatchId, i + 1, hash, 'src_profile_test', `REC_${testBatchId}_${i}`,
        `Test Person ${i}`, 'Test Org', 'Director', 'Abogado', (i % 2 === 0 ? 'CABA' : 'PBA'),
        'Profile Geo Evidence', 'QUALIFIED', 'ACTIVE'
      ]);
    }

    // Insert into staging
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const values = chunk.map((r, idx) => `($${idx*13+1}, $${idx*13+2}, $${idx*13+3}, $${idx*13+4}, $${idx*13+5}, $${idx*13+6}, $${idx*13+7}, $${idx*13+8}, $${idx*13+9}, $${idx*13+10}, $${idx*13+11}, $${idx*13+12}, $${idx*13+13})`).join(', ');
      const params = chunk.flat();
      await client.query(`
        INSERT INTO atlas_ingest_v2_shadow.staging_incoming_records (
          batch_id, batch_seq, identity_hash, source_id, source_record_key,
          display_name, organization, role, profession, geography_id,
          location_evidence, qualification_state, activity_state
        ) VALUES ${values}
      `, params);
    }
    const stagingWriteMs = performance.now() - t0;
    console.log(`Staging 1,000 rows took: ${stagingWriteMs.toFixed(1)}ms`);

    // Profile STAGING_READ
    const tRead = performance.now();
    const expCount = await client.query(`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT count(*) FROM atlas_ingest_v2_shadow.staging_incoming_records WHERE batch_id = $1;
    `, [testBatchId]);
    const stagingReadMs = performance.now() - tRead;
    console.log(`\n--- PHASE 1: STAGING_READ (${stagingReadMs.toFixed(1)}ms) ---`);
    console.log(expCount.rows.map(r => r['QUERY PLAN']).join('\n'));

    // Profile IDENTITY_HOT_LOOKUP
    const tLookup = performance.now();
    const expLookup = await client.query(`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT s.identity_hash, k.atlas_person_id
      FROM atlas_ingest_v2_shadow.staging_incoming_records s
      LEFT JOIN atlas_ingest_v2_shadow.atlas_identity_keys_v2 k
        ON k.identity_hash = s.identity_hash
      WHERE s.batch_id = $1;
    `, [testBatchId]);
    const lookupMs = performance.now() - tLookup;
    console.log(`\n--- PHASE 2: IDENTITY_HOT_LOOKUP (${lookupMs.toFixed(1)}ms) ---`);
    console.log(expLookup.rows.map(r => r['QUERY PLAN']).join('\n'));

    // Profile SSOT IDENTITY_MAP write
    const tIdMap = performance.now();
    const expIdMap = await client.query(`
      EXPLAIN (ANALYZE, BUFFERS)
      INSERT INTO public.atlas_person_identity_map (
        atlas_person_id, source_id, source_person_id, identifier_type,
        identifier_value, evidence_id, confidence, resolution_method, observed_at
      )
      SELECT 
        'atlas_per_' || encode(s.identity_hash, 'hex'),
        s.source_id,
        s.source_record_key,
        'NATIONAL_IDENTITY_HMAC',
        encode(s.identity_hash, 'hex'),
        'EV_PROF_' || s.batch_id,
        1.0,
        'V2_PROFILING',
        clock_timestamp()
      FROM atlas_ingest_v2_shadow.staging_incoming_records s
      WHERE s.batch_id = $1
      ON CONFLICT (source_id, source_person_id) DO UPDATE SET observed_at = clock_timestamp();
    `, [testBatchId]);
    const idMapMs = performance.now() - tIdMap;
    console.log(`\n--- PHASE 3: IDENTITY_MAP_WRITE (${idMapMs.toFixed(1)}ms) ---`);
    console.log(expIdMap.rows.map(r => r['QUERY PLAN']).join('\n'));

    // Profile SEARCH_DELIVERY_KEY_WRITE
    const tDeliv = performance.now();
    const expDeliv = await client.query(`
      EXPLAIN (ANALYZE, BUFFERS)
      INSERT INTO public.atlas_search_delivery_keys (
        logical_event_id, atlas_person_id, source_id, source_record_id,
        payload_version, delivery_status, first_committed_at, last_seen_at
      )
      SELECT 
        s.source_id || ':' || s.source_record_key || ':v1',
        'atlas_per_' || encode(s.identity_hash, 'hex'),
        s.source_id,
        s.source_record_key,
        1,
        'COMMITTED',
        clock_timestamp(),
        clock_timestamp()
      FROM atlas_ingest_v2_shadow.staging_incoming_records s
      WHERE s.batch_id = $1
      ON CONFLICT (logical_event_id) DO UPDATE SET last_seen_at = clock_timestamp();
    `, [testBatchId]);
    const delivMs = performance.now() - tDeliv;
    console.log(`\n--- PHASE 4: SEARCH_DELIVERY_KEY_WRITE (${delivMs.toFixed(1)}ms) ---`);
    console.log(expDeliv.rows.map(r => r['QUERY PLAN']).join('\n'));

    // Profile OUTBOX_WRITE
    const tOutbox = performance.now();
    const expOutbox = await client.query(`
      EXPLAIN (ANALYZE, BUFFERS)
      INSERT INTO public.atlas_search_outbox_v2 (
        logical_event_id, atlas_person_id, source_id, source_record_id,
        payload, payload_version, status, attempt_count, created_at, next_retry_at
      )
      SELECT 
        s.source_id || ':' || s.source_record_key || ':v1',
        'atlas_per_' || encode(s.identity_hash, 'hex'),
        s.source_id,
        s.source_record_key,
        jsonb_build_object('display_name', s.display_name),
        1,
        'PENDING',
        0,
        clock_timestamp(),
        clock_timestamp()
      FROM atlas_ingest_v2_shadow.staging_incoming_records s
      WHERE s.batch_id = $1;
    `, [testBatchId]);
    const outboxMs = performance.now() - tOutbox;
    console.log(`\n--- PHASE 5: OUTBOX_WRITE (${outboxMs.toFixed(1)}ms) ---`);
    console.log(expOutbox.rows.map(r => r['QUERY PLAN']).join('\n'));

    // Profile LIVE_METRICS_UPDATE
    const tMetrics = performance.now();
    const expMetrics = await client.query(`
      EXPLAIN (ANALYZE, BUFFERS)
      UPDATE public.atlas_people_live_metrics
      SET last_verified_change_at = clock_timestamp()
      WHERE id = 'current';
    `);
    const metricsMs = performance.now() - tMetrics;
    console.log(`\n--- PHASE 6: LIVE_METRICS_UPDATE (${metricsMs.toFixed(1)}ms) ---`);
    console.log(expMetrics.rows.map(r => r['QUERY PLAN']).join('\n'));

    // Profile STAGING_CLEANUP
    const tCleanup = performance.now();
    const expCleanup = await client.query(`
      EXPLAIN (ANALYZE, BUFFERS)
      DELETE FROM atlas_ingest_v2_shadow.staging_incoming_records WHERE batch_id = $1;
    `, [testBatchId]);
    const cleanupMs = performance.now() - tCleanup;
    console.log(`\n--- PHASE 7: STAGING_CLEANUP (${cleanupMs.toFixed(1)}ms) ---`);
    console.log(expCleanup.rows.map(r => r['QUERY PLAN']).join('\n'));

    // Also clean up any test records in identity map / delivery keys / outbox
    await client.query("DELETE FROM public.atlas_search_outbox_v2 WHERE source_id = 'src_profile_test'");
    await client.query("DELETE FROM public.atlas_search_delivery_keys WHERE source_id = 'src_profile_test'");
    await client.query("DELETE FROM public.atlas_person_identity_map WHERE source_id = 'src_profile_test'");

  } finally {
    client.release();
    await pool.end();
  }
}

profile().catch(console.error);
