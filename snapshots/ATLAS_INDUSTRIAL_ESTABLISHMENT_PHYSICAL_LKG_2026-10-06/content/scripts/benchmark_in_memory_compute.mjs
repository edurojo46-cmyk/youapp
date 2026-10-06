import fs from 'node:fs';
import crypto from 'node:crypto';

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const HMAC_SECRET = 'stage3b_benchmark_secret_key_12345';
const SAMPLE_COUNT = 10000;

function normalizeName(name) {
  return name.trim().replace(/\s+/g, ' ');
}

function classifyRecord(line) {
  if (line.length < 50) return { classification: 'MALFORMED_RECORD' };
  const cuit = line.substring(0, 11).trim();
  const rawName = line.substring(11, 41).trim();
  if (!/^\d{11}$/.test(cuit)) return { classification: 'INVALID_RECORD' };
  const prefix = cuit.substring(0, 2);
  if (prefix === '30' || prefix === '33' || prefix === '34') {
    return { classification: 'NON_PERSON_LEGAL_ENTITY', cuit, raw_name: rawName };
  }
  if (prefix === '20' || prefix === '23' || prefix === '24' || prefix === '27') {
    return { classification: 'CANDIDATE_NATURAL_PERSON', cuit, raw_name: rawName };
  }
  return { classification: 'INSUFFICIENT_EVIDENCE', cuit, raw_name: rawName };
}

function deriveIdentityKeys(cuit, hmacSecret) {
  const hmac = crypto.createHmac('sha256', hmacSecret).update(cuit).digest('hex');
  const dni = cuit.slice(2, 10);
  const atlasPersonId = `pe_${cuit}`;
  return { identifierValue: hmac, dni, atlasPersonId };
}

// Read 10,000 raw lines
const fd = fs.openSync(SOURCE_FILE, 'r');
const buf = Buffer.alloc(SAMPLE_COUNT * 52);
fs.readSync(fd, buf, 0, SAMPLE_COUNT * 52, 0);
fs.closeSync(fd);

const lines = [];
for (let i = 0; i < SAMPLE_COUNT; i++) {
  lines.push(buf.toString('latin1', i * 52, (i + 1) * 52));
}

console.log(`=== IN-MEMORY COMPUTE BENCHMARK ON ${SAMPLE_COUNT} SAMPLES ===\n`);

// Measure RECORD_PARSE & SCHEMA_VALIDATE
const t0 = performance.now();
for (let i = 0; i < SAMPLE_COUNT; i++) {
  const line = lines[i];
  const cuit = line.slice(0, 11);
  const rawName = line.slice(11, 41);
}
const tParse = performance.now() - t0;

// Measure PERSON_CLASSIFY
const t1 = performance.now();
const classified = [];
for (let i = 0; i < SAMPLE_COUNT; i++) {
  classified.push(classifyRecord(lines[i]));
}
const tClassify = performance.now() - t1;

// Filter candidate natural persons
const candidates = classified.filter(c => c.classification === 'CANDIDATE_NATURAL_PERSON');

// Measure SOURCE_KEY_NORMALIZE
const t2 = performance.now();
for (let i = 0; i < candidates.length; i++) {
  normalizeName(candidates[i].raw_name);
}
const tNormalize = performance.now() - t2;

// Measure HMAC_IDENTITY_KEY
const t3 = performance.now();
for (let i = 0; i < candidates.length; i++) {
  deriveIdentityKeys(candidates[i].cuit, HMAC_SECRET);
}
const tHmac = performance.now() - t3;

// Measure PREVIOUSLY_EVALUATED_LOOKUP (Set lookup with 160,000 items)
const prevEvaluatedSet = new Set();
for (let i = 0; i < 160000; i++) {
  prevEvaluatedSet.add(`20${String(i).padStart(9, '0')}`);
}
const t4 = performance.now();
for (let i = 0; i < candidates.length; i++) {
  prevEvaluatedSet.has(candidates[i].cuit);
}
const tSetLookup = performance.now() - t4;

console.log(`RECORD_PARSE:             ${tParse.toFixed(3)} ms total, ${(tParse * 1000 / SAMPLE_COUNT).toFixed(3)} us/cand`);
console.log(`PERSON_CLASSIFY:          ${tClassify.toFixed(3)} ms total, ${(tClassify * 1000 / SAMPLE_COUNT).toFixed(3)} us/cand`);
console.log(`SOURCE_KEY_NORMALIZE:     ${tNormalize.toFixed(3)} ms total, ${(tNormalize * 1000 / candidates.length).toFixed(3)} us/cand`);
console.log(`HMAC_IDENTITY_KEY:        ${tHmac.toFixed(3)} ms total, ${(tHmac * 1000 / candidates.length).toFixed(3)} us/cand`);
console.log(`PREV_EVAL_LOOKUP:         ${tSetLookup.toFixed(3)} ms total, ${(tSetLookup * 1000 / candidates.length).toFixed(3)} us/cand`);

const totalComputeUsPerCand = (tParse + tClassify + tNormalize + tHmac + tSetLookup) * 1000 / candidates.length;
console.log(`\nTotal In-Memory Compute:  ${totalComputeUsPerCand.toFixed(3)} us/candidate`);
console.log(`Theoretical Max Compute Throughput: ${(1000000 / totalComputeUsPerCand).toFixed(0)} candidates/sec per CPU core!`);
