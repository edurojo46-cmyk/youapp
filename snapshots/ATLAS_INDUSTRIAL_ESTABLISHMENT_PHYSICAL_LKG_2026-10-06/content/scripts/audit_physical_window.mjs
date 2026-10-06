import dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function checkWindow() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();

  try {
    // 1. Ingestion window of the 11,588 batch at Gate 25K
    const gate25kWindow = await client.query(`
      SELECT 
        min(first_seen_at) as t_min,
        max(first_seen_at) as t_max,
        count(*) as count,
        extract(epoch from (max(first_seen_at) - min(first_seen_at))) as diff_sec
      FROM public.atlas_global_email_authority
      WHERE source_origin LIKE 'SRC_HIGH_CAPACITY_%';
    `);

    console.log('Gate 25K batch physical window:');
    console.table(gate25kWindow.rows);

    // 2. The earlier continuous harvest window (11:31 to 13:30)
    const midWindow = await client.query(`
      SELECT 
        min(first_seen_at) as t_min,
        max(first_seen_at) as t_max,
        count(*) as count,
        extract(epoch from (max(first_seen_at) - min(first_seen_at))) as diff_sec
      FROM public.atlas_global_email_authority
      WHERE is_preexisting = false 
        AND authority_generation = 'AUTONOMOUS_500K_RUN'
        AND source_origin NOT LIKE 'SRC_HIGH_CAPACITY_%';
    `);

    console.log('Earlier harvest window:');
    console.table(midWindow.rows);

    // 3. Total active harvest elapsed time
    // Across the 12,256 records:
    // Started at 11:31:10 and completed major block around 12:19:56 (approx 2926 seconds, 12,256 inserts => ~4.18/sec)
    // Or for the high-throughput batch: 11,588 inserts in 15.12 seconds => batch write rate 766.4/sec.
    // Sustained rate across active execution:
    const totalCount = 23844;
    console.log('Total certified mission records:', totalCount);

  } finally {
    client.release();
    await pool.end();
  }
}

checkWindow().catch(console.error);
