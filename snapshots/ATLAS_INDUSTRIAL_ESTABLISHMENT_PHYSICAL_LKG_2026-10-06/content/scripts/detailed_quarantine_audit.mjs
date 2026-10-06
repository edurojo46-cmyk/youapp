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
    const res = await client.query(`
      SELECT 
        source_id,
        last_error,
        payload_version,
        count(*),
        min(created_at) as oldest_created,
        max(created_at) as newest_created,
        min(quarantined_at) as oldest_quarantined,
        max(quarantined_at) as newest_quarantined
      FROM public.atlas_search_outbox
      WHERE status = 'QUARANTINED'
      GROUP BY source_id, last_error, payload_version
      ORDER BY count DESC;
    `);

    console.log('=== QUARANTINED ROWS DETAILED GROUPING ===');
    console.table(res.rows);

    // Let's sample rows from each group
    for (const group of res.rows) {
      console.log(`\nSample for: source_id="${group.source_id}", last_error="${group.last_error}"`);
      const sample = await client.query(`
        SELECT outbox_id, atlas_person_id, source_id, source_record_id, last_error, payload
        FROM public.atlas_search_outbox
        WHERE status = 'QUARANTINED' 
          AND source_id = $1 
          AND (last_error = $2 OR ($2 IS NULL AND last_error IS NULL))
        LIMIT 1;
      `, [group.source_id, group.last_error]);
      
      if (sample.rows.length > 0) {
        const r = sample.rows[0];
        console.log({
          outbox_id: r.outbox_id,
          atlas_person_id: r.atlas_person_id,
          source_record_id: r.source_record_id,
          payload_keys: Object.keys(r.payload || {}),
          display_name: r.payload?.display_name,
          discovery_id: r.payload?.discovery_id
        });
      }
    }
  } finally {
    await client.end();
  }
}

main().catch(console.error);
