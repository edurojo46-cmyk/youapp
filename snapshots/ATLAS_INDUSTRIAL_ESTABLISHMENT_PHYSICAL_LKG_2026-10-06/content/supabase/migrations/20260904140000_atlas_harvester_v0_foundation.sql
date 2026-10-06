-- MIGRATION: ATLAS HARVESTER V0 FOUNDATION
-- 20260904140000_atlas_harvester_v0_foundation.sql

-- ==========================================
-- 1. Configuration
-- ==========================================
CREATE TABLE IF NOT EXISTS public.atlas_harvester_config (
    id INT PRIMARY KEY CHECK (id = 1),
    
    max_daily_candidates INT NOT NULL DEFAULT 1000 CHECK (max_daily_candidates >= 0),
    max_per_source_daily INT NOT NULL DEFAULT 50 CHECK (max_per_source_daily >= 0),
    max_backfill_daily INT NOT NULL DEFAULT 200 CHECK (max_backfill_daily >= 0),
    max_queue_depth INT NOT NULL DEFAULT 5000 CHECK (max_queue_depth > 0),
    max_retries INT NOT NULL DEFAULT 3 CHECK (max_retries >= 0),
    
    harvester_enabled BOOLEAN NOT NULL DEFAULT false,
    youtube_harvester_enabled BOOLEAN NOT NULL DEFAULT false,
    user_discovery_enabled BOOLEAN NOT NULL DEFAULT false,
    backfill_enabled BOOLEAN NOT NULL DEFAULT false,
    semantic_auto_process_enabled BOOLEAN NOT NULL DEFAULT false,
    
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.atlas_harvester_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;


-- ==========================================
-- 2. Source Registry
-- ==========================================
CREATE TABLE IF NOT EXISTS public.atlas_sources (
    source_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('YOUTUBE_CHANNEL', 'PUBLISHER', 'RSS', 'SITEMAP', 'API_ENDPOINT')),
    provider_source_id TEXT NOT NULL,
    canonical_url TEXT,
    
    status TEXT NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED', 'ACTIVE', 'PAUSED', 'FAILED', 'BLOCKED')),
    priority INT NOT NULL DEFAULT 5 CHECK (priority >= 0),
    discovery_method TEXT NOT NULL,
    
    last_checked_at TIMESTAMPTZ,
    next_check_at TIMESTAMPTZ,
    check_interval_seconds INT NOT NULL DEFAULT 86400 CHECK (check_interval_seconds > 0),
    
    failure_count INT NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
    last_error TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_sources_provider_id ON public.atlas_sources(provider, source_type, provider_source_id);


-- ==========================================
-- 3. Budget & Transactional Control
-- ==========================================
CREATE TABLE IF NOT EXISTS public.atlas_harvester_daily_usage (
    usage_date DATE NOT NULL,
    metric TEXT NOT NULL CHECK (metric IN ('GLOBAL_CANDIDATES', 'SOURCE_DISCOVERY', 'BACKFILL')),
    source_id UUID REFERENCES public.atlas_sources(source_id) ON DELETE CASCADE,
    usage_count INT NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
    UNIQUE NULLS NOT DISTINCT (usage_date, metric, source_id)
);


-- ==========================================
-- 4. Identities (Canonical -> Provider -> Snapshots)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.atlas_canonical_assets (
    canonical_asset_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_status TEXT NOT NULL DEFAULT 'UNRESOLVED' CHECK (canonical_status IN ('UNRESOLVED', 'RESOLVED', 'AMBIGUOUS')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.atlas_provider_assets (
    provider_asset_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_asset_id UUID REFERENCES public.atlas_canonical_assets(canonical_asset_id),
    legacy_index_asset_id UUID REFERENCES public.youapp_index(id) ON DELETE SET NULL,
    
    provider TEXT NOT NULL,
    provider_content_id TEXT NOT NULL,
    canonical_url TEXT,
    
    current_title TEXT,
    current_description TEXT,
    provider_channel_id TEXT,
    published_at TIMESTAMPTZ,
    
    semantic_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (semantic_status IN ('PENDING', 'PROCESSING', 'ACTIVE', 'UNKNOWN', 'REVIEW', 'FAILED', 'STALE')),
    rights_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (rights_status IN ('PENDING', 'PASS', 'FAIL', 'REVOKED')),
    metadata_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (metadata_status IN ('PENDING', 'STALE', 'FRESH')),
    
    metadata_expires_at TIMESTAMPTZ,
    last_provider_refresh_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_provider_content UNIQUE (provider, provider_content_id)
);

CREATE TABLE IF NOT EXISTS public.atlas_raw_metadata_snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_asset_id UUID NOT NULL REFERENCES public.atlas_provider_assets(provider_asset_id) ON DELETE CASCADE,
    
    raw_title TEXT NOT NULL,
    raw_description TEXT,
    raw_payload_hash TEXT NOT NULL,
    metadata_version TEXT NOT NULL,
    
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE (provider_asset_id, raw_payload_hash)
);


-- ==========================================
-- 5. Pre-Asset Discovery Events (Provenance Funnel)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.atlas_discovery_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    provider TEXT NOT NULL,
    provider_content_id TEXT NOT NULL,
    discovery_url TEXT,
    
    source_id UUID REFERENCES public.atlas_sources(source_id) ON DELETE SET NULL,
    discovered_via TEXT NOT NULL CHECK (discovered_via IN ('USER_ONDA', 'YOUTUBE_WATCHER', 'PUBLISHER', 'BACKFILL', 'COVERAGE_GAP')),
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    worker_id TEXT,
    pipeline_version TEXT,
    event_status TEXT NOT NULL DEFAULT 'DISCOVERED' CHECK (event_status IN ('DISCOVERED', 'RIGHTS_REJECTED', 'INVALID', 'DUPLICATE', 'INGESTED', 'FAILED')),
    error_code TEXT,
    error_detail TEXT,
    
    rights_profile_id TEXT,
    rights_policy_version TEXT,
    rights_checked_at TIMESTAMPTZ,
    rights_decision TEXT CHECK (rights_decision IN ('PASS', 'FAIL')),
    
    can_discover BOOLEAN,
    can_index BOOLEAN,
    can_store_metadata BOOLEAN,
    metadata_ttl_seconds INT,
    can_semantic_analyze BOOLEAN,
    can_embed BOOLEAN,
    can_thumbnail BOOLEAN,
    can_cache BOOLEAN,
    can_rehost BOOLEAN NOT NULL DEFAULT false,
    
    provider_asset_id UUID REFERENCES public.atlas_provider_assets(provider_asset_id) ON DELETE SET NULL
);


-- ==========================================
-- 6. Queues (Idempotent, Concurrent, Dead-Letter)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.atlas_queues (
    job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    queue_type TEXT NOT NULL CHECK (queue_type IN ('DISCOVERY', 'INGEST', 'SEMANTIC', 'REPROCESS')),
    idempotency_key TEXT NOT NULL,
    
    priority INT NOT NULL DEFAULT 5 CHECK (priority >= 0),
    payload JSONB NOT NULL,
    
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'RETRY', 'COMPLETED', 'DEAD_LETTER')),
    
    attempt_count INT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    max_attempts INT NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
    
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_at TIMESTAMPTZ,
    lock_expires_at TIMESTAMPTZ,
    locked_by TEXT,
    lock_token UUID,
    last_error TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    
    UNIQUE(queue_type, idempotency_key)
);

CREATE INDEX idx_atlas_queue_ready ON public.atlas_queues (queue_type, priority, available_at, created_at)
WHERE status IN ('PENDING', 'RETRY');

-- Para consultas de status (dashboard/telemetry)
CREATE INDEX idx_atlas_queue_status ON public.atlas_queues (status, queue_type);

-- Y el unique para los workers (solo puede haber un job "activo" por token)
CREATE UNIQUE INDEX idx_atlas_queue_lock ON public.atlas_queues (lock_token)
WHERE lock_token IS NOT NULL;

-- 2. Telemetry and Logging
-- Mantenemos atlas_task_logs y atlas_budget_telemetry

CREATE TABLE IF NOT EXISTS public.atlas_task_logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES public.atlas_queues(job_id) ON DELETE CASCADE,
    worker_id TEXT NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('INFO', 'WARN', 'ERROR', 'METRIC')),
    message TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_atlas_task_logs_job ON public.atlas_task_logs (job_id);
CREATE INDEX idx_atlas_task_logs_level ON public.atlas_task_logs (level);

CREATE TABLE IF NOT EXISTS public.atlas_budget_telemetry (
    telemetry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES public.atlas_queues(job_id) ON DELETE SET NULL,
    budget_type TEXT NOT NULL CHECK (budget_type IN ('COST', 'API_CALLS', 'TOKENS_IN', 'TOKENS_OUT')),
    amount NUMERIC NOT NULL,
    provider TEXT, -- e.g., 'openai', 'gemini', 'youtube', 'scraper'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_atlas_budget_telemetry_type ON public.atlas_budget_telemetry (budget_type, created_at);

-- 3. Killswitch System
-- Refined table to include module targeting
CREATE TABLE IF NOT EXISTS public.atlas_killswitches (
    switch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module TEXT NOT NULL UNIQUE, -- e.g., 'GLOBAL', 'YOUTUBE_HARVESTER', 'WEB_SCRAPER', 'LLM_ROUTER'
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    reason TEXT,
    activated_by TEXT,
    activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 7. Functions (Budget Enforcement & Job Management)
-- ==========================================

-- 7A. Atomic Budget Reservation (Internal Config Lookup)
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
    v_current_usage INT;
    v_max_limit INT;
BEGIN
    IF p_amount <= 0 THEN
        RETURN FALSE;
    END IF;

    -- Fetch the correct limit securely
    SELECT 
        CASE 
            WHEN p_metric = 'GLOBAL_CANDIDATES' THEN max_daily_candidates
            WHEN p_metric = 'SOURCE_DISCOVERY' THEN max_per_source_daily
            WHEN p_metric = 'BACKFILL' THEN max_backfill_daily
            ELSE 0
        END 
    INTO v_max_limit
    FROM public.atlas_harvester_config WHERE id = 1;

    IF v_max_limit = 0 THEN
        RETURN FALSE;
    END IF;

    -- Insert or Update atomic usage count using IS NOT DISTINCT FROM for NULL support
    INSERT INTO public.atlas_harvester_daily_usage (usage_date, metric, source_id, usage_count)
    VALUES (CURRENT_DATE, p_metric, p_source_id, p_amount)
    ON CONFLICT (usage_date, metric, source_id) DO UPDATE
    SET usage_count = public.atlas_harvester_daily_usage.usage_count + p_amount
    WHERE public.atlas_harvester_daily_usage.source_id IS NOT DISTINCT FROM EXCLUDED.source_id
    RETURNING usage_count INTO v_current_usage;

    -- Rollback if limit exceeded
    IF v_current_usage > v_max_limit THEN
        UPDATE public.atlas_harvester_daily_usage
        SET usage_count = usage_count - p_amount
        WHERE usage_date = CURRENT_DATE 
          AND metric = p_metric 
          AND source_id IS NOT DISTINCT FROM p_source_id;
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_atlas_budget(TEXT, UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_atlas_budget(TEXT, UUID, INT) TO service_role;


-- 7B. Enqueue Job Gate (Enforces Depth, Budgets, Idempotency and Features)
CREATE OR REPLACE FUNCTION public.enqueue_atlas_job(
    p_queue_type TEXT,
    p_idempotency_key TEXT,
    p_payload JSONB,
    p_source_id UUID DEFAULT NULL,
    p_metric TEXT DEFAULT NULL,
    p_priority INT DEFAULT 5
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_config public.atlas_harvester_config%ROWTYPE;
    v_queue_depth INT;
    v_lock_id BIGINT;
BEGIN
    -- Transaction-level advisory lock based on idempotency key to prevent concurrent duplicates from bypassing checks
    v_lock_id := hashtext(p_queue_type || ':' || p_idempotency_key);
    PERFORM pg_advisory_xact_lock(v_lock_id);

    -- Check idempotency: If job already exists, return true without consuming budget
    IF EXISTS (SELECT 1 FROM public.atlas_queues WHERE queue_type = p_queue_type AND idempotency_key = p_idempotency_key) THEN
        RETURN TRUE;
    END IF;

    -- Check global feature flag
    SELECT * INTO v_config FROM public.atlas_harvester_config WHERE id = 1;
    IF NOT v_config.harvester_enabled THEN
        RETURN FALSE;
    END IF;

    -- Specific feature flags mapped to payloads/queues
    IF p_queue_type = 'DISCOVERY' AND (p_payload->>'discovered_via') = 'YOUTUBE_WATCHER' AND NOT v_config.youtube_harvester_enabled THEN
        RETURN FALSE;
    END IF;
    IF p_queue_type = 'DISCOVERY' AND (p_payload->>'discovered_via') = 'USER_ONDA' AND NOT v_config.user_discovery_enabled THEN
        RETURN FALSE;
    END IF;
    IF p_queue_type = 'DISCOVERY' AND (p_payload->>'discovered_via') = 'BACKFILL' AND NOT v_config.backfill_enabled THEN
        RETURN FALSE;
    END IF;
    IF p_queue_type IN ('SEMANTIC', 'REPROCESS') AND NOT v_config.semantic_auto_process_enabled THEN
        RETURN FALSE;
    END IF;

    -- Enforce max_queue_depth globally
    SELECT COUNT(*) INTO v_queue_depth FROM public.atlas_queues WHERE status IN ('PENDING', 'RETRY');
    IF v_queue_depth >= v_config.max_queue_depth THEN
        RETURN FALSE;
    END IF;

    -- Enforce budget if metric is provided
    IF p_metric IS NOT NULL THEN
        IF NOT public.reserve_atlas_budget(p_metric, p_source_id, 1) THEN
            RETURN FALSE;
        END IF;
    END IF;

    -- Insert job safely
    INSERT INTO public.atlas_queues (queue_type, idempotency_key, payload, priority)
    VALUES (p_queue_type, p_idempotency_key, p_payload, p_priority);
    
    RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_atlas_job(TEXT, TEXT, JSONB, UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_atlas_job(TEXT, TEXT, JSONB, UUID, TEXT, INT) TO service_role;


-- 7C. Transactional Queue Fetcher (FOR UPDATE SKIP LOCKED)
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
BEGIN
    -- Recover stale locks (jobs stuck in PROCESSING past lock_expires_at)
    UPDATE public.atlas_queues
    SET 
        status = CASE WHEN attempt_count >= max_attempts THEN 'DEAD_LETTER' ELSE 'RETRY' END,
        available_at = NOW(),
        locked_by = NULL,
        locked_at = NULL,
        lock_expires_at = NULL,
        lock_token = NULL
    WHERE status = 'PROCESSING' AND lock_expires_at < NOW();

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
        ORDER BY priority ASC, available_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT p_limit
    )
    RETURNING *;
END;
$$;
REVOKE ALL ON FUNCTION public.get_next_atlas_job(TEXT, TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_atlas_job(TEXT, TEXT, INT, INT) TO service_role;


-- 7D. Secure Job Completion/Failure Enforcing Lock Token Ownership
CREATE OR REPLACE FUNCTION public.complete_atlas_job(
    p_job_id UUID,
    p_lock_token UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.atlas_queues
    SET status = 'COMPLETED',
        completed_at = NOW(),
        updated_at = NOW(),
        locked_by = NULL,
        locked_at = NULL,
        lock_expires_at = NULL,
        lock_token = NULL
    WHERE job_id = p_job_id 
      AND status = 'PROCESSING' 
      AND lock_token = p_lock_token;
      
    RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_atlas_job(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_atlas_job(UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.fail_atlas_job(
    p_job_id UUID,
    p_lock_token UUID,
    p_error TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.atlas_queues
    SET status = CASE WHEN attempt_count >= max_attempts THEN 'DEAD_LETTER' ELSE 'RETRY' END,
        last_error = p_error,
        updated_at = NOW(),
        locked_by = NULL,
        locked_at = NULL,
        lock_expires_at = NULL,
        lock_token = NULL
    WHERE job_id = p_job_id 
      AND status = 'PROCESSING' 
      AND lock_token = p_lock_token;
      
    RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.fail_atlas_job(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_atlas_job(UUID, UUID, TEXT) TO service_role;


-- ==========================================
-- 8. RLS Enforcement (Server Only Access)
-- ==========================================
ALTER TABLE public.atlas_harvester_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_harvester_daily_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_discovery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_canonical_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_provider_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_raw_metadata_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_queues ENABLE ROW LEVEL SECURITY;
-- No policies granted to anon/authenticated. Strict server-only access.


-- ==========================================
-- 9. Semantic Annotations Updates
-- ==========================================
-- A) Identity Bridge: Link Semantic annotations directly to new Provider Assets
ALTER TABLE public.asset_semantic_annotations 
ADD COLUMN IF NOT EXISTS provider_asset_id UUID REFERENCES public.atlas_provider_assets(provider_asset_id) ON DELETE CASCADE;

-- Allow asset_id to be NULL if it originated from Harvester and hasn't merged into youapp_index
ALTER TABLE public.asset_semantic_annotations ALTER COLUMN asset_id DROP NOT NULL;

-- Enforce that at least one identity bridge exists
ALTER TABLE public.asset_semantic_annotations 
ADD CONSTRAINT chk_semantic_asset_ref 
CHECK (asset_id IS NOT NULL OR provider_asset_id IS NOT NULL);

-- B) Status Constraint Update
ALTER TABLE public.asset_semantic_annotations DROP CONSTRAINT IF EXISTS asset_semantic_annotations_annotation_status_check;
ALTER TABLE public.asset_semantic_annotations ADD CONSTRAINT asset_semantic_annotations_annotation_status_check 
CHECK (annotation_status IN ('PROPOSED', 'ACTIVE', 'REVIEW', 'UNKNOWN', 'VERIFIED', 'REJECTED', 'PENDING'));

-- C) Unique Active Constraints (Separated)
DROP INDEX IF EXISTS idx_asset_semantic_annotations_asset_id_active;
DROP INDEX IF EXISTS idx_asset_semantic_annotations_one_active;
DROP INDEX IF EXISTS idx_asset_semantic_annotations_asset_id_active_v2;

CREATE UNIQUE INDEX idx_semantic_one_active_asset
ON public.asset_semantic_annotations(asset_id)
WHERE asset_id IS NOT NULL
  AND annotation_status IN ('VERIFIED','ACTIVE');

CREATE UNIQUE INDEX idx_semantic_one_active_provider
ON public.asset_semantic_annotations(provider_asset_id)
WHERE provider_asset_id IS NOT NULL
  AND annotation_status IN ('VERIFIED','ACTIVE');
