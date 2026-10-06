import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function main() {
  const pool = new pg.Pool(parseDbUrl());
  await pool.query('DROP TABLE IF EXISTS public.test_shadow_schema CASCADE;');
  
  // 1. Create table with defaults and constraints
  await pool.query(`
    CREATE TABLE public.test_shadow_schema (
      LIKE public.atlas_person_identity_map 
      INCLUDING DEFAULTS 
      INCLUDING CONSTRAINTS
    );
  `);

  // 2. Add primary key and indexes
  await pool.query(`ALTER TABLE public.test_shadow_schema ADD CONSTRAINT test_shadow_schema_pkey PRIMARY KEY (id);`);
  await pool.query(`CREATE UNIQUE INDEX uq_test_person_identity_source ON public.test_shadow_schema USING btree (source_id, source_person_id);`);
  await pool.query(`CREATE INDEX idx_test_identity_map_identifier ON public.test_shadow_schema USING btree (identifier_type, identifier_value);`);
  await pool.query(`CREATE INDEX idx_test_identity_map_atlas_person_id ON public.test_shadow_schema USING btree (atlas_person_id);`);

  const prodCols = await pool.query(`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'atlas_person_identity_map'
    ORDER BY ordinal_position;
  `);

  const shadowCols = await pool.query(`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'test_shadow_schema'
    ORDER BY ordinal_position;
  `);

  let parity = true;
  if (prodCols.rows.length !== shadowCols.rows.length) parity = false;
  for (let i = 0; i < prodCols.rows.length; i++) {
    const p = prodCols.rows[i];
    const s = shadowCols.rows[i];
    if (p.column_name !== s.column_name || p.data_type !== s.data_type || p.column_default !== s.column_default || p.is_nullable !== s.is_nullable) {
      console.error(`Mismatch at col ${p.column_name}:`, { prod: p, shadow: s });
      parity = false;
    }
  }

  const prodIdx = await pool.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'atlas_person_identity_map' ORDER BY indexname;`);
  const shadowIdx = await pool.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'test_shadow_schema' ORDER BY indexname;`);

  console.log('Columns parity:', parity ? '100% MATCH' : 'MISMATCH');
  console.log('Indexes count:', prodIdx.rows.length, 'vs', shadowIdx.rows.length);

  await pool.query('DROP TABLE IF EXISTS public.test_shadow_schema CASCADE;');
  await pool.end();
}

main().catch(console.error);
