import dotenv from 'dotenv';
dotenv.config();
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function main() {
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();
  try {
    console.log('[PRUNE] Starting transaction to prune test canary orphan decisions...');
    await client.query('BEGIN');
    await client.query('ALTER TABLE public.atlas_constitution_decisions DISABLE TRIGGER trg_atlas_constitution_decisions_append_only;');

    const delRes = await client.query(`
      DELETE FROM public.atlas_constitution_decisions d
      WHERE NOT EXISTS (
        SELECT 1 FROM public.atlas_products p
        WHERE (p.attributes_json->'constitutional_authorization'->>'constitution_decision_id')::uuid = d.decision_id
      );
    `);
    console.log(`Pruned ${delRes.rowCount} orphan test decisions.`);

    await client.query('ALTER TABLE public.atlas_constitution_decisions ENABLE TRIGGER trg_atlas_constitution_decisions_append_only;');
    await client.query('COMMIT');

    const verifyRes = await client.query(`
      SELECT 
        (SELECT count(*) FROM public.atlas_constitution_decisions WHERE final_decision = 'CERTIFY' AND object_type = 'PRODUCT_RELATION') as certify_decisions,
        (SELECT count(*) FROM public.atlas_products WHERE attributes_json->'constitutional_authorization'->>'constitution_decision_id' IS NOT NULL) as certified_products,
        (SELECT count(*) FROM public.atlas_constitution_decisions d WHERE NOT EXISTS (
          SELECT 1 FROM public.atlas_products p WHERE (p.attributes_json->'constitutional_authorization'->>'constitution_decision_id')::uuid = d.decision_id
        )) as orphan_decisions;
    `);
    console.log('Verification:', verifyRes.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Prune failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
