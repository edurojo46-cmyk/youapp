import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const HMAC_SECRET = 'stage3b_profile_secret_key_12345';

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

// Read sample candidates from source
console.log('Loading 10,000 real candidates from source file for benchmark...');
const fd = fs.openSync(SOURCE_FILE, 'r');
const buf = Buffer.alloc(30000 * 52);
fs.readSync(fd, buf, 0, 30000 * 52, 0);
fs.closeSync(fd);

const candidatePool = [];
for (let i = 0; i < 30000; i++) {
  const line = buf.toString('latin1', i * 52, (i + 1) * 52);
  const cl = classifyRecord(line);
  if (cl.classification === 'CANDIDATE_NATURAL_PERSON') {
    const keys = deriveIdentityKeys(cl.cuit, HMAC_SECRET);
    candidatePool.push({
      ...cl,
      ...keys,
      normalized_name: normalizeName(cl.raw_name),
      cuit_masked: `${cl.cuit.slice(0, 2)}***${cl.cuit.slice(-2)}`,
      sourceId: 'ARCA_PADRON_REDUCIDO',
      sourcePersonId: `arca_${cl.cuit}`,
      identifierType: 'NATIONAL_IDENTITY_HMAC'
    });
    if (candidatePool.length >= 10000) break;
  }
}
console.log(`Loaded ${candidatePool.length} eligible candidates.\n`);

const client = new pg.Client(parseDbUrl());
await client.connect();

// 1. Profile detailed step timings on a 1,000-candidate batch with TRANSACTION ROLLBACK
console.log('--- 1. PROFILING DETAILED STEP TIMINGS (BATCH = 1,000, WITH ROLLBACK) ---');

const batch1000 = candidatePool.slice(0, 1000);
const idValues = batch1000.map(b => b.identifierValue);

// Step A: IDENTITY_CANDIDATE_LOOKUP
const tLookupStart = performance.now();
const existingRes = await client.query(`
  SELECT identifier_value, atlas_person_id
  FROM public.atlas_person_identity_map
  WHERE identifier_type = 'NATIONAL_IDENTITY_HMAC'
    AND identifier_value = ANY($1::text[])
`, [idValues]);
const tLookup = performance.now() - tLookupStart;

const existingMap = new Map();
for (const r of existingRes.rows) {
  existingMap.set(r.identifier_value, r.atlas_person_id);
}

// Step B: IDENTITY_DECISION & CANONICAL_PREPARE
const tPrepStart = performance.now();
const identityRows = [];
const outboxRows = [];
for (const item of batch1000) {
  const existingPersonId = existingMap.get(item.identifierValue);
  const pid = existingPersonId || item.atlasPersonId;
  identityRows.push({
    atlas_person_id: pid,
    source_id: item.sourceId,
    source_person_id: item.sourcePersonId,
    identifier_type: item.identifierType,
    identifier_value: item.identifierValue,
    evidence_id: `ev_bench_${item.cuit}`,
    confidence: 1.0,
    resolution_method: 'DETERMINISTIC_CUIT_DNI_HMAC',
    observed_at: new Date().toISOString()
  });
  if (!existingPersonId) {
    outboxRows.push({
      atlas_person_id: pid,
      source_id: item.sourceId,
      source_record_id: `rec_bench_${item.cuit}`,
      payload: {
        atlas_person_id: pid,
        display_name: item.normalized_name,
        cuit_masked: item.cuit_masked,
        source_surface_id: 'SURF_BENCH',
        entity_type: 'NATURAL_PERSON'
      },
      payload_version: 1
    });
  }
}
const tPrep = performance.now() - tPrepStart;

// Step C: JSON Stringify
const tJsonStart = performance.now();
const pIdentJson = JSON.stringify(identityRows);
const pOutboxJson = JSON.stringify(outboxRows);
const tJson = performance.now() - tJsonStart;

// Step D: Execute RPC inside ROLLBACK transaction
const tRpcStart = performance.now();
await client.query('BEGIN');
const rpcRes = await client.query(
  'SELECT public.commit_canonical_with_search_outbox($1::jsonb, $2::jsonb) AS result',
  [pIdentJson, pOutboxJson]
);
await client.query('ROLLBACK');
const tRpc = performance.now() - tRpcStart;

// Step E: Checkpoint Write simulation
const tCkptStart = performance.now();
// Simulating checkpoint write roundtrip
await client.query('SELECT 1'); // Lightweight proxy for checkpoint write latency
const tCkpt = performance.now() - tCkptStart;

console.log(`IDENTITY_CANDIDATE_LOOKUP: ${tLookup.toFixed(2)} ms (${(tLookup / 1000 * 1000).toFixed(2)} us/cand)`);
console.log(`IDENTITY_DECISION & PREP:   ${tPrep.toFixed(2)} ms (${(tPrep / 1000 * 1000).toFixed(2)} us/cand)`);
console.log(`JSON_SERIALIZE:            ${tJson.toFixed(2)} ms (${(tJson / 1000 * 1000).toFixed(2)} us/cand)`);
console.log(`DB_BATCH_WRITE (RPC+ROLL): ${tRpc.toFixed(2)} ms (${(tRpc / 1000 * 1000).toFixed(2)} us/cand)`);
console.log(`CHECKPOINT_ROUNDTRIP:      ${tCkpt.toFixed(2)} ms (${(tCkpt / 1000 * 1000).toFixed(2)} us/cand)`);

const totalBatchMs = tLookup + tPrep + tJson + tRpc + tCkpt;
console.log(`Total 1,000 Batch Latency: ${totalBatchMs.toFixed(2)} ms -> ${(1000 / (totalBatchMs / 1000)).toFixed(1)} cand/sec`);

// 2. Benchmark Batch Sizes: 250, 500, 1000, 2000, 5000
console.log('\n--- 2. BENCHMARKING CANDIDATE BATCH SIZES (WITH ROLLBACK) ---');
const batchSizes = [250, 500, 1000, 2000, 5000];
const batchResults = [];

for (const bSize of batchSizes) {
  const testBatch = candidatePool.slice(0, bSize);
  const testIds = testBatch.map(b => b.identifierValue);

  const tStart = performance.now();
  
  // 1. Lookup
  const exRes = await client.query(`
    SELECT identifier_value, atlas_person_id
    FROM public.atlas_person_identity_map
    WHERE identifier_type = 'NATIONAL_IDENTITY_HMAC'
      AND identifier_value = ANY($1::text[])
  `, [testIds]);

  const exMap = new Map();
  for (const r of exRes.rows) exMap.set(r.identifier_value, r.atlas_person_id);

  const idRows = [];
  const outRows = [];
  for (const item of testBatch) {
    const existingPersonId = exMap.get(item.identifierValue);
    const pid = existingPersonId || item.atlasPersonId;
    idRows.push({
      atlas_person_id: pid,
      source_id: item.sourceId,
      source_person_id: item.sourcePersonId,
      identifier_type: item.identifierType,
      identifier_value: item.identifierValue,
      evidence_id: `ev_bench_${item.cuit}`,
      confidence: 1.0,
      resolution_method: 'DETERMINISTIC_CUIT_DNI_HMAC',
      observed_at: new Date().toISOString()
    });
    if (!existingPersonId) {
      outRows.push({
        atlas_person_id: pid,
        source_id: item.sourceId,
        source_record_id: `rec_bench_${item.cuit}`,
        payload: {
          atlas_person_id: pid,
          display_name: item.normalized_name,
          cuit_masked: item.cuit_masked,
          source_surface_id: 'SURF_BENCH',
          entity_type: 'NATURAL_PERSON'
        },
        payload_version: 1
      });
    }
  }

  const pIdent = JSON.stringify(idRows);
  const pOut = JSON.stringify(outRows);

  await client.query('BEGIN');
  await client.query(
    'SELECT public.commit_canonical_with_search_outbox($1::jsonb, $2::jsonb) AS result',
    [pIdent, pOut]
  );
  await client.query('ROLLBACK');

  const elapsed = performance.now() - tStart;
  const candPerSec = (bSize / (elapsed / 1000));
  const newPerSec = (outRows.length / (elapsed / 1000));
  
  console.log(`Batch Size: ${bSize.toString().padStart(5)} | Elapsed: ${elapsed.toFixed(1).padStart(7)} ms | Cand/sec: ${candPerSec.toFixed(1).padStart(7)} | NEW/sec: ${newPerSec.toFixed(1).padStart(7)}`);
  batchResults.push({
    batch_size: bSize,
    elapsed_ms: elapsed,
    candidates_per_sec: candPerSec,
    new_per_sec: newPerSec
  });
}

await client.end();
