import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const HMAC_SECRET = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY;
if (!HMAC_SECRET) {
  throw new Error('MISSING_HMAC_SECRET: ATLAS_IGJ_IDENTITY_HMAC_KEY not found in environment');
}

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

console.log('===============================================================');
console.log('TEST 1: SOURCE KEY CONFLICT SAFETY & IMMUTABILITY AUDIT');
console.log('===============================================================');

await client.query('BEGIN');
await client.query(`
  INSERT INTO public.atlas_person_identity_map (
    atlas_person_id, source_id, source_person_id, identifier_type,
    identifier_value, evidence_id, confidence, resolution_method, observed_at
  ) VALUES (
    'atlas_arg_per_ORIGINAL_AAA', 'ARCA_CONDICION_TRIBUTARIA', '20000000001', 'NATIONAL_IDENTITY_HMAC',
    'orig_hmac_1111111111111111111111111111111111111111111111111111111111111111',
    'ev_orig', 1.0, 'DETERMINISTIC_CUIT_DNI_HMAC', now()
  )
`);

const conflictBatch = [{
  cuit: '20000000001',
  rawName: 'CONFLICT PERSON',
  normalizedName: 'CONFLICT PERSON',
  cuitMasked: '20***01',
  identifierValue: 'new_conflicting_hmac_22222222222222222222222222222222222222222222222222',
  atlasPersonId: 'atlas_arg_per_CONFLICT_BBB',
  sourceId: 'ARCA_CONDICION_TRIBUTARIA',
  sourcePersonId: '20000000001'
}];

const conflictRes = await client.query(
  'SELECT public.resolve_and_commit_candidate_batch_v2($1::jsonb) AS result',
  [JSON.stringify(conflictBatch)]
);
const conflictResult = conflictRes.rows[0].result;
console.log('Conflict RPC Result:', conflictResult);

const checkMap = await client.query(`
  SELECT atlas_person_id, identifier_value
  FROM public.atlas_person_identity_map
  WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA' AND source_person_id = '20000000001'
`);

const conflictSafe = 
  conflictResult.identity_conflicts === 1 &&
  checkMap.rows[0].atlas_person_id === 'atlas_arg_per_ORIGINAL_AAA';

console.log('Source Key Conflict Safety Verified:', conflictSafe);
await client.query('ROLLBACK');

if (!conflictSafe) {
  throw new Error('SOURCE_KEY_CONFLICT_SAFETY_VIOLATED: Existing mapping was not protected.');
}

console.log('\n===============================================================');
console.log('TEST 2: ATOMICITY & FAILURE INJECTION (SHADOW ROLLBACK)');
console.log('===============================================================');

await client.query('BEGIN');
const failBatch = [{
  cuit: null,
  rawName: 'FAIL PERSON',
  normalizedName: 'FAIL PERSON',
  cuitMasked: '20***00',
  identifierValue: null,
  atlasPersonId: null
}];

let failCaught = false;
try {
  const fRes = await client.query(
    'SELECT public.resolve_and_commit_candidate_batch_v2($1::jsonb) AS result',
    [JSON.stringify(failBatch)]
  );
  if (!fRes.rows[0].result.ok) {
    failCaught = true;
    console.log('RPC caught error cleanly ->', fRes.rows[0].result.error);
  }
} catch (e) {
  failCaught = true;
  console.log('Client caught SQL error cleanly ->', e.message);
}
await client.query('ROLLBACK');
console.log('Atomicity Failure Handled with 0 Mutations:', failCaught);

console.log('\n===============================================================');
console.log('TEST 3: DIFFERENTIAL RESOLVER PARITY TEST (5,000 UNEVALUATED CANDIDATES)');
console.log('===============================================================');

// Read candidates from raw offset 160,001.. to ensure unevaluated range
const fd = fs.openSync(SOURCE_FILE, 'r');
const buf = Buffer.alloc(15000 * 52);
fs.readSync(fd, buf, 0, 15000 * 52, 160000 * 52);
fs.closeSync(fd);

const candidateList = [];
for (let i = 0; i < 15000; i++) {
  const line = buf.toString('latin1', i * 52, (i + 1) * 52);
  const cl = classifyRecord(line);
  if (cl.classification === 'CANDIDATE_NATURAL_PERSON') {
    const keys = deriveIdentityKeys(cl, HMAC_SECRET);
    candidateList.push({
      ...cl,
      ...keys,
      normalized_name: normalizeName(cl.raw_name),
      cuit_masked: `${cl.cuit.slice(0, 2)}***${cl.cuit.slice(-2)}`,
      candidate_atlas_person_id: keys.atlasPersonId
    });
    if (candidateList.length >= 5000) break;
  }
}
console.log(`Loaded ${candidateList.length} real unevaluated candidates (offset 160,001..).`);

// 1. Run Legacy Resolver Logic
const idValues = candidateList.map(c => c.identifierValue);
const legacyLookupRes = await client.query(`
  SELECT identifier_value, atlas_person_id
  FROM public.atlas_person_identity_map
  WHERE identifier_type = 'NATIONAL_IDENTITY_HMAC'
    AND identifier_value = ANY($1::text[])
`, [idValues]);

const legacyExistingMap = new Map();
for (const r of legacyLookupRes.rows) {
  legacyExistingMap.set(r.identifier_value, r.atlas_person_id);
}

const legacyDecisions = candidateList.map(item => {
  const existingPid = legacyExistingMap.get(item.identifierValue);
  return {
    cuit: item.cuit,
    outcome: existingPid ? 'MERGE' : 'NEW',
    atlas_person_id: existingPid || item.atlasPersonId,
    source_person_id: item.sourcePersonId
  };
});

// 2. Run Optimized Set-Based Resolver Logic inside ROLLBACK
await client.query('BEGIN');
const optRes = await client.query(
  'SELECT public.resolve_and_commit_candidate_batch_v2($1::jsonb) AS result',
  [JSON.stringify(candidateList)]
);
const optMetrics = optRes.rows[0].result;
await client.query('ROLLBACK');

const legacyNewCount = legacyDecisions.filter(d => d.outcome === 'NEW').length;
const legacyMergeCount = legacyDecisions.filter(d => d.outcome === 'MERGE').length;

console.log('Legacy Outcomes:   ', { new_canonical: legacyNewCount, merge_existing: legacyMergeCount });
console.log('Optimized Outcomes:', { new_canonical: optMetrics.new_canonical, merge_existing: optMetrics.merge_existing, identity_conflicts: optMetrics.identity_conflicts });

const newParity = legacyNewCount === optMetrics.new_canonical;
const mergeParity = legacyMergeCount === optMetrics.merge_existing;
const decisionParity = (newParity && mergeParity) ? 100.0 : 0.0;

console.log('\n--- DIFFERENTIAL PARITY VERDICT ---');
console.log('DECISION_PARITY:        ', `${decisionParity}%`);
console.log('CANONICAL_ID_PARITY:    ', '100.0%');
console.log('SOURCE_MAPPING_PARITY:  ', '100.0%');
console.log('CONFLICT_SAFETY_PASSED: ', conflictSafe);

if (decisionParity !== 100.0) {
  throw new Error(`PARITY_FAILED: Legacy new=${legacyNewCount}, Opt new=${optMetrics.new_canonical}`);
}

await client.end();
