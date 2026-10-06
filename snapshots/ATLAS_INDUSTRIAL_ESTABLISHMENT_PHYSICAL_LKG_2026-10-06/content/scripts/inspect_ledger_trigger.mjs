import dotenv from 'dotenv';
dotenv.config();
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function main() {
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT trigger_name, event_manipulation, action_statement
      FROM information_schema.triggers
      WHERE event_object_table = 'atlas_constitution_decisions';
    `);
    console.log('Triggers:', res.rows);

    const fRes = await client.query(`
      SELECT pg_get_functiondef(oid)
      FROM pg_proc
      WHERE proname = 'fn_atlas_constitution_decisions_append_only';
    `);
    console.log('Function def:\n', fRes.rows[0]?.pg_get_functiondef);

    const r3 = await client.query(`
      SELECT final_decision, object_type, mission_scope, count(*)
      FROM public.atlas_constitution_decisions
      WHERE NOT EXISTS (
        SELECT 1 FROM public.atlas_products p
        WHERE (p.attributes_json->'constitutional_authorization'->>'constitution_decision_id')::uuid = atlas_constitution_decisions.decision_id
      )
      GROUP BY final_decision, object_type, mission_scope;
    `);
    console.log('Orphan breakdown:', r3.rows);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
