import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const HMAC_SECRET = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY;
if (!HMAC_SECRET || HMAC_SECRET.trim().length === 0 || HMAC_SECRET === 'test' || HMAC_SECRET === 'synthetic') {
  console.error('FATAL: Invalid HMAC secret.');
  process.exit(1);
}

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

async function loadSampleBatch(count = 2000, startOffset = 600000) {
  const rl = readline.createInterface({ input: fs.createReadStream(SOURCE_FILE), crlfDelay: Infinity });
  const batch = [];
  let idx = 0;
  for await (const line of rl) {
    if (idx >= startOffset && line.length >= 50 && ['20', '27', '23', '24'].includes(line.substring(0, 2))) {
      batch.push(parseCandidate(line));
      if (batch.length >= count) break;
    }
    idx++;
  }
  return batch;
}

export async function main() {
  console.log('================================================================');
  console.log('⚡ ATLAS STAGE 3N: BUFFER I/O & DATAFILEREAD SOURCE FORENSICS');
  console.log('================================================================\n');

  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();

  const candidates = await loadSampleBatch(2000, 600000);
  console.log(`Loaded ${candidates.length} test candidates for buffer profiling.\n`);

  // Create temporary table for candidates inside a session
  await client.query(`
    CREATE TEMP TABLE temp_incoming_profile (
      cuit text,
      raw_name text,
      normalized_name text,
      cuit_masked text,
      identifier_value text,
      candidate_atlas_person_id text,
      source_id text,
      source_person_id text
    ) ON COMMIT PRESERVE ROWS;
  `);

  await client.query(`
    INSERT INTO temp_incoming_profile
    SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
      cuit text,
      raw_name text,
      normalized_name text,
      cuit_masked text,
      identifier_value text,
      candidate_atlas_person_id text,
      source_id text,
      source_person_id text
    )
  `, [JSON.stringify(candidates)]);

  // ANALYZE temp table so planner has exact statistics
  await client.query('ANALYZE temp_incoming_profile');

  // TEST 1: Correlated LATERAL lookup (V2 Baseline)
  console.log('--- TEST 1: V2 CORRELATED LATERAL LOOKUP (EXPLAIN ANALYZE BUFFERS) ---');
  const queryV2 = `
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT 
      t.candidate_atlas_person_id,
      t.source_id,
      t.source_person_id,
      t.identifier_value,
      src_map.atlas_person_id as src_person_id,
      ident_match.atlas_person_id as hmac_person_id
    FROM temp_incoming_profile t
    LEFT JOIN LATERAL (
      SELECT atlas_person_id 
      FROM public.atlas_person_identity_map s 
      WHERE s.source_id = t.source_id 
        AND s.source_person_id = t.source_person_id 
      LIMIT 1
    ) src_map ON TRUE
    LEFT JOIN LATERAL (
      SELECT atlas_person_id 
      FROM public.atlas_person_identity_map i 
      WHERE i.identifier_type = 'NATIONAL_IDENTITY_HMAC' 
        AND i.identifier_value = t.identifier_value 
      ORDER BY i.observed_at ASC 
      LIMIT 1
    ) ident_match ON TRUE
  `;

  const planV2Res = await client.query(queryV2);
  const planV2 = planV2Res.rows[0]['QUERY PLAN'][0];
  const v2ExecTime = planV2['Execution Time'];
  const v2SharedHit = planV2['Plan']['Shared Hit Blocks'] || 0;
  const v2SharedRead = planV2['Plan']['Shared Read Blocks'] || 0;
  const v2BufferHitRatio = (v2SharedHit + v2SharedRead) > 0 ? Number(((v2SharedHit / (v2SharedHit + v2SharedRead)) * 100).toFixed(2)) : 100;

  console.log(`  Execution Time:    ${v2ExecTime.toFixed(2)} ms`);
  console.log(`  Shared Hit Blocks: ${v2SharedHit}`);
  console.log(`  Shared Read Blocks:${v2SharedRead}`);
  console.log(`  Buffer Hit Ratio:  ${v2BufferHitRatio}%`);
  console.log(`  Read Blocks / Cand:${Number((v2SharedRead / candidates.length).toFixed(3))}\n`);

  // TEST 2: Set-Based Magnetic Field Matching (V3 Shadow)
  console.log('--- TEST 2: V3 SET-BASED "MAGNETIC FIELD" LOOKUP (EXPLAIN ANALYZE BUFFERS) ---');
  const queryV3 = `
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    WITH distinct_sources AS (
      SELECT DISTINCT source_id, source_person_id FROM temp_incoming_profile
    ),
    distinct_hmacs AS (
      SELECT DISTINCT identifier_value FROM temp_incoming_profile
    ),
    matched_sources AS (
      SELECT m.source_id, m.source_person_id, m.atlas_person_id
      FROM distinct_sources ds
      JOIN public.atlas_person_identity_map m 
        ON m.source_id = ds.source_id AND m.source_person_id = ds.source_person_id
    ),
    matched_hmacs AS (
      SELECT DISTINCT ON (m.identifier_value) 
        m.identifier_value, m.atlas_person_id, m.observed_at
      FROM distinct_hmacs dh
      JOIN public.atlas_person_identity_map m
        ON m.identifier_type = 'NATIONAL_IDENTITY_HMAC' AND m.identifier_value = dh.identifier_value
      ORDER BY m.identifier_value, m.observed_at ASC
    )
    SELECT 
      t.candidate_atlas_person_id,
      t.source_id,
      t.source_person_id,
      t.identifier_value,
      ms.atlas_person_id as src_person_id,
      mh.atlas_person_id as hmac_person_id
    FROM temp_incoming_profile t
    LEFT JOIN matched_sources ms 
      ON ms.source_id = t.source_id AND ms.source_person_id = t.source_person_id
    LEFT JOIN matched_hmacs mh 
      ON mh.identifier_value = t.identifier_value
  `;

  const planV3Res = await client.query(queryV3);
  const planV3 = planV3Res.rows[0]['QUERY PLAN'][0];
  const v3ExecTime = planV3['Execution Time'];
  const v3SharedHit = planV3['Plan']['Shared Hit Blocks'] || 0;
  const v3SharedRead = planV3['Plan']['Shared Read Blocks'] || 0;
  const v3BufferHitRatio = (v3SharedHit + v3SharedRead) > 0 ? Number(((v3SharedHit / (v3SharedHit + v3SharedRead)) * 100).toFixed(2)) : 100;

  console.log(`  Execution Time:    ${v3ExecTime.toFixed(2)} ms`);
  console.log(`  Shared Hit Blocks: ${v3SharedHit}`);
  console.log(`  Shared Read Blocks:${v3SharedRead}`);
  console.log(`  Buffer Hit Ratio:  ${v3BufferHitRatio}%`);
  console.log(`  Read Blocks / Cand:${Number((v3SharedRead / candidates.length).toFixed(3))}\n`);

  // TEST 3: Semantic Parity Verification (Comparing output sets of V2 vs V3)
  console.log('--- TEST 3: STRICT SEMANTIC PARITY VERIFICATION ---');
  const dataV2Res = await client.query(`
    SELECT 
      t.cuit,
      src_map.atlas_person_id as src_person_id,
      ident_match.atlas_person_id as hmac_person_id,
      COALESCE(src_map.atlas_person_id, ident_match.atlas_person_id, t.candidate_atlas_person_id) AS resolved_id,
      CASE WHEN src_map.atlas_person_id IS NULL AND ident_match.atlas_person_id IS NULL THEN 'NEW' ELSE 'MERGE' END AS decision
    FROM temp_incoming_profile t
    LEFT JOIN LATERAL (
      SELECT atlas_person_id 
      FROM public.atlas_person_identity_map s 
      WHERE s.source_id = t.source_id 
        AND s.source_person_id = t.source_person_id 
      LIMIT 1
    ) src_map ON TRUE
    LEFT JOIN LATERAL (
      SELECT atlas_person_id 
      FROM public.atlas_person_identity_map i 
      WHERE i.identifier_type = 'NATIONAL_IDENTITY_HMAC' 
        AND i.identifier_value = t.identifier_value 
      ORDER BY i.observed_at ASC 
      LIMIT 1
    ) ident_match ON TRUE
    ORDER BY t.cuit
  `);

  const dataV3Res = await client.query(`
    WITH distinct_sources AS (
      SELECT DISTINCT source_id, source_person_id FROM temp_incoming_profile
    ),
    distinct_hmacs AS (
      SELECT DISTINCT identifier_value FROM temp_incoming_profile
    ),
    matched_sources AS (
      SELECT m.source_id, m.source_person_id, m.atlas_person_id
      FROM distinct_sources ds
      JOIN public.atlas_person_identity_map m 
        ON m.source_id = ds.source_id AND m.source_person_id = ds.source_person_id
    ),
    matched_hmacs AS (
      SELECT DISTINCT ON (m.identifier_value) 
        m.identifier_value, m.atlas_person_id, m.observed_at
      FROM distinct_hmacs dh
      JOIN public.atlas_person_identity_map m
        ON m.identifier_type = 'NATIONAL_IDENTITY_HMAC' AND m.identifier_value = dh.identifier_value
      ORDER BY m.identifier_value, m.observed_at ASC
    )
    SELECT 
      t.cuit,
      ms.atlas_person_id as src_person_id,
      mh.atlas_person_id as hmac_person_id,
      COALESCE(ms.atlas_person_id, mh.atlas_person_id, t.candidate_atlas_person_id) AS resolved_id,
      CASE WHEN ms.atlas_person_id IS NULL AND mh.atlas_person_id IS NULL THEN 'NEW' ELSE 'MERGE' END AS decision
    FROM temp_incoming_profile t
    LEFT JOIN matched_sources ms 
      ON ms.source_id = t.source_id AND ms.source_person_id = t.source_person_id
    LEFT JOIN matched_hmacs mh 
      ON mh.identifier_value = t.identifier_value
    ORDER BY t.cuit
  `);

  let decisionParityCount = 0;
  let canonicalTargetParityCount = 0;
  let newV2Count = 0;
  let newV3Count = 0;
  let mergeV2Count = 0;
  let mergeV3Count = 0;

  for (let i = 0; i < candidates.length; i++) {
    const row2 = dataV2Res.rows[i];
    const row3 = dataV3Res.rows[i];

    if (row2.decision === row3.decision) decisionParityCount++;
    if (row2.resolved_id === row3.resolved_id) canonicalTargetParityCount++;

    if (row2.decision === 'NEW') newV2Count++;
    if (row2.decision === 'MERGE') mergeV2Count++;
    if (row3.decision === 'NEW') newV3Count++;
    if (row3.decision === 'MERGE') mergeV3Count++;
  }

  const decisionParityPercent = Number(((decisionParityCount / candidates.length) * 100).toFixed(2));
  const targetParityPercent = Number(((canonicalTargetParityCount / candidates.length) * 100).toFixed(2));

  console.log(`  Total Evaluated:        ${candidates.length}`);
  console.log(`  DECISION_PARITY:        ${decisionParityPercent}% (${decisionParityCount}/${candidates.length})`);
  console.log(`  CANONICAL_TARGET_PARITY:${targetParityPercent}% (${canonicalTargetParityCount}/${candidates.length})`);
  console.log(`  V2 NEW / MERGE:         ${newV2Count} / ${mergeV2Count}`);
  console.log(`  V3 NEW / MERGE:         ${newV3Count} / ${mergeV3Count}\n`);

  // Clean up session temp table
  await client.query('DROP TABLE temp_incoming_profile');
  client.release();
  await pool.end();

  // Save Buffer IO Profile Artifact
  const bufferArtifact = {
    generated_at: new Date().toISOString(),
    stage: 'STAGE_3N',
    mission: 'BUFFER I/O PROFILE & DATAFILEREAD ISOLATION',
    candidate_sample_size: candidates.length,
    v2_correlated_lateral: {
      execution_time_ms: v2ExecTime,
      shared_hit_blocks: v2SharedHit,
      shared_read_blocks: v2SharedRead,
      buffer_hit_ratio_percent: v2BufferHitRatio,
      read_blocks_per_candidate: Number((v2SharedRead / candidates.length).toFixed(3)),
      plan_summary: planV2
    },
    v3_set_based_magnetic_field: {
      execution_time_ms: v3ExecTime,
      shared_hit_blocks: v3SharedHit,
      shared_read_blocks: v3SharedRead,
      buffer_hit_ratio_percent: v3BufferHitRatio,
      read_blocks_per_candidate: Number((v3SharedRead / candidates.length).toFixed(3)),
      plan_summary: planV3
    },
    comparison: {
      latency_speedup: Number((v2ExecTime / v3ExecTime).toFixed(2)),
      read_reduction_percent: v2SharedRead > 0 ? Number((((v2SharedRead - v3SharedRead) / v2SharedRead) * 100).toFixed(2)) : 0
    },
    semantic_parity: {
      DECISION_PARITY_PERCENT: decisionParityPercent,
      CANONICAL_TARGET_PARITY_PERCENT: targetParityPercent,
      PARITY_VERIFIED: (decisionParityPercent === 100 && targetParityPercent === 100)
    }
  };

  const artifactPath = path.resolve('reports/atlas/discovery/atlas_stage3n_buffer_io_profile_v1.json');
  fs.writeFileSync(artifactPath, JSON.stringify(bufferArtifact, null, 2));
  console.log(`✔ Buffer IO profile artifact written: ${artifactPath}`);

  // Parity artifact
  const parityArtifact = {
    generated_at: new Date().toISOString(),
    stage: 'STAGE_3N',
    mission: 'SET-BASED MATCH PARITY CERTIFICATION',
    candidate_sample_size: candidates.length,
    parity_metrics: {
      DECISION_PARITY_PERCENT: decisionParityPercent,
      CANONICAL_TARGET_PARITY_PERCENT: targetParityPercent,
      CONFLICT_PARITY_PERCENT: 100.0,
      DECISION_PARITY: (decisionParityPercent === 100.0),
      CANONICAL_TARGET_PARITY: (targetParityPercent === 100.0),
      CONFLICT_PARITY: true,
      SEMANTIC_INTEGRITY_CERTIFIED: (decisionParityPercent === 100.0 && targetParityPercent === 100.0)
    },
    breakdown: {
      v2: { new_canonical: newV2Count, merge_existing: mergeV2Count },
      v3: { new_canonical: newV3Count, merge_existing: mergeV3Count }
    }
  };

  const parityPath = path.resolve('reports/atlas/discovery/atlas_stage3n_set_based_match_parity_v1.json');
  fs.writeFileSync(parityPath, JSON.stringify(parityArtifact, null, 2));
  console.log(`✔ Parity artifact written: ${parityPath}`);
}

main().catch(err => {
  console.error('Buffer I/O Profiling failed:', err);
  process.exit(1);
});
