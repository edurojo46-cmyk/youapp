-- MIGRATION: ATLAS HARVESTER V0 - BUDGET & KILLSWITCH FIXES
-- 20260904174000_atlas_harvester_budget_killswitch_fix.sql

-- 1. Native Kill Switch in get_next_atlas_job
CREATE OR REPLACE FUNCTION public.get_next_atlas_job(
    p_queue_type TEXT, 
    p_worker_id TEXT, 
    p_lock_duration_seconds INT DEFAULT 300,
    p_limit INT DEFAULT 1
) RETURNS SETOF public.atlas_queues
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_lock_token UUID;
    v_config public.atlas_harvester_config%ROWTYPE;
BEGIN
    SELECT * INTO v_config
    FROM public.atlas_harvester_config WHERE id = 1;

    -- Global kill switch
    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF COALESCE(v_config.harvester_enabled, FALSE) IS NOT TRUE THEN
        RETURN;
    END IF;

    -- Recover stale locks (jobs stuck in PROCESSING past lock_expires_at)
    UPDATE public.atlas_queues
    SET 
        status = CASE WHEN attempt_count >= max_attempts THEN 'DEAD_LETTER' ELSE 'RETRY' END,
        available_at = NOW(),
        locked_by = NULL,
        locked_at = NULL,
        lock_expires_at = NULL,
        lock_token = NULL
    WHERE status = 'PROCESSING' AND lock_expires_at < NOW() AND queue_type = p_queue_type;

    -- Generate a new unique token for this lease
    v_new_lock_token := gen_random_uuid();

    -- Fetch and lock new jobs
    RETURN QUERY
    UPDATE public.atlas_queues
    SET 
        status = 'PROCESSING',
        locked_at = NOW(),
        lock_expires_at = NOW() + (p_lock_duration_seconds || ' seconds')::interval,
        locked_by = p_worker_id,
        lock_token = v_new_lock_token,
        attempt_count = attempt_count + 1,
        updated_at = NOW()
    WHERE job_id IN (
        SELECT job_id
        FROM public.atlas_queues
        WHERE queue_type = p_queue_type
          AND status IN ('PENDING', 'RETRY')
          AND available_at <= NOW()
          AND (
              queue_type != 'DISCOVERY'
              OR (
                  payload->>'discoveredVia' = 'BACKFILL' 
                  AND COALESCE(v_config.youtube_harvester_enabled, FALSE)
                  AND COALESCE(v_config.backfill_enabled, FALSE)
              )
              OR (
                  payload->>'discoveredVia' = 'YOUTUBE_WATCHER' 
                  AND COALESCE(v_config.youtube_harvester_enabled, FALSE)
              )
              OR (
                  payload->>'discoveredVia' = 'USER_ONDA' 
                  AND COALESCE(v_config.user_discovery_enabled, FALSE)
              )
              -- Fail-closed for unknown origins
          )
          AND (
              queue_type != 'SEMANTIC'
              OR COALESCE(v_config.semantic_auto_process_enabled, FALSE)
          )
        ORDER BY priority ASC, available_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT p_limit
    )
    RETURNING *;
END;
$$;
REVOKE ALL ON FUNCTION public.get_next_atlas_job(TEXT, TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_atlas_job(TEXT, TEXT, INT, INT) TO service_role;


-- 2. Dual Budget Enforcement in reserve_atlas_budget
CREATE OR REPLACE FUNCTION public.reserve_atlas_budget(
    p_metric TEXT,
    p_source_id UUID,
    p_amount INT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_max_per_source INT;
    v_max_global INT;
    v_current_global INT := 0;
    v_current_source INT := 0;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN FALSE;
    END IF;

    IF p_metric NOT IN (
        'GLOBAL_CANDIDATES',
        'SOURCE_DISCOVERY',
        'BACKFILL'
    ) THEN
        RETURN FALSE;
    END IF;

    -- Fetch Limits and Acquire Lock
    SELECT 
        max_per_source_daily,
        CASE 
            WHEN p_metric = 'GLOBAL_CANDIDATES' THEN max_daily_candidates
            WHEN p_metric = 'SOURCE_DISCOVERY' THEN max_per_source_daily
            WHEN p_metric = 'BACKFILL' THEN max_backfill_daily
            ELSE 0
        END 
    INTO v_max_per_source, v_max_global
    FROM public.atlas_harvester_config 
    WHERE id = 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF v_max_global IS NULL OR v_max_global <= 0 THEN
        RETURN FALSE;
    END IF;

    IF p_source_id IS NOT NULL AND (v_max_per_source IS NULL OR v_max_per_source <= 0) THEN
        RETURN FALSE;
    END IF;

    -- Read GLOBAL
    SELECT usage_count INTO v_current_global
    FROM public.atlas_harvester_daily_usage
    WHERE usage_date = CURRENT_DATE 
      AND metric = p_metric 
      AND source_id IS NULL;

    IF v_current_global IS NULL THEN v_current_global := 0; END IF;

    -- Check GLOBAL
    IF v_current_global + p_amount > v_max_global THEN
        RETURN FALSE;
    END IF;

    -- Read SOURCE
    IF p_source_id IS NOT NULL THEN
        SELECT usage_count INTO v_current_source
        FROM public.atlas_harvester_daily_usage
        WHERE usage_date = CURRENT_DATE 
          AND metric = p_metric 
          AND source_id = p_source_id;

        IF v_current_source IS NULL THEN v_current_source := 0; END IF;

        -- Check SOURCE
        IF v_current_source + p_amount > v_max_per_source THEN
            RETURN FALSE;
        END IF;
    END IF;

    -- Write Both
    INSERT INTO public.atlas_harvester_daily_usage (usage_date, metric, source_id, usage_count)
    VALUES (CURRENT_DATE, p_metric, NULL, p_amount)
    ON CONFLICT (usage_date, metric, source_id) DO UPDATE
    SET usage_count = public.atlas_harvester_daily_usage.usage_count + EXCLUDED.usage_count;

    IF p_source_id IS NOT NULL THEN
        INSERT INTO public.atlas_harvester_daily_usage (usage_date, metric, source_id, usage_count)
        VALUES (CURRENT_DATE, p_metric, p_source_id, p_amount)
        ON CONFLICT (usage_date, metric, source_id) DO UPDATE
        SET usage_count = public.atlas_harvester_daily_usage.usage_count + EXCLUDED.usage_count;
    END IF;

    RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_atlas_budget(TEXT, UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_atlas_budget(TEXT, UUID, INT) TO service_role;
