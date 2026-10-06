import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT id, source_id, source_person_id, created_at 
      FROM public.atlas_person_identity_map 
      WHERE created_at > now() - interval '30 minutes'
    `);
    console.log('Recent identity map rows:', res.rows);

    const res2 = await client.query(`
      SELECT outbox_id, source_id, source_record_id, created_at 
      FROM public.atlas_search_outbox 
      WHERE created_at > now() - interval '30 minutes'
    `);
    console.log('Recent outbox rows:', res2.rows);

    if (res.rows.length > 0) {
      const ids = res.rows.map(r => r.id);
      await client.query(`DELETE FROM public.atlas_person_identity_map WHERE id = ANY($1)`, [ids]);
      console.log(`Deleted ${ids.length} test rows from atlas_person_identity_map`);
    }

    if (res2.rows.length > 0) {
      const outboxIds = res2.rows.map(r => r.outbox_id);
      await client.query(`DELETE FROM public.atlas_search_outbox WHERE outbox_id = ANY($1)`, [outboxIds]);
      console.log(`Deleted ${outboxIds.length} test rows from atlas_search_outbox`);
    }

    const cIdent = await client.query('SELECT count(*) FROM public.atlas_person_identity_map');
    const cOutbox = await client.query('SELECT count(*) FROM public.atlas_search_outbox');
    console.log(`Post-cleanup identity map count: ${cIdent.rows[0].count} (expected 2684776)`);
    console.log(`Post-cleanup outbox count:       ${cOutbox.rows[0].count} (expected 960868)`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
