import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
dotenv.config();

const dbConfig = parseDbUrl();

async function check() {
  const p = new pg.Pool({ ...dbConfig, max: 1 });
  const c = await p.connect();
  const res = await c.query(`
    SELECT pid, state, wait_event_type, wait_event, query_start, now() - query_start as duration, substring(query, 1, 80) as q
    FROM pg_stat_activity
    WHERE datname = 'atlas_shadow_cold_gate' AND pid != pg_backend_pid()
  `);
  console.log('Active queries on atlas_shadow_cold_gate:', res.rows.length);
  for (const r of res.rows) {
    console.log(`PID ${r.pid} [${r.state}] wait: ${r.wait_event_type}:${r.wait_event} dur: ${r.duration?.seconds || 0}s | ${r.q}`);
  }
  c.release();
  await p.end();
}
check().catch(console.error);
