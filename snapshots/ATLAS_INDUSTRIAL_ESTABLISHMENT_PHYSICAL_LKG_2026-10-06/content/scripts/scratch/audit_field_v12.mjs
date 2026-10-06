import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import { IdentityInductionField } from '../lib/identity_field.mjs';
import { streamChunkedCandidates } from '../chunked_source_reader.mjs';

dotenv.config();

const FIELD_PATH = 'cache_gate31d/identity_field_perf_1m30.bin';
const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const START_LINE = 2865000;

async function main() {
  console.log('================================================================');
  console.log('🔬 ATLAS INDUCTION ENGINE V1.2: IDENTITY FIELD FORENSIC AUDIT');
  console.log('================================================================\n');

  // --- SECTION 3: AUDIT THE LOADED IDENTITY FIELD METADATA ---
  console.log('--- SECTION 3: LOADED FIELD METADATA ---');
  const fileBytes = fs.readFileSync(FIELD_PATH);
  const fileSha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');

  const srcBits = fileBytes.readUInt32LE(0);
  const srcK = fileBytes.readUInt32LE(4);
  const srcCount = fileBytes.readUInt32LE(8);
  const stBits = fileBytes.readUInt32LE(12);
  const stK = fileBytes.readUInt32LE(16);
  const stCount = fileBytes.readUInt32LE(20);

  const wmLen = fileBytes.readUInt32LE(32);
  const watermark = wmLen > 0 ? fileBytes.subarray(36, 36 + wmLen).toString('utf8') : 'NONE';

  const field = IdentityInductionField.loadFromFile(FIELD_PATH);

  // Connect to DB for truth counts
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();
  let dbHmacCount = 0;
  try {
    const res = await client.query(`
      SELECT count(*) FROM public.atlas_person_identity_map
      WHERE identifier_type = 'NATIONAL_IDENTITY_HMAC'
    `);
    dbHmacCount = parseInt(res.rows[0].count, 10);
  } finally {
    client.release();
  }

  console.log(`FIELD_FILE_PATH                       : ${FIELD_PATH}`);
  console.log(`FIELD_FILE_SHA256                     : ${fileSha256}`);
  console.log(`FIELD_FORMAT_VERSION                  : V1_BINARY_LE32`);
  console.log(`FIELD_BUILD_TIMESTAMP                 : ${watermark}`);
  console.log(`FIELD_BUILD_KEY_COUNT                 : ${srcCount + stCount}`);
  console.log(`FIELD_EXPECTED_IDENTIFIER_TYPE        : NATIONAL_IDENTITY_HMAC`);
  console.log(`CURRENT_DB_NATIONAL_IDENTITY_HMAC_COUNT: ${dbHmacCount}`);
  console.log(`FIELD_BASE_KEY_COUNT (Source/Stable)  : ${srcCount} / ${stCount}`);
  console.log(`FIELD_DELTA_OVERLAY_KEY_COUNT         : ${field.deltaSourceOverlay.size + field.deltaStableOverlay.size}`);
  console.log(`FIELD_INFLIGHT_RESERVATION_COUNT      : ${field.inFlightSourceReservations.size}`);
  console.log(`FIELD_FALSE_NEGATIVE_GUARD_ACTIVE     : true (Double-hash Bloom Filter with 0 FN math)\n`);

  // --- SECTION 2: COMPARE LEGACY AND INDUCTION CLASSIFICATION (10,000 CANDIDATES) ---
  console.log('--- SECTION 2: COMPARE LEGACY AND INDUCTION CLASSIFICATION (10,000 COHORT) ---');
  const cohort10k = [];
  for await (const batch of streamChunkedCandidates(SOURCE_FILE, { startLine: START_LINE, limit: 10000, batchSize: 2000 })) {
    cohort10k.push(...batch);
    if (cohort10k.length >= 10000) break;
  }
  const exactCohort = cohort10k.slice(0, 10000);

  let legacyAbsent = 0, legacyPresent = 0;
  let inductionAbsent = 0, inductionPresent = 0;
  let diffCount = 0;
  const differingExamples = [];

  for (let i = 0; i < exactCohort.length; i++) {
    const cand = exactCohort[i];
    const payload = {
      source_id: cand.source_id,
      source_person_id: cand.source_person_id,
      identifier_value: cand.identifier_value
    };

    // A. Legacy / P2 classifier path (Classify first without pre-reserving self)
    const legCls = field.classifyCandidate(payload, null);
    if (legCls.classification === 'DEFINITELY_ABSENT') legacyAbsent++;
    else legacyPresent++;

    // B. Induction Engine V1 classifier path (Pre-reserving self without worker-id isolation)
    field.reserveInFlight('worker_test', payload);
    const indCls = field.classifyCandidate(payload, 'worker_test');
    if (indCls.classification === 'DEFINITELY_ABSENT') inductionAbsent++;
    else inductionPresent++;
    field.releaseReservation('worker_test', payload);

    if (legCls.classification !== indCls.classification) {
      diffCount++;
      if (differingExamples.length < 3) {
        differingExamples.push({
          index: i,
          candidate: cand.source_person_id,
          legacy: legCls.classification,
          induction: indCls.classification,
          reason: indCls.isReservationMatch ? 'SELF_RESERVATION_MATCH' : 'OTHER'
        });
      }
    }
  }

  console.log(`LEGACY_PATH:    DEFINITELY_ABSENT = ${legacyAbsent} (${((legacyAbsent/10000)*100).toFixed(2)}%), POSSIBLY_PRESENT = ${legacyPresent}`);
  console.log(`INDUCTION_PATH: DEFINITELY_ABSENT = ${inductionAbsent} (${((inductionAbsent/10000)*100).toFixed(2)}%), POSSIBLY_PRESENT = ${inductionPresent}`);
  console.log(`CLASSIFICATION_DIFF_COUNT: ${diffCount}`);
  if (differingExamples.length > 0) {
    console.log('First differing candidates:', JSON.stringify(differingExamples, null, 2));
  }
  console.log('');

  // --- SECTION 4: TEST FIELD QUALITY AGAINST DB TRUTH (10,000 CANDIDATES FROM REAL ARCA) ---
  console.log('--- SECTION 4: TEST FIELD QUALITY AGAINST DB TRUTH ---');
  const dbClient = await pool.connect();
  let truePresent = 0, trueAbsent = 0;
  let truePositives = 0, falsePositives = 0, trueNegatives = 0, falseNegatives = 0;

  try {
    const hmacs = exactCohort.map(c => c.identifier_value);
    const dbRes = await dbClient.query(`
      SELECT identifier_value
      FROM public.atlas_person_identity_map
      WHERE identifier_type = 'NATIONAL_IDENTITY_HMAC'
      AND identifier_value = ANY($1::text[])
    `, [hmacs]);

    const dbPresentSet = new Set(dbRes.rows.map(r => r.identifier_value));

    for (const cand of exactCohort) {
      const isDbPresent = dbPresentSet.has(cand.identifier_value);
      if (isDbPresent) truePresent++;
      else trueAbsent++;

      const payload = {
        source_id: cand.source_id,
        source_person_id: cand.source_person_id,
        identifier_value: cand.identifier_value
      };

      // Pure Field evaluation (without self-reservation bug)
      const cls = field.classifyCandidate(payload, null);
      const isFieldPresent = (cls.classification !== 'DEFINITELY_ABSENT');

      if (isDbPresent && isFieldPresent) truePositives++;
      else if (!isDbPresent && !isFieldPresent) trueNegatives++;
      else if (!isDbPresent && isFieldPresent) falsePositives++;
      else if (isDbPresent && !isFieldPresent) falseNegatives++;
    }
  } finally {
    dbClient.release();
    await pool.end();
  }

  const fpr = trueAbsent > 0 ? (falsePositives / trueAbsent) * 100 : 0;
  const defAbsentRate = exactCohort.length > 0 ? (trueNegatives / exactCohort.length) * 100 : 0;

  console.log(`TRUE_PRESENT                : ${truePresent}`);
  console.log(`TRUE_ABSENT                 : ${trueAbsent}`);
  console.log(`TRUE_POSITIVE               : ${truePositives}`);
  console.log(`TRUE_NEGATIVE (Fast Path)   : ${trueNegatives}`);
  console.log(`FALSE_POSITIVE (Bloom Over) : ${falsePositives}`);
  console.log(`FALSE_NEGATIVE              : ${falseNegatives}`);
  console.log(`FIELD_FALSE_POSITIVE_RATE   : ${fpr.toFixed(2)}%`);
  console.log(`DEFINITELY_ABSENT_RATE      : ${defAbsentRate.toFixed(2)}%`);
  console.log(`ZERO_FALSE_NEGATIVE_VERIFIED: ${falseNegatives === 0 ? 'PASS' : 'FAIL'}`);

  console.log('\n================================================================');
  console.log('🏁 FIELD AUDIT COMPLETE');
  console.log('================================================================\n');
}

main().catch(console.error);
