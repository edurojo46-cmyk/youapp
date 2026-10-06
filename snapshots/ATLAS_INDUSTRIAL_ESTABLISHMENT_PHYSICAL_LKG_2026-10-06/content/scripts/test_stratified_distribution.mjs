import dotenv from 'dotenv';
dotenv.config();
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function main() {
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();
  try {
    console.log('[QUERY] Running stratified selection test for 50,000 rows...');
    const t0 = Date.now();
    const res = await client.query(`
      WITH uncertified AS (
        SELECT 
          product_id, tenant_id, name, category, description, attributes_json,
          COALESCE(attributes_json->>'source', attributes_json->'evidence'->>'source_id', attributes_json->>'source_id', 'UNKNOWN') as src
        FROM public.atlas_products
        WHERE status = 'ACTIVE'
          AND attributes_json ? 'category'
          AND (attributes_json->'constitutional_authorization'->>'constitution_decision_id' IS NULL)
      ),
      ranked AS (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY src, category 
            ORDER BY COALESCE(attributes_json->>'company_name', ''), product_id
          ) as rn
        FROM uncertified
      )
      SELECT 
        src, category, count(*) as count
      FROM (
        SELECT src, category FROM ranked ORDER BY rn, src, category LIMIT 50000
      ) sub
      GROUP BY src, category
      ORDER BY count DESC;
    `);

    const elapsed = Date.now() - t0;
    console.log(`Query finished in ${elapsed}ms. Categories matched: ${res.rows.length}`);

    const sourceDist = {};
    let total = 0;
    res.rows.forEach(r => {
      sourceDist[r.src] = (sourceDist[r.src] || 0) + parseInt(r.count, 10);
      total += parseInt(r.count, 10);
    });

    console.log(`Total selected: ${total}`);
    console.log('Source distribution:', sourceDist);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
