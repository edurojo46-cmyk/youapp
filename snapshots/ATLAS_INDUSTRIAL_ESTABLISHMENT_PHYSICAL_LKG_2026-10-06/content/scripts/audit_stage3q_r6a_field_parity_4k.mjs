import fs from 'node:fs';
import readline from 'node:readline';
import crypto from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { IdentityInductionField } from './lib/identity_field.mjs';

dotenv.config();

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const BINARY_FIELD_PATH = 'cache_gate31d/identity_field_base.bin';
const HMAC_SECRET = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY;

const START_OFFSET_INCLUSIVE = 569000;
const END_OFFSET_EXCLUSIVE = 573000;
const COUNT = 4000;

function normalizeName(rawName) {
  return rawName.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseCandidate(line, ordinal) {
  const cuit = line.substring(0, 11).trim();
  const rawName = line.substring(11, 41).trim();
  const dni = String(parseInt(cuit.slice(2, 10), 10));
  const identifierValue = crypto.createHmac('sha256', HMAC_SECRET).update(`ARG:DNI:${dni}`).digest('hex');
  const atlasPersonId = `atlas_arg_per_${identifierValue.slice(0, 16)}`;
  return {
    input_ordinal: ordinal,
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

async function main() {
  console.log('================================================================');
  console.log('⚡ STAGE 3Q-R6A: FIELD PARITY MICRO-CHECK (4,000 CANDIDATES)');
  console.log(`   Range: [${START_OFFSET_INCLUSIVE}, ${END_OFFSET_EXCLUSIVE})`);
  console.log('================================================================\n');

  // 1. Load candidates
  const candidates = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(SOURCE_FILE),
    crlfDelay: Infinity
  });

  let idx = 0;
  let ordinal = 0;
  for await (const line of rl) {
    if (idx >= START_OFFSET_INCLUSIVE && idx < END_OFFSET_EXCLUSIVE) {
      if (line.length >= 41) {
        candidates.push(parseCandidate(line, ordinal++));
      }
    }
    idx++;
    if (idx >= END_OFFSET_EXCLUSIVE) break;
  }

  if (candidates.length !== COUNT) {
    throw new Error(`CANDIDATE_COUNT_MISMATCH: Loaded ${candidates.length}, expected ${COUNT}`);
  }

  console.log(`Loaded ${candidates.length} candidates.`);

  // 2. Load rebuilt Identity Induction Field
  console.log('Loading Identity Induction Field...');
  const field = IdentityInductionField.loadFromFile(BINARY_FIELD_PATH);

  // 3. Connect to PostgreSQL for read-only authoritative truth
  const client = new pg.Client(parseDbUrl());
  await client.connect();

  try {
    console.log('Querying authoritative database matches for 4,000 candidates...');
    const matchRes = await client.query(`
      WITH incoming AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
          input_ordinal int, cuit text, identifier_value text, candidate_atlas_person_id text, source_id text, source_person_id text
        )
      )
      SELECT 
        i.input_ordinal, i.cuit, i.candidate_atlas_person_id,
        src_map.atlas_person_id AS src_atlas_id,
        ident_match.atlas_person_id AS ident_atlas_id
      FROM incoming i
      LEFT JOIN LATERAL (
        SELECT atlas_person_id FROM public.atlas_person_identity_map s
        WHERE s.source_id = i.source_id AND s.source_person_id = i.source_person_id LIMIT 1
      ) src_map ON TRUE
      LEFT JOIN LATERAL (
        SELECT atlas_person_id FROM public.atlas_person_identity_map im
        WHERE im.identifier_type = 'NATIONAL_IDENTITY_HMAC' AND im.identifier_value = i.identifier_value
        ORDER BY im.observed_at ASC LIMIT 1
      ) ident_match ON TRUE;
    `, [JSON.stringify(candidates)]);

    const dbMap = new Map(matchRes.rows.map(r => [r.input_ordinal, r]));

    let definitelyAbsentCount = 0;
    let possiblyPresentCount = 0;
    let fieldFalseNegatives = 0;
    let fieldFalsePositives = 0;

    let totalAuthoritativeNew = 0;
    let totalAuthoritativeMerge = 0;

    let correctFastPathNew = 0;
    let fallbackCorrectMerge = 0;
    let fallbackOverinclusiveNew = 0;

    for (const c of candidates) {
      const cls = field.classifyCandidate(c);
      const isFieldAbsent = cls.classification === 'DEFINITELY_ABSENT';

      const dbMatch = dbMap.get(c.input_ordinal);
      const isDbMerge = Boolean(dbMatch.src_atlas_id || dbMatch.ident_atlas_id);
      const isDbNew = !isDbMerge;

      if (isDbNew) totalAuthoritativeNew++;
      else totalAuthoritativeMerge++;

      if (isFieldAbsent) {
        definitelyAbsentCount++;
        if (isDbMerge) {
          fieldFalseNegatives++;
          console.error(`FATAL FALSE NEGATIVE on candidate ${c.input_ordinal} (${c.cuit_masked})!`);
        } else {
          correctFastPathNew++;
        }
      } else {
        possiblyPresentCount++;
        if (isDbNew) {
          fieldFalsePositives++;
          fallbackOverinclusiveNew++;
        } else {
          fallbackCorrectMerge++;
        }
      }
    }

    const fastPathPercent = Number(((definitelyAbsentCount / COUNT) * 100).toFixed(2));
    const fallbackPercent = Number(((possiblyPresentCount / COUNT) * 100).toFixed(2));
    const newParity = Number((((correctFastPathNew + fallbackOverinclusiveNew) / totalAuthoritativeNew) * 100).toFixed(2));
    const mergeParity = Number(((fallbackCorrectMerge / totalAuthoritativeMerge) * 100).toFixed(2));

    const result = {
      timestamp: new Date().toISOString(),
      stage: 'STAGE3Q-R6A',
      title: 'ATLAS STAGE 3Q-R6A: FIELD PARITY MICRO-CHECK (4K)',
      RANGE: {
        START_OFFSET_INCLUSIVE,
        END_OFFSET_EXCLUSIVE,
        CANDIDATES_COUNT: COUNT
      },
      FIELD_CLASSIFICATION: {
        DEFINITELY_ABSENT: definitelyAbsentCount,
        POSSIBLY_PRESENT: possiblyPresentCount,
        FAST_PATH_PERCENT: fastPathPercent,
        FALLBACK_PERCENT: fallbackPercent
      },
      AUTHORITATIVE_TRUTH: {
        AUTHORITATIVE_NEW: totalAuthoritativeNew,
        AUTHORITATIVE_MERGE: totalAuthoritativeMerge
      },
      ACCURACY_METRICS: {
        FIELD_FALSE_NEGATIVES: fieldFalseNegatives,
        FIELD_FALSE_POSITIVES: fieldFalsePositives,
        EMPIRICAL_FALSE_POSITIVE_RATE_ON_NEW: Number(((fieldFalsePositives / totalAuthoritativeNew) * 100).toFixed(4)),
        NEW_PARITY: `${newParity}%`,
        MERGE_TARGET_PARITY: `${mergeParity}%`
      },
      GATE_EVALUATION: {
        FALSE_NEGATIVES_ZERO: fieldFalseNegatives === 0,
        FAST_PATH_SANITY_PASS: fastPathPercent > 0,
        OVERALL_PARITY_GATE: fieldFalseNegatives === 0 && fastPathPercent > 50 ? 'PASS' : 'FAIL'
      }
    };

    console.log('--- 4K FIELD PARITY MICRO-CHECK RESULTS ---');
    console.log(`  DEFINITELY_ABSENT:     ${definitelyAbsentCount} (${fastPathPercent}%)`);
    console.log(`  POSSIBLY_PRESENT:      ${possiblyPresentCount} (${fallbackPercent}%)`);
    console.log(`  Authoritative NEW:     ${totalAuthoritativeNew}`);
    console.log(`  Authoritative MERGE:   ${totalAuthoritativeMerge}`);
    console.log(`  FIELD_FALSE_NEGATIVES: ${fieldFalseNegatives}`);
    console.log(`  FIELD_FALSE_POSITIVES: ${fieldFalsePositives}`);
    console.log(`  NEW_PARITY:            ${newParity}%`);
    console.log(`  MERGE_TARGET_PARITY:   ${mergeParity}%`);
    console.log(`  OVERALL GATE:          ${result.GATE_EVALUATION.OVERALL_PARITY_GATE}\n`);

    if (fieldFalseNegatives > 0) {
      throw new Error(`PARITY_GATE_FAILED: FIELD_FALSE_NEGATIVES = ${fieldFalseNegatives} (must be 0)`);
    }

    if (fastPathPercent === 0) {
      throw new Error(`FAST_PATH_SANITY_FAILED: FAST_PATH_PERCENT = 0%`);
    }

    fs.writeFileSync('reports/atlas/discovery/atlas_stage3q_r6a_field_parity_4k_v1.json', JSON.stringify(result, null, 2));
    console.log('Saved 4K parity report to reports/atlas/discovery/atlas_stage3q_r6a_field_parity_4k_v1.json');

  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Fatal Micro-check error:', err);
  process.exit(1);
});
