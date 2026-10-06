import fs from 'node:fs';

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const START_OFFSET = 165000;
const TARGET_CANDIDATES = 100000;

function classifyRecord(line) {
  if (line.length < 50) return { classification: 'MALFORMED_RECORD' };
  const cuit = line.substring(0, 11).trim();
  const rawName = line.substring(11, 41).trim();
  if (!/^\d{11}$/.test(cuit)) return { classification: 'INVALID_RECORD' };
  const prefix = cuit.substring(0, 2);
  if (prefix === '30' || prefix === '33' || prefix === '34') {
    return { classification: 'NON_PERSON_LEGAL_ENTITY', cuit, raw_name: rawName };
  }
  if (['20', '27', '23', '24'].includes(prefix)) {
    if (!rawName || rawName.length < 2) {
      return { classification: 'INSUFFICIENT_EVIDENCE', cuit, is_person: true };
    }
    const dni = String(parseInt(cuit.slice(2, 10), 10));
    return { classification: 'CANDIDATE_NATURAL_PERSON', cuit, dni, raw_name: rawName, prefix, is_person: true };
  }
  return { classification: 'INVALID_RECORD', cuit };
}

const fd = fs.openSync(SOURCE_FILE, 'r');
const CHUNK_RECORDS = 50000;
const buf = Buffer.alloc(CHUNK_RECORDS * 52);

let currentOffset = START_OFFSET;
let candidateCount = 0;
let legalEntityCount = 0;
let malformedCount = 0;
let invalidCount = 0;
let insufficientCount = 0;
let totalRawScanned = 0;

console.log('=== EXACT CENSUS AUDIT OF ARCA SOURCE STARTING AT OFFSET 165,000 ===\n');

while (candidateCount < TARGET_CANDIDATES) {
  const bytesRead = fs.readSync(fd, buf, 0, CHUNK_RECORDS * 52, currentOffset * 52);
  if (bytesRead === 0) break;
  const recordsInChunk = Math.floor(bytesRead / 52);

  for (let i = 0; i < recordsInChunk; i++) {
    currentOffset++;
    totalRawScanned++;
    const line = buf.toString('latin1', i * 52, (i + 1) * 52);
    const cl = classifyRecord(line);

    if (cl.classification === 'CANDIDATE_NATURAL_PERSON') {
      candidateCount++;
    } else if (cl.classification === 'NON_PERSON_LEGAL_ENTITY') {
      legalEntityCount++;
    } else if (cl.classification === 'MALFORMED_RECORD') {
      malformedCount++;
    } else if (cl.classification === 'INVALID_RECORD') {
      invalidCount++;
    } else if (cl.classification === 'INSUFFICIENT_EVIDENCE') {
      insufficientCount++;
    }

    if (candidateCount >= TARGET_CANDIDATES) break;
  }
}
fs.closeSync(fd);

console.log('--- RECONSTRUCTED CENSUS RESULTS ---');
console.log('RAW_START_OFFSET:               ', START_OFFSET);
console.log('RAW_END_OFFSET:                 ', currentOffset);
console.log('RAW_ROWS_SCANNED:               ', totalRawScanned);
console.log('ACTUALLY_EVALUATED_CANDIDATES:  ', candidateCount);
console.log('LEGAL_ENTITY_ROWS (prefix 30..):', legalEntityCount);
console.log('MALFORMED_ROWS:                 ', malformedCount);
console.log('INVALID_RECORD_ROWS:            ', invalidCount);
console.log('INSUFFICIENT_EVIDENCE_ROWS:     ', insufficientCount);
console.log('TOTAL_SKIPPED_ROWS:             ', legalEntityCount + malformedCount + invalidCount + insufficientCount);
console.log('SUM VERIFICATION:               ', candidateCount + legalEntityCount + malformedCount + invalidCount + insufficientCount === totalRawScanned);
