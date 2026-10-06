import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function auditHotIndexes() {
  const client = new pg.Client(parseDbUrl());
  await client.connect();

  console.log('=== 3. AUDITING HOT MAP INDEXES ===\n');

  // 1. All indexes on both tables
  const idxRes = await client.query(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE tablename IN ('atlas_hot_source_key_map', 'atlas_hot_national_identity_map')
    ORDER BY tablename, indexname;
  `);
  console.log('Index Definitions:');
  console.table(idxRes.rows);

  // 2. Index stats
  const statRes = await client.query(`
    SELECT 
      relname AS table_name,
      indexrelname AS index_name,
      idx_scan,
      idx_tup_read,
      idx_tup_fetch,
      pg_size_pretty(pg_relation_size(indexrelid)) AS size_pretty,
      pg_relation_size(indexrelid) AS size_bytes
    FROM pg_stat_user_indexes
    WHERE relname IN ('atlas_hot_source_key_map', 'atlas_hot_national_identity_map')
    ORDER BY relname, indexrelname;
  `);
  console.log('\nIndex Usage Statistics:');
  console.table(statRes.rows);

  // 3. Test EXPLAIN on typical identity resolution query
  console.log('\nEXPLAIN 1: Lookup by primary key (source_id, source_person_id):');
  const exp1 = await client.query(`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT atlas_person_id 
    FROM public.atlas_hot_source_key_map 
    WHERE source_id = 'IGJ_AUTORIDADES_GENERO_2026' 
      AND source_person_id = 'test_sample_key'
    LIMIT 1;
  `);
  console.log(exp1.rows.map(r => r['QUERY PLAN']).join('\n'));

  console.log('\nEXPLAIN 2: Lookup by atlas_person_id:');
  const exp2 = await client.query(`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT source_id, source_person_id 
    FROM public.atlas_hot_source_key_map 
    WHERE atlas_person_id = 'atlas_arg_per_2295def546739ca4'
    LIMIT 10;
  `);
  console.log(exp2.rows.map(r => r['QUERY PLAN']).join('\n'));

  console.log('\nEXPLAIN 3: Lookup national id by primary key:');
  const exp3 = await client.query(`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT atlas_person_id 
    FROM public.atlas_hot_national_identity_map 
    WHERE national_id = '20345678901'
    LIMIT 1;
  `);
  console.log(exp3.rows.map(r => r['QUERY PLAN']).join('\n'));

  console.log('\nEXPLAIN 4: Lookup national id by atlas_person_id:');
  const exp4 = await client.query(`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT national_id 
    FROM public.atlas_hot_national_identity_map 
    WHERE atlas_person_id = 'atlas_arg_per_2295def546739ca4'
    LIMIT 10;
  `);
  console.log(exp4.rows.map(r => r['QUERY PLAN']).join('\n'));

  await client.end();
}

auditHotIndexes().catch(console.error);
