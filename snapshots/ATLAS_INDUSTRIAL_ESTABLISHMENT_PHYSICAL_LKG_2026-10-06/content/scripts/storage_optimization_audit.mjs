import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function runStorageAudit() {
  const client = new pg.Client(parseDbUrl());
  await client.connect();

  await client.query("SET statement_timeout = '45s';");

  console.log('=== 1. DATABASE TOTAL, TABLE & INDEX SIZES ===');
  const dbTot = await client.query(`
    SELECT pg_size_pretty(pg_database_size(current_database())) as db_size;
  `);
  console.log('Database size:', dbTot.rows[0].db_size);

  const topTables = await client.query(`
    SELECT 
      c.relname as table_name,
      pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
      pg_total_relation_size(c.oid) as total_bytes,
      pg_size_pretty(pg_relation_size(c.oid)) as data_size,
      pg_relation_size(c.oid) as data_bytes,
      pg_size_pretty(pg_indexes_size(c.oid)) as index_size,
      pg_indexes_size(c.oid) as index_bytes,
      coalesce((SELECT n_live_tup FROM pg_stat_user_tables WHERE pg_stat_user_tables.relname = c.relname), 0) as est_rows
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND n.nspname = 'public'
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT 10;
  `);
  console.table(topTables.rows);

  console.log('\n=== 2. OUTBOX METRICS (INDEX-ASSISTED FAST AUDIT) ===');
  // Pending & Retry use partial index idx_atlas_search_outbox_ready_queue (instant)
  const pendingRes = await client.query(`
    SELECT count(*) as pending_count 
    FROM public.atlas_search_outbox 
    WHERE status = 'PENDING';
  `);
  const retryRes = await client.query(`
    SELECT count(*) as retry_count 
    FROM public.atlas_search_outbox 
    WHERE status = 'RETRY';
  `);
  const processingRes = await client.query(`
    SELECT count(*) as processing_count 
    FROM public.atlas_search_outbox 
    WHERE status = 'PROCESSING';
  `);
  const quarantinedRes = await client.query(`
    SELECT count(*) as quarantined_count 
    FROM public.atlas_search_outbox 
    WHERE status = 'QUARANTINED';
  `);
  const failedRes = await client.query(`
    SELECT count(*) as failed_count 
    FROM public.atlas_search_outbox 
    WHERE status = 'FAILED';
  `);

  const outboxStat = topTables.rows.find(t => t.table_name === 'atlas_search_outbox');
  const estTotalOutbox = Number(outboxStat?.est_rows || 0);

  const pending = Number(pendingRes.rows[0].pending_count);
  const retry = Number(retryRes.rows[0].retry_count);
  const processing = Number(processingRes.rows[0].processing_count);
  const quarantined = Number(quarantinedRes.rows[0].quarantined_count);
  const failed = Number(failedRes.rows[0].failed_count);
  const publishedEst = Math.max(0, estTotalOutbox - pending - retry - processing - quarantined - failed);

  console.log({
    total_est_rows: estTotalOutbox,
    pending,
    retry,
    processing,
    quarantined,
    failed,
    published_est: publishedEst
  });

  // Outbox Age Bounds
  const oldestOutbox = await client.query(`
    SELECT outbox_id, created_at, status 
    FROM public.atlas_search_outbox 
    ORDER BY outbox_id ASC 
    LIMIT 1;
  `);
  const newestOutbox = await client.query(`
    SELECT outbox_id, created_at, status 
    FROM public.atlas_search_outbox 
    ORDER BY outbox_id DESC 
    LIMIT 1;
  `);
  console.log('Oldest outbox record:', oldestOutbox.rows[0]);
  console.log('Newest outbox record:', newestOutbox.rows[0]);

  console.log('\n=== 3. TOP 30 INDEXES WITH USAGE STATS ===');
  const top30Indexes = await client.query(`
    SELECT
      s.relname AS table_name,
      s.indexrelname AS index_name,
      pg_size_pretty(pg_relation_size(s.indexrelid)) AS size_pretty,
      pg_relation_size(s.indexrelid) AS size_bytes,
      s.idx_scan,
      s.idx_tup_read,
      s.idx_tup_fetch,
      i.indisunique AS is_unique,
      i.indisprimary AS is_pk,
      CASE
        WHEN i.indisprimary THEN 'PRIMARY_KEY (ESSENTIAL)'
        WHEN i.indisunique THEN 'UNIQUE (ESSENTIAL)'
        WHEN s.idx_scan > 1000 THEN 'FREQUENTLY_USED (ESSENTIAL)'
        WHEN s.idx_scan > 0 THEN 'MODERATELY_USED (USEFUL)'
        WHEN s.indexrelname ~* '_trgm' AND s.idx_scan = 0 THEN 'UNUSED_TRIGRAM (SAFE CANDIDATE)'
        WHEN s.idx_scan = 0 THEN 'ZERO_SCAN_INDEX (SAFE CANDIDATE)'
        ELSE 'OTHER'
      END AS classification
    FROM pg_stat_user_indexes s
    JOIN pg_index i ON i.indexrelid = s.indexrelid
    JOIN pg_class c ON c.oid = s.relid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
    ORDER BY pg_relation_size(s.indexrelid) DESC
    LIMIT 30;
  `);
  console.table(top30Indexes.rows);

  console.log('\n=== 4. DISCOVERY CANDIDATES STORAGE & STATUS AUDIT ===');
  const candStat = topTables.rows.find(t => t.table_name === 'atlas_people_discovery_candidates');
  console.log('Discovery candidates stats:', candStat);

  // Discovery candidate bounds
  const oldestCand = await client.query(`
    SELECT discovery_id, first_seen_at 
    FROM public.atlas_people_discovery_candidates 
    ORDER BY first_seen_at ASC 
    LIMIT 1;
  `);
  const newestCand = await client.query(`
    SELECT discovery_id, first_seen_at 
    FROM public.atlas_people_discovery_candidates 
    ORDER BY first_seen_at DESC 
    LIMIT 1;
  `);
  console.log('Oldest candidate record:', oldestCand.rows[0]);
  console.log('Newest candidate record:', newestCand.rows[0]);

  // Trigram index sizes on discovery candidates
  const trgmIndexes = top30Indexes.rows.filter(idx => idx.table_name === 'atlas_people_discovery_candidates' && idx.index_name.includes('trgm'));
  console.log('Trigram search indexes on discovery candidates:');
  console.table(trgmIndexes);
  const totalTrgmBytes = trgmIndexes.reduce((acc, idx) => acc + Number(idx.size_bytes), 0);
  console.log(`Total Trigram Index Size on discovery_candidates: ${(totalTrgmBytes / (1024 * 1024)).toFixed(1)} MB (${(totalTrgmBytes / (1024*1024*1024)).toFixed(2)} GB)`);

  await client.end();
}

runStorageAudit().catch(console.error);
