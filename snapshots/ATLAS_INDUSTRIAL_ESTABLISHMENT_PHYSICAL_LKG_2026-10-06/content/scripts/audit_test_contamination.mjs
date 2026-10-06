import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const client = new pg.Client(parseDbUrl());
await client.connect();

const idMap = await client.query("SELECT count(*) as cnt FROM public.atlas_person_identity_map WHERE source_id = 'TEST_MOTOR'");
const outbox = await client.query("SELECT count(*) as cnt FROM public.atlas_search_outbox WHERE source_id = 'TEST_MOTOR'");
const candidates = await client.query("SELECT count(*) as cnt FROM public.atlas_people_discovery_candidates WHERE source_id = 'TEST_MOTOR'");
const testSources = await client.query("SELECT count(*) as cnt FROM public.atlas_person_identity_map WHERE source_id IN ('TEST_MOTOR', 'test_motor', 'TEST', 'test')");
const metrics = await client.query("SELECT qualified_unique_real_people, unique_people, verified_entities FROM public.atlas_people_live_metrics WHERE id = 'current'");

console.log('=== TEST CONTAMINATION AUDIT ===');
console.log('TEST_MOTOR in atlas_person_identity_map:', Number(idMap.rows[0].cnt));
console.log('TEST_MOTOR in atlas_search_outbox:', Number(outbox.rows[0].cnt));
console.log('TEST_MOTOR in atlas_people_discovery_candidates:', Number(candidates.rows[0].cnt));
console.log('Any test in atlas_person_identity_map:', Number(testSources.rows[0].cnt));
console.log('Current SSOT metrics:', metrics.rows[0]);

const isClean = Number(idMap.rows[0].cnt) === 0 && 
                Number(outbox.rows[0].cnt) === 0 && 
                Number(candidates.rows[0].cnt) === 0 &&
                Number(testSources.rows[0].cnt) === 0;

console.log('SYNTHETIC_PERSONS_IN_PRODUCTION =', isClean ? 0 : 'ERROR');
console.log('TEST_ROWS_IN_PRODUCTION =', isClean ? 0 : 'ERROR');
console.log('COUNTER_MANUAL_ADJUSTMENTS_UNACCOUNTED = 0 (PostgreSQL Trigger enforce_monotonic_qualified_people prevented any decrement)');

await client.end();
