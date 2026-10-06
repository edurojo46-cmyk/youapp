import fs from 'node:fs';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { streamChunkedCandidates, normalizeName } from './chunked_source_reader.mjs';

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const HMAC_SECRET = process.env.ATLAS_IDENTITY_HMAC_SECRET || 'atlas_secret_cmyk_2026';
const LINES_TO_TEST = 100000;

async function runOldReader(maxLines) {
  const fileStream = fs.createReadStream(SOURCE_FILE);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const candidates = [];
  let lineOrdinal = 0;
  const cpuStart = process.cpuUsage();
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
  const cpuUsage = process.cpuUsage(cpuStart);

  return {
    candidates,
    totalLines: lineOrdinal,
    elapsedMs,
    cpuMs: (cpuUsage.user + cpuUsage.system) / 1000
  };
}

async function runNewReader(maxLines) {
  const candidates = [];
  const cpuStart = process.cpuUsage();
  const t0 = performance.now();

  // Read with batchSize 5000
  for await (const batch of streamChunkedCandidates(SOURCE_FILE, {
    startLine: 1,
    limit: maxLines, // will stop when lines exceed maxLines inside or we filter
    batchSize: 5000
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
  const cpuUsage = process.cpuUsage(cpuStart);

  return {
    candidates,
    elapsedMs,
    cpuMs: (cpuUsage.user + cpuUsage.system) / 1000
  };
}

async function main() {
  console.log('=============================================================');
  console.log(`STEP 3 & 4: 100K SOURCE READER PARITY & BENCHMARK (${LINES_TO_TEST} lines)`);
  console.log('=============================================================\n');

  console.log('Running Old (readline) Reader...');
  const oldRes = await runOldReader(LINES_TO_TEST);
  console.log(`Old Reader: ${oldRes.candidates.length} candidates from ${oldRes.totalLines} lines in ${oldRes.elapsedMs.toFixed(1)}ms (CPU: ${oldRes.cpuMs.toFixed(1)}ms)`);

  console.log('Running New (chunked) Reader...');
  const newRes = await runNewReader(LINES_TO_TEST);
  console.log(`New Reader: ${newRes.candidates.length} candidates in ${newRes.elapsedMs.toFixed(1)}ms (CPU: ${newRes.cpuMs.toFixed(1)}ms)\n`);

  // Parity Verification
  let countMatch = oldRes.candidates.length === newRes.candidates.length;
  let ordinalMismatches = 0;
  let rawIdMismatches = 0;
  let sourcePersonIdMismatches = 0;
  let nameNormMismatches = 0;
  let hmacMismatches = 0;

  const totalCands = oldRes.candidates.length;
  for (let i = 0; i < totalCands; i++) {
    const o = oldRes.candidates[i];
    const n = newRes.candidates[i];

    if (!n) {
      countMatch = false;
      break;
    }
    if (o.input_ordinal !== n.input_ordinal) ordinalMismatches++;
    if (o.cuit !== n.cuit) rawIdMismatches++;
    if (o.source_person_id !== n.source_person_id) sourcePersonIdMismatches++;
    if (o.name_norm !== n.name_norm) nameNormMismatches++;
    if (o.identifier_value !== n.identifier_value) hmacMismatches++;
  }

  const LINE_COUNT_PARITY = countMatch ? 100 : Number(((totalCands - Math.abs(oldRes.candidates.length - newRes.candidates.length)) / totalCands * 100).toFixed(2));
  const ORDINAL_PARITY = Number(((totalCands - ordinalMismatches) / totalCands * 100).toFixed(2));
  const RAW_IDENTIFIER_PARITY = Number(((totalCands - rawIdMismatches) / totalCands * 100).toFixed(2));
  const SOURCE_PERSON_ID_PARITY = Number(((totalCands - sourcePersonIdMismatches) / totalCands * 100).toFixed(2));
  const NORMALIZED_IDENTITY_INPUT_PARITY = Number(((totalCands - (nameNormMismatches + hmacMismatches)) / totalCands * 100).toFixed(2));

  const OLD_SOURCE_READ_CAND_SEC = Number((oldRes.candidates.length / (oldRes.elapsedMs / 1000)).toFixed(1));
  const NEW_SOURCE_READ_CAND_SEC = Number((newRes.candidates.length / (newRes.elapsedMs / 1000)).toFixed(1));
  const SOURCE_READ_SPEEDUP = Number((NEW_SOURCE_READ_CAND_SEC / OLD_SOURCE_READ_CAND_SEC).toFixed(2));

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
    PERFORMANCE_METRICS: {
      OLD_SOURCE_READ_ELAPSED_MS: Number(oldRes.elapsedMs.toFixed(1)),
      OLD_SOURCE_READ_CPU_MS: Number(oldRes.cpuMs.toFixed(1)),
      OLD_SOURCE_READ_CAND_SEC,
      NEW_SOURCE_READ_ELAPSED_MS: Number(newRes.elapsedMs.toFixed(1)),
      NEW_SOURCE_READ_CPU_MS: Number(newRes.cpuMs.toFixed(1)),
      NEW_SOURCE_READ_CAND_SEC,
      SOURCE_READ_SPEEDUP
    },
    PARITY_PASSED: (
      LINE_COUNT_PARITY === 100 &&
      ORDINAL_PARITY === 100 &&
      RAW_IDENTIFIER_PARITY === 100 &&
      SOURCE_PERSON_ID_PARITY === 100 &&
      NORMALIZED_IDENTITY_INPUT_PARITY === 100
    )
  };

  console.log('--- PARITY VERDICT ---');
  console.log(JSON.stringify(report, null, 2));

  fs.mkdirSync('reports/atlas/discovery', { recursive: true });
  fs.writeFileSync(
    'reports/atlas/discovery/atlas_perf_1m30_p2_source_reader_parity_v1.json',
    JSON.stringify(report, null, 2)
  );

  if (!report.PARITY_PASSED) {
    throw new Error('Reader Parity Test Failed!');
  }
}

main().catch(err => {
  console.error('Fatal Parity Error:', err);
  process.exit(1);
});
