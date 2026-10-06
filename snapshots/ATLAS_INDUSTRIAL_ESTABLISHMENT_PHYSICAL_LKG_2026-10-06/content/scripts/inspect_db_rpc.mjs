import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());

async function main() {
  await client.connect();
  console.log('Connected to PostgreSQL successfully via parseDbUrl.');

  // 1. Inspect pg_proc for commit_canonical_with_search_outbox
  const funcRes = await client.query(`
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE proname ILIKE '%commit_canonical%'
  `);
  console.log(`Found ${funcRes.rows.length} functions matching commit_canonical:`);
  for (const row of funcRes.rows) {
    console.log(`\n=== FUNCTION: ${row.proname} ===`);
    console.log(row.prosrc);
  }

  // 2. Check outbox tables
  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name ILIKE '%outbox%'
  `);
  console.log('\n=== OUTBOX TABLES ===', tablesRes.rows.map(r => r.table_name));

  // 3. For each outbox table, check row count and oldest pending
  for (const row of tablesRes.rows) {
    const tbl = row.table_name;
    try {
      const cntRes = await client.query(`SELECT COUNT(*) AS cnt FROM public."${tbl}"`);
      const pendingRes = await client.query(`
        SELECT COUNT(*) AS pending, 
               EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) AS oldest_pending_sec
        FROM public."${tbl}"
        WHERE processed = false OR status = 'pending' OR status = 'PENDING'
      `).catch((e) => ({ rows: [{ pending: 'N/A', oldest_pending_sec: 'N/A', err: e.message }] }));

      console.log(`Table: ${tbl} -> Total: ${cntRes.rows[0].cnt}, Pending: ${pendingRes.rows[0]?.pending}, OldestPendingSec: ${pendingRes.rows[0]?.oldest_pending_sec}`);
    } catch (e) {
      console.log(`Table: ${tbl} -> Query error:`, e.message);
    }
  }

  await client.end();
}

main().catch(err => {
  console.error('Fatal error in inspect_db_rpc:', err);
  process.exit(1);
});
