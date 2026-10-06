import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 5 });
  const client = await pool.connect();

  console.log('--- ARCA OUTBOX ROWS BREAKDOWN ---');
  const rOutbox = await client.query(`
    SELECT status, count(*) as cnt, min(created_at) as min_created, max(created_at) as max_created
    FROM public.atlas_search_outbox
    WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA' AND created_at >= '2026-09-20T18:31:35.322Z'
    GROUP BY status;
  `);
  console.log(rOutbox.rows);

  const rOutboxGuard = await client.query(`
    SELECT count(*) as cnt
    FROM public.atlas_search_outbox
    WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA' AND created_at >= '2026-09-20T18:57:00Z' AND created_at < '2026-09-20T19:00:00Z';
  `);
  console.log('Guard batch outbox rows:', rOutboxGuard.rows[0].cnt);

  const rOutboxMain = await client.query(`
    SELECT count(*) as cnt
    FROM public.atlas_search_outbox
    WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA' AND created_at >= '2026-09-20T19:00:00Z';
  `);
  console.log('Main campaign outbox rows:', rOutboxMain.rows[0].cnt);

  // Check if there are any non-PUBLISHED rows for ARCA anywhere
  const rNonPublished = await client.query(`
    SELECT status, count(*) as cnt
    FROM public.atlas_search_outbox
    WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA' AND status != 'PUBLISHED'
    GROUP BY status;
  `);
  console.log('Non-PUBLISHED ARCA rows:', rNonPublished.rows);

  client.release();
  await pool.end();
}

main().catch(console.error);
