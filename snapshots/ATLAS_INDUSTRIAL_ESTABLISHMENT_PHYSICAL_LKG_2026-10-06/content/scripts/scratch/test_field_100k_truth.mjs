import fs from 'node:fs';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import { IdentityInductionField } from '../lib/identity_field.mjs';
import { streamChunkedCandidates } from '../chunked_source_reader.mjs';

dotenv.config();

const FIELD_PATH = 'cache_gate31d/identity_field_perf_1m30.bin';
const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const START_LINE = 3100000;
const LIMIT = 100000;

async function main() {
  console.log('================================================================');
  console.log(`🔬 SECTION 4: TEST FIELD QUALITY AGAINST DB TRUTH (100K SAMPLE)`);
  console.log(`START_LINE: ${START_LINE} | LIMIT: ${LIMIT}`);
  console.log('================================================================\n');

  const field = IdentityInductionField.loadFromFile(FIELD_PATH);
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();

  let truePresent = 0;
  let trueAbsent = 0;
  let fieldDefinitelyAbsent = 0;
  let fieldPossiblyPresent = 0;

  let truePositive = 0;
  let trueNegative = 0;
  let falsePositive = 0;
  let falseNegative = 0;

  let processed = 0;

  try {
    for await (const batch of streamChunkedCandidates(SOURCE_FILE, { startLine: START_LINE, limit: LIMIT, batchSize: 5000 })) {
      // 1. Bulk DB truth lookup
      const hmacs = batch.map(c => c.identifier_value);
      const dbRes = await client.query(`
        SELECT identifier_value
        FROM public.atlas_person_identity_map
        WHERE identifier_type = 'NATIONAL_IDENTITY_HMAC'
        AND identifier_value = ANY($1::text[])
      `, [hmacs]);

      const dbPresentSet = new Set(dbRes.rows.map(r => r.identifier_value));

      for (const cand of batch) {
        processed++;
        const isDbPresent = dbPresentSet.has(cand.identifier_value);
        if (isDbPresent) truePresent++;
        else trueAbsent++;

        const payload = {
          source_id: cand.source_id,
          source_person_id: cand.source_person_id,
          identifier_value: cand.identifier_value
        };

        const cls = field.classifyCandidate(payload, null);
        const isFieldAbsent = (cls.classification === 'DEFINITELY_ABSENT');

        if (isFieldAbsent) fieldDefinitelyAbsent++;
        else fieldPossiblyPresent++;

        if (isDbPresent && !isFieldAbsent) {
          truePositive++;
        } else if (!isDbPresent && isFieldAbsent) {
          trueNegative++;
        } else if (!isDbPresent && !isFieldAbsent) {
          falsePositive++;
        } else if (isDbPresent && isFieldAbsent) {
          falseNegative++;
        }
      }

      console.log(`Processed ${processed}/${LIMIT} | DefAbsent: ${fieldDefinitelyAbsent} | FalsePos: ${falsePositive} | FalseNeg: ${falseNegative}`);
    }
  } finally {
    client.release();
    await pool.end();
  }

  const falsePositiveRate = trueAbsent > 0 ? (falsePositive / trueAbsent) * 100 : 0;
  const definitelyAbsentRate = processed > 0 ? (fieldDefinitelyAbsent / processed) * 100 : 0;

  console.log('\n=== FIELD QUALITY EVALUATION RESULTS (100K SAMPLE) ===');
  console.log(`TOTAL_CANDIDATES            : ${processed}`);
  console.log(`TRUE_PRESENT                : ${truePresent}`);
  console.log(`TRUE_ABSENT                 : ${trueAbsent}`);
  console.log(`FIELD_DEFINITELY_ABSENT     : ${fieldDefinitelyAbsent}`);
  console.log(`FIELD_POSSIBLY_PRESENT      : ${fieldPossiblyPresent}`);
  console.log(`TRUE_POSITIVE               : ${truePositive}`);
  console.log(`TRUE_NEGATIVE (Fast Path)   : ${trueNegative}`);
  console.log(`FALSE_POSITIVE (Bloom Over) : ${falsePositive}`);
  console.log(`FALSE_NEGATIVE              : ${falseNegative}`);
  console.log(`FIELD_FALSE_POSITIVE_RATE   : ${falsePositiveRate.toFixed(2)}%`);
  console.log(`DEFINITELY_ABSENT_RATE      : ${definitelyAbsentRate.toFixed(2)}%`);
  console.log(`ZERO_FALSE_NEGATIVE_VERIFIED: ${falseNegative === 0 ? 'PASS' : 'FAIL'}`);

  return {
    truePresent, trueAbsent, fieldDefinitelyAbsent, fieldPossiblyPresent,
    truePositive, trueNegative, falsePositive, falseNegative,
    falsePositiveRate, definitelyAbsentRate
  };
}

main().catch(console.error);
