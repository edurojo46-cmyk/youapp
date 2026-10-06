import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const HMAC_SECRET = 'stage3b_matrix_secret_key_12345';

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
  const atlasPersonId = `pe_bench_${cuit}`;
  return { identifierValue: hmac, dni, atlasPersonId };
}

console.log('--- 1. LOADING REPLAY POPULATION (KNOWN STAGE 3 IDENTITIES) ---');
const client = new pg.Client(parseDbUrl());
await client.connect();

// Fetch 1,000 real known Stage 3 identities from DB
const knownRes = await client.query(`
  SELECT identifier_value, source_person_id, atlas_person_id
  FROM public.atlas_person_identity_map
  WHERE identifier_type = 'NATIONAL_IDENTITY_HMAC'
  LIMIT 1000
`);
console.log(`Loaded ${knownRes.rows.length} known identities from PostgreSQL SSOT.`);

// Formulate replay candidates
const replayCandidates = knownRes.rows.map((r, i) => ({
  cuit: `2099999${String(i).padStart(4, '0')}`,
  raw_name: 'REPLAY CANDIDATE',
  normalized_name: 'REPLAY CANDIDATE',
  cuit_masked: '20***99',
  identifier_value: r.identifier_value, // EXACT matching HMAC
  candidate_atlas_person_id: `pe_fake_conflict_${i}`,
  source_id: 'ARCA_PADRON_REDUCIDO',
  source_person_id: r.source_person_id
}));

console.log('\n--- 2. RUNNING REPLAY VALIDATION ON KNOWN IDENTITIES ---');
await client.query('BEGIN');
const replayRes = await client.query(
  'SELECT public.resolve_and_commit_candidate_batch_v1($1::jsonb) AS result',
  [JSON.stringify(replayCandidates)]
);
await client.query('ROLLBACK');

const replayOutcome = replayRes.rows[0].result;
console.log('Replay Validation Outcome:', replayOutcome);

const replaySuccess = 
  replayOutcome.ok === true &&
  replayOutcome.new_canonical === 0 &&
  replayOutcome.merge_existing === 1000 &&
  replayOutcome.outbox_created === 0;

console.log('Replay Idempotency & Merge Correctness Verified:', replaySuccess);
if (!replaySuccess) {
  throw new Error(`REPLAY_VALIDATION_FAILED: ${JSON.stringify(replayOutcome)}`);
}

// 3. SUSTAINED BENCHMARK TEST
console.log('\n--- 3. RUNNING SUSTAINED BENCHMARK (10 CONSECUTIVE BATCHES, BATCH = 2,000, 2 WORKERS) ---');

// Load 4,000 candidates
const fd = fs.openSync(SOURCE_FILE, 'r');
const buf = Buffer.alloc(15000 * 52);
fs.readSync(fd, buf, 0, 15000 * 52, 0);
fs.closeSync(fd);

const pool = [];
for (let i = 0; i < 15000; i++) {
  const line = buf.toString('latin1', i * 52, (i + 1) * 52);
  const cl = classifyRecord(line);
  if (cl.classification === 'CANDIDATE_NATURAL_PERSON') {
    const keys = deriveIdentityKeys(cl.cuit, HMAC_SECRET);
    pool.push({
      cuit: cl.cuit,
      raw_name: cl.raw_name,
      normalized_name: normalizeName(cl.raw_name),
      cuit_masked: `${cl.cuit.slice(0, 2)}***${cl.cuit.slice(-2)}`,
      identifier_value: keys.identifierValue,
      candidate_atlas_person_id: keys.atlasPersonId,
      source_id: 'ARCA_PADRON_REDUCIDO',
      source_person_id: `arca_${cl.cuit}`
    });
    if (pool.length >= 4000) break;
  }
}

const c1 = new pg.Client(parseDbUrl());
const c2 = new pg.Client(parseDbUrl());
await Promise.all([c1.connect(), c2.connect()]);

const b1 = pool.slice(0, 2000);
const b2 = pool.slice(2000, 4000);

const sustainedIterations = 5;
const iterationTimings = [];
let totalCandidatesEvaluated = 0;
let totalNewCanonical = 0;

const tSustainedStart = performance.now();

for (let iter = 1; iter <= sustainedIterations; iter++) {
  const tIterStart = performance.now();

  const [r1, r2] = await Promise.all([
    (async () => {
      await c1.query('BEGIN');
      const res = await c1.query('SELECT public.resolve_and_commit_candidate_batch_v1($1::jsonb) AS result', [JSON.stringify(b1)]);
      await c1.query('ROLLBACK');
      return res.rows[0].result;
    })(),
    (async () => {
      await c2.query('BEGIN');
      const res = await c2.query('SELECT public.resolve_and_commit_candidate_batch_v1($1::jsonb) AS result', [JSON.stringify(b2)]);
      await c2.query('ROLLBACK');
      return res.rows[0].result;
    })()
  ]);

  const iterElapsed = performance.now() - tIterStart;
  const iterCands = 4000;
  const iterNew = r1.new_canonical + r2.new_canonical;
  const iterCandSec = iterCands / (iterElapsed / 1000);
  const iterNewSec = iterNew / (iterElapsed / 1000);

  totalCandidatesEvaluated += iterCands;
  totalNewCanonical += iterNew;
  iterationTimings.push({
    iteration: iter,
    elapsed_ms: iterElapsed,
    candidates_sec: iterCandSec,
    new_sec: iterNewSec
  });

  console.log(`Iteration ${iter}/${sustainedIterations} | Elapsed: ${iterElapsed.toFixed(1)} ms | Cand/sec: ${iterCandSec.toFixed(1)} | NEW/sec: ${iterNewSec.toFixed(1)}`);
}

const totalSustainedTime = performance.now() - tSustainedStart;
const sustainedCandSec = totalCandidatesEvaluated / (totalSustainedTime / 1000);
const sustainedNewSec = totalNewCanonical / (totalSustainedTime / 1000);

console.log('\n=== SUSTAINED BENCHMARK SUMMARY ===');
console.log(`Total Candidates Evaluated: ${totalCandidatesEvaluated}`);
console.log(`Total Elapsed Time:         ${(totalSustainedTime / 1000).toFixed(2)} s`);
console.log(`Sustained Candidate Rate:   ${sustainedCandSec.toFixed(1)} candidates/sec`);
console.log(`Sustained Net New Rate:     ${sustainedNewSec.toFixed(1)} NEW/sec`);
console.log(`Speedup vs Stage 3 Baseline: ${(sustainedCandSec / 103.8).toFixed(2)}x`);

await Promise.all([client.end(), c1.end(), c2.end()]);
