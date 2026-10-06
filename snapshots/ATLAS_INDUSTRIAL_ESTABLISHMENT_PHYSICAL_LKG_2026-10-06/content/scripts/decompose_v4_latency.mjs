import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });

async function run() {
  console.log('=== SECTION 1: DETAILED V4 LATENCY DECOMPOSITION ===');

  // Network ping / round-trip time
  const pingSamples = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    await pool.query('SELECT 1;');
    pingSamples.push(performance.now() - t0);
  }
  const avgPing = (pingSamples.reduce((a, b) => a + b, 0) / pingSamples.length).toFixed(2);
  console.log(`Network RTT ping (5 samples): avg=${avgPing}ms [${pingSamples.map(p => p.toFixed(1)).join(', ')}]`);

  // Sample 100 recent rows to construct exact representative B100 batch
  const sampleRes = await pool.query(`
    SELECT atlas_person_id, source_id, source_person_id, identifier_type, identifier_value
    FROM atlas_person_identity_map
    ORDER BY id DESC LIMIT 100;
  `);

  const identityRows = sampleRes.rows.map((r, i) => ({
    atlas_person_id: r.atlas_person_id,
    source_id: 'PUB_MOTOR_BOLETIN_OFICIAL_SOC',
    source_person_id: `rec_decomp_${Date.now()}_${i}`,
    identifier_type: 'NATIONAL_ID',
    identifier_value: `dni_${Date.now()}_${i}`,
    confidence: 1.0,
    resolution_method: 'EXACT',
    observed_at: new Date().toISOString()
  }));

  const outboxRows = sampleRes.rows.map((r, i) => ({
    atlas_person_id: r.atlas_person_id,
    source_id: 'PUB_MOTOR_BOLETIN_OFICIAL_SOC',
    source_record_id: `rec_decomp_${Date.now()}_${i}`,
    payload_version: 1,
    payload: {
      discovery_id: `disc_decomp_${Date.now()}_${i}`,
      display_name: `Persona Decomp ${i}`,
      role: 'DIRECTOR',
      organization: 'EMPRESA S.A.',
      profession: 'COMERCIANTE',
      geography_id: 'caba',
      target_region: 'CABA',
      geo_confidence: 1.0,
      current_activity_state: 'ACTIVE'
    }
  }));

  // 1. Stage A: Input parse + CTE subquery for new_candidates
  console.log('\n--- 1. IDENTITY LOOKUP (new_candidates CTE) ---');
  const tId0 = performance.now();
  const planNewCands = await pool.query(`
    EXPLAIN (ANALYZE, BUFFERS, WAL)
    WITH incoming_identity AS (
      SELECT DISTINCT ON (source_id, source_person_id)
        atlas_person_id, source_id, source_person_id, identifier_type,
        identifier_value, evidence_id, confidence, resolution_method,
        COALESCE(observed_at, now()) AS observed_at
      FROM jsonb_to_recordset($1::jsonb) AS x(
        atlas_person_id text, source_id text, source_person_id text, identifier_type text,
        identifier_value text, evidence_id text, confidence float, resolution_method text,
        observed_at timestamptz
      )
      ORDER BY source_id, source_person_id, observed_at DESC
    ),
    distinct_incoming AS (
      SELECT DISTINCT atlas_person_id
      FROM incoming_identity
      ORDER BY atlas_person_id
    )
    SELECT d.atlas_person_id
    FROM distinct_incoming d
    WHERE NOT EXISTS (
      SELECT 1 FROM public.atlas_person_identity_map existing
      WHERE existing.atlas_person_id = d.atlas_person_id
    );
  `, [JSON.stringify(identityRows)]);
  const durId = performance.now() - tId0;
  console.log(`Wall clock: ${durId.toFixed(2)}ms`);
  console.log(planNewCands.rows.map(r => r['QUERY PLAN']).join('\n'));

  // 2. Stage B: ON CONFLICT upsert on atlas_person_identity_map
  console.log('\n--- 2. CANONICAL IDENTITY MAP UPSERT (100 rows) ---');
  const tUpsert0 = performance.now();
  const planUpsert = await pool.query(`
    EXPLAIN (ANALYZE, BUFFERS, WAL)
    WITH incoming_identity AS (
      SELECT DISTINCT ON (source_id, source_person_id)
        atlas_person_id, source_id, source_person_id, identifier_type,
        identifier_value, evidence_id, confidence, resolution_method,
        COALESCE(observed_at, now()) AS observed_at
      FROM jsonb_to_recordset($1::jsonb) AS x(
        atlas_person_id text, source_id text, source_person_id text, identifier_type text,
        identifier_value text, evidence_id text, confidence float, resolution_method text,
        observed_at timestamptz
      )
      ORDER BY source_id, source_person_id, observed_at DESC
    )
    INSERT INTO public.atlas_person_identity_map (
      atlas_person_id, source_id, source_person_id, identifier_type,
      identifier_value, evidence_id, confidence, resolution_method, observed_at
    )
    SELECT 
      atlas_person_id, source_id, source_person_id, identifier_type,
      identifier_value, evidence_id, confidence, resolution_method, observed_at
    FROM incoming_identity
    ON CONFLICT (source_id, source_person_id) DO UPDATE SET
      identifier_value  = EXCLUDED.identifier_value,
      confidence        = EXCLUDED.confidence,
      resolution_method = EXCLUDED.resolution_method,
      observed_at       = EXCLUDED.observed_at
    RETURNING (xmax = 0) AS is_inserted;
  `, [JSON.stringify(identityRows)]);
  const durUpsert = performance.now() - tUpsert0;
  console.log(`Wall clock: ${durUpsert.toFixed(2)}ms`);
  console.log(planUpsert.rows.map(r => r['QUERY PLAN']).join('\n'));

  // 3. Stage C: Delivery keys upsert
  console.log('\n--- 3. DELIVERY KEYS UPSERT (100 rows) ---');
  const tKeys0 = performance.now();
  const planKeys = await pool.query(`
    EXPLAIN (ANALYZE, BUFFERS, WAL)
    WITH incoming_outbox AS (
      SELECT DISTINCT ON (source_id, source_record_id)
        atlas_person_id, source_id, source_record_id, payload,
        COALESCE(payload_version, 1) AS payload_version,
        (source_id || ':' || source_record_id || ':v' || COALESCE(payload_version, 1)) AS logical_event_id
      FROM jsonb_to_recordset($1::jsonb) AS x(
        atlas_person_id text, source_id text, source_record_id text,
        payload jsonb, payload_version integer
      )
      ORDER BY source_id, source_record_id, payload_version DESC
    )
    INSERT INTO public.atlas_search_delivery_keys (
      logical_event_id, atlas_person_id, source_id, source_record_id,
      payload_version, delivery_status, first_committed_at, last_seen_at
    )
    SELECT 
      inc.logical_event_id, inc.atlas_person_id, inc.source_id, inc.source_record_id,
      inc.payload_version, 'COMMITTED', now(), now()
    FROM incoming_outbox inc
    ON CONFLICT (logical_event_id) DO UPDATE SET
      last_seen_at = now()
    RETURNING (xmax = 0) AS is_new_event, logical_event_id;
  `, [JSON.stringify(outboxRows)]);
  const durKeys = performance.now() - tKeys0;
  console.log(`Wall clock: ${durKeys.toFixed(2)}ms`);
  console.log(planKeys.rows.map(r => r['QUERY PLAN']).join('\n'));

  // 4. Stage D: Outbox V2 insert
  console.log('\n--- 4. OUTBOX V2 INSERT (100 rows) ---');
  const tOutbox0 = performance.now();
  const planOutbox = await pool.query(`
    EXPLAIN (ANALYZE, BUFFERS, WAL)
    WITH incoming_outbox AS (
      SELECT DISTINCT ON (source_id, source_record_id)
        atlas_person_id, source_id, source_record_id, payload,
        COALESCE(payload_version, 1) AS payload_version,
        (source_id || ':' || source_record_id || ':v' || COALESCE(payload_version, 1)) AS logical_event_id
      FROM jsonb_to_recordset($1::jsonb) AS x(
        atlas_person_id text, source_id text, source_record_id text,
        payload jsonb, payload_version integer
      )
      ORDER BY source_id, source_record_id, payload_version DESC
    )
    INSERT INTO public.atlas_search_outbox_v2 (
      logical_event_id, atlas_person_id, source_id, source_record_id,
      payload, payload_version, status, attempt_count, created_at, next_retry_at
    )
    SELECT 
      inc.logical_event_id, inc.atlas_person_id, inc.source_id, inc.source_record_id,
      inc.payload, inc.payload_version, 'PENDING', 0, now(), now()
    FROM incoming_outbox inc;
  `, [JSON.stringify(outboxRows)]);
  const durOutbox = performance.now() - tOutbox0;
  console.log(`Wall clock: ${durOutbox.toFixed(2)}ms`);
  console.log(planOutbox.rows.map(r => r['QUERY PLAN']).join('\n'));

  // 5. Test full commit_canonical_with_search_outbox_v4 RPC execution
  console.log('\n--- 5. FULL V4 RPC EXECUTION WITH SERVER TIMING RETURN ---');
  const rpcBatchId = `DECOMP_${Date.now()}`;
  const tRpc0 = performance.now();
  const rpcRes = await pool.query(`
    SELECT public.commit_canonical_with_search_outbox_v4(
      $1::jsonb,
      $2::jsonb,
      $3::text,
      $4::text,
      $5::text
    ) as result;
  `, [
    JSON.stringify(identityRows),
    JSON.stringify(outboxRows),
    rpcBatchId,
    `RPC_${Date.now()}`,
    'EPOCH_TEST'
  ]);
  const durRpc = performance.now() - tRpc0;
  console.log(`Client wall clock duration: ${durRpc.toFixed(2)}ms`);
  console.log('Result payload:', JSON.stringify(rpcRes.rows[0].result, null, 2));

  await pool.end();
}

run().catch(console.error);
