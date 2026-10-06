import pg from 'pg';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const shadowCfg = { ...parseDbUrl(), database: 'atlas_shadow_cold_gate' };
  const p = new pg.Pool(shadowCfg);
  const c = await p.connect();

  try {
    const personId = crypto.randomUUID();
    const docId = crypto.randomUUID();

    console.log('Testing insert 1...');
    await c.query(`
      INSERT INTO atlas_shadow.atlas_person_identity_map 
      (atlas_person_id, source_id, source_person_id, identifier_type, identifier_value, resolution_method, confidence)
      VALUES ($1, $2, $3, $4, $5, $6, $7);
    `, [personId, 'SRC_OAI_CONICET_DIGITAL', 'SRC_OAI_CONICET_DIGITAL:oai:ri.conicet.gov.ar:11336/1234', 'NORMALIZED_NAME_HASH', 'JUAN PEREZ', 'REAL_RADAR_REMOTE_OAI_CKAN', 0.95]);
    console.log('✓ Insert 1 passed!');

    console.log('Testing insert 2...');
    await c.query(`
      INSERT INTO atlas_shadow.atlas_argentina_people_search_v1 
      (document_id, canonical_id, full_name, normalized_name, organization, role, geography_id, qualification_state)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
    `, [docId, personId, 'Juan Perez', 'JUAN PEREZ', 'Investigación / Datos Públicos AR', 'Investigador / Autor', 'NATIONAL', 'QUALIFIED']);
    console.log('✓ Insert 2 passed!');

  } catch (err) {
    console.error('ERROR ON TEST INSERT:', err);
  } finally {
    c.release();
    await p.end();
  }
}

main().catch(console.error);
