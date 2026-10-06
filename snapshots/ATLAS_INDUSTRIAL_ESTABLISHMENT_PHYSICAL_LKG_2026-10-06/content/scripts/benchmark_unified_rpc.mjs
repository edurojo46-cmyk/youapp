import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const HMAC_SECRET = 'stage3b_unified_secret_key_12345';

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
console.log('Loading 10,000 real candidates from source file...');
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
      cuit: cl.cuit,
      raw_name: cl.raw_name,
      normalized_name: normalizeName(cl.raw_name),
      cuit_masked: `${cl.cuit.slice(0, 2)}***${cl.cuit.slice(-2)}`,
      identifier_value: keys.identifierValue,
      candidate_atlas_person_id: keys.atlasPersonId,
      source_id: 'ARCA_PADRON_REDUCIDO',
      source_person_id: `arca_${cl.cuit}`
    });
    if (candidatePool.length >= 10000) break;
  }
}
console.log(`Loaded ${candidatePool.length} eligible candidates.\n`);

const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('=== BENCHMARKING UNIFIED RPC (1 SINGLE DB ROUNDTRIP, WITH ROLLBACK) ===');
const testBatchSizes = [500, 1000, 2000, 5000];

for (const bSize of testBatchSizes) {
  const batch = candidatePool.slice(0, bSize);
  const payloadJson = JSON.stringify(batch);

  const tStart = performance.now();
  await client.query('BEGIN');
  const res = await client.query(
    'SELECT public.resolve_and_commit_candidate_batch_v1($1::jsonb) AS result',
    [payloadJson]
  );
  await client.query('ROLLBACK');
  const elapsed = performance.now() - tStart;

  const resultData = res.rows[0].result;
  const candRate = (bSize / (elapsed / 1000));
  const newRate = (resultData.new_canonical / (elapsed / 1000));

  console.log(`Batch: ${bSize.toString().padStart(5)} | Total Time: ${elapsed.toFixed(1).padStart(7)} ms | Cand/sec: ${candRate.toFixed(1).padStart(7)} | NEW/sec: ${newRate.toFixed(1).padStart(7)} | Outcome:`, resultData);
}

await client.end();
