import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function check() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });
  const client = await pool.connect();
  try {
    const res = await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'commit_staged_batch_v2'");
    const src = res.rows[0].prosrc;
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('atlas_people_live_metrics') || lines[i].includes('UPDATE') || lines[i].includes('caba_pba')) {
        console.log(`L${i+1}: ${lines[i]}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}
check().catch(console.error);
