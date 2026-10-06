import 'dotenv/config';
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function forensic() {
  const pool = new pg.Pool(parseDbUrl());

  const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'atlas_person_identity_map'");
  console.log('Columns of atlas_person_identity_map:', cols.rows.map(r => r.column_name));

  // Let's inspect the outbox creation timestamp clusters to identify distinct write runs in Stage 3E
  // Stage 3E started after Stage 3D certified baseline of 702,061 outbox rows
  // Total outbox rows now: 821,969 (so exactly 119,908 outbox rows created in Stage 3E!)
  const clusters = await pool.query(`
    SELECT date_trunc('minute', created_at) as minute_bucket,
           min(created_at) as first_created,
           max(created_at) as last_created,
           count(*) as event_count
    FROM public.atlas_search_outbox
    WHERE created_at > '2026-09-19 15:00:00+00'
    GROUP BY 1
    ORDER BY 1 ASC
  `);
  console.log('\n--- OUTBOX CREATION CLUSTERS (Stage 3E) ---');
  for (const r of clusters.rows) {
    console.log(`${r.minute_bucket.toISOString()} | Count: ${r.event_count} | First: ${r.first_created.toISOString()} | Last: ${r.last_created.toISOString()}`);
  }

  await pool.end();
}

forensic().catch(console.error);
