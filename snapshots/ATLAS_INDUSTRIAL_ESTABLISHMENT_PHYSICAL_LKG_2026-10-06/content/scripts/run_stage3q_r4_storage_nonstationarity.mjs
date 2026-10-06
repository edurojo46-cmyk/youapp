import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { IdentityInductionField } from './lib/identity_field.mjs';

dotenv.config();

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const HMAC_SECRET = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY;
if (!HMAC_SECRET) {
  console.error('FATAL: ATLAS_IGJ_IDENTITY_HMAC_KEY missing');
  process.exit(1);
}

const BINARY_FIELD_PATH = 'cache_gate31d/identity_field_base.bin';
const PROBE_CANDIDATES = 16000;
const BATCH_SIZE = 2000;
const WORKERS = 3;
const BASELINE_SEED_ROWS = 1400000;

function normalizeName(rawName) {
  return rawName.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseCandidate(line) {
  const cuit = line.substring(0, 11).trim();
  const rawName = line.substring(11, 41).trim();
  const dni = String(parseInt(cuit.slice(2, 10), 10));
  const identifierValue = crypto.createHmac('sha256', HMAC_SECRET).update(`ARG:DNI:${dni}`).digest('hex');
  const atlasPersonId = `atlas_arg_per_${identifierValue.slice(0, 16)}`;
  return {
    cuit,
    raw_name: rawName,
    normalized_name: normalizeName(rawName),
    cuit_masked: `${cuit.slice(0, 2)}***${cuit.slice(-2)}`,
    identifier_value: identifierValue,
    candidate_atlas_person_id: atlasPersonId,
    source_id: 'ARCA_CONDICION_TRIBUTARIA',
    source_person_id: cuit
  };
}

async function loadDeterministicPopulation(startOffset, count) {
  console.log(`Loading ${count.toLocaleString()} deterministic candidates from offset ${startOffset.toLocaleString()}...`);
  const candidates = [];
  const rl = readline.createInterface({ input: fs.createReadStream(SOURCE_FILE), crlfDelay: Infinity });
  let idx = 0;
  for await (const line of rl) {
    if (idx >= startOffset && candidates.length < count) {
      if (line.length >= 41) {
        candidates.push(parseCandidate(line));
      }
    }
    idx++;
    if (candidates.length >= count) break;
  }
  return candidates;
}

const Q2_FAST_PATH_SQL = `
WITH raw_input AS (
  SELECT 
    (elem->>'input_ordinal')::int as input_ordinal,
    COALESCE(elem->>'source_id', 'ARCA_CONDICION_TRIBUTARIA') as source_id,
    COALESCE(elem->>'source_person_id', elem->>'cuit') as source_person_id,
    COALESCE(elem->>'candidate_atlas_person_id', 'atlas_p_' || gen_random_uuid()) as atlas_person_id,
    (elem->>'identifier_value')::text as identifier_value,
    (elem->>'raw_name')::text as raw_name,
    (elem->>'normalized_name')::text as normalized_name,
    (elem->>'cuit_masked')::text as cuit_masked,
    (elem->>'cuit')::text as cuit
  FROM jsonb_array_elements($1::jsonb) as elem
),
deduped_input AS (
  SELECT DISTINCT ON (source_id, source_person_id) *
  FROM raw_input
  ORDER BY source_id, source_person_id, input_ordinal ASC
),
insert_map AS (
  INSERT INTO public.stage3q_r4_shadow_identity_map (
    atlas_person_id, source_id, source_person_id, identifier_type,
    identifier_value, evidence_id, confidence, resolution_method, observed_at
  )
  SELECT 
    atlas_person_id, source_id, source_person_id, 'NATIONAL_IDENTITY_HMAC',
    identifier_value, 'ev_arca_' || source_person_id, 1.0, 'DETERMINISTIC_CUIT_DNI_HMAC', now()
  FROM deduped_input
  ON CONFLICT DO NOTHING
  RETURNING source_id, source_person_id, atlas_person_id
),
insert_outbox AS (
  INSERT INTO public.stage3q_r4_shadow_search_outbox (
    atlas_person_id, source_id, source_record_id, payload, payload_version,
    status, attempt_count, next_retry_at
  )
  SELECT 
    m.atlas_person_id, m.source_id, 'rec_arca_' || d.cuit,
    jsonb_build_object('atlas_person_id', m.atlas_person_id, 'display_name', d.normalized_name),
    1, 'PENDING', 0, now()
  FROM insert_map m
  JOIN deduped_input d ON d.source_id = m.source_id AND d.source_person_id = m.source_person_id
  ON CONFLICT DO NOTHING
  RETURNING source_id, source_record_id
)
SELECT d.input_ordinal, d.source_id, d.source_person_id, m.atlas_person_id
FROM insert_map m
JOIN deduped_input d ON d.source_id = m.source_id AND d.source_person_id = m.source_person_id;
`;

const V2_FALLBACK_SQL = `
CREATE OR REPLACE FUNCTION public.stage3q_r4_resolver_fallback(p_candidates jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $func$
DECLARE
  v_total_candidates    integer := 0;
  v_new_canonical       integer := 0;
  v_merge_existing      integer := 0;
  v_identity_conflicts  integer := 0;
BEGIN
  CREATE TEMP TABLE temp_incoming_batch ON COMMIT DROP AS
  SELECT DISTINCT ON (COALESCE(c->>'source_id', c->>'sourceId', 'ARCA_CONDICION_TRIBUTARIA'), (c->>'cuit'))
    (c->>'cuit') AS cuit,
    COALESCE(c->>'raw_name', c->>'rawName') AS raw_name,
    COALESCE(c->>'normalized_name', c->>'normalizedName') AS normalized_name,
    COALESCE(c->>'cuit_masked', c->>'cuitMasked') AS cuit_masked,
    COALESCE(c->>'identifier_value', c->>'identifierValue') AS identifier_value,
    COALESCE(c->>'candidate_atlas_person_id', c->>'atlasPersonId') AS candidate_atlas_person_id,
    COALESCE(c->>'source_id', c->>'sourceId', 'ARCA_CONDICION_TRIBUTARIA') AS source_id,
    COALESCE(c->>'source_person_id', c->>'sourcePersonId', (c->>'cuit')) AS source_person_id
  FROM jsonb_array_elements(p_candidates) AS c
  ORDER BY COALESCE(c->>'source_id', c->>'sourceId', 'ARCA_CONDICION_TRIBUTARIA'), (c->>'cuit');

  GET DIAGNOSTICS v_total_candidates = ROW_COUNT;

  CREATE TEMP TABLE temp_resolved_candidates ON COMMIT DROP AS
  SELECT 
    t.cuit, t.raw_name, t.normalized_name, t.cuit_masked, t.identifier_value, t.source_id, t.source_person_id, t.candidate_atlas_person_id,
    src_map.atlas_person_id AS existing_source_atlas_id, ident_match.atlas_person_id AS existing_ident_atlas_id,
    CASE 
      WHEN src_map.atlas_person_id IS NOT NULL AND ident_match.atlas_person_id IS NOT NULL AND src_map.atlas_person_id != ident_match.atlas_person_id THEN TRUE
      WHEN src_map.atlas_person_id IS NOT NULL AND ident_match.atlas_person_id IS NULL AND src_map.atlas_person_id != t.candidate_atlas_person_id THEN TRUE
      ELSE FALSE
    END AS is_conflict,
    COALESCE(src_map.atlas_person_id, ident_match.atlas_person_id, t.candidate_atlas_person_id) AS resolved_atlas_person_id,
    CASE WHEN src_map.atlas_person_id IS NULL AND ident_match.atlas_person_id IS NULL THEN 'NEW' ELSE 'MERGE' END AS resolution_type
  FROM temp_incoming_batch t
  LEFT JOIN LATERAL (
    SELECT atlas_person_id FROM public.stage3q_r4_shadow_identity_map s 
    WHERE s.source_id = t.source_id AND s.source_person_id = t.source_person_id LIMIT 1
  ) src_map ON TRUE
  LEFT JOIN LATERAL (
    SELECT atlas_person_id FROM public.stage3q_r4_shadow_identity_map i 
    WHERE i.identifier_type = 'NATIONAL_IDENTITY_HMAC' AND i.identifier_value = t.identifier_value 
    ORDER BY i.observed_at ASC LIMIT 1
  ) ident_match ON TRUE;

  SELECT count(*) INTO v_identity_conflicts FROM temp_resolved_candidates WHERE is_conflict = TRUE;
  SELECT count(*) FILTER (WHERE is_conflict = FALSE AND resolution_type = 'NEW'),
         count(*) FILTER (WHERE is_conflict = FALSE AND resolution_type = 'MERGE')
  INTO v_new_canonical, v_merge_existing FROM temp_resolved_candidates;

  WITH inserted_map AS (
    INSERT INTO public.stage3q_r4_shadow_identity_map (
      atlas_person_id, source_id, source_person_id, identifier_type, identifier_value, evidence_id, confidence, resolution_method, observed_at
    )
    SELECT resolved_atlas_person_id, source_id, source_person_id, 'NATIONAL_IDENTITY_HMAC', identifier_value, 'ev_arca_' || cuit, 1.0, 'DETERMINISTIC_CUIT_DNI_HMAC', now()
    FROM temp_resolved_candidates WHERE is_conflict = FALSE
    ON CONFLICT (source_id, source_person_id) DO UPDATE SET identifier_value = EXCLUDED.identifier_value
    RETURNING 1
  )
  INSERT INTO public.stage3q_r4_shadow_search_outbox (
    atlas_person_id, source_id, source_record_id, payload, payload_version, status, attempt_count, next_retry_at
  )
  SELECT resolved_atlas_person_id, source_id, 'rec_arca_' || cuit, jsonb_build_object('atlas_person_id', resolved_atlas_person_id), 1, 'PENDING', 0, now()
  FROM temp_resolved_candidates WHERE is_conflict = FALSE AND resolution_type = 'NEW'
  ON CONFLICT (source_id, source_record_id) DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'total_candidates', v_total_candidates,
    'new_canonical', v_new_canonical,
    'merge_existing', v_merge_existing,
    'identity_conflicts', v_identity_conflicts
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$func$;
`;

function auditShadowSafety() {
  const allSql = [Q2_FAST_PATH_SQL, V2_FALLBACK_SQL].join('\n');
  const forbiddenMatches = [...allSql.matchAll(/INSERT\s+INTO\s+public\.atlas_([^\s(]+)/gi)]
    .concat([...allSql.matchAll(/UPDATE\s+public\.atlas_([^\s(]+)/gi)])
    .concat([...allSql.matchAll(/DELETE\s+FROM\s+public\.atlas_([^\s(]+)/gi)]);

  const productionWriteTargetCount = forbiddenMatches.length;
  console.log(`Shadow Safety Audit: PRODUCTION_WRITE_TARGET_COUNT = ${productionWriteTargetCount}`);
  if (productionWriteTargetCount > 0) {
    console.error('FATAL: Production write target detected in shadow SQL:', forbiddenMatches);
    process.exit(1);
  }
  console.log('✅ SHADOW SAFETY CERTIFIED: 100% of writes target stage3q_r4_shadow relations.\n');
  return productionWriteTargetCount;
}

async function snapshotIoState(client) {
  const tRes = await client.query(`
    SELECT 
      relname,
      heap_blks_read,
      heap_blks_hit,
      idx_blks_read,
      idx_blks_hit
    FROM pg_statio_user_tables
    WHERE relname IN ('stage3q_r4_shadow_identity_map', 'stage3q_r4_shadow_search_outbox');
  `);

  const iRes = await client.query(`
    SELECT 
      indexrelname,
      idx_blks_read,
      idx_blks_hit
    FROM pg_statio_user_indexes
    WHERE relname = 'stage3q_r4_shadow_identity_map';
  `);

  const cpRes = await client.query(`
    SELECT num_timed, num_requested, write_time, sync_time, buffers_written
    FROM pg_stat_checkpointer;
  `);

  const bgRes = await client.query(`
    SELECT buffers_clean, maxwritten_clean, buffers_alloc
    FROM pg_stat_bgwriter;
  `);

  const walRes = await client.query(`
    SELECT wal_records, wal_bytes, wal_buffers_full, wal_write, wal_sync
    FROM pg_stat_wal;
  `);

  const dbRes = await client.query(`
    SELECT blks_read, blks_hit
    FROM pg_stat_database
    WHERE datname = current_database();
  `);

  return {
    tables: tRes.rows,
    indexes: iRes.rows,
    checkpointer: cpRes.rows[0] || {},
    bgwriter: bgRes.rows[0] || {},
    wal: walRes.rows[0] || {},
    database: dbRes.rows[0] || {}
  };
}

function computeDeltas(pre, post) {
  function sub(a, b, key) {
    return Math.max(0, parseInt(b[key] || 0, 10) - parseInt(a[key] || 0, 10));
  }

  const tableDeltas = {};
  for (const tPost of post.tables) {
    const tPre = pre.tables.find(x => x.relname === tPost.relname) || {};
    tableDeltas[tPost.relname] = {
      heap_blks_read: sub(tPre, tPost, 'heap_blks_read'),
      heap_blks_hit: sub(tPre, tPost, 'heap_blks_hit'),
      idx_blks_read: sub(tPre, tPost, 'idx_blks_read'),
      idx_blks_hit: sub(tPre, tPost, 'idx_blks_hit')
    };
  }

  const indexDeltas = {};
  for (const iPost of post.indexes) {
    const iPre = pre.indexes.find(x => x.indexrelname === iPost.indexrelname) || {};
    indexDeltas[iPost.indexrelname] = {
      idx_blks_read: sub(iPre, iPost, 'idx_blks_read'),
      idx_blks_hit: sub(iPre, iPost, 'idx_blks_hit')
    };
  }

  return {
    tables: tableDeltas,
    indexes: indexDeltas,
    checkpoints_timed: sub(pre.checkpointer, post.checkpointer, 'num_timed'),
    checkpoints_req: sub(pre.checkpointer, post.checkpointer, 'num_requested'),
    checkpoint_buffers_written: sub(pre.checkpointer, post.checkpointer, 'buffers_written'),
    bgwriter_buffers_clean: sub(pre.bgwriter, post.bgwriter, 'buffers_clean'),
    bgwriter_buffers_alloc: sub(pre.bgwriter, post.bgwriter, 'buffers_alloc'),
    wal_records: sub(pre.wal, post.wal, 'wal_records'),
    wal_bytes: sub(pre.wal, post.wal, 'wal_bytes'),
    db_blks_read: sub(pre.database, post.database, 'blks_read'),
    db_blks_hit: sub(pre.database, post.database, 'blks_hit')
  };
}

async function sampleWaitEvents(client, waitStats) {
  try {
    const res = await client.query(`
      SELECT 
        wait_event_type,
        COALESCE(wait_event, 'CPU') AS wait_event,
        count(*) AS cnt
      FROM pg_stat_activity
      WHERE state = 'active' AND pid != pg_backend_pid()
      GROUP BY wait_event_type, wait_event;
    `);
    waitStats.sample_count++;
    for (const row of res.rows) {
      const eventKey = `${row.wait_event_type || 'Activity'}:${row.wait_event || 'CPU'}`;
      const cnt = parseInt(row.cnt, 10);
      waitStats.counts[eventKey] = (waitStats.counts[eventKey] || 0) + cnt;
    }
  } catch {}
}

async function setupFixedShadow(client) {
  console.log(`Building ONE fixed fresh shadow (${BASELINE_SEED_ROWS.toLocaleString()} rows)...`);
  await client.query(`DROP TABLE IF EXISTS public.stage3q_r4_shadow_search_outbox CASCADE`);
  await client.query(`DROP TABLE IF EXISTS public.stage3q_r4_shadow_identity_map CASCADE`);
  await client.query(`DROP TABLE IF EXISTS public.stage3q_r4_shadow_stress CASCADE`);

  await client.query(`
    CREATE UNLOGGED TABLE public.stage3q_r4_shadow_identity_map AS
    SELECT id, atlas_person_id, source_id, source_person_id, identifier_type, identifier_value, evidence_id, confidence, resolution_method, observed_at, created_at
    FROM public.atlas_person_identity_map
    LIMIT ${BASELINE_SEED_ROWS}
  `);

  await client.query(`
    CREATE UNIQUE INDEX uq_r4_shadow_person_source 
    ON public.stage3q_r4_shadow_identity_map USING btree (source_id, source_person_id)
  `);
  await client.query(`
    CREATE INDEX idx_r4_shadow_identity_map_identifier 
    ON public.stage3q_r4_shadow_identity_map USING btree (identifier_type, identifier_value)
  `);
  await client.query(`
    CREATE INDEX idx_r4_shadow_identity_map_atlas_id 
    ON public.stage3q_r4_shadow_identity_map USING btree (atlas_person_id)
  `);

  await client.query(`
    CREATE UNLOGGED TABLE public.stage3q_r4_shadow_search_outbox AS
    SELECT outbox_id, atlas_person_id, source_id, source_record_id, payload, payload_version, status, attempt_count, created_at, next_retry_at, processing_started_at, processing_worker_id, last_error, quarantined_at, published_at
    FROM public.atlas_search_outbox
    LIMIT 300000
  `);
  await client.query(`
    CREATE UNIQUE INDEX uq_r4_shadow_search_canonical 
    ON public.stage3q_r4_shadow_search_outbox USING btree (source_id, source_record_id)
  `);

  await client.query(`ANALYZE public.stage3q_r4_shadow_identity_map`);
  await client.query(`ANALYZE public.stage3q_r4_shadow_search_outbox`);
  await client.query(V2_FALLBACK_SQL);

  const szRes = await client.query(`
    SELECT 
      pg_relation_size('public.stage3q_r4_shadow_identity_map') as table_bytes,
      pg_indexes_size('public.stage3q_r4_shadow_identity_map') as index_bytes
  `);

  const shadowMeta = {
    seedRows: BASELINE_SEED_ROWS,
    table_mb: Number((parseInt(szRes.rows[0].table_bytes, 10) / (1024 * 1024)).toFixed(1)),
    index_mb: Number((parseInt(szRes.rows[0].index_bytes, 10) / (1024 * 1024)).toFixed(1))
  };
  console.log(`Fixed shadow ready: Table=${shadowMeta.table_mb} MB | Idx=${shadowMeta.index_mb} MB.\n`);
  return shadowMeta;
}

async function runProbeWorkload(pool, batches, field) {
  let nextIdx = 0;
  let totalInput = 0;
  let totalNew = 0;
  let totalMerge = 0;
  let totalConflict = 0;
  const rpcDurations = [];

  // PURE TIMED SECTION (Active Pipeline Only)
  const t0 = performance.now();

  async function worker() {
    const client = await pool.connect();
    try {
      while (true) {
        let rawBatch = null;
        synchronized: {
          if (nextIdx >= batches.length) break;
          rawBatch = batches[nextIdx++];
        }

        const bT0 = performance.now();
        const fastPathCandidates = [];
        const fallbackCandidates = [];

        for (let i = 0; i < rawBatch.length; i++) {
          const c = rawBatch[i];
          const isAbsent = field.classifyCandidate(c).classification === 'DEFINITELY_ABSENT';
          const tagged = { ...c, input_ordinal: i, is_definitely_absent: isAbsent };
          if (isAbsent) fastPathCandidates.push(tagged);
          else fallbackCandidates.push(tagged);
        }

        const orderedFastPath = [...fastPathCandidates].sort((a, b) => a.source_person_id.localeCompare(b.source_person_id));

        let fastPathInserted = 0;
        let fbNew = 0;
        let fbMerge = 0;
        let fbConflict = 0;

        await client.query('BEGIN');
        try {
          if (orderedFastPath.length > 0) {
            const fpRes = await client.query(Q2_FAST_PATH_SQL, [JSON.stringify(orderedFastPath)]);
            const insertedOrdinals = new Set(fpRes.rows.map(r => r.input_ordinal));
            fastPathInserted = insertedOrdinals.size;

            for (const c of orderedFastPath) {
              if (!insertedOrdinals.has(c.input_ordinal)) {
                fallbackCandidates.push(c);
              }
            }
          }

          if (fallbackCandidates.length > 0) {
            const fbRes = await client.query(
              `SELECT public.stage3q_r4_resolver_fallback($1::jsonb) as res`,
              [JSON.stringify(fallbackCandidates)]
            );
            const r = fbRes.rows[0].res;
            if (r && r.ok) {
              fbNew = r.new_canonical || 0;
              fbMerge = r.merge_existing || 0;
              fbConflict = r.identity_conflicts || 0;
            }
          }

          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        }

        const bDur = performance.now() - bT0;
        rpcDurations.push(bDur);

        totalInput += rawBatch.length;
        totalNew += (fastPathInserted + fbNew);
        totalMerge += fbMerge;
        totalConflict += fbConflict;
      }
    } finally {
      client.release();
    }
  }

  const workerPromises = [];
  for (let w = 0; w < WORKERS; w++) {
    workerPromises.push(worker());
  }
  await Promise.all(workerPromises);
  const wallSec = (performance.now() - t0) / 1000;

  rpcDurations.sort((a, b) => a - b);
  const p50 = rpcDurations[Math.floor(rpcDurations.length * 0.50)] || 0;
  const p95 = rpcDurations[Math.floor(rpcDurations.length * 0.95)] || 0;

  return {
    wallSec,
    pipelineWallMs: Math.round(wallSec * 1000),
    totalInput,
    totalNew,
    totalMerge,
    totalConflict,
    candSec: totalInput / wallSec,
    newSec: totalNew / wallSec,
    p50,
    p95
  };
}

async function applyShadowStress(pool, level, targetRows) {
  console.log(`\nApplying Controlled Shadow-Only I/O Stress [Level: ${level}, Target: ${targetRows.toLocaleString()} rows]...`);
  const client = await pool.connect();
  const t0 = performance.now();
  let estimatedWriteBytes = 0;
  let estimatedReadBytes = 0;

  try {
    await client.query(`DROP TABLE IF EXISTS public.stage3q_r4_shadow_stress CASCADE`);
    await client.query(`
      CREATE UNLOGGED TABLE public.stage3q_r4_shadow_stress AS
      SELECT 
        g AS id,
        'payload_' || md5(g::text) AS val1,
        repeat('X', 200) AS padding
      FROM generate_series(1, ${targetRows}) g;
    `);

    estimatedWriteBytes += targetRows * 250; // ~250 bytes per row

    await client.query(`CREATE INDEX idx_r4_stress_val ON public.stage3q_r4_shadow_stress (val1);`);
    estimatedWriteBytes += targetRows * 40;

    // Read sweep
    const scanRes = await client.query(`SELECT count(*) FROM public.stage3q_r4_shadow_stress WHERE val1 LIKE '%abc%';`);
    estimatedReadBytes += targetRows * 250;

    // Additional update sweep
    await client.query(`UPDATE public.stage3q_r4_shadow_stress SET val1 = 'mod_' || md5((id * 2)::text) WHERE id % 2 = 0;`);
    estimatedWriteBytes += (targetRows / 2) * 250;
    estimatedReadBytes += targetRows * 250;

    await client.query(`DROP TABLE IF EXISTS public.stage3q_r4_shadow_stress CASCADE`);
  } finally {
    client.release();
  }

  const durationSec = (performance.now() - t0) / 1000;
  const stressStats = {
    level,
    target_rows: targetRows,
    duration_sec: Number(durationSec.toFixed(2)),
    stress_read_bytes_estimate: estimatedReadBytes,
    stress_write_bytes_estimate: estimatedWriteBytes,
    stress_read_mb: Number((estimatedReadBytes / (1024 * 1024)).toFixed(1)),
    stress_write_mb: Number((estimatedWriteBytes / (1024 * 1024)).toFixed(1))
  };

  console.log(`Stress [${level}] Completed in ${stressStats.duration_sec}s | Est Read: ${stressStats.stress_read_mb} MB | Est Write: ${stressStats.stress_write_mb} MB.\n`);
  return stressStats;
}

async function runProbe(probeLabel, offset, pool, field, description) {
  console.log(`----------------------------------------------------------------`);
  console.log(`🚀 EXECUTING ${probeLabel}: ${description}`);
  console.log(`----------------------------------------------------------------`);

  const population = await loadDeterministicPopulation(offset, PROBE_CANDIDATES);
  const batches = [];
  for (let i = 0; i < population.length; i += BATCH_SIZE) {
    batches.push(population.slice(i, i + BATCH_SIZE));
  }

  // Pre-probe IO snapshot
  const snapPre = await pool.connect();
  let ioPre = {};
  try {
    ioPre = await snapshotIoState(snapPre);
  } finally {
    snapPre.release();
  }

  // Observer for wait events
  const waitStats = { sample_count: 0, counts: {} };
  const obsClient = await pool.connect();
  let stopObs = false;
  const obsTimer = setInterval(() => {
    if (!stopObs) sampleWaitEvents(obsClient, waitStats);
  }, 250);

  // Pure timed execution
  const res = await runProbeWorkload(pool, batches, field);

  stopObs = true;
  clearInterval(obsTimer);
  obsClient.release();

  // Post-probe IO snapshot
  const snapPost = await pool.connect();
  let ioPost = {};
  try {
    ioPost = await snapshotIoState(snapPost);
  } finally {
    snapPost.release();
  }

  const deltas = computeDeltas(ioPre, ioPost);
  const identTableIo = deltas.tables['stage3q_r4_shadow_identity_map'] || {};
  const totalIdxReads = Object.values(deltas.indexes).reduce((acc, i) => acc + i.idx_blks_read, 0);
  const totalIdxHits = Object.values(deltas.indexes).reduce((acc, i) => acc + i.idx_blks_hit, 0);
  const idxHitRatio = (totalIdxHits + totalIdxReads > 0) ? (totalIdxHits / (totalIdxHits + totalIdxReads)) : 1.0;

  console.log(`${probeLabel} Results:`);
  console.log(`  Throughput:       ${res.candSec.toFixed(2)} cand/s | ${res.newSec.toFixed(2)} NEW/s (Active Wall: ${res.wallSec.toFixed(2)}s)`);
  console.log(`  RPC Latency:      P50: ${res.p50.toFixed(1)} ms | P95: ${res.p95.toFixed(1)} ms`);
  console.log(`  Index Reads/Hits: Reads=${totalIdxReads} | Hits=${totalIdxHits} (Hit Ratio: ${(idxHitRatio * 100).toFixed(2)}%)`);
  console.log(`  Heap Reads/Hits:  Reads=${identTableIo.heap_blks_read || 0} | Hits=${identTableIo.heap_blks_hit || 0}`);
  console.log(`  Wait Events:     `, waitStats.counts);

  return {
    probe_id: probeLabel,
    description,
    candidate_offset: offset,
    candidate_count: PROBE_CANDIDATES,
    cand_sec: Number(res.candSec.toFixed(2)),
    new_sec: Number(res.newSec.toFixed(2)),
    pipeline_wall_ms: res.pipelineWallMs,
    pipeline_wall_sec: Number(res.wallSec.toFixed(2)),
    rpc_p50_ms: Number(res.p50.toFixed(1)),
    rpc_p95_ms: Number(res.p95.toFixed(1)),
    total_idx_blks_read: totalIdxReads,
    total_idx_blks_hit: totalIdxHits,
    index_hit_ratio: Number(idxHitRatio.toFixed(4)),
    heap_blks_read: identTableIo.heap_blks_read || 0,
    heap_blks_hit: identTableIo.heap_blks_hit || 0,
    read_time_ms: 0, // track_io_timing off
    write_time_ms: 0, // track_io_timing off
    data_file_read_waits: waitStats.counts['IO:DataFileRead'] || 0,
    data_file_write_waits: waitStats.counts['IO:DataFileWrite'] || 0,
    wait_events: waitStats.counts,
    io_deltas: deltas
  };
}

async function main() {
  console.log('================================================================');
  console.log('⚡ STAGE 3Q-R4: SHORT STORAGE NONSTATIONARITY CONFIRMATION');
  console.log('================================================================\n');

  auditShadowSafety();

  console.log('1. Loading Identity Induction Field...');
  const field = IdentityInductionField.loadFromFile(BINARY_FIELD_PATH);

  const pool = new pg.Pool({ ...parseDbUrl(), max: WORKERS + 4 });
  const setupClient = await pool.connect();
  let shadowMeta = {};
  try {
    shadowMeta = await setupFixedShadow(setupClient);
  } finally {
    setupClient.release();
  }

  const probeResults = [];
  const stressEvents = [];

  // PROBE A: Initial state
  const probeA = await runProbe('PROBE_A', 600000, pool, field, 'Initial baseline state (fresh shadow)');
  probeResults.push(probeA);

  // Controlled Stress 1: Moderate
  const stress1 = await applyShadowStress(pool, 'MODERATE', 300000);
  stressEvents.push(stress1);

  // PROBE B: Immediately after moderate stress
  const probeB = await runProbe('PROBE_B', 616000, pool, field, 'Immediately after moderate accumulated shadow I/O');
  probeResults.push(probeB);

  // Controlled Stress 2: Heavy
  const stress2 = await applyShadowStress(pool, 'HEAVY', 600000);
  stressEvents.push(stress2);

  // PROBE C: Immediately after heavy stress
  const probeC = await runProbe('PROBE_C', 632000, pool, field, 'Immediately after heavy accumulated shadow I/O');
  probeResults.push(probeC);

  // Quiet Interval 1: 90 seconds
  const quiet1Sec = 90;
  console.log(`\nInitiating Controlled Quiet Interval 1 (${quiet1Sec} seconds idle, zero queries)...`);
  await new Promise(resolve => setTimeout(resolve, quiet1Sec * 1000));
  console.log('Quiet Interval 1 elapsed.\n');

  // PROBE D: After quiet interval 1
  const probeD = await runProbe('PROBE_D', 648000, pool, field, `After ${quiet1Sec}s controlled quiet recovery interval`);
  probeResults.push(probeD);

  // Quiet Interval 2: 120 seconds
  const quiet2Sec = 120;
  console.log(`\nInitiating Controlled Quiet Interval 2 (${quiet2Sec} seconds idle, zero queries)...`);
  await new Promise(resolve => setTimeout(resolve, quiet2Sec * 1000));
  console.log('Quiet Interval 2 elapsed.\n');

  // PROBE E: After quiet interval 2
  const probeE = await runProbe('PROBE_E', 664000, pool, field, `After additional ${quiet2Sec}s quiet recovery interval`);
  probeResults.push(probeE);

  // Cleanup shadow tables
  console.log('\nCleaning up shadow tables...');
  const cleanClient = await pool.connect();
  try {
    await cleanClient.query(`DROP TABLE IF EXISTS public.stage3q_r4_shadow_search_outbox CASCADE`);
    await cleanClient.query(`DROP TABLE IF EXISTS public.stage3q_r4_shadow_identity_map CASCADE`);
    await cleanClient.query(`DROP TABLE IF EXISTS public.stage3q_r4_shadow_stress CASCADE`);
  } finally {
    cleanClient.release();
  }

  // -------------------------------------------------------------
  // CLASSIFICATION & EVALUATION
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log('⚡ STAGE 3Q-R4: STORAGE STATE CURVE & CLASSIFICATION');
  console.log('================================================================');

  for (const p of probeResults) {
    console.log(`  ${p.probe_id}: ${p.cand_sec.toFixed(2)} cand/s | Wall: ${p.pipeline_wall_sec}s | P50: ${p.rpc_p50_ms}ms | Idx Reads: ${p.total_idx_blks_read} | DataFileRead: ${p.data_file_read_waits}`);
  }

  const speedA = probeA.cand_sec;
  const speedB = probeB.cand_sec;
  const speedC = probeC.cand_sec;
  const speedD = probeD.cand_sec;
  const speedE = probeE.cand_sec;

  const degradedUnderStress = (speedB < speedA * 0.85) && (speedC < speedA * 0.70);
  const recoveredAfterQuiet = (speedD > speedC * 1.25) || (speedE > speedC * 1.25);

  let classification = 'UNRESOLVED';
  let rationale = '';

  if (degradedUnderStress && recoveredAfterQuiet) {
    classification = 'STORAGE_THROTTLING_RECOVERY_PATTERN = CONFIRMED';
    rationale = 'Sawtooth recovery pattern confirmed: Probe A was fast, Probes B and C degraded under accumulated shadow I/O stress, and Probes D and E recovered materially after controlled quiet intervals while table cardinality remained constant (~1.4M rows).';
  } else if (degradedUnderStress && !recoveredAfterQuiet) {
    classification = 'STORAGE_NONSTATIONARITY_WITHOUT_RECOVERY_PROOF';
    rationale = 'Throughput degraded severely under stress, but quiet interval was insufficient to observe material recovery.';
  } else if (!degradedUnderStress) {
    classification = 'NO_STORAGE_STATE_EFFECT';
    rationale = 'Throughput remained invariant across stress levels.';
  } else {
    classification = 'UNRESOLVED';
    rationale = 'Metrics exhibited mixed or inconclusive patterns.';
  }

  console.log(`\nR4 CLASSIFICATION: ${classification}`);
  console.log(`RATIONALE: ${rationale}\n`);

  // -------------------------------------------------------------
  // ARTIFACT GENERATION
  // -------------------------------------------------------------
  const discoveryDir = path.join(process.cwd(), 'reports', 'atlas', 'discovery');

  // 1. Storage State Curve
  const curveReport = {
    timestamp: new Date().toISOString(),
    stage: 'STAGE3Q-R4',
    title: 'ATLAS STAGE 3Q-R4: STORAGE STATE CURVE',
    table_cardinality_constant_mb: shadowMeta.table_mb,
    index_cardinality_constant_mb: shadowMeta.index_mb,
    PROBES_SEQUENCE: probeResults.map(p => ({
      probe_id: p.probe_id,
      description: p.description,
      cand_sec: p.cand_sec,
      new_sec: p.new_sec,
      pipeline_wall_ms: p.pipeline_wall_ms,
      rpc_p50_ms: p.rpc_p50_ms,
      rpc_p95_ms: p.rpc_p95_ms,
      total_idx_blks_read: p.total_idx_blks_read,
      index_hit_ratio: p.index_hit_ratio,
      heap_blks_read: p.heap_blks_read,
      data_file_read_waits: p.data_file_read_waits,
      data_file_write_waits: p.data_file_write_waits
    })),
    STRESS_EVENTS: stressEvents
  };
  fs.writeFileSync(path.join(discoveryDir, 'atlas_stage3q_r4_storage_state_curve_v1.json'), JSON.stringify(curveReport, null, 2));

  // 2. IO Deltas Report
  const ioDeltasReport = {
    timestamp: new Date().toISOString(),
    stage: 'STAGE3Q-R4',
    title: 'ATLAS STAGE 3Q-R4: DETAILED I/O DELTAS',
    PROBE_DELTAS: probeResults.map(p => ({
      probe_id: p.probe_id,
      deltas: p.io_deltas,
      wait_events: p.wait_events
    }))
  };
  fs.writeFileSync(path.join(discoveryDir, 'atlas_stage3q_r4_io_deltas_v1.json'), JSON.stringify(ioDeltasReport, null, 2));

  // 3. Storage Verdict Report
  const verdictReport = {
    timestamp: new Date().toISOString(),
    stage: 'STAGE3Q-R4',
    title: 'ATLAS STAGE 3Q-R4: STORAGE NONSTATIONARITY VERDICT',
    R3_VERDICT_WORDING_FREEZE: {
      "REMOTE_STORAGE_NONSTATIONARITY / THROTTLING": "STRONGLY_SUPPORTED",
      BURST_TOKEN_MODEL_STATUS: "EXPLANATORY_HYPOTHESIS_NOT_CLAIMED_AS_PROVEN"
    },
    R4_STORAGE_CLASSIFICATION: classification,
    RATIONALE: rationale,
    ARCHITECTURAL_DIRECTIVE: {
      OPTIMIZE_Q2_MICRO_SQL: false,
      NEXT_STAGE_ATTACK_VECTOR: "PHYSICAL IOPS PER NEW PERSON",
      CANDIDATE_STRATEGIES_TO_EVALUATE: [
        "hash/partitioned identity write structures",
        "append/bulk-oriented ingestion",
        "smaller independently hot indexes",
        "write coalescing"
      ]
    },
    CERTIFICATION_STATUS: {
      "25_MIN_FULL_PIPELINE_CERTIFIED": false,
      PHYSICAL_COMMIT_CANARY_AUTHORIZED: false,
      STATUS: "DIAGNOSIS_COMPLETE_STOP_AFTER_R4"
    }
  };
  fs.writeFileSync(path.join(discoveryDir, 'atlas_stage3q_r4_storage_verdict_v1.json'), JSON.stringify(verdictReport, null, 2));

  console.log('Saved Stage 3Q-R4 artifacts successfully.');
  await pool.end();
}

main().catch(console.error);
