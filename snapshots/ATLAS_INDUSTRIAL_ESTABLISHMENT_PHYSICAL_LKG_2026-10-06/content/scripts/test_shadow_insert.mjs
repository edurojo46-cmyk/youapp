import pg from 'pg';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const shadowCfg = { ...parseDbUrl(), database: 'atlas_shadow_cold_gate' };
  const p = new pg.Pool(shadowCfg);
  const c = await p.connect();

  console.log('Testing shadow table insertion constraints...');
  await c.query('BEGIN;');

  const testCanId = crypto.randomUUID();
  const testDocId = crypto.randomUUID();

  // Test insert into atlas_shadow.atlas_person_identity_map
  await c.query(`
    INSERT INTO atlas_shadow.atlas_person_identity_map 
    (atlas_person_id, source_id, source_person_id, identifier_type, identifier_value, resolution_method, confidence)
    VALUES ($1, $2, $3, $4, $5, $6, $7);
  `, [testCanId, 'SRC_TEST', 'REC_1', 'CANONICAL_HASH', 'CAN:TEST', 'REAL_RADAR_PARSE', 0.95]);

  // Test insert into atlas_shadow.atlas_argentina_people_search_v1
  await c.query(`
    INSERT INTO atlas_shadow.atlas_argentina_people_search_v1 
    (document_id, canonical_id, full_name, normalized_name, organization, role, geography_id, qualification_state)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
  `, [testDocId, testCanId, 'Test Person', 'TEST PERSON', 'Universidad Nacional', 'Investigador', 'NATIONAL', 'QUALIFIED']);

  console.log('✓ Successfully inserted test records into both shadow tables.');
  await c.query('ROLLBACK;');
  console.log('✓ Rolled back test transaction.');

  c.release();
  await p.end();
}

main().catch(console.error);
