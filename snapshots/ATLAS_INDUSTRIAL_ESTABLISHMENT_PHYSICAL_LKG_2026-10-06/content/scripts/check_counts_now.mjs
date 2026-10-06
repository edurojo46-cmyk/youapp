import 'dotenv/config';
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function check() {
  const pool = new pg.Pool(parseDbUrl());
  const mapRes = await pool.query('SELECT count(DISTINCT atlas_person_id) as canonical_distinct, count(*) as identity_map_rows FROM public.atlas_person_identity_map');
  const outboxRes = await pool.query(`
    SELECT count(*) as total,
           count(*) FILTER (WHERE status = 'PENDING') as pending,
           count(*) FILTER (WHERE status = 'PROCESSING') as processing,
           count(*) FILTER (WHERE status = 'PUBLISHED') as published
    FROM public.atlas_search_outbox
  `);
  console.log('Map counts:', mapRes.rows[0]);
  console.log('Outbox counts:', outboxRes.rows[0]);

  const meiliRes = await fetch('http://127.0.0.1:7700/indexes/atlas_people_discovery_gate32_delta/stats');
  console.log('Meili stats:', await meiliRes.json());
  await pool.end();
}
check();
