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
const BINARY_FIELD_PATH = 'cache_gate31d/identity_field_base.bin';

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

async function loadSlice(startOffset, count) {
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

async function main() {
  console.log('================================================================');
  console.log('⚡ STAGE 3Q-R1: FORMAL THROUGHPUT DENOMINATOR ERRATA');
  console.log('================================================================\n');

  const field = IdentityInductionField.loadFromFile(BINARY_FIELD_PATH);
  const candidates = await loadSlice(600000, 2000);
  console.log(`Loaded ${candidates.length} candidates.`);

  // 1. Measure Field Classification Wall Time
  const tField0 = performance.now();
  const classified = candidates.map((c, idx) => ({
    ...c,
    input_ordinal: idx,
    is_definitely_absent: field.classifyCandidate(c).classification === 'DEFINITELY_ABSENT'
  }));
  const fieldWallMs = performance.now() - tField0;

  const fastPathCandidates = classified.filter(c => c.is_definitely_absent);
  const fallbackCandidates = classified.filter(c => !c.is_definitely_absent);

  console.log(`Field classified:`);
  console.log(`  Fast Path (Definitely Absent): ${fastPathCandidates.length} (${((fastPathCandidates.length / candidates.length) * 100).toFixed(2)}%)`);
  console.log(`  Fallback:                      ${fallbackCandidates.length} (${((fallbackCandidates.length / candidates.length) * 100).toFixed(2)}%)`);
  console.log(`  Field Classification Time:     ${fieldWallMs.toFixed(3)} ms\n`);

  // 2. Measure Sort Wall Time
  const tSort0 = performance.now();
  const sortedFastPath = [...fastPathCandidates].sort((a, b) => a.source_person_id.localeCompare(b.source_person_id));
  const sortWallMs = performance.now() - tSort0;
  console.log(`Sort Time: ${sortWallMs.toFixed(3)} ms\n`);

  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();

  try {
    // 3. Measure Fast Path Only Wall Time on Production Table (inside rollback)
    const fastPathSql = `
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
        INSERT INTO public.atlas_person_identity_map (
          atlas_person_id, source_id, source_person_id, identifier_type,
          identifier_value, evidence_id, confidence, resolution_method, observed_at
        )
        SELECT 
          atlas_person_id,
          source_id,
          source_person_id,
          'NATIONAL_IDENTITY_HMAC',
          identifier_value,
          'ev_arca_' || source_person_id,
          1.0,
          'DETERMINISTIC_CUIT_DNI_HMAC',
          now()
        FROM deduped_input
        ON CONFLICT DO NOTHING
        RETURNING source_id, source_person_id, atlas_person_id
      ),
      insert_outbox AS (
        INSERT INTO public.atlas_search_outbox (
          atlas_person_id, source_id, source_record_id, payload, payload_version,
          status, attempt_count, next_retry_at
        )
        SELECT 
          m.atlas_person_id,
          m.source_id,
          'rec_arca_' || d.cuit,
          jsonb_build_object(
            'atlas_person_id', m.atlas_person_id,
            'display_name', d.normalized_name,
            'cuit_masked', d.cuit_masked,
            'source_surface_id', 'SURF_ARCA_RG1817',
            'entity_type', 'NATURAL_PERSON'
          ),
          1,
          'PENDING',
          0,
          now()
        FROM insert_map m
        JOIN deduped_input d ON d.source_id = m.source_id AND d.source_person_id = m.source_person_id
        ON CONFLICT DO NOTHING
        RETURNING source_id, source_record_id
      )
      SELECT d.input_ordinal, d.source_id, d.source_person_id
      FROM insert_map m
      JOIN deduped_input d ON d.source_id = m.source_id AND d.source_person_id = m.source_person_id;
    `;

    await client.query('BEGIN');
    const tFast0 = performance.now();
    await client.query(fastPathSql, [JSON.stringify(sortedFastPath)]);
    const fastPathWallMs = performance.now() - tFast0;
    await client.query('ROLLBACK');
    console.log(`Fast Path Wall Time: ${fastPathWallMs.toFixed(1)} ms`);

    // 4. Measure Fallback Wall Time (200 candidates through Resolver V2 inside rollback)
    await client.query('BEGIN');
    const tFb0 = performance.now();
    await client.query(
      `SELECT public.resolve_and_commit_candidate_batch_v2($1::jsonb) as res`,
      [JSON.stringify(fallbackCandidates)]
    );
    const fallbackWallMs = performance.now() - tFb0;
    await client.query('ROLLBACK');
    console.log(`Fallback Wall Time:  ${fallbackWallMs.toFixed(1)} ms\n`);

    const fullBatchWallMs = fieldWallMs + sortWallMs + fastPathWallMs + fallbackWallMs;
    const fastPathOnlyCandSec = fastPathCandidates.length / (fastPathWallMs / 1000);
    const fullPipelineCandSec = candidates.length / (fullBatchWallMs / 1000);

    console.log('================================================================');
    console.log('⚡ THROUGHPUT METRIC COMPARISON: FAST-PATH ONLY vs FULL PIPELINE');
    console.log('================================================================');
    console.log(`FAST_PATH_ONLY_CAND_SEC:  ${fastPathOnlyCandSec.toFixed(2)} cand/s (numerator: ${fastPathCandidates.length}, wall: ${fastPathWallMs.toFixed(1)} ms)`);
    console.log(`FULL_PIPELINE_CAND_SEC:   ${fullPipelineCandSec.toFixed(2)} cand/s (numerator: ${candidates.length}, wall: ${fullBatchWallMs.toFixed(1)} ms)`);
    console.log(`Denominator Divergence:   ${((1 - (fullPipelineCandSec / fastPathOnlyCandSec)) * 100).toFixed(2)}% drop when including fallback & pipeline overhead`);
    console.log('================================================================\n');

    const errataReport = {
      timestamp: new Date().toISOString(),
      stage: 'STAGE3Q-R1',
      title: 'ATLAS STAGE 3Q-R1: FORMAL THROUGHPUT DENOMINATOR ERRATA',
      ERRATA_STATEMENT: 'The production probe in Stage 3Q reported Q2 throughput as 753.50 cand/s and 832.89 cand/s using only the 1,800 DEFINITELY_ABSENT candidates as the numerator (1800 / 2.3889s and 1800 / 2.1611s). It did not include the execution time of the 200 fallback candidates through Resolver V2, nor the memory-side field classification and sorting overhead.',
      STAGE3Q_GATE_6_25MIN_CERTIFIED: false,
      BREAKDOWN: {
        TOTAL_INPUT_CANDIDATES: candidates.length,
        FAST_PATH_CANDIDATES: fastPathCandidates.length,
        FALLBACK_CANDIDATES: fallbackCandidates.length,
        THROUGHPUT_NUMERATOR_USED_IN_STAGE3Q_PROBE: fastPathCandidates.length,
        AUTHORITATIVE_THROUGHPUT_NUMERATOR: candidates.length,
        FIELD_CLASSIFICATION_WALL_MS: Number(fieldWallMs.toFixed(3)),
        SORT_WALL_MS: Number(sortWallMs.toFixed(3)),
        FAST_PATH_ONLY_WALL_MS: Number(fastPathWallMs.toFixed(1)),
        FALLBACK_WALL_MS: Number(fallbackWallMs.toFixed(1)),
        FULL_BATCH_WALL_MS: Number(fullBatchWallMs.toFixed(1)),
        FAST_PATH_ONLY_CAND_SEC: Number(fastPathOnlyCandSec.toFixed(2)),
        FULL_PIPELINE_CAND_SEC: Number(fullPipelineCandSec.toFixed(2))
      },
      ACTION: 'Stage3Q Gate 6 is marked NOT_CERTIFIED until full-pipeline end-to-end benchmarking (including 100% of candidates and fallback reconciliation) is sustained across 96,000 candidates on a production-scale shadow table.'
    };

    const errataPath = path.join(process.cwd(), 'reports', 'atlas', 'discovery', 'atlas_stage3q_r1_denominator_errata_v1.json');
    fs.writeFileSync(errataPath, JSON.stringify(errataReport, null, 2));
    console.log(`Saved denominator errata: ${errataPath}`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
