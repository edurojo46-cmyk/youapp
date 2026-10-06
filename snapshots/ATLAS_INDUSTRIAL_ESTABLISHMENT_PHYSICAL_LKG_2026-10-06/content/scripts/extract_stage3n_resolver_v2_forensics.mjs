import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  console.log('================================================================');
  console.log('🔬 ATLAS STAGE 3N: RESOLVER V2 FORENSICS & ARCHIVE');
  console.log('================================================================\n');

  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();

  // 1. Extract pg_get_functiondef() for resolve_and_commit_candidate_batch_v2
  console.log('1. Extracting pg_get_functiondef()...');
  const funcRes = await client.query(`
    SELECT pg_get_functiondef(p.oid) as def
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'resolve_and_commit_candidate_batch_v2'
  `);

  if (funcRes.rows.length === 0) {
    throw new Error('FUNCTION_NOT_FOUND: public.resolve_and_commit_candidate_batch_v2');
  }
  const functionDef = funcRes.rows[0].def;
  const functionDefSha256 = crypto.createHash('sha256').update(functionDef).digest('hex');
  console.log(`  Function Definition SHA256: ${functionDefSha256}`);

  // 2. Extract indexes used by referenced tables: atlas_person_identity_map and atlas_search_outbox
  console.log('2. Extracting table indexes...');
  const idxRes = await client.query(`
    SELECT 
      tablename,
      indexname,
      indexdef,
      pg_size_pretty(pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(indexname))::bigint) as index_size_pretty,
      pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(indexname))::bigint as index_size_bytes
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename IN ('atlas_person_identity_map', 'atlas_search_outbox')
    ORDER BY tablename, indexname
  `);

  // 3. Extract table stats
  console.log('3. Extracting table statistics and sizes...');
  const tableStatsRes = await client.query(`
    SELECT 
      relname as tablename,
      n_live_tup,
      n_dead_tup,
      last_vacuum,
      last_autovacuum,
      last_analyze,
      last_autoanalyze,
      pg_size_pretty(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(relname))::bigint) as total_size_pretty,
      pg_size_pretty(pg_table_size(quote_ident(schemaname) || '.' || quote_ident(relname))::bigint) as table_size_pretty,
      pg_size_pretty(pg_indexes_size(quote_ident(schemaname) || '.' || quote_ident(relname))::bigint) as indexes_size_pretty
    FROM pg_stat_user_tables
    WHERE schemaname = 'public' AND relname IN ('atlas_person_identity_map', 'atlas_search_outbox')
  `);

  // 4. Index usage statistics
  console.log('4. Extracting index usage statistics (pg_stat_user_indexes)...');
  const idxUsageRes = await client.query(`
    SELECT 
      relname as tablename,
      indexrelname as indexname,
      idx_scan,
      idx_tup_read,
      idx_tup_fetch
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public' AND relname IN ('atlas_person_identity_map', 'atlas_search_outbox')
    ORDER BY relname, idx_scan DESC
  `);

  client.release();
  await pool.end();

  // 5. Decompose the Resolver Function conceptually into stages
  const stagesDecomposition = [
    {
      stage_id: 'STAGE_A',
      name: 'incoming_candidate_materialization',
      sql_construct: 'CREATE TEMP TABLE temp_incoming_batch ... ON COMMIT DROP AS SELECT ... FROM jsonb_to_recordset',
      tables_touched: ['pg_temp.temp_incoming_batch'],
      indexes_expected: ['none (heap scan)'],
      is_set_based: true,
      lateral_correlated_per_candidate: false,
      repeated_access_to_ssot: false,
      potential_io_risk: 'LOW (in-memory / temp table buffer write)'
    },
    {
      stage_id: 'STAGE_B_AND_C',
      name: 'source_key_and_hmac_cross_matching',
      sql_construct: 'CREATE TEMP TABLE temp_resolved_candidates ... LEFT JOIN LATERAL (SELECT atlas_person_id FROM public.atlas_person_identity_map s WHERE s.source_id = t.source_id AND s.source_person_id = t.source_person_id LIMIT 1) src_map ON TRUE LEFT JOIN LATERAL (SELECT atlas_person_id FROM public.atlas_person_identity_map i WHERE i.identifier_type = \'NATIONAL_IDENTITY_HMAC\' AND i.identifier_value = t.identifier_value ORDER BY i.observed_at ASC LIMIT 1) ident_match ON TRUE',
      tables_touched: ['public.atlas_person_identity_map (2.68M rows)', 'pg_temp.temp_incoming_batch'],
      indexes_expected: [
        'idx_atlas_person_identity_map_source_key (source_id, source_person_id)',
        'idx_atlas_identity_map_lookup / idx_atlas_person_identity_map_hmac'
      ],
      is_set_based: false,
      lateral_correlated_per_candidate: true,
      loops_multiplier: '2 x candidate_batch_size (e.g. 4,000 to 16,000 separate index seeks per batch)',
      repeated_access_to_ssot: true,
      potential_io_risk: 'CRITICAL (PRIMARY SOURCE OF DATAFILEREAD: 2 correlated subqueries per candidate hitting 2.68M-row table from cold storage)'
    },
    {
      stage_id: 'STAGE_D_E_F',
      name: 'canonical_decision_new_merge_conflict',
      sql_construct: 'CASE WHEN src_map.atlas_person_id IS NULL AND ident_match.atlas_person_id IS NULL THEN \'NEW\' ELSE \'MERGE\' END',
      tables_touched: ['pg_temp.temp_resolved_candidates'],
      indexes_expected: ['none'],
      is_set_based: true,
      lateral_correlated_per_candidate: false,
      repeated_access_to_ssot: false,
      potential_io_risk: 'NONE (in-memory evaluation)'
    },
    {
      stage_id: 'STAGE_G',
      name: 'identity_map_writes',
      sql_construct: 'INSERT INTO public.atlas_person_identity_map (...) SELECT ... ON CONFLICT (source_id, source_person_id) DO UPDATE ...',
      tables_touched: ['public.atlas_person_identity_map'],
      indexes_expected: ['unique constraint on (source_id, source_person_id)'],
      is_set_based: true,
      lateral_correlated_per_candidate: false,
      repeated_access_to_ssot: true,
      potential_io_risk: 'MODERATE (write to table and index pages; in shadow runs this is rolled back)'
    },
    {
      stage_id: 'STAGE_H_AND_I',
      name: 'search_outbox_generation_and_mutation',
      sql_construct: 'CREATE TEMP TABLE temp_outbox_decisions ... LEFT JOIN LATERAL (SELECT source_record_id, payload FROM public.atlas_search_outbox o WHERE o.source_id = r.source_id AND o.source_record_id = (\'rec_arca_\' || r.cuit) LIMIT 1) existing_outbox ON TRUE',
      tables_touched: ['public.atlas_search_outbox (960K rows)', 'pg_temp.temp_resolved_candidates'],
      indexes_expected: ['idx_atlas_search_outbox_source_rec or PK'],
      is_set_based: false,
      lateral_correlated_per_candidate: true,
      loops_multiplier: '1 x candidate_batch_size (e.g. 2,000 to 8,000 seeks into 960K-row outbox)',
      repeated_access_to_ssot: true,
      potential_io_risk: 'HIGH (correlated outbox existence check per candidate)'
    }
  ];

  const forensicArtifact = {
    generated_at: new Date().toISOString(),
    stage: 'STAGE_3N',
    mission: 'IDENTITY RESOLVER V2 ARCHIVE & DECOMPOSITION FORENSICS',
    function_metadata: {
      schema: 'public',
      function_name: 'resolve_and_commit_candidate_batch_v2',
      function_def_sha256: functionDefSha256,
      raw_function_def: functionDef
    },
    table_statistics: tableStatsRes.rows,
    indexes_audit: idxRes.rows,
    index_usage_statistics: idxUsageRes.rows,
    stages_decomposition: stagesDecomposition,
    top_hypothesized_io_bottleneck: {
      primary_suspect: 'STAGE_B_AND_C (TWO CORRELATED LATERAL SUBQUERIES PER CANDIDATE AGAINST ATLAS_PERSON_IDENTITY_MAP)',
      secondary_suspect: 'STAGE_H_AND_I (CORRELATED LATERAL SUBQUERY PER CANDIDATE AGAINST ATLAS_SEARCH_OUTBOX)',
      mechanism: 'For a batch of 4,000 candidates, PostgreSQL executes 8,000 individual b-tree root-to-leaf index descents into a 2.68M row table, followed by 4,000 index descents into the outbox. When concurrent workers execute simultaneously, index blocks are evicted from shared buffers, causing widespread IO: DataFileRead stalls.'
    }
  };

  const outPath = path.resolve('reports/atlas/discovery/atlas_stage3n_resolver_v2_forensics_v1.json');
  fs.writeFileSync(outPath, JSON.stringify(forensicArtifact, null, 2));
  console.log(`\n✔ Forensics artifact archived: ${outPath}`);
  console.log(`  Artifact SHA256: ${crypto.createHash('sha256').update(fs.readFileSync(outPath)).digest('hex')}`);
}

main().catch(err => {
  console.error('Forensics failed:', err);
  process.exit(1);
});
