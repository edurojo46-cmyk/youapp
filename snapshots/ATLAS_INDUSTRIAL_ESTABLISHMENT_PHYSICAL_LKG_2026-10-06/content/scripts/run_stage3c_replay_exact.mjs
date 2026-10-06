import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const HMAC_SECRET = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY;

function normalizeName(rawName) {
  return rawName
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
  if (['20', '27', '23', '24'].includes(prefix)) {
    if (!rawName || rawName.length < 2) {
      return { classification: 'INSUFFICIENT_EVIDENCE', cuit, is_person: true };
    }
    const dni = String(parseInt(cuit.slice(2, 10), 10));
    return { classification: 'CANDIDATE_NATURAL_PERSON', cuit, dni, raw_name: rawName, prefix, is_person: true };
  }
  return { classification: 'INVALID_RECORD', cuit };
}

function deriveIdentityKeys(classified, hmacSecret) {
  const identifierValue = crypto
    .createHmac('sha256', hmacSecret)
    .update(`ARG:DNI:${classified.dni}`)
    .digest('hex');
  const atlasPersonId = `atlas_arg_per_${identifierValue.slice(0, 16)}`;
  return {
    atlasPersonId,
    identifierValue,
    identifierType: 'NATIONAL_IDENTITY_HMAC',
    sourceId: 'ARCA_CONDICION_TRIBUTARIA',
    sourcePersonId: classified.cuit
  };
}

const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('=== RUNNING DETERMINISTIC REPLAY OF 2,000 REAL STAGE 3C CANDIDATES ===\n');

// Read 2,000 real candidates from raw offset 165,000.. (the exact candidates committed in Stage 3C)
const fd = fs.openSync(SOURCE_FILE, 'r');
const buf = Buffer.alloc(6000 * 52);
fs.readSync(fd, buf, 0, 6000 * 52, 165000 * 52);
fs.closeSync(fd);

const replayBatch = [];
for (let i = 0; i < 6000; i++) {
  const line = buf.toString('latin1', i * 52, (i + 1) * 52);
  const cl = classifyRecord(line);
  if (cl.classification === 'CANDIDATE_NATURAL_PERSON') {
    const keys = deriveIdentityKeys(cl, HMAC_SECRET);
    replayBatch.push({
      cuit: cl.cuit,
      rawName: cl.raw_name,
      normalizedName: normalizeName(cl.raw_name),
      cuitMasked: `${cl.cuit.slice(0, 2)}***${cl.cuit.slice(-2)}`,
      identifierValue: keys.identifierValue,
      atlasPersonId: keys.atlasPersonId,
      sourceId: 'ARCA_CONDICION_TRIBUTARIA',
      sourcePersonId: cl.cuit
    });
    if (replayBatch.length >= 2000) break;
  }
}

console.log(`Loaded ${replayBatch.length} exact real Stage 3C candidates for deterministic replay.`);

// Run replay through resolve_and_commit_candidate_batch_v2
const res = await client.query(
  'SELECT public.resolve_and_commit_candidate_batch_v2($1::jsonb) AS result',
  [JSON.stringify(replayBatch)]
);
const outcome = res.rows[0].result;
console.log('Replay Outcome:', outcome);

const replayPass = 
  outcome.ok === true &&
  outcome.new_canonical === 0 &&
  outcome.merge_existing === 2000 &&
  outcome.identity_conflicts === 0 &&
  outcome.create_events === 0 &&
  outcome.update_events === 0 &&
  outcome.suppressed_events === 2000;

console.log(`\nExact Replay Idempotency Certified: ${replayPass}`);
console.log(`NEW_CANONICAL:     ${outcome.new_canonical} (Expected: 0)`);
console.log(`MERGE_EXISTING:    ${outcome.merge_existing} (Expected: 2000)`);
console.log(`CREATE_EVENTS:     ${outcome.create_events} (Expected: 0)`);
console.log(`UPDATE_EVENTS:     ${outcome.update_events} (Expected: 0)`);
console.log(`SUPPRESSED_EVENTS: ${outcome.suppressed_events} (Expected: 2000)`);

if (!replayPass) {
  throw new Error(`REPLAY_FAILED: ${JSON.stringify(outcome)}`);
}

await client.end();
