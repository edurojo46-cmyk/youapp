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
  console.log('⚡ STAGE 3Q: MINIMAL CONTROLLED PRODUCTION-TABLE ROLLBACK PROBE');
  console.log('================================================================\n');

  const field = IdentityInductionField.loadFromFile(BINARY_FIELD_PATH);
  const candidates = await loadSlice(600000, 2000);
  console.log(`Loaded ${candidates.length} candidates.`);

  const classified = candidates.map((c, idx) => ({
    ...c,
    input_ordinal: idx,
    is_definitely_absent: field.classifyCandidate(c).classification === 'DEFINITELY_ABSENT'
  }));

  const absentCandidates = classified.filter(c => c.is_definitely_absent);
  console.log(`Field classified ${absentCandidates.length} / ${candidates.length} as DEFINITELY_ABSENT.\n`);

  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();

  try {
    // Register Stage 3P functions for production probe
    await client.query(`
      CREATE OR REPLACE FUNCTION public.stage3p_resolver_strat_e(p_batch jsonb)
      RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $$
      DECLARE v_res jsonb;
      BEGIN
        IF jsonb_array_length(p_batch) = 0 THEN RETURN jsonb_build_object('ok', true); END IF;
        WITH incoming_batch AS MATERIALIZED (
          SELECT (elem->>'cuit')::text AS cuit, (elem->>'raw_name')::text AS raw_name,
            (elem->>'normalized_name')::text AS normalized_name, (elem->>'cuit_masked')::text AS cuit_masked,
            (elem->>'identifier_value')::text AS identifier_value, (elem->>'candidate_atlas_person_id')::text AS candidate_atlas_person_id,
            COALESCE((elem->>'source_id')::text, 'ARCA_CONDICION_TRIBUTARIA') AS source_id,
            COALESCE((elem->>'source_person_id')::text, (elem->>'cuit')::text) AS source_person_id
          FROM jsonb_array_elements(p_batch) AS elem
        ),
        distinct_sources AS (SELECT DISTINCT source_id, source_person_id FROM incoming_batch),
        distinct_hmacs AS (SELECT DISTINCT identifier_value FROM incoming_batch),
        matched_sources AS (
          SELECT m.source_id, m.source_person_id, m.atlas_person_id
          FROM distinct_sources ds JOIN public.atlas_person_identity_map m ON m.source_id = ds.source_id AND m.source_person_id = ds.source_person_id
        ),
        matched_hmacs AS (
          SELECT DISTINCT ON (m.identifier_value) m.identifier_value, m.atlas_person_id
          FROM distinct_hmacs dh JOIN public.atlas_person_identity_map m ON m.identifier_type = 'NATIONAL_IDENTITY_HMAC' AND m.identifier_value = dh.identifier_value
          ORDER BY m.identifier_value, m.observed_at ASC
        ),
        resolved_candidates AS (
          SELECT i.cuit, i.raw_name, i.normalized_name, i.cuit_masked, i.identifier_value, i.source_id, i.source_person_id,
            COALESCE(ms.atlas_person_id, mh.atlas_person_id, i.candidate_atlas_person_id) AS resolved_atlas_person_id
          FROM incoming_batch i
          LEFT JOIN matched_sources ms ON ms.source_id = i.source_id AND ms.source_person_id = i.source_person_id
          LEFT JOIN matched_hmacs mh ON mh.identifier_value = i.identifier_value
        ),
        inserted_map AS (
          INSERT INTO public.atlas_person_identity_map (atlas_person_id, source_id, source_person_id, identifier_type, identifier_value, evidence_id, confidence, resolution_method, observed_at)
          SELECT resolved_atlas_person_id, source_id, source_person_id, 'NATIONAL_IDENTITY_HMAC', identifier_value, 'ev_arca_' || cuit, 1.0, 'DETERMINISTIC_CUIT_DNI_HMAC', now()
          FROM resolved_candidates
          ON CONFLICT (source_id, source_person_id) DO UPDATE SET identifier_value = EXCLUDED.identifier_value
          RETURNING 1
        ),
        inserted_outbox AS (
          INSERT INTO public.atlas_search_outbox (atlas_person_id, source_id, source_record_id, payload, payload_version, status, attempt_count, next_retry_at)
          SELECT resolved_atlas_person_id, source_id, 'rec_arca_' || cuit, jsonb_build_object('atlas_person_id', resolved_atlas_person_id), 1, 'PENDING', 0, now()
          FROM resolved_candidates
          ON CONFLICT (source_id, source_record_id) DO NOTHING RETURNING 1
        )
        SELECT jsonb_build_object('ok', true, 'total_candidates', count(*)) INTO v_res FROM resolved_candidates;
        RETURN v_res;
      END;
      $$;
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION public.stage3p_resolver_field_assisted_e(p_batch jsonb)
      RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $$
      DECLARE v_res jsonb;
      BEGIN
        IF jsonb_array_length(p_batch) = 0 THEN RETURN jsonb_build_object('ok', true); END IF;
        WITH incoming_batch AS MATERIALIZED (
          SELECT (elem->>'cuit')::text AS cuit, (elem->>'raw_name')::text AS raw_name,
            (elem->>'normalized_name')::text AS normalized_name, (elem->>'cuit_masked')::text AS cuit_masked,
            (elem->>'identifier_value')::text AS identifier_value, (elem->>'candidate_atlas_person_id')::text AS candidate_atlas_person_id,
            COALESCE((elem->>'source_id')::text, 'ARCA_CONDICION_TRIBUTARIA') AS source_id,
            COALESCE((elem->>'source_person_id')::text, (elem->>'cuit')::text) AS source_person_id,
            COALESCE((elem->>'is_definitely_absent')::boolean, FALSE) AS is_definitely_absent
          FROM jsonb_array_elements(p_batch) AS elem
        ),
        distinct_sources AS (SELECT DISTINCT source_id, source_person_id FROM incoming_batch WHERE is_definitely_absent = FALSE),
        distinct_hmacs AS (SELECT DISTINCT identifier_value FROM incoming_batch WHERE is_definitely_absent = FALSE),
        matched_sources AS (
          SELECT m.source_id, m.source_person_id, m.atlas_person_id
          FROM distinct_sources ds JOIN public.atlas_person_identity_map m ON m.source_id = ds.source_id AND m.source_person_id = ds.source_person_id
        ),
        matched_hmacs AS (
          SELECT DISTINCT ON (m.identifier_value) m.identifier_value, m.atlas_person_id
          FROM distinct_hmacs dh JOIN public.atlas_person_identity_map m ON m.identifier_type = 'NATIONAL_IDENTITY_HMAC' AND m.identifier_value = dh.identifier_value
          ORDER BY m.identifier_value, m.observed_at ASC
        ),
        resolved_candidates AS (
          SELECT i.cuit, i.raw_name, i.normalized_name, i.cuit_masked, i.identifier_value, i.source_id, i.source_person_id,
            CASE WHEN i.is_definitely_absent = TRUE THEN i.candidate_atlas_person_id
                 ELSE COALESCE(ms.atlas_person_id, mh.atlas_person_id, i.candidate_atlas_person_id) END AS resolved_atlas_person_id
          FROM incoming_batch i
          LEFT JOIN matched_sources ms ON ms.source_id = i.source_id AND ms.source_person_id = i.source_person_id
          LEFT JOIN matched_hmacs mh ON mh.identifier_value = i.identifier_value
        ),
        inserted_map AS (
          INSERT INTO public.atlas_person_identity_map (atlas_person_id, source_id, source_person_id, identifier_type, identifier_value, evidence_id, confidence, resolution_method, observed_at)
          SELECT resolved_atlas_person_id, source_id, source_person_id, 'NATIONAL_IDENTITY_HMAC', identifier_value, 'ev_arca_' || cuit, 1.0, 'DETERMINISTIC_CUIT_DNI_HMAC', now()
          FROM resolved_candidates
          ON CONFLICT (source_id, source_person_id) DO UPDATE SET identifier_value = EXCLUDED.identifier_value
          RETURNING 1
        ),
        inserted_outbox AS (
          INSERT INTO public.atlas_search_outbox (atlas_person_id, source_id, source_record_id, payload, payload_version, status, attempt_count, next_retry_at)
          SELECT resolved_atlas_person_id, source_id, 'rec_arca_' || cuit, jsonb_build_object('atlas_person_id', resolved_atlas_person_id), 1, 'PENDING', 0, now()
          FROM resolved_candidates
          ON CONFLICT (source_id, source_record_id) DO NOTHING RETURNING 1
        )
        SELECT jsonb_build_object('ok', true, 'total_candidates', count(*)) INTO v_res FROM resolved_candidates;
        RETURN v_res;
      END;
      $$;
    `);
    // 1. Probe Production V2 (Full 2000 batch)
    console.log('Probing Production Resolver V2...');
    await client.query('BEGIN');
    const t0V2 = performance.now();
    const resV2 = await client.query(
      `SELECT public.resolve_and_commit_candidate_batch_v2($1::jsonb) as res`,
      [JSON.stringify(candidates)]
    );
    const durV2 = performance.now() - t0V2;
    await client.query('ROLLBACK');
    console.log(`  -> Production V2: ${durV2.toFixed(1)} ms (${(2000 / (durV2 / 1000)).toFixed(2)} cand/s)`);

    // 2. Probe Production Strategy E (Full 2000 batch)
    console.log('Probing Production Strategy E...');
    await client.query('BEGIN');
    const t0StratE = performance.now();
    const resStratE = await client.query(
      `SELECT public.stage3p_resolver_strat_e($1::jsonb) as res`,
      [JSON.stringify(candidates)]
    );
    const durStratE = performance.now() - t0StratE;
    await client.query('ROLLBACK');
    console.log(`  -> Production Strategy E: ${durStratE.toFixed(1)} ms (${(2000 / (durStratE / 1000)).toFixed(2)} cand/s)`);

    // 3. Probe Production Field-Assisted E (Full 2000 batch)
    console.log('Probing Production Field-Assisted E (Q1)...');
    await client.query('BEGIN');
    const t0FieldE = performance.now();
    const resFieldE = await client.query(
      `SELECT public.stage3p_resolver_field_assisted_e($1::jsonb) as res`,
      [JSON.stringify(classified)]
    );
    const durFieldE = performance.now() - t0FieldE;
    await client.query('ROLLBACK');
    console.log(`  -> Production Field-Assisted E: ${durFieldE.toFixed(1)} ms (${(2000 / (durFieldE / 1000)).toFixed(2)} cand/s)`);

    // 4. Probe Production Q2 Fast Path (Definitely absent fast write on production table under rollback)
    console.log('Probing Production Q2 Fast Write Statement...');
    const q2ProdSql = `
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
    const t0Q2 = performance.now();
    const resQ2 = await client.query(q2ProdSql, [JSON.stringify(absentCandidates)]);
    const durQ2 = performance.now() - t0Q2;
    await client.query('ROLLBACK');
    console.log(`  -> Production Q2 Fast Write (${absentCandidates.length} cand): ${durQ2.toFixed(1)} ms (${(absentCandidates.length / (durQ2 / 1000)).toFixed(2)} cand/s)`);

    // 5. Probe Production Q2 Ordered
    const orderedAbsent = [...absentCandidates].sort((a, b) => a.source_person_id.localeCompare(b.source_person_id));
    await client.query('BEGIN');
    const t0Q2Ord = performance.now();
    const resQ2Ord = await client.query(q2ProdSql, [JSON.stringify(orderedAbsent)]);
    const durQ2Ord = performance.now() - t0Q2Ord;
    await client.query('ROLLBACK');
    console.log(`  -> Production Q2 Ordered (${orderedAbsent.length} cand): ${durQ2Ord.toFixed(1)} ms (${(orderedAbsent.length / (durQ2Ord / 1000)).toFixed(2)} cand/s)`);

    const candSecV2 = 2000 / (durV2 / 1000);
    const candSecFieldE = 2000 / (durFieldE / 1000);
    const candSecQ2 = absentCandidates.length / (durQ2 / 1000);
    const candSecQ2Ord = orderedAbsent.length / (durQ2Ord / 1000);

    console.log('\n================================================================');
    console.log('⚡ PRODUCTION CONTROLLED ROLLBACK PROBE COMPARISON');
    console.log('================================================================');
    console.log(`V2 Production:        ${candSecV2.toFixed(2)} cand/s (duration: ${durV2.toFixed(1)} ms)`);
    console.log(`Field-Assisted E:     ${candSecFieldE.toFixed(2)} cand/s (duration: ${durFieldE.toFixed(1)} ms)`);
    console.log(`Q2 Fast Write:        ${candSecQ2.toFixed(2)} cand/s (duration: ${durQ2.toFixed(1)} ms, +${(((candSecQ2 / candSecFieldE) - 1) * 100).toFixed(2)}% vs Field E)`);
    console.log(`Q2 Ordered Write:     ${candSecQ2Ord.toFixed(2)} cand/s (duration: ${durQ2Ord.toFixed(1)} ms, +${(((candSecQ2Ord / candSecFieldE) - 1) * 100).toFixed(2)}% vs Field E)`);
    console.log('================================================================\n');

    // Update verdict artifact with both shadow and production-probe findings
    const verdictPath = path.join(process.cwd(), 'reports', 'atlas', 'discovery', 'atlas_stage3q_verdict_v1.json');
    const verdictData = JSON.parse(fs.readFileSync(verdictPath, 'utf8'));

    verdictData.PRODUCTION_CONTROLLED_PROBE = {
      candidate_sample_size: 2000,
      v2_cand_sec: Number(candSecV2.toFixed(2)),
      field_e_cand_sec: Number(candSecFieldE.toFixed(2)),
      q2_fast_write_cand_sec: Number(candSecQ2.toFixed(2)),
      q2_ordered_write_cand_sec: Number(candSecQ2Ord.toFixed(2)),
      q2_speedup_vs_field_e: `${(((candSecQ2 / candSecFieldE) - 1) * 100).toFixed(2)}%`,
      q2_speedup_vs_v2: `${(((candSecQ2 / candSecV2) - 1) * 100).toFixed(2)}%`
    };

    fs.writeFileSync(verdictPath, JSON.stringify(verdictData, null, 2));
    console.log(`Updated verdict report with production probe findings.`);

  } finally {
    try {
      await client.query(`DROP FUNCTION IF EXISTS public.stage3p_resolver_strat_e(jsonb)`);
      await client.query(`DROP FUNCTION IF EXISTS public.stage3p_resolver_field_assisted_e(jsonb)`);
    } catch {}
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
