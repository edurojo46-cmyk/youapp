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

console.log('Loading 20,000 test candidates for Matrix Benchmark...');
const fd = fs.openSync(SOURCE_FILE, 'r');
const buf = Buffer.alloc(60000 * 52);
fs.readSync(fd, buf, 0, 60000 * 52, 0);
fs.closeSync(fd);

const candidatePool = [];
for (let i = 0; i < 60000; i++) {
  const line = buf.toString('latin1', i * 52, (i + 1) * 52);
  const cl = classifyRecord(line);
  if (cl.classification === 'CANDIDATE_NATURAL_PERSON') {
    const keys = deriveIdentityKeys(cl.cuit, HMAC_SECRET);
    candidatePool.push({
      cuit: cl.cuit,
      raw_name: cl.raw_name,
      normalized_name: normalizeName(cl.raw_name),
      cuit_masked: `${cl.cuit.slice(0, 2)}***${cl.cuit.slice(-2)}`,
      identifier_value: keys.identifierValue,
      candidate_atlas_person_id: keys.atlasPersonId,
      source_id: 'ARCA_PADRON_REDUCIDO',
      source_person_id: `arca_${cl.cuit}`,
      identifier_type: 'NATIONAL_IDENTITY_HMAC'
    });
    if (candidatePool.length >= 20000) break;
  }
}
console.log(`Loaded ${candidatePool.length} eligible candidates.\n`);

const matrixResults = [];

// Helper to run 2-step commit
async function run2StepBatch(client, batch) {
  const t0 = performance.now();
  const idValues = batch.map(b => b.identifier_value);
  
  // 1. Lookup
  const exRes = await client.query(`
    SELECT identifier_value, atlas_person_id
    FROM public.atlas_person_identity_map
    WHERE identifier_type = 'NATIONAL_IDENTITY_HMAC'
      AND identifier_value = ANY($1::text[])
  `, [idValues]);

  const exMap = new Map();
  for (const r of exRes.rows) exMap.set(r.identifier_value, r.atlas_person_id);

  const idRows = [];
  const outRows = [];
  for (const item of batch) {
    const existingPid = exMap.get(item.identifier_value);
    const pid = existingPid || item.candidate_atlas_person_id;
    idRows.push({
      atlas_person_id: pid,
      source_id: item.source_id,
      source_person_id: item.source_person_id,
      identifier_type: item.identifier_type,
      identifier_value: item.identifier_value,
      evidence_id: `ev_bench_${item.cuit}`,
      confidence: 1.0,
      resolution_method: 'DETERMINISTIC_CUIT_DNI_HMAC',
      observed_at: new Date().toISOString()
    });
    if (!existingPid) {
      outRows.push({
        atlas_person_id: pid,
        source_id: item.source_id,
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

  await client.query('BEGIN');
  await client.query(
    'SELECT public.commit_canonical_with_search_outbox($1::jsonb, $2::jsonb) AS result',
    [JSON.stringify(idRows), JSON.stringify(outRows)]
  );
  await client.query('ROLLBACK');
  const elapsed = performance.now() - t0;
  return { elapsed_ms: elapsed, new_count: outRows.length };
}

// Helper to run unified RPC batch
async function runUnifiedBatch(client, batch) {
  const t0 = performance.now();
  await client.query('BEGIN');
  const res = await client.query(
    'SELECT public.resolve_and_commit_candidate_batch_v1($1::jsonb) AS result',
    [JSON.stringify(batch)]
  );
  await client.query('ROLLBACK');
  const elapsed = performance.now() - t0;
  return { elapsed_ms: elapsed, new_count: res.rows[0].result.new_canonical };
}

console.log('=== RUNNING CONTROLLED BENCHMARK MATRIX ===\n');

// 1. CFG_LEGACY_1000_2STEP
{
  const client = new pg.Client(parseDbUrl());
  await client.connect();
  const batch = candidatePool.slice(0, 1000);
  const r = await run2StepBatch(client, batch);
  const candSec = 1000 / (r.elapsed_ms / 1000);
  const newSec = r.new_count / (r.elapsed_ms / 1000);
  matrixResults.push({
    config: 'CFG_LEGACY_1000_2STEP_1W',
    batch_size: 1000,
    concurrency: 1,
    db_method: '2_STEP_LOOKUP_AND_COMMIT_RPC',
    parser: 'READLINE',
    candidates_sec: candSec,
    new_sec: newSec,
    db_roundtrips_per_1k: 2,
    db_p95_ms: r.elapsed_ms,
    rss_mb: (process.memoryUsage().rss / 1024 / 1024).toFixed(1)
  });
  await client.end();
}

// 2. CFG_BATCH_2000_2STEP
{
  const client = new pg.Client(parseDbUrl());
  await client.connect();
  const batch = candidatePool.slice(0, 2000);
  const r = await run2StepBatch(client, batch);
  const candSec = 2000 / (r.elapsed_ms / 1000);
  const newSec = r.new_count / (r.elapsed_ms / 1000);
  matrixResults.push({
    config: 'CFG_BATCH_2000_2STEP_1W',
    batch_size: 2000,
    concurrency: 1,
    db_method: '2_STEP_LOOKUP_AND_COMMIT_RPC',
    parser: 'FIXED_WIDTH_BLOCK',
    candidates_sec: candSec,
    new_sec: newSec,
    db_roundtrips_per_1k: 1,
    db_p95_ms: r.elapsed_ms,
    rss_mb: (process.memoryUsage().rss / 1024 / 1024).toFixed(1)
  });
  await client.end();
}

// 3. CFG_BATCH_2000_UNIFIED
{
  const client = new pg.Client(parseDbUrl());
  await client.connect();
  const batch = candidatePool.slice(0, 2000);
  const r = await runUnifiedBatch(client, batch);
  const candSec = 2000 / (r.elapsed_ms / 1000);
  const newSec = r.new_count / (r.elapsed_ms / 1000);
  matrixResults.push({
    config: 'CFG_BATCH_2000_UNIFIED_1W',
    batch_size: 2000,
    concurrency: 1,
    db_method: 'UNIFIED_SET_BASED_RPC',
    parser: 'FIXED_WIDTH_BLOCK',
    candidates_sec: candSec,
    new_sec: newSec,
    db_roundtrips_per_1k: 0.5,
    db_p95_ms: r.elapsed_ms,
    rss_mb: (process.memoryUsage().rss / 1024 / 1024).toFixed(1)
  });
  await client.end();
}

// 4. CFG_BATCH_5000_UNIFIED
{
  const client = new pg.Client(parseDbUrl());
  await client.connect();
  const batch = candidatePool.slice(0, 5000);
  const r = await runUnifiedBatch(client, batch);
  const candSec = 5000 / (r.elapsed_ms / 1000);
  const newSec = r.new_count / (r.elapsed_ms / 1000);
  matrixResults.push({
    config: 'CFG_BATCH_5000_UNIFIED_1W',
    batch_size: 5000,
    concurrency: 1,
    db_method: 'UNIFIED_SET_BASED_RPC',
    parser: 'FIXED_WIDTH_BLOCK',
    candidates_sec: candSec,
    new_sec: newSec,
    db_roundtrips_per_1k: 0.2,
    db_p95_ms: r.elapsed_ms,
    rss_mb: (process.memoryUsage().rss / 1024 / 1024).toFixed(1)
  });
  await client.end();
}

// 5. CFG_BATCH_2000_UNIFIED_CONCURRENT_2 (2 parallel workers)
{
  const c1 = new pg.Client(parseDbUrl());
  const c2 = new pg.Client(parseDbUrl());
  await Promise.all([c1.connect(), c2.connect()]);
  const b1 = candidatePool.slice(0, 2000);
  const b2 = candidatePool.slice(2000, 4000);

  const t0 = performance.now();
  const [r1, r2] = await Promise.all([
    runUnifiedBatch(c1, b1),
    runUnifiedBatch(c2, b2)
  ]);
  const elapsed = performance.now() - t0;
  const totalCands = 4000;
  const candSec = totalCands / (elapsed / 1000);
  const newSec = (r1.new_count + r2.new_count) / (elapsed / 1000);

  matrixResults.push({
    config: 'CFG_BATCH_2000_UNIFIED_2W',
    batch_size: 2000,
    concurrency: 2,
    db_method: 'UNIFIED_SET_BASED_RPC',
    parser: 'FIXED_WIDTH_BLOCK',
    candidates_sec: candSec,
    new_sec: newSec,
    db_roundtrips_per_1k: 0.5,
    db_p95_ms: elapsed,
    rss_mb: (process.memoryUsage().rss / 1024 / 1024).toFixed(1)
  });
  await Promise.all([c1.end(), c2.end()]);
}

// 6. CFG_BATCH_2000_UNIFIED_CONCURRENT_4 (4 parallel workers)
{
  const clients = Array.from({ length: 4 }, () => new pg.Client(parseDbUrl()));
  await Promise.all(clients.map(c => c.connect()));
  const batches = [
    candidatePool.slice(0, 2000),
    candidatePool.slice(2000, 4000),
    candidatePool.slice(4000, 6000),
    candidatePool.slice(6000, 8000)
  ];

  const t0 = performance.now();
  const results = await Promise.all(batches.map((b, idx) => runUnifiedBatch(clients[idx], b)));
  const elapsed = performance.now() - t0;
  const totalCands = 8000;
  const candSec = totalCands / (elapsed / 1000);
  const totalNew = results.reduce((sum, r) => sum + r.new_count, 0);
  const newSec = totalNew / (elapsed / 1000);

  matrixResults.push({
    config: 'CFG_BATCH_2000_UNIFIED_4W',
    batch_size: 2000,
    concurrency: 4,
    db_method: 'UNIFIED_SET_BASED_RPC',
    parser: 'FIXED_WIDTH_BLOCK',
    candidates_sec: candSec,
    new_sec: newSec,
    db_roundtrips_per_1k: 0.5,
    db_p95_ms: elapsed,
    rss_mb: (process.memoryUsage().rss / 1024 / 1024).toFixed(1)
  });
  await Promise.all(clients.map(c => c.end()));
}

console.log('--- SHADOW BENCHMARK MATRIX RESULTS ---');
console.table(matrixResults.map(m => ({
  Config: m.config,
  'Batch Size': m.batch_size,
  Concurrency: m.concurrency,
  'Cand/sec': m.candidates_sec.toFixed(1),
  'NEW/sec': m.new_sec.toFixed(1),
  'DB RT / 1k': m.db_roundtrips_per_1k,
  'Latency (ms)': m.db_p95_ms.toFixed(1),
  'RSS (MB)': m.rss_mb
})));
