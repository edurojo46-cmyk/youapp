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
const POPULATION_SIZE = 96000;
const SHADOW_OFFSET_START = 600000;
const BATCH_SIZE = 2000;
const WORKERS = 3;

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
  console.log(`Loading ${count} deterministic candidates starting from offset ${startOffset}...`);
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

// -------------------------------------------------------------
// SQL DEFINITIONS FOR 1.5M SCALE SHADOW TABLES
// -------------------------------------------------------------

const V2_R1_SHADOW_SQL = `
CREATE OR REPLACE FUNCTION public.stage3q_r1_resolver_v2(p_candidates jsonb)
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
    SELECT atlas_person_id FROM public.stage3q_r1_shadow_identity_map s 
    WHERE s.source_id = t.source_id AND s.source_person_id = t.source_person_id LIMIT 1
  ) src_map ON TRUE
  LEFT JOIN LATERAL (
    SELECT atlas_person_id FROM public.stage3q_r1_shadow_identity_map i 
    WHERE i.identifier_type = 'NATIONAL_IDENTITY_HMAC' AND i.identifier_value = t.identifier_value 
    ORDER BY i.observed_at ASC LIMIT 1
  ) ident_match ON TRUE;

  SELECT count(*) INTO v_identity_conflicts FROM temp_resolved_candidates WHERE is_conflict = TRUE;
  SELECT count(*) FILTER (WHERE is_conflict = FALSE AND resolution_type = 'NEW'),
         count(*) FILTER (WHERE is_conflict = FALSE AND resolution_type = 'MERGE')
  INTO v_new_canonical, v_merge_existing FROM temp_resolved_candidates;

  WITH inserted_map AS (
    INSERT INTO public.stage3q_r1_shadow_identity_map (
      atlas_person_id, source_id, source_person_id, identifier_type, identifier_value, evidence_id, confidence, resolution_method, observed_at
    )
    SELECT resolved_atlas_person_id, source_id, source_person_id, 'NATIONAL_IDENTITY_HMAC', identifier_value, 'ev_arca_' || cuit, 1.0, 'DETERMINISTIC_CUIT_DNI_HMAC', now()
    FROM temp_resolved_candidates WHERE is_conflict = FALSE
    ON CONFLICT (source_id, source_person_id) DO UPDATE SET identifier_value = EXCLUDED.identifier_value
    RETURNING 1
  )
  INSERT INTO public.stage3q_r1_shadow_search_outbox (
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

const STRAT_E_R1_SHADOW_SQL = `
CREATE OR REPLACE FUNCTION public.stage3q_r1_resolver_strat_e(p_batch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $func$
DECLARE v_res jsonb;
BEGIN
  IF jsonb_array_length(p_batch) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'total_candidates', 0, 'new_canonical', 0, 'merge_existing', 0, 'identity_conflicts', 0);
  END IF;

  WITH incoming_batch AS MATERIALIZED (
    SELECT 
      (elem->>'cuit')::text                     AS cuit,
      (elem->>'raw_name')::text                 AS raw_name,
      (elem->>'normalized_name')::text          AS normalized_name,
      (elem->>'cuit_masked')::text              AS cuit_masked,
      (elem->>'identifier_value')::text         AS identifier_value,
      (elem->>'candidate_atlas_person_id')::text AS candidate_atlas_person_id,
      COALESCE((elem->>'source_id')::text, 'ARCA_CONDICION_TRIBUTARIA') AS source_id,
      COALESCE((elem->>'source_person_id')::text, (elem->>'cuit')::text) AS source_person_id
    FROM jsonb_array_elements(p_batch) AS elem
  ),
  distinct_sources AS (SELECT DISTINCT source_id, source_person_id FROM incoming_batch),
  distinct_hmacs AS (SELECT DISTINCT identifier_value FROM incoming_batch),
  matched_sources AS (
    SELECT m.source_id, m.source_person_id, m.atlas_person_id
    FROM distinct_sources ds JOIN public.stage3q_r1_shadow_identity_map m ON m.source_id = ds.source_id AND m.source_person_id = ds.source_person_id
  ),
  matched_hmacs AS (
    SELECT DISTINCT ON (m.identifier_value) m.identifier_value, m.atlas_person_id
    FROM distinct_hmacs dh JOIN public.stage3q_r1_shadow_identity_map m ON m.identifier_type = 'NATIONAL_IDENTITY_HMAC' AND m.identifier_value = dh.identifier_value
    ORDER BY m.identifier_value, m.observed_at ASC
  ),
  resolved_candidates AS (
    SELECT 
      i.cuit, i.raw_name, i.normalized_name, i.cuit_masked, i.identifier_value, i.source_id, i.source_person_id,
      CASE 
        WHEN ms.atlas_person_id IS NOT NULL AND mh.atlas_person_id IS NOT NULL AND ms.atlas_person_id != mh.atlas_person_id THEN TRUE
        WHEN ms.atlas_person_id IS NOT NULL AND mh.atlas_person_id IS NULL AND ms.atlas_person_id != i.candidate_atlas_person_id THEN TRUE
        ELSE FALSE
      END AS is_conflict,
      COALESCE(ms.atlas_person_id, mh.atlas_person_id, i.candidate_atlas_person_id) AS resolved_atlas_person_id,
      CASE WHEN ms.atlas_person_id IS NULL AND mh.atlas_person_id IS NULL THEN 'NEW' ELSE 'MERGE' END AS resolution_type
    FROM incoming_batch i
    LEFT JOIN matched_sources ms ON ms.source_id = i.source_id AND ms.source_person_id = i.source_person_id
    LEFT JOIN matched_hmacs mh ON mh.identifier_value = i.identifier_value
  ),
  inserted_map AS (
    INSERT INTO public.stage3q_r1_shadow_identity_map (
      atlas_person_id, source_id, source_person_id, identifier_type, identifier_value, evidence_id, confidence, resolution_method, observed_at
    )
    SELECT resolved_atlas_person_id, source_id, source_person_id, 'NATIONAL_IDENTITY_HMAC', identifier_value, 'ev_arca_' || cuit, 1.0, 'DETERMINISTIC_CUIT_DNI_HMAC', now()
    FROM resolved_candidates WHERE is_conflict = FALSE
    ON CONFLICT (source_id, source_person_id) DO UPDATE SET identifier_value = EXCLUDED.identifier_value
    RETURNING 1
  ),
  inserted_outbox AS (
    INSERT INTO public.stage3q_r1_shadow_search_outbox (
      atlas_person_id, source_id, source_record_id, payload, payload_version, status, attempt_count, next_retry_at
    )
    SELECT resolved_atlas_person_id, source_id, 'rec_arca_' || cuit, jsonb_build_object('atlas_person_id', resolved_atlas_person_id), 1, 'PENDING', 0, now()
    FROM resolved_candidates WHERE is_conflict = FALSE AND resolution_type = 'NEW'
    ON CONFLICT (source_id, source_record_id) DO NOTHING
    RETURNING 1
  )
  SELECT jsonb_build_object(
    'ok', true,
    'total_candidates', (SELECT count(*) FROM incoming_batch),
    'new_canonical', (SELECT count(*) FROM resolved_candidates WHERE is_conflict = FALSE AND resolution_type = 'NEW'),
    'merge_existing', (SELECT count(*) FROM resolved_candidates WHERE is_conflict = FALSE AND resolution_type = 'MERGE'),
    'identity_conflicts', (SELECT count(*) FROM resolved_candidates WHERE is_conflict = TRUE)
  ) INTO v_res;
  RETURN v_res;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$func$;
`;

const FIELD_E_R1_SHADOW_SQL = `
CREATE OR REPLACE FUNCTION public.stage3q_r1_resolver_field_e(p_batch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $func$
DECLARE v_res jsonb;
BEGIN
  IF jsonb_array_length(p_batch) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'total_candidates', 0, 'new_canonical', 0, 'merge_existing', 0, 'identity_conflicts', 0);
  END IF;

  WITH incoming_batch AS MATERIALIZED (
    SELECT 
      (elem->>'cuit')::text                     AS cuit,
      (elem->>'raw_name')::text                 AS raw_name,
      (elem->>'normalized_name')::text          AS normalized_name,
      (elem->>'cuit_masked')::text              AS cuit_masked,
      (elem->>'identifier_value')::text         AS identifier_value,
      (elem->>'candidate_atlas_person_id')::text AS candidate_atlas_person_id,
      COALESCE((elem->>'source_id')::text, 'ARCA_CONDICION_TRIBUTARIA') AS source_id,
      COALESCE((elem->>'source_person_id')::text, (elem->>'cuit')::text) AS source_person_id,
      COALESCE((elem->>'is_definitely_absent')::boolean, FALSE) AS is_definitely_absent
    FROM jsonb_array_elements(p_batch) AS elem
  ),
  distinct_sources AS (SELECT DISTINCT source_id, source_person_id FROM incoming_batch WHERE is_definitely_absent = FALSE),
  distinct_hmacs AS (SELECT DISTINCT identifier_value FROM incoming_batch WHERE is_definitely_absent = FALSE),
  matched_sources AS (
    SELECT m.source_id, m.source_person_id, m.atlas_person_id
    FROM distinct_sources ds JOIN public.stage3q_r1_shadow_identity_map m ON m.source_id = ds.source_id AND m.source_person_id = ds.source_person_id
  ),
  matched_hmacs AS (
    SELECT DISTINCT ON (m.identifier_value) m.identifier_value, m.atlas_person_id
    FROM distinct_hmacs dh JOIN public.stage3q_r1_shadow_identity_map m ON m.identifier_type = 'NATIONAL_IDENTITY_HMAC' AND m.identifier_value = dh.identifier_value
    ORDER BY m.identifier_value, m.observed_at ASC
  ),
  resolved_candidates AS (
    SELECT 
      i.cuit, i.raw_name, i.normalized_name, i.cuit_masked, i.identifier_value, i.source_id, i.source_person_id,
      CASE 
        WHEN i.is_definitely_absent = TRUE THEN FALSE
        WHEN ms.atlas_person_id IS NOT NULL AND mh.atlas_person_id IS NOT NULL AND ms.atlas_person_id != mh.atlas_person_id THEN TRUE
        WHEN ms.atlas_person_id IS NOT NULL AND mh.atlas_person_id IS NULL AND ms.atlas_person_id != i.candidate_atlas_person_id THEN TRUE
        ELSE FALSE
      END AS is_conflict,
      CASE 
        WHEN i.is_definitely_absent = TRUE THEN i.candidate_atlas_person_id
        ELSE COALESCE(ms.atlas_person_id, mh.atlas_person_id, i.candidate_atlas_person_id)
      END AS resolved_atlas_person_id,
      CASE 
        WHEN i.is_definitely_absent = TRUE THEN 'NEW'
        WHEN ms.atlas_person_id IS NULL AND mh.atlas_person_id IS NULL THEN 'NEW'
        ELSE 'MERGE'
      END AS resolution_type
    FROM incoming_batch i
    LEFT JOIN matched_sources ms ON ms.source_id = i.source_id AND ms.source_person_id = i.source_person_id
    LEFT JOIN matched_hmacs mh ON mh.identifier_value = i.identifier_value
  ),
  inserted_map AS (
    INSERT INTO public.stage3q_r1_shadow_identity_map (
      atlas_person_id, source_id, source_person_id, identifier_type, identifier_value, evidence_id, confidence, resolution_method, observed_at
    )
    SELECT resolved_atlas_person_id, source_id, source_person_id, 'NATIONAL_IDENTITY_HMAC', identifier_value, 'ev_arca_' || cuit, 1.0, 'DETERMINISTIC_CUIT_DNI_HMAC', now()
    FROM resolved_candidates WHERE is_conflict = FALSE
    ON CONFLICT (source_id, source_person_id) DO UPDATE SET identifier_value = EXCLUDED.identifier_value
    RETURNING 1
  ),
  inserted_outbox AS (
    INSERT INTO public.stage3q_r1_shadow_search_outbox (
      atlas_person_id, source_id, source_record_id, payload, payload_version, status, attempt_count, next_retry_at
    )
    SELECT resolved_atlas_person_id, source_id, 'rec_arca_' || cuit, jsonb_build_object('atlas_person_id', resolved_atlas_person_id), 1, 'PENDING', 0, now()
    FROM resolved_candidates WHERE is_conflict = FALSE AND resolution_type = 'NEW'
    ON CONFLICT (source_id, source_record_id) DO NOTHING
    RETURNING 1
  )
  SELECT jsonb_build_object(
    'ok', true,
    'total_candidates', (SELECT count(*) FROM incoming_batch),
    'new_canonical', (SELECT count(*) FROM resolved_candidates WHERE is_conflict = FALSE AND resolution_type = 'NEW'),
    'merge_existing', (SELECT count(*) FROM resolved_candidates WHERE is_conflict = FALSE AND resolution_type = 'MERGE'),
    'identity_conflicts', (SELECT count(*) FROM resolved_candidates WHERE is_conflict = TRUE)
  ) INTO v_res;
  RETURN v_res;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$func$;
`;

// Helper: Fast Write CTE with RETURNING input_ordinal
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
  INSERT INTO public.stage3q_r1_shadow_identity_map (
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
  INSERT INTO public.stage3q_r1_shadow_search_outbox (
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

async function executeFullPipelineQ2Batch(client, rawBatch, field, isOrdered = false) {
  // 1. Timing starts BEFORE field classification
  const t0 = performance.now();

  // 2. Memory-side Identity Field Classification
  const fastPathCandidates = [];
  const fallbackCandidates = [];

  for (let i = 0; i < rawBatch.length; i++) {
    const c = rawBatch[i];
    const isAbsent = field.classifyCandidate(c).classification === 'DEFINITELY_ABSENT';
    const tagged = { ...c, input_ordinal: i, is_definitely_absent: isAbsent };
    if (isAbsent) {
      fastPathCandidates.push(tagged);
    } else {
      fallbackCandidates.push(tagged);
    }
  }

  // 3. Optional Ordering (Source-key ordering)
  let orderedFastPath = fastPathCandidates;
  if (isOrdered) {
    orderedFastPath = [...fastPathCandidates].sort((a, b) => a.source_person_id.localeCompare(b.source_person_id));
  }

  let fastPathInsertedCount = 0;
  let fallbackNewCount = 0;
  let fallbackMergeCount = 0;
  let fallbackConflictCount = 0;

  // 4. Database Transaction
  await client.query('BEGIN');
  try {
    // 4A. Fast Path Execution
    if (orderedFastPath.length > 0) {
      const fpRes = await client.query(Q2_FAST_PATH_SQL, [JSON.stringify(orderedFastPath)]);
      const insertedOrdinals = new Set(fpRes.rows.map(r => r.input_ordinal));
      fastPathInsertedCount = insertedOrdinals.size;

      // Identify unexpected conflicts and add to fallback
      for (const cand of orderedFastPath) {
        if (!insertedOrdinals.has(cand.input_ordinal)) {
          fallbackCandidates.push(cand);
        }
      }
    }

    // 4B. Fallback Reconciliation Execution via V2
    if (fallbackCandidates.length > 0) {
      const fbRes = await client.query(
        `SELECT public.stage3q_r1_resolver_v2($1::jsonb) as res`,
        [JSON.stringify(fallbackCandidates)]
      );
      const r = fbRes.rows[0].res;
      if (r && r.ok) {
        fallbackNewCount = r.new_canonical || 0;
        fallbackMergeCount = r.merge_existing || 0;
        fallbackConflictCount = r.identity_conflicts || 0;
      }
    }

    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }

  // 5. Timing stops ONLY when all candidates have final decision
  const wallMs = performance.now() - t0;

  const totalInput = rawBatch.length;
  const totalNew = fastPathInsertedCount + fallbackNewCount;
  const totalMerge = fallbackMergeCount;
  const totalConflict = fallbackConflictCount;
  const totalAccounted = totalNew + totalMerge + totalConflict;
  const unaccounted = totalInput - totalAccounted;

  return {
    wall_ms: wallMs,
    total_input: totalInput,
    fast_path_input: fastPathCandidates.length,
    fast_path_inserted: fastPathInsertedCount,
    fallback_input: fallbackCandidates.length,
    total_new: totalNew,
    total_merge: totalMerge,
    total_conflict: totalConflict,
    unaccounted: unaccounted
  };
}

async function executeStandardBatch(client, rawBatch, fnName) {
  const t0 = performance.now();
  await client.query('BEGIN');
  let res = null;
  try {
    const qRes = await client.query(`SELECT ${fnName}($1::jsonb) as res`, [JSON.stringify(rawBatch)]);
    res = qRes.rows[0].res;
    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
  const wallMs = performance.now() - t0;

  const totalInput = rawBatch.length;
  const totalNew = res.new_canonical || 0;
  const totalMerge = res.merge_existing || 0;
  const totalConflict = res.identity_conflicts || 0;
  const unaccounted = totalInput - (totalNew + totalMerge + totalConflict);

  return {
    wall_ms: wallMs,
    total_input: totalInput,
    fast_path_input: 0,
    fast_path_inserted: 0,
    fallback_input: totalInput,
    total_new: totalNew,
    total_merge: totalMerge,
    total_conflict: totalConflict,
    unaccounted: unaccounted
  };
}

async function runWorkerPool(pool, batches, workers, runnerFn) {
  let nextIdx = 0;
  let totalInput = 0;
  let totalNew = 0;
  let totalMerge = 0;
  let totalConflict = 0;
  let totalUnaccounted = 0;
  const rpcDurations = [];

  const t0 = performance.now();

  async function worker() {
    const client = await pool.connect();
    try {
      while (true) {
        let b = null;
        synchronized: {
          if (nextIdx >= batches.length) break;
          b = batches[nextIdx++];
        }

        const r = await runnerFn(client, b);
        rpcDurations.push(r.wall_ms);
        totalInput += r.total_input;
        totalNew += r.total_new;
        totalMerge += r.total_merge;
        totalConflict += r.total_conflict;
        totalUnaccounted += r.unaccounted;
      }
    } finally {
      client.release();
    }
  }

  const workerPromises = [];
  for (let w = 0; w < workers; w++) {
    workerPromises.push(worker());
  }
  await Promise.all(workerPromises);
  const wallSec = (performance.now() - t0) / 1000;

  rpcDurations.sort((a, b) => a - b);
  const p50 = rpcDurations[Math.floor(rpcDurations.length * 0.50)] || 0;
  const p95 = rpcDurations[Math.floor(rpcDurations.length * 0.95)] || 0;

  const candSec = totalInput / wallSec;
  const newSec = totalNew / wallSec;

  return {
    wall_sec: wallSec,
    total_input: totalInput,
    total_new: totalNew,
    total_merge: totalMerge,
    total_conflict: totalConflict,
    unaccounted: totalUnaccounted,
    cand_sec: candSec,
    new_sec: newSec,
    p50_ms: p50,
    p95_ms: p95
  };
}

async function main() {
  console.log('================================================================');
  console.log('⚡ STAGE 3Q-R1: 96K FULL-PIPELINE SUSTAINED CERTIFICATION');
  console.log('================================================================\n');

  console.log('1. Loading Identity Induction Field...');
  const field = IdentityInductionField.loadFromFile(BINARY_FIELD_PATH);
  console.log(`Field loaded: ${field.fieldSource.count + field.fieldStable.count} keys.\n`);

  console.log(`2. Loading ${POPULATION_SIZE} candidates from offset ${SHADOW_OFFSET_START}...`);
  const population = await loadDeterministicPopulation(SHADOW_OFFSET_START, POPULATION_SIZE);
  console.log(`Loaded ${population.length} candidates.\n`);

  // Split into 48 batches of size 2000
  const batches = [];
  for (let i = 0; i < population.length; i += BATCH_SIZE) {
    batches.push(population.slice(i, i + BATCH_SIZE));
  }
  console.log(`Batches prepared: ${batches.length} batches of size ${BATCH_SIZE}.\n`);

  const pool = new pg.Pool({ ...parseDbUrl(), max: WORKERS + 3 });
  const setupClient = await pool.connect();

  try {
    console.log('3. Registering SQL functions on 1.5M shadow environment...');
    await setupClient.query(V2_R1_SHADOW_SQL);
    await setupClient.query(STRAT_E_R1_SHADOW_SQL);
    await setupClient.query(FIELD_E_R1_SHADOW_SQL);
    console.log('Functions registered successfully.\n');
  } finally {
    setupClient.release();
  }

  // Architectures to test across 3 balanced repeats:
  // A. V2
  // B. Strategy E
  // C. Field-Assisted E
  // D. Q2 Full Pipeline (Unsorted)
  // E. Q2 Full Pipeline (Source-Key Ordered)
  const archs = [
    {
      tag: 'RESOLVER_V2',
      fn: (client, b) => executeStandardBatch(client, b, 'public.stage3q_r1_resolver_v2')
    },
    {
      tag: 'STRATEGY_E',
      fn: (client, b) => executeStandardBatch(client, b, 'public.stage3q_r1_resolver_strat_e')
    },
    {
      tag: 'FIELD_ASSISTED_E',
      fn: (client, b) => {
        // Tag with field
        const tagged = b.map(c => ({
          ...c,
          is_definitely_absent: field.classifyCandidate(c).classification === 'DEFINITELY_ABSENT'
        }));
        return executeStandardBatch(client, tagged, 'public.stage3q_r1_resolver_field_e');
      }
    },
    {
      tag: 'Q2_FULL_PIPELINE_UNSORTED',
      fn: (client, b) => executeFullPipelineQ2Batch(client, b, field, false)
    },
    {
      tag: 'Q2_ORDERED_FULL_PIPELINE',
      fn: (client, b) => executeFullPipelineQ2Batch(client, b, field, true)
    }
  ];

  const results = {};
  for (const a of archs) {
    results[a.tag] = [];
  }

  const REPEATS = 3;
  console.log(`4. Executing 3 Balanced Repeats across ${archs.length} Architectures...\n`);

  for (let r = 1; r <= REPEATS; r++) {
    console.log(`=================== BALANCED REPEAT ${r} / ${REPEATS} ===================`);
    // Balanced execution order: rotate architectures per repeat
    const rotatedArchs = [...archs];
    if (r === 2) rotatedArchs.reverse();
    if (r === 3) rotatedArchs.sort(() => 0.5 - Math.random());

    for (const arch of rotatedArchs) {
      console.log(`Running Repeat ${r}: ${arch.tag}...`);
      const res = await runWorkerPool(pool, batches, WORKERS, arch.fn);
      console.log(`  -> ${res.cand_sec.toFixed(2)} cand/s | ${res.new_sec.toFixed(2)} NEW/s | P50: ${res.p50_ms.toFixed(1)}ms | P95: ${res.p95_ms.toFixed(1)}ms | Unaccounted: ${res.unaccounted}`);
      results[arch.tag].push(res);
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    console.log('');
  }

  function summarizeArch(runs) {
    const cands = runs.map(r => r.cand_sec).sort((a, b) => a - b);
    const news = runs.map(r => r.new_sec).sort((a, b) => a - b);
    const p50s = runs.map(r => r.p50_ms).sort((a, b) => a - b);
    const p95s = runs.map(r => r.p95_ms).sort((a, b) => a - b);
    const median = arr => arr[Math.floor(arr.length / 2)];
    return {
      runs: runs.length,
      cand_sec_min: Number(cands[0].toFixed(2)),
      cand_sec_median: Number(median(cands).toFixed(2)),
      cand_sec_max: Number(cands[cands.length - 1].toFixed(2)),
      new_sec_median: Number(median(news).toFixed(2)),
      p50_ms_median: Number(median(p50s).toFixed(1)),
      p95_ms_median: Number(median(p95s).toFixed(1)),
      unaccounted_candidates_total: runs.reduce((a, b) => a + b.unaccounted, 0)
    };
  }

  const summary = {};
  for (const a of archs) {
    summary[a.tag] = summarizeArch(results[a.tag]);
  }

  const v2Median = summary['RESOLVER_V2'].cand_sec_median;
  const stratEMedian = summary['STRATEGY_E'].cand_sec_median;
  const fieldEMedian = summary['FIELD_ASSISTED_E'].cand_sec_median;
  const q2UnsortedMedian = summary['Q2_FULL_PIPELINE_UNSORTED'].cand_sec_median;
  const q2OrderedMedian = summary['Q2_ORDERED_FULL_PIPELINE'].cand_sec_median;

  const orderingSpeedup = Number((q2OrderedMedian / q2UnsortedMedian).toFixed(4));
  const speedupVsFieldE = Number((q2OrderedMedian / fieldEMedian).toFixed(4));
  const speedupVsV2 = Number((q2OrderedMedian / v2Median).toFixed(4));

  console.log('================================================================');
  console.log('⚡ 96K FULL-PIPELINE SUSTAINED SUMMARY (MEDIANS)');
  console.log('================================================================');
  console.log(`RESOLVER_V2:                 ${v2Median.toFixed(2)} cand/s`);
  console.log(`STRATEGY_E:                  ${stratEMedian.toFixed(2)} cand/s`);
  console.log(`FIELD_ASSISTED_E:            ${fieldEMedian.toFixed(2)} cand/s`);
  console.log(`Q2_FULL_PIPELINE_UNSORTED:   ${q2UnsortedMedian.toFixed(2)} cand/s`);
  console.log(`Q2_ORDERED_FULL_PIPELINE:    ${q2OrderedMedian.toFixed(2)} cand/s`);
  console.log(`Ordering Paired Speedup:     ${orderingSpeedup.toFixed(4)}x (+${(((orderingSpeedup - 1)) * 100).toFixed(2)}%)`);
  console.log(`Q2 Ordered vs Field-E:       ${speedupVsFieldE.toFixed(4)}x (+${(((speedupVsFieldE - 1)) * 100).toFixed(2)}%)`);
  console.log(`Q2 Ordered vs V2:            ${speedupVsV2.toFixed(4)}x (+${(((speedupVsV2 - 1)) * 100).toFixed(2)}%)`);
  console.log('================================================================\n');

  const gate6Passed = q2OrderedMedian >= 739.0 && summary['Q2_ORDERED_FULL_PIPELINE'].new_sec_median >= 666.67;

  const report96k = {
    timestamp: new Date().toISOString(),
    stage: 'STAGE3Q-R1',
    title: 'ATLAS STAGE 3Q-R1: 96K FULL-PIPELINE SUSTAINED CERTIFICATION',
    parameters: {
      population: POPULATION_SIZE,
      batch_size: BATCH_SIZE,
      workers: WORKERS,
      repeats: REPEATS,
      shadow_cardinality: 1500000
    },
    CARDINALITY_ACCOUNTING: {
      UNACCOUNTED_CANDIDATES: summary['Q2_ORDERED_FULL_PIPELINE'].unaccounted_candidates_total,
      VERDICT: summary['Q2_ORDERED_FULL_PIPELINE'].unaccounted_candidates_total === 0 ? 'PASS' : 'FAIL'
    },
    architectures: summary,
    PAIRED_SPEEDUPS: {
      ORDERING_PAIRED_SPEEDUP_MEDIAN: orderingSpeedup,
      PAIRED_SPEEDUP_VS_FIELD_E: speedupVsFieldE,
      PAIRED_SPEEDUP_VS_V2: speedupVsV2
    },
    TWENTY_FIVE_MINUTE_GATE: {
      TARGET_CAND_SEC: 739.0,
      ACHIEVED_FULL_PIPELINE_CAND_SEC: q2OrderedMedian,
      TARGET_NEW_SEC: 666.67,
      ACHIEVED_FULL_PIPELINE_NEW_SEC: summary['Q2_ORDERED_FULL_PIPELINE'].new_sec_median,
      VERDICT: gate6Passed ? 'PASS' : 'FAIL_NARROW'
    }
  };

  const reportPath = path.join(process.cwd(), 'reports', 'atlas', 'discovery', 'atlas_stage3q_r1_full_pipeline_96k_v1.json');
  fs.writeFileSync(reportPath, JSON.stringify(report96k, null, 2));
  console.log(`Saved 96K certification report: ${reportPath}`);

  // Cleanup functions
  const cleanupClient = await pool.connect();
  try {
    await cleanupClient.query(`DROP FUNCTION IF EXISTS public.stage3q_r1_resolver_v2(jsonb)`);
    await cleanupClient.query(`DROP FUNCTION IF EXISTS public.stage3q_r1_resolver_strat_e(jsonb)`);
    await cleanupClient.query(`DROP FUNCTION IF EXISTS public.stage3q_r1_resolver_field_e(jsonb)`);
  } finally {
    cleanupClient.release();
    await pool.end();
  }
}

main().catch(console.error);
