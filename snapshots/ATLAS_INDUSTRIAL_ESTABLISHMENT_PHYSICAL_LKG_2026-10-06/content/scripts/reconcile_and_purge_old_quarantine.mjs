import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('=== PURGING & PERSISTING OLD OUTBOX QUARANTINE TO DEAD LETTER ===');

await client.query("SET statement_timeout = '120s'");

// Check status breakdown using specific indexed queries
const checkQuarantined = await client.query("SELECT count(*) FROM public.atlas_search_outbox WHERE status = 'QUARANTINED'");
console.log('Old Quarantined count:', checkQuarantined.rows[0].count);

const checkPending = await client.query("SELECT count(*) FROM public.atlas_search_outbox WHERE status = 'PENDING'");
console.log('Old Pending count:', checkPending.rows[0].count);

const checkProcessing = await client.query("SELECT count(*) FROM public.atlas_search_outbox WHERE status = 'PROCESSING'");
console.log('Old Processing count:', checkProcessing.rows[0].count);

const checkRetry = await client.query("SELECT count(*) FROM public.atlas_search_outbox WHERE status = 'RETRY'");
console.log('Old Retry count:', checkRetry.rows[0].count);

// 1. Move QUARANTINED rows to dead letter (using index on status = 'QUARANTINED')
const movedRes = await client.query(`
  WITH quarantined_rows AS (
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
      now() AS quarantined_at,
      source_id || ':' || source_record_id || ':v' || payload_version AS logical_event_id,
      jsonb_build_object('source_table', 'atlas_search_outbox', 'status', status) AS metadata
    FROM public.atlas_search_outbox
    WHERE status = 'QUARANTINED'
  ),
  ins AS (
    INSERT INTO public.atlas_search_delivery_dead_letter (
      outbox_id, atlas_person_id, source_id, source_record_id,
      payload_version, attempt_count, reason, payload_hash,
      created_at, quarantined_at, logical_event_id, metadata
    )
    SELECT 
      outbox_id, atlas_person_id, source_id, source_record_id,
      payload_version, attempt_count, reason, payload_hash,
      created_at, quarantined_at, logical_event_id, metadata
    FROM quarantined_rows
    ON CONFLICT DO NOTHING
    RETURNING dead_letter_id
  )
  SELECT count(*) FROM ins;
`);
console.log(`Persisted ${movedRes.rows[0].count} rows to atlas_search_delivery_dead_letter.`);

// 2. Delete QUARANTINED rows from old outbox using status = 'QUARANTINED'
const delRes = await client.query(`
  DELETE FROM public.atlas_search_outbox 
  WHERE status = 'QUARANTINED';
`);
console.log(`Deleted ${delRes.rowCount} quarantined rows from atlas_search_outbox.`);

// 3. Verify counts in old outbox
const finalQ = await client.query("SELECT count(*) FROM public.atlas_search_outbox WHERE status = 'QUARANTINED'");
const finalP = await client.query("SELECT count(*) FROM public.atlas_search_outbox WHERE status = 'PENDING'");
const finalProc = await client.query("SELECT count(*) FROM public.atlas_search_outbox WHERE status = 'PROCESSING'");
const finalR = await client.query("SELECT count(*) FROM public.atlas_search_outbox WHERE status = 'RETRY'");
console.log('Old Remaining Quarantined:', finalQ.rows[0].count);
console.log('Old Remaining Pending:', finalP.rows[0].count);
console.log('Old Remaining Processing:', finalProc.rows[0].count);
console.log('Old Remaining Retry:', finalR.rows[0].count);

// 4. Verify dead letter total rows
const dlCount = await client.query(`SELECT count(*) as dead_letter_total FROM public.atlas_search_delivery_dead_letter;`);
console.log(`Total in atlas_search_delivery_dead_letter: ${dlCount.rows[0].dead_letter_total}`);

await client.end();
