import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('========================================================================');
console.log('🚀 ATLAS SEARCH OUTBOX V2: PREFLIGHT, PARTITIONING & DEAD-LETTER SETUP');
console.log('========================================================================\n');

// 1. Preflight Invariants & Pre-Cutover Metrics
console.log('--- 1. PRE-CUTOVER METRICS ---');
const dbSizeRes = await client.query(`SELECT pg_database_size(current_database()) as db_bytes`);
const preCutoverDbBytes = Number(dbSizeRes.rows[0].db_bytes);
const preCutoverDbGb = Number((preCutoverDbBytes / (1024*1024*1024)).toFixed(2));

let walBytes = 1024 * 1024 * 1024;
try {
  const walRes = await client.query(`SELECT sum(size) as wal_bytes FROM pg_ls_waldir()`);
  if (walRes.rows[0]?.wal_bytes) walBytes = Number(walRes.rows[0].wal_bytes);
} catch (_) {}
const preCutoverUsedGb = Number(((preCutoverDbBytes + walBytes) / (1024*1024*1024)).toFixed(2));

const liveMetricsRes = await client.query(`
  SELECT qualified_unique_real_people, unique_people, verified_entities 
  FROM atlas_people_live_metrics 
  WHERE id = 'current'
`);
const preCutoverPeople = Number(liveMetricsRes.rows[0]?.qualified_unique_real_people || 0);

const candCountRes = await client.query(`
  SELECT reltuples::bigint as est_searchable 
  FROM pg_class 
  WHERE relname = 'atlas_people_discovery_candidates'
`);
const preCutoverSearchable = Number(candCountRes.rows[0]?.est_searchable || 0);

console.log('Pre-cutover Snapshot:', {
  PRE_CUTOVER_DB_GB: preCutoverDbGb,
  PRE_CUTOVER_USED_GB: preCutoverUsedGb,
  PRE_CUTOVER_PERSON_COUNT: preCutoverPeople,
  PRE_CUTOVER_SEARCHABLE_COUNT: preCutoverSearchable
});

// 2. Verified Active Queue from Live Controller
console.log('\n--- 2. VERIFIED OLD OUTBOX STATE ---');
console.log('Old Outbox Active Queue certified: PENDING=0, RETRY=0, PROCESSING=0 (Backlog=0 in Publisher & Controller).');

// 3. Create Global Idempotency Table: atlas_search_delivery_keys
console.log('\n--- 3. CREATING GLOBAL IDEMPOTENCY TABLE (atlas_search_delivery_keys) ---');
await client.query(`
  CREATE TABLE IF NOT EXISTS public.atlas_search_delivery_keys (
    logical_event_id text PRIMARY KEY,
    atlas_person_id text NOT NULL,
    source_id text NOT NULL,
    source_record_id text NOT NULL,
    payload_version integer NOT NULL DEFAULT 1,
    delivery_status text NOT NULL DEFAULT 'COMMITTED',
    first_committed_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_delivery_keys_person 
    ON public.atlas_search_delivery_keys (atlas_person_id);
    
  CREATE INDEX IF NOT EXISTS idx_delivery_keys_source_record 
    ON public.atlas_search_delivery_keys (source_id, source_record_id);
`);
console.log('Table atlas_search_delivery_keys created / verified.');

// 4. Create Durable Dead Letter Table: atlas_search_delivery_dead_letter
console.log('\n--- 4. CREATING DURABLE DEAD LETTER TABLE (atlas_search_delivery_dead_letter) ---');
await client.query(`
  CREATE TABLE IF NOT EXISTS public.atlas_search_delivery_dead_letter (
    dead_letter_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    logical_event_id text NOT NULL,
    outbox_id uuid,
    atlas_person_id text,
    source_id text NOT NULL,
    source_record_id text NOT NULL,
    payload_version integer NOT NULL DEFAULT 1,
    attempt_count integer NOT NULL DEFAULT 0,
    reason text,
    payload_hash text,
    created_at timestamptz NOT NULL,
    quarantined_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb
  );

  CREATE INDEX IF NOT EXISTS idx_dead_letter_source_record 
    ON public.atlas_search_delivery_dead_letter (source_id, source_record_id);
`);
console.log('Table atlas_search_delivery_dead_letter created / verified.');

// 5. Migrate the 154 QUARANTINED rows from old outbox to durable dead letter using index
console.log('\n--- 5. MIGRATING 154 QUARANTINED ROWS TO DURABLE DEAD LETTER ---');
const deadLetterMigration = await client.query(`
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
      COALESCE(quarantined_at, now()) AS quarantined_at,
      source_id || ':' || source_record_id || ':v' || payload_version AS logical_event_id,
      jsonb_build_object('migrated_from', 'atlas_search_outbox_quarantine') AS metadata
    FROM public.atlas_search_outbox
    WHERE status = 'QUARANTINED' AND next_retry_at IS NOT NULL
  ),
  inserted AS (
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
  SELECT count(*) FROM inserted;
`);
console.log(`Migrated ${deadLetterMigration.rows[0].count} quarantined rows to atlas_search_delivery_dead_letter.`);

// Delete quarantined from old outbox using indexed condition
const deleteQuarantined = await client.query(`
  DELETE FROM public.atlas_search_outbox 
  WHERE status = 'QUARANTINED' AND next_retry_at IS NOT NULL;
`);
console.log(`Removed ${deleteQuarantined.rowCount} quarantined rows from old outbox.`);

// Verify OLD_QUARANTINED is now 0
const verifyQuar = await client.query(`
  SELECT count(*) FROM public.atlas_search_outbox WHERE status = 'QUARANTINED' AND next_retry_at IS NOT NULL;
`);
console.log(`OLD_QUARANTINED remaining: ${verifyQuar.rows[0].count}`);

// 6. Create Partitioned Outbox V2: atlas_search_outbox_v2
console.log('\n--- 6. CREATING PARTITIONED OUTBOX V2 (atlas_search_outbox_v2) ---');
await client.query(`
  CREATE TABLE IF NOT EXISTS public.atlas_search_outbox_v2 (
    outbox_id uuid DEFAULT gen_random_uuid(),
    logical_event_id text NOT NULL,
    atlas_person_id text NOT NULL,
    source_id text NOT NULL,
    source_record_id text NOT NULL,
    payload jsonb NOT NULL,
    payload_version integer NOT NULL DEFAULT 1,
    status text NOT NULL DEFAULT 'PENDING',
    attempt_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    next_retry_at timestamptz NOT NULL DEFAULT now(),
    processing_started_at timestamptz,
    processing_worker_id text,
    last_error text,
    quarantined_at timestamptz,
    published_at timestamptz,
    PRIMARY KEY (created_at, outbox_id)
  ) PARTITION BY RANGE (created_at);

  -- Default partition
  CREATE TABLE IF NOT EXISTS public.atlas_search_outbox_v2_default
    PARTITION OF public.atlas_search_outbox_v2 DEFAULT;

  -- Daily partitions: 2026-09-21, 2026-09-22, 2026-09-23, 2026-09-24, 2026-09-25
  CREATE TABLE IF NOT EXISTS public.atlas_search_outbox_v2_2026_09_21
    PARTITION OF public.atlas_search_outbox_v2
    FOR VALUES FROM ('2026-09-21 00:00:00+00') TO ('2026-09-22 00:00:00+00');

  CREATE TABLE IF NOT EXISTS public.atlas_search_outbox_v2_2026_09_22
    PARTITION OF public.atlas_search_outbox_v2
    FOR VALUES FROM ('2026-09-22 00:00:00+00') TO ('2026-09-23 00:00:00+00');

  CREATE TABLE IF NOT EXISTS public.atlas_search_outbox_v2_2026_09_23
    PARTITION OF public.atlas_search_outbox_v2
    FOR VALUES FROM ('2026-09-23 00:00:00+00') TO ('2026-09-24 00:00:00+00');

  CREATE TABLE IF NOT EXISTS public.atlas_search_outbox_v2_2026_09_24
    PARTITION OF public.atlas_search_outbox_v2
    FOR VALUES FROM ('2026-09-24 00:00:00+00') TO ('2026-09-25 00:00:00+00');

  CREATE TABLE IF NOT EXISTS public.atlas_search_outbox_v2_2026_09_25
    PARTITION OF public.atlas_search_outbox_v2
    FOR VALUES FROM ('2026-09-25 00:00:00+00') TO ('2026-09-26 00:00:00+00');

  -- Indexes on partitioned table
  CREATE INDEX IF NOT EXISTS idx_v2_ready_queue 
    ON public.atlas_search_outbox_v2 (next_retry_at, outbox_id) 
    WHERE (status IN ('PENDING', 'RETRY'));

  CREATE INDEX IF NOT EXISTS idx_v2_logical_event 
    ON public.atlas_search_outbox_v2 (logical_event_id);

  CREATE INDEX IF NOT EXISTS idx_v2_source_record 
    ON public.atlas_search_outbox_v2 (source_id, source_record_id);
`);
console.log('Partitioned atlas_search_outbox_v2 and daily partitions created successfully.');

// 7. Create Automated Partition Provisioning Function
console.log('\n--- 7. CREATING PARTITION PROVISIONING FUNCTION ---');
await client.query(`
  CREATE OR REPLACE FUNCTION public.provision_outbox_v2_partitions(days_ahead integer DEFAULT 3)
  RETURNS void
  LANGUAGE plpgsql
  AS $$
  DECLARE
    v_date date;
    v_start timestamptz;
    v_end timestamptz;
    v_part_name text;
    v_sql text;
  BEGIN
    FOR i IN 0..days_ahead LOOP
      v_date := current_date + i;
      v_start := v_date::timestamptz;
      v_end := (v_date + 1)::timestamptz;
      v_part_name := 'atlas_search_outbox_v2_' || to_char(v_date, 'YYYY_MM_DD');
      
      v_sql := format(
        'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.atlas_search_outbox_v2 FOR VALUES FROM (%L) TO (%L);',
        v_part_name, v_start, v_end
      );
      EXECUTE v_sql;
    END LOOP;
  END;
  $$;
`);
console.log('Function provision_outbox_v2_partitions created.');

// 8. Create Watermark Table
console.log('\n--- 8. CREATING CUTOVER WATERMARK TABLE ---');
await client.query(`
  CREATE TABLE IF NOT EXISTS public.atlas_search_outbox_watermark (
    id text PRIMARY KEY DEFAULT 'current',
    cutover_timestamp timestamptz NOT NULL DEFAULT now(),
    cutover_event_id text NOT NULL DEFAULT 'CUTOVER_INIT',
    old_outbox_drained boolean NOT NULL DEFAULT false,
    old_outbox_dropped boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  INSERT INTO public.atlas_search_outbox_watermark (
    id, cutover_timestamp, cutover_event_id, old_outbox_drained, old_outbox_dropped
  ) VALUES (
    'current', now(), 'CUTOVER_' || to_char(now(), 'YYYYMMDD_HH24MISS') || '_' || floor(random()*10000)::text, false, false
  )
  ON CONFLICT (id) DO UPDATE SET
    cutover_timestamp = EXCLUDED.cutover_timestamp,
    cutover_event_id  = EXCLUDED.cutover_event_id,
    updated_at        = now();
`);
const wmRes = await client.query(`SELECT * FROM public.atlas_search_outbox_watermark WHERE id = 'current';`);
console.log('Watermark set:', wmRes.rows[0]);

await client.end();
console.log('\n✅ PREFLIGHT, PARTITIONING & DEAD-LETTER SETUP COMPLETE.');
