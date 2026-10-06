-- ATLAS V2.0 — OUTBOX V2 RETENTION, PARTITIONING & PURGE SPECIFICATION
-- Authoritative architecture for append-only outbox lifecycle

-- 1. Partitioned Outbox V2 Architecture (Design reference for high-volume deployments)
-- The table can be partitioned by RANGE (created_at) or RANGE (event_id):
/*
CREATE TABLE public.atlas_search_outbox_v2_partitioned (
  event_id BIGSERIAL,
  atlas_person_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_person_id TEXT NOT NULL,
  schema_version INT NOT NULL DEFAULT 1,
  projection_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (created_at, event_id)
) PARTITION BY RANGE (created_at);
*/

-- 2. Authoritative Consumer Checkpoint Watermark Function
CREATE OR REPLACE FUNCTION public.atlas_get_safe_outbox_purge_boundary()
RETURNS TABLE (
  min_checkpoint_event_id BIGINT,
  active_consumers_count INT,
  safe_purge_boundary_event_id BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_min_event_id BIGINT;
  v_active_count INT;
BEGIN
  SELECT 
    COALESCE(MIN(last_committed_event_id), 0),
    COUNT(*)
  INTO v_min_event_id, v_active_count
  FROM public.atlas_search_consumer_checkpoint;

  RETURN QUERY SELECT 
    v_min_event_id,
    v_active_count,
    CASE 
      WHEN v_active_count = 0 THEN 0::BIGINT
      ELSE v_min_event_id 
    END;
END;
$$;

-- 3. Asynchronous Safe Purge Procedure (Executed only during off-peak maintenance, NEVER on hot path)
CREATE OR REPLACE PROCEDURE public.atlas_purge_outbox_v2_safe_watermark(
  p_retention_days INT DEFAULT 7,
  p_batch_limit INT DEFAULT 50000
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_safe_watermark BIGINT;
  v_active_consumers INT;
  v_deleted INT := 0;
BEGIN
  -- Determine safe watermark across all consumers
  SELECT min_checkpoint_event_id, active_consumers_count
  INTO v_safe_watermark, v_active_consumers
  FROM public.atlas_get_safe_outbox_purge_boundary();

  IF v_active_consumers = 0 OR v_safe_watermark = 0 THEN
    RAISE NOTICE 'No active consumer checkpoints found. Purge aborted to prevent data loss.';
    RETURN;
  END IF;

  -- Safe deletion strictly behind the minimum consumer watermark and older than retention horizon
  DELETE FROM public.atlas_search_outbox_v2
  WHERE event_id IN (
    SELECT event_id 
    FROM public.atlas_search_outbox_v2
    WHERE event_id <= v_safe_watermark
      AND created_at < NOW() - (p_retention_days || ' days')::INTERVAL
    ORDER BY event_id ASC
    LIMIT p_batch_limit
  );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Safely purged % events from outbox_v2 behind watermark % (Retention: % days)', 
    v_deleted, v_safe_watermark, p_retention_days;
END;
$$;
