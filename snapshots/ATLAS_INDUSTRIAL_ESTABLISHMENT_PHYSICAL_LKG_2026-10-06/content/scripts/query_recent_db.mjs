import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function queryRecentCommits() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });
  const client = await pool.connect();
  
  // Let's inspect recent entries in atlas_search_outbox_v2
  const outboxRes = await client.query(`
    SELECT DISTINCT source_id, count(*), min(created_at), max(created_at)
    FROM public.atlas_search_outbox_v2
    WHERE created_at >= NOW() - INTERVAL '3 hours'
    GROUP BY source_id;
  `);
  console.log('Outbox recent activity (last 3h):', outboxRes.rows);

  // Check live metrics history or current values
  const metricsRes = await client.query('SELECT * FROM public.atlas_people_live_metrics;');
  console.log('Live metrics:', metricsRes.rows);

  await client.release();
  await pool.end();
}
queryRecentCommits().catch(console.error);
