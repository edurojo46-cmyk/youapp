-- ============================================================
-- RPC auxiliar: claim_search_outbox_batch
-- SELECT FOR UPDATE SKIP LOCKED para multi-publisher safety
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_search_outbox_batch(
  p_batch_size    integer DEFAULT 50,
  p_worker_id     text    DEFAULT 'unknown',
  p_lease_seconds integer DEFAULT 120
)
RETURNS SETOF public.atlas_search_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now         timestamptz := now();
  v_lease_expiry timestamptz := v_now + (p_lease_seconds || ' seconds')::interval;
  v_claimed_ids uuid[];
BEGIN
  -- Reclamar y retornar en una sola transacción atómica con SKIP LOCKED
  WITH claimed AS (
    SELECT outbox_id
    FROM public.atlas_search_outbox
    WHERE status IN ('PENDING', 'RETRY')
      AND next_retry_at <= v_now
    ORDER BY next_retry_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.atlas_search_outbox o
    SET
      status                = 'PROCESSING',
      processing_started_at = v_now,
      processing_worker_id  = p_worker_id
    FROM claimed
    WHERE o.outbox_id = claimed.outbox_id
    RETURNING o.*
  )
  SELECT * FROM updated;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_search_outbox_batch(integer, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_search_outbox_batch(integer, text, integer) TO service_role;

COMMENT ON FUNCTION public.claim_search_outbox_batch IS
  'Claims a batch of outbox rows atomically using FOR UPDATE SKIP LOCKED. '
  'Multiple publisher workers can call this concurrently with DOUBLE_CLAIM = 0.';

-- ============================================================
-- RPC auxiliar: release_stale_processing_rows
-- Devuelve a RETRY las filas con lease expirado
-- ============================================================
CREATE OR REPLACE FUNCTION public.release_stale_processing_rows(
  p_lease_seconds integer DEFAULT 120
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lease_cutoff timestamptz := now() - (p_lease_seconds || ' seconds')::interval;
  v_count        integer;
BEGIN
  UPDATE public.atlas_search_outbox
  SET
    status        = 'RETRY',
    next_retry_at = now(),
    last_error    = 'LEASE_EXPIRED: processing_started_at < ' || v_lease_cutoff::text
  WHERE status = 'PROCESSING'
    AND processing_started_at < v_lease_cutoff;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.release_stale_processing_rows(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_stale_processing_rows(integer) TO service_role;
