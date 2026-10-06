import fs from 'node:fs';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { streamChunkedCandidates, normalizeName } from './chunked_source_reader.mjs';

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const HMAC_SECRET = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY || process.env.ATLAS_IDENTITY_HMAC_SECRET || 'atlas_secret_cmyk_2026';
const LINES_TO_TEST = 100000;

async function runOldReader(maxLines) {
  const fileStream = fs.createReadStream(SOURCE_FILE);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const candidates = [];
  let lineOrdinal = 0;
  const t0 = performance.now();

  for await (const line of rl) {
    lineOrdinal++;
    if (lineOrdinal > maxLines) break;

    if (line.startsWith('20') || line.startsWith('23') || line.startsWith('24') || line.startsWith('27')) {
      const cuit = line.substring(0, 11).trim();
      const rawName = line.substring(11, 41).trim();

      const dni = String(parseInt(cuit.slice(2, 10), 10));
      const identifierValue = crypto.createHmac('sha256', HMAC_SECRET).update(`ARG:DNI:${dni}`).digest('hex');
      const nameNorm = normalizeName(rawName);

      candidates.push({
        input_ordinal: lineOrdinal,
        cuit,
        raw_name: rawName,
        name_norm: nameNorm,
        identifier_value: identifierValue,
        source_id: 'ARCA_CONDICION_TRIBUTARIA',
        source_person_id: 'rec_arca_' + cuit
      });
    }
  }

  const elapsedMs = performance.now() - t0;
  return { candidates, totalLines: lineOrdinal, elapsedMs };
}

async function runNewReader(maxLines, bufferSize = 16 * 1024 * 1024) {
  const candidates = [];
  const t0 = performance.now();

  for await (const batch of streamChunkedCandidates(SOURCE_FILE, {
    startLine: 1,
    limit: maxLines,
    batchSize: 5000,
    bufferSize
  })) {
    for (const cand of batch) {
      if (cand.input_ordinal <= maxLines) {
        candidates.push(cand);
      }
    }
    if (batch.length > 0 && batch[batch.length - 1].input_ordinal >= maxLines) {
      break;
    }
  }

  const elapsedMs = performance.now() - t0;
  return { candidates, elapsedMs };
}

async function main() {
  console.log('=============================================================');
  console.log(`STEP 5: COMPREHENSIVE 100K READER PARITY & EDGE CASE AUDIT`);
  console.log(`EVALUATING ${LINES_TO_TEST} REAL SOURCE LINES`);
  console.log('=============================================================\n');

  console.log('1. Running baseline legacy readline reader...');
  const oldRes = await runOldReader(LINES_TO_TEST);
  console.log(`Legacy: ${oldRes.candidates.length} candidates from ${oldRes.totalLines} lines (${oldRes.elapsedMs.toFixed(1)}ms)`);

  console.log('2. Running new chunked reader (16MB buffer)...');
  const newRes = await runNewReader(LINES_TO_TEST, 16 * 1024 * 1024);
  console.log(`New Chunked: ${newRes.candidates.length} candidates (${newRes.elapsedMs.toFixed(1)}ms)`);

  console.log('3. Running edge-case: stress testing chunk boundaries with micro 127-byte buffer...');
  const microRes = await runNewReader(10000, 127); // forces thousands of chunk boundary splits across lines
  console.log(`Micro-chunk test: ${microRes.candidates.length} candidates parsed across micro boundaries.`);

  // 100K Parity Comparison
  const totalCands = oldRes.candidates.length;
  let ordinalMismatches = 0;
  let rawIdMismatches = 0;
  let sourcePersonIdMismatches = 0;
  let nameNormMismatches = 0;
  let hmacMismatches = 0;
  let crlfInParsedValues = 0;
  let nonAsciiEvaluated = 0;
  let nonAsciiMismatches = 0;

  for (let i = 0; i < totalCands; i++) {
    const o = oldRes.candidates[i];
    const n = newRes.candidates[i];

    if (!n) break;
    if (o.input_ordinal !== n.input_ordinal) ordinalMismatches++;
    if (o.cuit !== n.cuit) rawIdMismatches++;
    if (o.source_person_id !== n.source_person_id) sourcePersonIdMismatches++;
    if (o.name_norm !== n.name_norm) nameNormMismatches++;
    if (o.identifier_value !== n.identifier_value) hmacMismatches++;

    // CRLF check
    if (n.cuit.includes('\r') || n.raw_name.includes('\r') || n.name_norm.includes('\r')) {
      crlfInParsedValues++;
    }

    // Non-ASCII check
    if (/[^\x00-\x7F]/.test(o.raw_name)) {
      nonAsciiEvaluated++;
      if (o.name_norm !== n.name_norm) {
        nonAsciiMismatches++;
      }
    }
  }

  // Micro-buffer parity check against first 10,000 legacy candidates
  let microBoundaryMismatches = 0;
  for (let i = 0; i < microRes.candidates.length; i++) {
    const o = oldRes.candidates[i];
    const m = microRes.candidates[i];
    if (!m || o.cuit !== m.cuit || o.name_norm !== m.name_norm || o.input_ordinal !== m.input_ordinal) {
      microBoundaryMismatches++;
    }
  }

  const LINE_COUNT_PARITY = (oldRes.candidates.length === newRes.candidates.length) ? 100 : 0;
  const ORDINAL_PARITY = Number(((totalCands - ordinalMismatches) / totalCands * 100).toFixed(2));
  const RAW_IDENTIFIER_PARITY = Number(((totalCands - rawIdMismatches) / totalCands * 100).toFixed(2));
  const SOURCE_PERSON_ID_PARITY = Number(((totalCands - sourcePersonIdMismatches) / totalCands * 100).toFixed(2));
  const NORMALIZED_IDENTITY_INPUT_PARITY = Number(((totalCands - (nameNormMismatches + hmacMismatches)) / totalCands * 100).toFixed(2));

  const report = {
    timestamp: new Date().toISOString(),
    stage: 'atlas_perf_1m30_p2_source_reader_parity',
    LINES_EVALUATED: LINES_TO_TEST,
    OLD_READER_CANDIDATES: oldRes.candidates.length,
    NEW_READER_CANDIDATES: newRes.candidates.length,
    PARITY_METRICS: {
      LINE_COUNT_PARITY,
      ORDINAL_PARITY,
      RAW_IDENTIFIER_PARITY,
      SOURCE_PERSON_ID_PARITY,
      NORMALIZED_IDENTITY_INPUT_PARITY
    },
    EDGE_CASES: {
      CHUNK_BOUNDARY_PARTIAL_LINES: {
        TEST_BUFFER_SIZE_BYTES: 127,
        CANDIDATES_TESTED: microRes.candidates.length,
        MISMATCHES: microBoundaryMismatches,
        PARITY: microBoundaryMismatches === 0 ? '100%' : 'FAILED'
      },
      CRLF_REMOVAL: {
        TRAILING_CR_IN_PARSED_VALUES: crlfInParsedValues,
        STATUS: crlfInParsedValues === 0 ? 'CLEAN (0 CR)' : 'FAILED'
      },
      SOURCE_ENCODING: {
        NON_ASCII_RECORDS_EVALUATED: nonAsciiEvaluated,
        NON_ASCII_MISMATCHES: nonAsciiMismatches,
        STATUS: nonAsciiMismatches === 0 ? '100% IDENTICAL' : 'FAILED'
      }
    },
    PERFORMANCE: {
      OLD_SOURCE_READ_CAND_SEC: Number((oldRes.candidates.length / (oldRes.elapsedMs / 1000)).toFixed(1)),
      NEW_SOURCE_READ_CAND_SEC: Number((newRes.candidates.length / (newRes.elapsedMs / 1000)).toFixed(1)),
      SPEEDUP: Number((oldRes.elapsedMs / newRes.elapsedMs).toFixed(2))
    },
    PARITY_PASSED: (
      LINE_COUNT_PARITY === 100 &&
      ORDINAL_PARITY === 100 &&
      RAW_IDENTIFIER_PARITY === 100 &&
      SOURCE_PERSON_ID_PARITY === 100 &&
      NORMALIZED_IDENTITY_INPUT_PARITY === 100 &&
      microBoundaryMismatches === 0 &&
      crlfInParsedValues === 0 &&
      nonAsciiMismatches === 0
    )
  };

  console.log('\n--- COMPREHENSIVE PARITY VERDICT ---');
  console.log(JSON.stringify(report, null, 2));

  fs.mkdirSync('reports/atlas/discovery', { recursive: true });
  fs.writeFileSync(
    'reports/atlas/discovery/atlas_perf_1m30_p2_source_reader_parity_v1.json',
    JSON.stringify(report, null, 2)
  );

  if (!report.PARITY_PASSED) {
    throw new Error('Comprehensive Reader Parity Test Failed!');
  }
}

main().catch(err => {
  console.error('Fatal Parity Error:', err);
  process.exit(1);
});
