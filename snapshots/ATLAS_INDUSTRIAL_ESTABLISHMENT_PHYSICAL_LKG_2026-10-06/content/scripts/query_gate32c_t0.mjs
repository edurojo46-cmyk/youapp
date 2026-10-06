import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const { Client } = pg;
const dbConfig = parseDbUrl();

async function main() {
  const client = new Client(dbConfig);
  await client.connect();
  try {
    const canonRes = await client.query(`
      SELECT 
        count(DISTINCT atlas_person_id) AS distinct_canonical_people,
        count(*) AS total_identity_rows
      FROM public.atlas_person_identity_map;
    `);
    const outboxRes = await client.query(`
      SELECT 
        count(*) AS total_outbox,
        count(*) FILTER (WHERE status = 'PENDING') AS pending,
        count(*) FILTER (WHERE status = 'PROCESSING') AS processing,
        count(*) FILTER (WHERE status = 'PUBLISHED') AS published,
        count(*) FILTER (WHERE status = 'QUARANTINED') AS quarantined,
        count(*) FILTER (WHERE status = 'RETRY') AS retry
      FROM public.atlas_search_outbox;
    `);

    console.log('T0_32C_BASELINE:', {
      timestamp: new Date().toISOString(),
      canonical_distinct: parseInt(canonRes.rows[0].distinct_canonical_people, 10),
      identity_map_rows: parseInt(canonRes.rows[0].total_identity_rows, 10),
      outbox_total: parseInt(outboxRes.rows[0].total_outbox, 10),
      outbox_dist: {
        pending: parseInt(outboxRes.rows[0].pending, 10),
        processing: parseInt(outboxRes.rows[0].processing, 10),
        published: parseInt(outboxRes.rows[0].published, 10),
        quarantined: parseInt(outboxRes.rows[0].quarantined, 10),
        retry: parseInt(outboxRes.rows[0].retry, 10)
      }
    });
  } finally {
    await client.end();
  }
}

main().catch(console.error);
