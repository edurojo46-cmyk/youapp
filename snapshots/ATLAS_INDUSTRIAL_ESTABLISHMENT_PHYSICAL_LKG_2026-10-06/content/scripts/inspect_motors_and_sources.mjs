import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
dotenv.config();

async function check() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });
  const client = await pool.connect();
  try {
    const cols = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'atlas_discovery_source_motors'");
    console.log('Columns:', cols.rows.map(c => `${c.column_name} (${c.data_type})`));
    
    const res = await client.query("SELECT count(*), state FROM atlas_discovery_source_motors GROUP BY state");
    console.log('Motors by state:', res.rows);

    const all = await client.query("SELECT motor_id, source_id, source_family, protocol, endpoint_reference, state, overlap_observed, estimated_person_depth FROM atlas_discovery_source_motors ORDER BY motor_id");
    console.log(`Total motors in atlas_discovery_source_motors: ${all.rows.length}`);
    for (const r of all.rows) {
      console.log(`- [${r.motor_id}] src=${r.source_id} (${r.source_family}, ${r.protocol}, state=${r.state}, overlap=${r.overlap_observed}, depth=${r.estimated_person_depth})`);
    }

    const kmCount = await client.query("SELECT count(*) FROM atlas_source_knowledge_map");
    console.log('Current count in atlas_source_knowledge_map:', kmCount.rows[0].count);
  } finally {
    client.release();
    await pool.end();
  }
}
check().catch(console.error);
