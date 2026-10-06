-- ═══════════════════════════════════════════════════════════════════════════
-- APLICAR EN SUPABASE DASHBOARD > SQL EDITOR
-- RPC Set-Based para el Search Publisher ACK
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.mark_search_outbox_batch_status(
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_total_processed integer := 0;
  v_total_updated   integer := 0;
  v_total_skipped   integer := 0;
BEGIN
  -- p_rows expects: [{ outbox_id, payload_version, status, error, attempt_count }, ...]
  
  WITH incoming AS (
    SELECT 
      (x.obj->>'outbox_id')::uuid AS outbox_id,
      (x.obj->>'payload_version')::integer AS claimed_version,
      (x.obj->>'status') AS new_status,
      (x.obj->>'error') AS last_error,
      COALESCE((x.obj->>'attempt_count')::integer, 0) AS attempt_count
    FROM jsonb_array_elements(p_rows) AS x(obj)
  ),
  updated AS (
    UPDATE public.atlas_search_outbox o
    SET 
      status = i.new_status,
      published_at = CASE WHEN i.new_status = 'PUBLISHED' THEN now() ELSE o.published_at END,
      quarantined_at = CASE WHEN i.new_status = 'QUARANTINED' THEN now() ELSE o.quarantined_at END,
      processing_worker_id = NULL,
      processing_started_at = NULL,
      last_error = i.last_error,
      attempt_count = CASE WHEN i.new_status IN ('RETRY', 'QUARANTINED') THEN i.attempt_count + 1 ELSE i.attempt_count END,
      next_retry_at = CASE 
                        WHEN i.new_status = 'RETRY' 
                        THEN now() + interval '1 second' * LEAST(POWER(2, i.attempt_count + 1) * 2, 1800)
                        WHEN i.new_status = 'QUARANTINED'
                        THEN now() + interval '86400 seconds'
                        ELSE o.next_retry_at 
                      END
    FROM incoming i
    WHERE o.outbox_id = i.outbox_id
      AND o.payload_version = i.claimed_version
      AND o.status = 'PROCESSING' -- Safety check: we should only ACK what we claimed
    RETURNING o.outbox_id
  )
  SELECT 
    (SELECT count(*) FROM incoming),
    (SELECT count(*) FROM updated)
  INTO v_total_processed, v_total_updated;

  v_total_skipped := v_total_processed - v_total_updated;

  RETURN jsonb_build_object(
    'ok', true,
    'total_processed', v_total_processed,
    'total_updated', v_total_updated,
    'total_skipped_version_mismatch', v_total_skipped
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$$;

-- SEGURIDAD
REVOKE ALL ON FUNCTION public.mark_search_outbox_batch_status(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_search_outbox_batch_status(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.mark_search_outbox_batch_status(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_search_outbox_batch_status(jsonb) TO service_role;
