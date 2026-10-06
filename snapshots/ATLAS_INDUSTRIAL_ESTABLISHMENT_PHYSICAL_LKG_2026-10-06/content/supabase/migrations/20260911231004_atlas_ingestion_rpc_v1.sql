-- 20260911231004_atlas_ingestion_rpc_v1.sql

-- Atomic Lease Acquisition with pg_advisory_xact_lock
CREATE OR REPLACE FUNCTION public.acquire_atlas_ingestion_run_v1(
    p_source_id TEXT,
    p_lease_duration_seconds INTEGER DEFAULT 300
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_active_run_id UUID;
    v_lease_expires_at TIMESTAMPTZ;
    v_new_run_id UUID;
BEGIN
    -- 1. Acquire transaction-scoped advisory lock for the source
    PERFORM pg_advisory_xact_lock(hashtext(p_source_id));

    -- 2. Check for active RUNNING lease
    SELECT id, lease_expires_at INTO v_active_run_id, v_lease_expires_at
    FROM public.atlas_ingestion_runs
    WHERE source_id = p_source_id AND status = 'RUNNING';
    
    IF FOUND THEN
        IF v_lease_expires_at > NOW() THEN
            -- 3. Lease is still active, reject
            RAISE EXCEPTION 'ALREADY_RUNNING';
        ELSE
            -- 4. Lease is expired, transition to FAILED_STALE
            UPDATE public.atlas_ingestion_runs
            SET status = 'FAILED_STALE',
                ended_at = NOW(),
                error_code = 'LEASE_EXPIRED',
                error_message = 'Worker crashed or hung. Lease expired.'
            WHERE id = v_active_run_id;
        END IF;
    END IF;
    
    -- 5. Create new RUNNING lease
    INSERT INTO public.atlas_ingestion_runs (
        source_id,
        status,
        started_at,
        heartbeat_at,
        lease_expires_at
    ) VALUES (
        p_source_id,
        'RUNNING',
        NOW(),
        NOW(),
        NOW() + (p_lease_duration_seconds || ' seconds')::INTERVAL
    ) RETURNING id INTO v_new_run_id;
    
    RETURN v_new_run_id;
END;
$$;

-- Heartbeat
CREATE OR REPLACE FUNCTION public.heartbeat_atlas_ingestion_run_v1(
    p_run_id UUID,
    p_lease_duration_seconds INTEGER DEFAULT 300
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    UPDATE public.atlas_ingestion_runs
    SET 
        heartbeat_at = NOW(),
        lease_expires_at = NOW() + (p_lease_duration_seconds || ' seconds')::INTERVAL
    WHERE id = p_run_id AND status = 'RUNNING';
END;
$$;

-- Run Finalization
CREATE OR REPLACE FUNCTION public.finalize_atlas_ingestion_run_v1(
    p_run_id UUID,
    p_status TEXT, -- 'SUCCESS', 'FAILED'
    p_rows_seen INTEGER DEFAULT 0,
    p_rows_inserted INTEGER DEFAULT 0,
    p_rows_skipped INTEGER DEFAULT 0,
    p_rows_changed INTEGER DEFAULT 0,
    p_error_code TEXT DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    UPDATE public.atlas_ingestion_runs
    SET 
        status = p_status,
        ended_at = NOW(),
        lease_expires_at = NULL,
        rows_seen = p_rows_seen,
        rows_inserted = p_rows_inserted,
        rows_skipped = p_rows_skipped,
        rows_changed = p_rows_changed,
        error_code = p_error_code,
        error_message = p_error_message
    WHERE id = p_run_id AND status = 'RUNNING';
END;
$$;

-- REVOKE execute from public/anon/authenticated to ensure backend-only
REVOKE EXECUTE ON FUNCTION public.acquire_atlas_ingestion_run_v1 FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.acquire_atlas_ingestion_run_v1 FROM anon;
REVOKE EXECUTE ON FUNCTION public.acquire_atlas_ingestion_run_v1 FROM authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_atlas_ingestion_run_v1 TO service_role;

REVOKE EXECUTE ON FUNCTION public.heartbeat_atlas_ingestion_run_v1 FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.heartbeat_atlas_ingestion_run_v1 FROM anon;
REVOKE EXECUTE ON FUNCTION public.heartbeat_atlas_ingestion_run_v1 FROM authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_atlas_ingestion_run_v1 TO service_role;

REVOKE EXECUTE ON FUNCTION public.finalize_atlas_ingestion_run_v1 FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalize_atlas_ingestion_run_v1 FROM anon;
REVOKE EXECUTE ON FUNCTION public.finalize_atlas_ingestion_run_v1 FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_atlas_ingestion_run_v1 TO service_role;
