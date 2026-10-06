import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
import { parseDbUrl } from './export_search_projection_v2.mjs';

const dbConfig = parseDbUrl();
const pool = new Pool({
  ...dbConfig,
  max: 2,
});

async function main() {
  const client = await pool.connect();
  try {
    console.log('--- 1. AUDIT next_retry_at SEMANTICS IN PRODUCTION OUTBOX ---');
    const retrySemantics = await client.query(`
      SELECT 
        COUNT(*) AS total_outbox,
        COUNT(*) FILTER (WHERE status = 'PENDING') AS pending_total,
        COUNT(*) FILTER (WHERE status = 'PENDING' AND next_retry_at IS NULL) AS pending_next_retry_null,
        COUNT(*) FILTER (WHERE status = 'PENDING' AND next_retry_at IS NOT NULL) AS pending_next_retry_non_null,
        COUNT(*) FILTER (WHERE status = 'RETRY') AS retry_total,
        COUNT(*) FILTER (WHERE status = 'RETRY' AND next_retry_at IS NULL) AS retry_next_retry_null,
        COUNT(*) FILTER (WHERE status = 'RETRY' AND next_retry_at IS NOT NULL) AS retry_next_retry_non_null,
        COUNT(*) FILTER (WHERE status = 'PROCESSING') AS processing_total,
        COUNT(*) FILTER (WHERE status = 'PUBLISHED') AS published_total,
        COUNT(*) FILTER (WHERE status = 'QUARANTINED') AS quarantined_total
      FROM public.atlas_search_outbox;
    `);
    console.log('Outbox Counts:', JSON.stringify(retrySemantics.rows[0], null, 2));

    const columnInfo = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'atlas_search_outbox' AND column_name IN ('next_retry_at', 'status', 'outbox_id');
    `);
    console.log('Column Schema:', JSON.stringify(columnInfo.rows, null, 2));

    console.log('--- 2. AUDIT CERTIFIED STORED PROCEDURE: process_search_outbox_batch ---');
    const procDef = await client.query(`
      SELECT pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = 'process_search_outbox_batch';
    `);
    if (procDef.rows.length > 0) {
      console.log('Procedure Definition Header:\n', procDef.rows[0].definition.slice(0, 500));
    } else {
      console.log('Procedure public.process_search_outbox_batch NOT FOUND.');
    }

    console.log('--- 3. CHECK EXISTING INDEXES ON atlas_search_outbox ---');
    const indexQuery = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'atlas_search_outbox';
    `);
    console.log('Indexes:', JSON.stringify(indexQuery.rows, null, 2));

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
