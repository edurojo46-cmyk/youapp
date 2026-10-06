import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function main() {
  const pool = new pg.Pool(parseDbUrl());
  const mapRes = await pool.query('SELECT count(*) FROM public.atlas_person_identity_map');
  const outboxRes = await pool.query('SELECT count(*) FROM public.atlas_search_outbox');
  console.log('Production atlas_person_identity_map count:', mapRes.rows[0].count);
  console.log('Production atlas_search_outbox count:', outboxRes.rows[0].count);

  const shadowRes = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'stage3q_r3_%'"
  );
  console.log('Remaining shadow tables:', shadowRes.rows);

  if (shadowRes.rows.length > 0) {
    for (const row of shadowRes.rows) {
      console.log('Dropping leftover shadow table:', row.table_name);
      await pool.query(`DROP TABLE IF EXISTS public.${row.table_name} CASCADE`);
    }
  }

  await pool.end();
}

main().catch(console.error);
