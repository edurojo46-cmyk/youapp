import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function runIndexAudit() {
  const client = new pg.Client(parseDbUrl());
  await client.connect();

  console.log('=== TOP 30 LARGEST INDEXES AUDIT ===');
  const indexQuery = `
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
  `;

  const res = await client.query(indexQuery);
  console.table(res.rows);

  const unused = res.rows.filter(r => !r.is_pk && !r.is_unique && r.idx_scan === 0);
  console.log('\n=== SAFE UNUSED CANDIDATE INDEXES (0 scans, non-unique, non-PK) ===');
  console.table(unused);

  const unusedBytes = unused.reduce((acc, r) => acc + Number(r.size_bytes), 0);
  console.log(`\nTotal Safe Unused Candidate Index Size: ${(unusedBytes / (1024 * 1024)).toFixed(2)} MB (${(unusedBytes / (1024 * 1024 * 1024)).toFixed(3)} GB)`);

  await client.end();
}

runIndexAudit().catch(console.error);
