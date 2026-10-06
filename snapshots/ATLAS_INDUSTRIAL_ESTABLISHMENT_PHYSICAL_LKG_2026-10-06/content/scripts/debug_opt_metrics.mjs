import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { executeInRollback } from './production_safety_guard.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

const sampleCandidate = [{
  cuit: '20123456789',
  raw_name: 'TEST PERSON',
  normalized_name: 'TEST PERSON',
  cuit_masked: '20***89',
  identifier_value: 'test_hmac_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  candidate_atlas_person_id: 'atlas_arg_per_test123',
  source_id: 'ARCA_CONDICION_TRIBUTARIA',
  source_person_id: '20123456789'
}];

// Execute strictly inside ROLLBACK transaction
await executeInRollback(client, async (txClient) => {
  const res = await txClient.query('SELECT public.resolve_and_commit_candidate_batch_v2($1::jsonb) AS result', [JSON.stringify(sampleCandidate)]);
  console.log('Sample Candidate Result (Inside Rollback):');
  console.log(res.rows[0].result);
});

console.log('✔ Verified execution with automatic rollback. Zero persistent mutation.');

await client.end();
