import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('=== RUNNING REPLAY OF 2,000 COMMITTED STAGE 3C CANDIDATES ===\n');

// Fetch 2,000 Stage 3C identities from DB
const replayRes = await client.query(`
  SELECT source_person_id AS cuit, atlas_person_id, identifier_value
  FROM public.atlas_person_identity_map
  WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA'
  ORDER BY observed_at DESC
  LIMIT 2000;
`);

console.log(`Loaded ${replayRes.rows.length} committed Stage 3C candidates for replay.`);

const replayBatch = replayRes.rows.map(r => ({
  cuit: r.cuit,
  rawName: 'REPLAY CANDIDATE',
  normalizedName: 'REPLAY CANDIDATE',
  cuitMasked: `${r.cuit.slice(0, 2)}***${r.cuit.slice(-2)}`,
  identifierValue: r.identifier_value,
  atlasPersonId: r.atlas_person_id,
  sourceId: 'ARCA_CONDICION_TRIBUTARIA',
  sourcePersonId: r.cuit
}));

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
  outcome.suppressed_events === 2000;

console.log(`\nReplay Idempotency Certified: ${replayPass}`);
console.log(`NEW_CANONICAL:        ${outcome.new_canonical} (Expected: 0)`);
console.log(`MERGE_EXISTING:       ${outcome.merge_existing} (Expected: 2000)`);
console.log(`CREATE_EVENTS:        ${outcome.create_events} (Expected: 0)`);
console.log(`SUPPRESSED_EVENTS:    ${outcome.suppressed_events} (Expected: 2000)`);

if (!replayPass) {
  throw new Error(`REPLAY_FAILED: ${JSON.stringify(outcome)}`);
}

await client.end();
