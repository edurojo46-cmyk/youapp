-- MIGRATION: ATLAS HARVESTER V0 - BUDGET & KILLSWITCH FIXES
-- 20260904173000_atlas_harvester_budget_killswitch_fix.sql

-- 1. Native Kill Switch in get_next_atlas_job
CREATE OR REPLACE FUNCTION public.get_next_atlas_job(p_queue_type TEXT, p_worker_id TEXT, p_limit INT DEFAULT 1)
RETURNS SETOF public.atlas_queues
LANGUAGE plpgsql
AS $$
DECLARE
    v_config public.atlas_harvester_config%ROWTYPE;
BEGIN
    SELECT * INTO v_config
    FROM public.atlas_harvester_config WHERE id = 1;

    -- Global kill switch
    IF NOT v_config.harvester_enabled THEN
        RETURN;
    END IF;

    RETURN QUERY
    UPDATE public.atlas_queues
    SET 
        status = 'PROCESSING',
        locked_at = NOW(),
        locked_by = p_worker_id,
        attempt_count = attempt_count + 1
    WHERE job_id IN (
        SELECT job_id
        FROM public.atlas_queues
        WHERE queue_type = p_queue_type
          AND status IN ('PENDING', 'FAILED')
          AND available_at <= NOW()
          AND attempt_count < max_attempts
          -- Server-side Kill Switch filtering based on job payload
          AND (
              queue_type != 'DISCOVERY'
              OR (
                  payload->>'discoveredVia' = 'BACKFILL' 
                  AND v_config.backfill_enabled 
                  AND v_config.youtube_harvester_enabled
              )
              OR (
                  payload->>'discoveredVia' = 'YOUTUBE_WATCHER' 
                  AND v_config.youtube_harvester_enabled
              )
              OR (
                  payload->>'discoveredVia' = 'USER_ONDA' 
                  AND v_config.user_discovery_enabled
              )
              -- NO fallback for unknown origins (fail-closed)
          )
        ORDER BY priority ASC, available_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT p_limit
    )
    RETURNING *;
END;
$$;

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
    IF p_amount <= 0 THEN
        RETURN FALSE;
    END IF;

    -- 1. Fetch Limits and Acquire Lock
    -- Locking the config row serializes budget requests, ensuring strict 
    -- atomicity for the check-both-then-write-both logic.
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

    IF v_max_global = 0 THEN
        RETURN FALSE;
    END IF;

    -- 2. Check current usage
    
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

    -- 3. Write Both (Safe due to FOR UPDATE lock on config)
    
    -- Write GLOBAL
    INSERT INTO public.atlas_harvester_daily_usage (usage_date, metric, source_id, usage_count)
    VALUES (CURRENT_DATE, p_metric, NULL, p_amount)
    ON CONFLICT (usage_date, metric, source_id) DO UPDATE
    SET usage_count = public.atlas_harvester_daily_usage.usage_count + EXCLUDED.usage_count;

    -- Write SOURCE
    IF p_source_id IS NOT NULL THEN
        INSERT INTO public.atlas_harvester_daily_usage (usage_date, metric, source_id, usage_count)
        VALUES (CURRENT_DATE, p_metric, p_source_id, p_amount)
        ON CONFLICT (usage_date, metric, source_id) DO UPDATE
        SET usage_count = public.atlas_harvester_daily_usage.usage_count + EXCLUDED.usage_count;
    END IF;

    RETURN TRUE;
END;
$$;
