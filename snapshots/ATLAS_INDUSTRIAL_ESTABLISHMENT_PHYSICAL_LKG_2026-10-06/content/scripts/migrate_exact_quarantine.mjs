import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('--- Migrating QUARANTINED rows to atlas_search_delivery_dead_letter ---');

const insRes = await client.query(`
  WITH q_sample AS (
    SELECT 
      outbox_id,
      atlas_person_id,
      source_id,
      source_record_id,
      payload_version,
      attempt_count,
      last_error AS reason,
      md5(payload::text) AS payload_hash,
      created_at,
      COALESCE(quarantined_at, now()) AS quarantined_at,
      source_id || ':' || source_record_id || ':v' || payload_version AS logical_event_id,
      jsonb_build_object('migrated_from', 'atlas_search_outbox_quarantine') AS metadata
    FROM public.atlas_search_outbox
    WHERE status = 'QUARANTINED'
    LIMIT 200
  )
  INSERT INTO public.atlas_search_delivery_dead_letter (
    outbox_id, atlas_person_id, source_id, source_record_id,
    payload_version, attempt_count, reason, payload_hash,
    created_at, quarantined_at, logical_event_id, metadata
  )
  SELECT 
    outbox_id, atlas_person_id, source_id, source_record_id,
    payload_version, attempt_count, reason, payload_hash,
    created_at, quarantined_at, logical_event_id, metadata
  FROM q_sample
  ON CONFLICT DO NOTHING
  RETURNING dead_letter_id;
`);

console.log(`Migrated \${insRes.rowCount} rows to atlas_search_delivery_dead_letter.`);

const totalDeadLetter = await client.query('SELECT count(*) FROM public.atlas_search_delivery_dead_letter');
console.log('Total in atlas_search_delivery_dead_letter:', totalDeadLetter.rows[0].count);

await client.end();
