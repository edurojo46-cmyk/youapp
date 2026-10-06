import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

import { EvidenceFusionEngine } from '../../src/lib/profile/evidence_fusion_engine.mjs';
import { ExplainableProfileApi } from '../../src/lib/profile/explainable_profile_api.mjs';
import { adaptSourceRecord } from '../../src/lib/profile/evidence_adapters.mjs';

async function test() {
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();
  try {
    const pId = 'atlas_arg_per_000012c72214214e';
    const recs = await client.query(`
      SELECT m.atlas_person_id, m.source_id, m.source_person_id, m.identifier_type, m.identifier_value, m.evidence_id, m.observed_at,
             o.payload
      FROM public.atlas_person_identity_map m
      LEFT JOIN public.atlas_search_outbox o
        ON o.atlas_person_id = m.atlas_person_id AND o.source_record_id = m.source_person_id
      WHERE m.atlas_person_id = $1;
    `, [pId]);

    console.log(`Found ${recs.rows.length} records for ${pId}`);
    const engine = new EvidenceFusionEngine(pool);
    const api = new ExplainableProfileApi(pool);

    for (const r of recs.rows) {
      console.log(`Adapting record from source ${r.source_id}...`);
      const obs = adaptSourceRecord(r.source_id, {
        source_id: r.source_id,
        source_person_id: r.source_person_id,
        source_record_id: r.source_person_id,
        display_name: r.payload?.display_name || 'TEST PERSON',
        raw_name: r.payload?.display_name || 'TEST PERSON',
        full_name: r.payload?.display_name || 'TEST PERSON',
        name_norm: r.payload?.display_name_normalized || 'TEST PERSON',
        role: r.payload?.role || 'DIRECTOR',
        organization_name: r.payload?.organization || 'TEST ORG SA',
        province: r.payload?.province || 'BUENOS AIRES',
        evidence_id: r.evidence_id || 'ev_test',
        observed_at: r.observed_at || new Date().toISOString()
      });
      console.log(`Ingesting ${obs.length} observations...`);
      const updateRes = await engine.incrementalUpdate(
        client,
        pId,
        r.source_id,
        r.source_person_id,
        r.source_person_id,
        obs
      );
      console.log('Update result:', updateRes.conflicts);
    }

    console.log('Fetching explanation...');
    const expl = await api.getPersonProfileWithExplanation(pId, client);
    console.log('Explanation result profile display_name:', expl.profile.display_name);
    console.log('Supporting obs count:', expl.explanation.supporting_observations_count);
    console.log('Field provenance:', Object.keys(expl.explanation.field_provenance));
  } finally {
    client.release();
    await pool.end();
  }
}

test().catch(console.error);
