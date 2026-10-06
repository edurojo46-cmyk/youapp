import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const client = new pg.Client(parseDbUrl());
  await client.connect();

  const dl = await client.query("SELECT deadlocks, conflicts FROM pg_stat_database WHERE datname = current_database()");
  console.log('Deadlocks & conflicts:', dl.rows[0]);

  const lw = await client.query("SELECT count(*) as lock_waits FROM pg_stat_activity WHERE wait_event_type = 'Lock'");
  console.log('Active lock waits:', lw.rows[0]);

  const ob = await client.query("SELECT count(*) as pending_outbox FROM atlas_search_outbox WHERE status = 'PENDING'");
  console.log('Pending outbox:', ob.rows[0]);

  const m = await client.query("SELECT qualified_unique_real_people, unique_people, searchable_documents, search_outbox_depth FROM atlas_people_live_metrics WHERE id = 'current'");
  console.log('Live metrics:', m.rows[0]);

  await client.end();
  return;

  console.log('\n=== Tables in public ===');
  const tables = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name LIKE 'atlas_%'
    ORDER BY table_name
  `);
  console.log(tables.rows.map(r => r.table_name));

  console.log('\n=== Table columns ===');
  for (const t of ['atlas_person_identity_map', 'atlas_canonical_persons', 'atlas_canonical_evidence', 'atlas_search_outbox', 'atlas_people_live_metrics']) {
    const cols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [t]);
    if (cols.rows.length > 0) {
      console.log(`Table ${t}:`, cols.rows.map(c => `${c.column_name} (${c.data_type})`).join(', '));
    } else {
      console.log(`Table ${t}: DOES NOT EXIST`);
    }
  }

  await client.end();
}

main().catch(console.error);
