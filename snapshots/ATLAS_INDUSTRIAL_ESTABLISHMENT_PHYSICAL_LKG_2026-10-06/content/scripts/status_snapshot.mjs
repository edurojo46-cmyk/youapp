import 'dotenv/config';
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const MEILI_URL = 'http://127.0.0.1:7700';
const MEILI_INDEX = 'atlas_people_discovery_gate32_delta';

async function snapshot() {
  const pool = new pg.Pool(parseDbUrl());
  
  // 1. DB Health & Connections
  const connRes = await pool.query(`
    SELECT count(*) as total,
           count(*) FILTER (WHERE state = 'active') as active,
           count(*) FILTER (WHERE state = 'idle') as idle,
           count(*) FILTER (WHERE wait_event IS NOT NULL AND state = 'active') as waiting
    FROM pg_stat_activity 
    WHERE datname = current_database()
  `);
  
  // 2. Lock waits
  const lockRes = await pool.query(`
    SELECT count(*) as lock_waits 
    FROM pg_locks 
    WHERE NOT granted
  `);

  // 3. Current SSOT counts
  const mapRes = await pool.query('SELECT count(DISTINCT atlas_person_id) as canonical_distinct, count(*) as identity_map_rows FROM public.atlas_person_identity_map');
  const outboxRes = await pool.query(`
    SELECT count(*) as total,
           count(*) FILTER (WHERE status = 'PENDING') as pending,
           count(*) FILTER (WHERE status = 'PROCESSING') as processing,
           count(*) FILTER (WHERE status = 'PUBLISHED') as published
    FROM public.atlas_search_outbox
  `);

  // 4. Meilisearch stats & last task
  const meiliStatsRes = await fetch(`${MEILI_URL}/indexes/${MEILI_INDEX}/stats`);
  const meiliStats = await meiliStatsRes.json();
  const tasksRes = await fetch(`${MEILI_URL}/tasks?limit=5`);
  const tasksJson = await tasksRes.json();

  console.log('=== READ-ONLY STATUS SNAPSHOT ===');
  console.log('DB Connections:', connRes.rows[0]);
  console.log('DB Lock Waits:', lockRes.rows[0]);
  console.log('SSOT Map Counts:', mapRes.rows[0]);
  console.log('SSOT Outbox Counts:', outboxRes.rows[0]);
  console.log('Meili Total Documents:', meiliStats.numberOfDocuments);
  console.log('Meili isIndexing:', meiliStats.isIndexing);
  console.log('Meili Last 3 Tasks:');
  for (const t of tasksJson.results.slice(0, 3)) {
    console.log(`  taskUid: ${t.uid}, type: ${t.type}, status: ${t.status}, duration: ${t.duration}`);
  }

  await pool.end();
}

snapshot().catch(console.error);
