import dotenv from 'dotenv';
dotenv.config();
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function main() {
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();
  try {
    const r1 = await client.query(`
      SELECT 
        count(*) as total_physical_rows,
        count(*) FILTER (WHERE status = 'ACTIVE') as active_rows,
        count(*) FILTER (WHERE status = 'ACTIVE' AND attributes_json ? 'category') as active_mission_fit,
        count(*) FILTER (WHERE attributes_json->'constitutional_authorization'->>'constitution_decision_id' IS NOT NULL) as certified_products
      FROM public.atlas_products;
    `);
    console.log('Products status:', r1.rows[0]);

    const r2 = await client.query(`
      SELECT 
        final_decision,
        object_type,
        count(*) 
      FROM public.atlas_constitution_decisions
      GROUP BY final_decision, object_type;
    `);
    console.log('Decisions by type:', r2.rows);

    const r3 = await client.query(`
      SELECT count(*) as orphan_decisions
      FROM public.atlas_constitution_decisions d
      WHERE NOT EXISTS (
        SELECT 1 FROM public.atlas_products p
        WHERE (p.attributes_json->'constitutional_authorization'->>'constitution_decision_id')::uuid = d.decision_id
      );
    `);
    console.log('Orphan decisions (not referenced by atlas_products):', r3.rows[0]);

    const r4 = await client.query(`
      SELECT count(*) as cert_without_decision
      FROM public.atlas_products p
      WHERE attributes_json->'constitutional_authorization'->>'constitution_decision_id' IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.atlas_constitution_decisions d
          WHERE d.decision_id = (p.attributes_json->'constitutional_authorization'->>'constitution_decision_id')::uuid
        );
    `);
    console.log('Certified without decision:', r4.rows[0]);

    const r5 = await client.query(`
      SELECT count(*) as dup_bindings FROM (
        SELECT attributes_json->'constitutional_authorization'->>'constitution_decision_id' as dec_id, count(*)
        FROM public.atlas_products
        WHERE attributes_json->'constitutional_authorization'->>'constitution_decision_id' IS NOT NULL
        GROUP BY 1
        HAVING count(*) > 1
      ) s;
    `);
    console.log('Duplicate decision bindings:', r5.rows[0]);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
