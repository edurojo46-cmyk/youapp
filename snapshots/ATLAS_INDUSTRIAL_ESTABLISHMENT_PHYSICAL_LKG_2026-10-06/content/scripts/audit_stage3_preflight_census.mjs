/**
 * scripts/audit_stage3_preflight_census.mjs
 * 
 * Pre-flight Physical Census & Population Reconstruction for Stage 3 (100k):
 * 1. Read live DB baseline (T0)
 * 2. Reconstruct Stage 1 (10,000) and Stage 2 (50,000) evaluated keys from DB (total 60,000)
 * 3. Verify STAGE1_STAGE2_UNION = 60,000
 * 4. Physically inspect lines 60,001 onward in ARCA file
 * 5. Report physical census until 100,000 eligible unevaluated candidates are found
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const { Client } = pg;
const dbConfig = parseDbUrl();

function classifyRecord(line) {
  if (!line || typeof line !== 'string') return { classification: 'INVALID_RECORD' };
  if (line.length < 51) return { classification: 'MALFORMED_RECORD' };
  const cuit = line.slice(0, 11).trim();
  if (!/^\d{11}$/.test(cuit)) return { classification: 'MALFORMED_RECORD' };
  const prefix = cuit.slice(0, 2);
  const rawName = line.slice(11, 41).trim();

  if (prefix === '30' || prefix === '33' || prefix === '34') {
    return { classification: 'NON_PERSON_LEGAL_ENTITY', cuit, entity_name: rawName, prefix, is_person: false };
  }
  if (['20', '27', '23', '24'].includes(prefix)) {
    if (!rawName || rawName.length < 2) {
      return { classification: 'INSUFFICIENT_EVIDENCE', cuit, is_person: true };
    }
    const dni = String(parseInt(cuit.slice(2, 10), 10));
    return { classification: 'CANDIDATE_NATURAL_PERSON', cuit, dni, raw_name: rawName, prefix, is_person: true };
  }
  return { classification: 'OTHER_PREFIX_RECORD', cuit, prefix, raw_name: rawName };
}

async function main() {
  const pgClient = new Client(dbConfig);
  await pgClient.connect();

  try {
    console.log('=== 1. T0 STAGE 3 POSTGRESQL BASELINE ===');
    const t0Res = await pgClient.query(`
      SELECT 
        (SELECT COUNT(DISTINCT atlas_person_id) FROM public.atlas_person_identity_map) as canonical_distinct,
        (SELECT COUNT(*) FROM public.atlas_person_identity_map) as identity_map_rows,
        (SELECT COUNT(*) FROM public.atlas_search_outbox) as outbox_total,
        (SELECT COUNT(*) FROM public.atlas_search_outbox WHERE status = 'PENDING') as outbox_pending,
        (SELECT COUNT(*) FROM public.atlas_search_outbox WHERE status = 'PROCESSING') as outbox_processing,
        (SELECT COUNT(*) FROM public.atlas_search_outbox WHERE status = 'PUBLISHED') as outbox_published,
        (SELECT COUNT(*) FROM public.atlas_search_outbox WHERE status = 'QUARANTINED') as outbox_quarantined;
    `);

    const t0Baseline = {
      t0_stage3_timestamp: new Date().toISOString(),
      t0_canonical_distinct: parseInt(t0Res.rows[0].canonical_distinct, 10),
      t0_identity_map_rows: parseInt(t0Res.rows[0].identity_map_rows, 10),
      t0_search_outbox_total: parseInt(t0Res.rows[0].outbox_total, 10),
      t0_pending: parseInt(t0Res.rows[0].outbox_pending, 10),
      t0_processing: parseInt(t0Res.rows[0].outbox_processing, 10),
      t0_published: parseInt(t0Res.rows[0].outbox_published, 10),
      t0_quarantined: parseInt(t0Res.rows[0].outbox_quarantined, 10)
    };
    console.log(t0Baseline);

    console.log('\n=== 2. RECONSTRUCT STAGE 1 + STAGE 2 EVALUATED POPULATION ===');
    const sourceFilePath = path.resolve('cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp');
    const streamPre = fs.createReadStream(sourceFilePath, { encoding: 'latin1' });
    const rlPre = readline.createInterface({ input: streamPre, crlfDelay: Infinity });

    let preLineCount = 0;
    const stage1Keys = new Set();
    const stage2Keys = new Set();

    for await (const line of rlPre) {
      preLineCount++;
      const cl = classifyRecord(line);
      if (cl.classification === 'CANDIDATE_NATURAL_PERSON') {
        if (preLineCount <= 10000) {
          stage1Keys.add(cl.cuit);
        } else if (preLineCount <= 60000) {
          stage2Keys.add(cl.cuit);
        }
      }
      if (preLineCount >= 60000) break;
    }
    rlPre.close();

    console.log(`Stage 1 unique keys: ${stage1Keys.size}`);
    console.log(`Stage 2 unique keys: ${stage2Keys.size}`);
    const stage1_2_overlap = [...stage1Keys].filter(k => stage2Keys.has(k)).length;
    console.log(`Stage 1 ∩ Stage 2 overlap: ${stage1_2_overlap}`);

    const previouslyEvaluatedKeys = new Set([...stage1Keys, ...stage2Keys]);
    console.log(`STAGE1_STAGE2_UNION count: ${previouslyEvaluatedKeys.size}`);
    if (previouslyEvaluatedKeys.size !== 60000) {
      throw new Error(`PREVIOUS_POPULATION_MISMATCH: Expected 60,000, got ${previouslyEvaluatedKeys.size}`);
    }
    console.log('✔ STAGE1_STAGE2_UNION = 60000 verified.');

    console.log('\n=== 3. PHYSICAL RANGE CENSUS FOR STAGE 3 (TARGET: 100,000 CANDIDATES) ===');
    const stream = fs.createReadStream(sourceFilePath, { encoding: 'latin1' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let rawLineNumber = 0;
    let targetReached = false;
    let stage3StartLine = 60001;
    let stage3EndLine = null;

    const census = {
      RAW_ROWS_SCANNED_TO_FIND_TARGET: 0,
      NATURAL_PERSON_ROWS: 0,
      LEGAL_ENTITY_ROWS: 0,
      MALFORMED_ROWS: 0,
      OTHER_PREFIX_ROWS: 0,
      DISTINCT_SOURCE_KEYS: 0,
      ALREADY_EVALUATED_KEYS: 0,
      ELIGIBLE_UNEVALUATED_KEYS: 0
    };

    const scannedKeys = new Set();
    const stage3Candidates = [];

    for await (const line of rl) {
      rawLineNumber++;
      if (rawLineNumber < stage3StartLine) {
        continue;
      }

      census.RAW_ROWS_SCANNED_TO_FIND_TARGET++;
      const cl = classifyRecord(line);

      if (cl.classification === 'NON_PERSON_LEGAL_ENTITY') {
        census.LEGAL_ENTITY_ROWS++;
        scannedKeys.add(cl.cuit);
      } else if (cl.classification === 'MALFORMED_RECORD' || cl.classification === 'INVALID_RECORD') {
        census.MALFORMED_ROWS++;
      } else if (cl.classification === 'OTHER_PREFIX_RECORD') {
        census.OTHER_PREFIX_ROWS++;
        scannedKeys.add(cl.cuit);
      } else if (cl.classification === 'CANDIDATE_NATURAL_PERSON') {
        census.NATURAL_PERSON_ROWS++;
        scannedKeys.add(cl.cuit);

        if (previouslyEvaluatedKeys.has(cl.cuit)) {
          census.ALREADY_EVALUATED_KEYS++;
        } else {
          census.ELIGIBLE_UNEVALUATED_KEYS++;
          stage3Candidates.push({ rawLine: rawLineNumber, cuit: cl.cuit, dni: cl.dni, name: cl.raw_name });
          if (census.ELIGIBLE_UNEVALUATED_KEYS === 100000) {
            stage3EndLine = rawLineNumber;
            targetReached = true;
            break;
          }
        }
      }
    }
    rl.close();

    census.DISTINCT_SOURCE_KEYS = scannedKeys.size;
    console.log('Census Results:');
    console.log(JSON.stringify(census, null, 2));
    console.log(`Stage 3 Start Line: ${stage3StartLine}`);
    console.log(`Stage 3 End Line:   ${stage3EndLine}`);
    console.log(`Target Reached:     ${targetReached}`);
    console.log(`First Stage 3 Candidate:`, stage3Candidates[0]);
    console.log(`Last Stage 3 Candidate: `, stage3Candidates[stage3Candidates.length - 1]);

  } finally {
    await pgClient.end();
  }
}

main().catch(console.error);
