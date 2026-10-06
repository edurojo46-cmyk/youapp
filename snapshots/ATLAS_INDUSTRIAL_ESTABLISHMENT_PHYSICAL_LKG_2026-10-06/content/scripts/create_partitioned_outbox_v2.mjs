import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('=== CREATING PARTITIONED OUTBOX V2 AND PARTITIONS ===');

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

  -- Daily partitions
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

  -- Function to provision daily partitions automatically
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

  -- Cutover Watermark Table
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

console.log('✅ Partitioned atlas_search_outbox_v2, partitions, indexes, and watermark created successfully.');

const checkParts = await client.query(`
  SELECT inhrelid::regclass AS partition_name 
  FROM pg_inherits 
  WHERE inhparent = 'public.atlas_search_outbox_v2'::regclass;
`);
console.log('Active V2 Partitions:');
console.table(checkParts.rows);

await client.end();
