-- Migration: 20260909079000_atlas_demand_radar_v1.sql
-- Description: Atlas Demand Radar V1 — Market Demand Intelligence, Multidimensional Vectors & Commercial Bridge
-- Subsystem: Demand Radar V1
-- Contracts:
--   1. Source Access State: 3 orthogonal states (contract_status, access_status, live_status). Only LIVE_VERIFIED feeds ACTIONABLE.
--   2. Persisted Metric Semantics: Source-native units (SEARCH_INTEREST_INDEX, PUBLIC_POST_COUNT, CONTENT_PUBLICATION_SIGNAL, ARTICLE_COUNT).
--   3. Mathematical Policy Versioning: Immutable scoring policies (weights sum to 1.000) with input snapshot hashing.
--   4. DB-Level Zero PII: Database trigger regex & RPC rejection of emails, IPs, phone patterns; direct inserts revoked.
--   5. Append-Only Time Series: Signals and snapshots are strictly append-only (triggers prevent updates/deletes).
--   6. Lead/Lag Metadata Profiles: Category & regional lead/lag tracking for 10H empirical learning.
--   7. Read-Only Atlas Commerce V1 Bridge: References 078000 tables without schema modification.
--   8. Security Definer Hardening: Explicit search_path = public, extensions, pg_temp on all functions.
-- Safety: Strict forward-only migration. Preserves 040000..078000 without modification.

-- ============================================================================
-- 1. SOURCE CAPABILITIES & ACCESS CONTROL
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_demand_source_capabilities (
    capability_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_platform TEXT NOT NULL UNIQUE, -- 'GOOGLE_TRENDS_FAST', 'GOOGLE_TRENDS_SLOW', 'X_TWITTER', 'YOUTUBE', 'NEWS_WEB', 'MASTODON', 'BLUESKY', 'TIKTOK_PUBLIC'
    
    -- 3 Orthogonal Access States
    contract_status TEXT NOT NULL CHECK (contract_status IN ('SUPPORTED', 'LIMITED_ALPHA', 'BLOCKED_FOR_COMMERCIAL_USE', 'UNREGISTERED')),
    access_status TEXT NOT NULL CHECK (access_status IN ('ACTIVE_CONFIGURED', 'NOT_CONFIGURED', 'NO_ACCESS', 'RESTRICTED')),
    live_status TEXT NOT NULL CHECK (live_status IN ('LIVE_VERIFIED', 'UNVERIFIED', 'ERROR_DEGRADED', 'DISABLED')),
    
    commercial_use_authorized BOOLEAN NOT NULL DEFAULT false,
    metric_kind TEXT NOT NULL CHECK (metric_kind IN ('SEARCH_INTEREST_INDEX', 'PUBLIC_POST_COUNT', 'CONTENT_PUBLICATION_SIGNAL', 'ARTICLE_COUNT', 'ENGAGEMENT_VOLUME')),
    metric_unit TEXT NOT NULL CHECK (metric_unit IN ('INDEX_0_100', 'POST_COUNT', 'VIDEO_COUNT', 'ARTICLE_COUNT', 'ENGAGEMENT_SCORE')),
    default_window_seconds INTEGER NOT NULL DEFAULT 600, -- e.g. 600s (10 min)
    max_freshness_seconds INTEGER NOT NULL DEFAULT 3600,
    documentation_ref TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Baseline Source Capabilities
INSERT INTO public.atlas_demand_source_capabilities (
    source_platform, contract_status, access_status, live_status,
    commercial_use_authorized, metric_kind, metric_unit, default_window_seconds, max_freshness_seconds, documentation_ref
) VALUES
    ('GOOGLE_TRENDS_FAST', 'SUPPORTED', 'ACTIVE_CONFIGURED', 'LIVE_VERIFIED', true, 'SEARCH_INTEREST_INDEX', 'INDEX_0_100', 600, 1800, 'https://support.google.com/trends/answer/3076011'),
    ('GOOGLE_TRENDS_SLOW', 'LIMITED_ALPHA', 'NOT_CONFIGURED', 'UNVERIFIED', false, 'SEARCH_INTEREST_INDEX', 'INDEX_0_100', 604800, 172800, 'https://developers.google.com/search/blog/2025/07/trends-api'),
    ('X_TWITTER', 'SUPPORTED', 'ACTIVE_CONFIGURED', 'LIVE_VERIFIED', true, 'PUBLIC_POST_COUNT', 'POST_COUNT', 600, 3600, 'https://docs.x.com/x-api/posts/search-recent-posts'),
    ('YOUTUBE', 'SUPPORTED', 'ACTIVE_CONFIGURED', 'LIVE_VERIFIED', true, 'CONTENT_PUBLICATION_SIGNAL', 'VIDEO_COUNT', 86400, 7200, 'https://developers.google.com/youtube/v3/docs/search/list'),
    ('NEWS_WEB', 'SUPPORTED', 'ACTIVE_CONFIGURED', 'LIVE_VERIFIED', true, 'ARTICLE_COUNT', 'ARTICLE_COUNT', 86400, 14400, 'Atlas News Harvester Registry'),
    ('MASTODON', 'SUPPORTED', 'ACTIVE_CONFIGURED', 'LIVE_VERIFIED', true, 'PUBLIC_POST_COUNT', 'POST_COUNT', 600, 3600, 'Mastodon Fediverse Public API'),
    ('BLUESKY', 'SUPPORTED', 'ACTIVE_CONFIGURED', 'LIVE_VERIFIED', true, 'PUBLIC_POST_COUNT', 'POST_COUNT', 600, 3600, 'Bluesky Jetstream Public Firehose'),
    ('TIKTOK_PUBLIC', 'BLOCKED_FOR_COMMERCIAL_USE', 'NO_ACCESS', 'DISABLED', false, 'PUBLIC_POST_COUNT', 'POST_COUNT', 86400, 3600, 'https://developers.tiktok.com/products/research-api')
ON CONFLICT (source_platform) DO UPDATE SET
    contract_status = EXCLUDED.contract_status,
    access_status = EXCLUDED.access_status,
    live_status = EXCLUDED.live_status,
    commercial_use_authorized = EXCLUDED.commercial_use_authorized,
    updated_at = NOW();

-- ============================================================================
-- 2. VERSIONED SCORING POLICIES (IMMUTABLE & SINGLE ACTIVE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_demand_scoring_policies (
    scoring_policy_version TEXT PRIMARY KEY,
    
    -- Weights must sum strictly to 1.000
    search_weight NUMERIC(4,3) NOT NULL DEFAULT 0.250,
    social_weight NUMERIC(4,3) NOT NULL DEFAULT 0.150,
    acceleration_weight NUMERIC(4,3) NOT NULL DEFAULT 0.200,
    intent_weight NUMERIC(4,3) NOT NULL DEFAULT 0.200,
    persistence_weight NUMERIC(4,3) NOT NULL DEFAULT 0.100,
    confidence_weight NUMERIC(4,3) NOT NULL DEFAULT 0.100,
    
    is_active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT chk_weights_sum_to_one CHECK (
        (search_weight + social_weight + acceleration_weight + intent_weight + persistence_weight + confidence_weight) = 1.000
    )
);

-- Partial Unique Index for Single Active Policy
CREATE UNIQUE INDEX IF NOT EXISTS uq_single_active_demand_scoring_policy 
ON public.atlas_demand_scoring_policies(is_active) 
WHERE is_active = TRUE;

-- Policy Immutability Trigger
CREATE OR REPLACE FUNCTION public.trg_enforce_demand_scoring_policy_immutability()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
    IF (OLD.search_weight IS DISTINCT FROM NEW.search_weight) OR
       (OLD.social_weight IS DISTINCT FROM NEW.social_weight) OR
       (OLD.acceleration_weight IS DISTINCT FROM NEW.acceleration_weight) OR
       (OLD.intent_weight IS DISTINCT FROM NEW.intent_weight) OR
       (OLD.persistence_weight IS DISTINCT FROM NEW.persistence_weight) OR
       (OLD.confidence_weight IS DISTINCT FROM NEW.confidence_weight) THEN
        RAISE EXCEPTION 'POLICY_IMMUTABLE: Demand scoring parameters cannot be modified. Create a new policy version.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_demand_scoring_policy_immutability ON public.atlas_demand_scoring_policies;
CREATE TRIGGER trg_demand_scoring_policy_immutability
BEFORE UPDATE ON public.atlas_demand_scoring_policies
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_demand_scoring_policy_immutability();

-- Seed Default Active Scoring Policy
INSERT INTO public.atlas_demand_scoring_policies (
    scoring_policy_version, search_weight, social_weight, acceleration_weight,
    intent_weight, persistence_weight, confidence_weight, is_active
) VALUES (
    'dsp-v1.0.0-deterministic', 0.250, 0.150, 0.200, 0.200, 0.100, 0.100, TRUE
) ON CONFLICT (scoring_policy_version) DO NOTHING;

-- ============================================================================
-- 3. DEMAND SIGNALS (APPEND-ONLY, METRIC SEMANTICS & ZERO PII)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_demand_signals (
    signal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_platform TEXT NOT NULL REFERENCES public.atlas_demand_source_capabilities(source_platform),
    
    metric_kind TEXT NOT NULL,
    metric_value NUMERIC(14,4) NOT NULL,
    metric_unit TEXT NOT NULL,
    window_seconds INTEGER NOT NULL DEFAULT 600,
    is_sampled BOOLEAN NOT NULL DEFAULT false,
    freshness_seconds INTEGER NOT NULL DEFAULT 0,
    
    raw_query_topic TEXT NOT NULL,
    normalized_query TEXT NOT NULL,
    region_code TEXT NOT NULL DEFAULT 'GLOBAL',
    
    source_confidence NUMERIC(4,3) NOT NULL CHECK (source_confidence >= 0 AND source_confidence <= 1.0),
    provider_observed_at TIMESTAMPTZ NOT NULL,
    signal_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demand_signals_topic ON public.atlas_demand_signals(normalized_query, region_code, provider_observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_demand_signals_source ON public.atlas_demand_signals(source_platform, provider_observed_at DESC);

-- DB-Level Zero PII Trigger Function
CREATE OR REPLACE FUNCTION public.trg_enforce_zero_pii_on_demand_signal()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
    -- 1. Check for email patterns (case-insensitive)
    IF NEW.raw_query_topic ~* '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' THEN
        RAISE EXCEPTION 'ZERO_PII_VIOLATION: Email pattern detected in query topic (Signal rejected).';
    END IF;

    -- 2. Check for IPv4 addresses
    IF NEW.raw_query_topic ~ '\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b' THEN
        RAISE EXCEPTION 'ZERO_PII_VIOLATION: IP address pattern detected in query topic (Signal rejected).';
    END IF;

    -- 3. Check for phone numbers (>= 7 digits with separators)
    IF length(regexp_replace(NEW.raw_query_topic, '[^0-9]', '', 'g')) >= 7 AND
       NEW.raw_query_topic ~ '(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{1,4}\)?[\s-]?){2,5}\d{2,4}' THEN
        RAISE EXCEPTION 'ZERO_PII_VIOLATION: Phone number pattern detected in query topic (Signal rejected).';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_demand_signal_zero_pii ON public.atlas_demand_signals;
CREATE TRIGGER trg_demand_signal_zero_pii
BEFORE INSERT ON public.atlas_demand_signals
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_zero_pii_on_demand_signal();

-- Append-Only Trigger on Signals (Prohibits UPDATE & DELETE)
CREATE OR REPLACE FUNCTION public.trg_enforce_append_only_demand_signals()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'APPEND_ONLY_VIOLATION: Historical demand signals are immutable. Update and Delete are prohibited.';
END;
$$;

DROP TRIGGER IF EXISTS trg_demand_signals_append_only ON public.atlas_demand_signals;
CREATE TRIGGER trg_demand_signals_append_only
BEFORE UPDATE OR DELETE ON public.atlas_demand_signals
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_append_only_demand_signals();

-- ============================================================================
-- 4. DEMAND CLUSTERS & SYNONYM MEMBERSHIPS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_demand_clusters (
    cluster_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    category_hint TEXT NOT NULL DEFAULT 'General',
    status TEXT NOT NULL CHECK (status IN ('EMERGING', 'ACCELERATING', 'SUSTAINED', 'DECAYING', 'DORMANT')),
    first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demand_clusters_status ON public.atlas_demand_clusters(status, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.atlas_demand_cluster_memberships (
    membership_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id UUID NOT NULL REFERENCES public.atlas_demand_clusters(cluster_id) ON DELETE CASCADE,
    synonym_query TEXT NOT NULL,
    normalized_query TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(cluster_id, normalized_query)
);

CREATE INDEX IF NOT EXISTS idx_cluster_memberships_normalized ON public.atlas_demand_cluster_memberships(normalized_query);

-- ============================================================================
-- 5. DEMAND SNAPSHOTS (APPEND-ONLY MULTIDIMENSIONAL TIME-SERIES)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_demand_snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id UUID NOT NULL REFERENCES public.atlas_demand_clusters(cluster_id) ON DELETE CASCADE,
    as_of TIMESTAMPTZ NOT NULL,
    
    -- Multidimensional Demand Vector
    search_strength NUMERIC(5,2) NOT NULL CHECK (search_strength >= 0 AND search_strength <= 100),
    social_strength NUMERIC(5,2) NOT NULL CHECK (social_strength >= 0 AND social_strength <= 100),
    content_signal_strength NUMERIC(5,2) NOT NULL CHECK (content_signal_strength >= 0 AND content_signal_strength <= 100),
    commercial_intent NUMERIC(5,2) NOT NULL CHECK (commercial_intent >= 0 AND commercial_intent <= 100),
    confidence NUMERIC(5,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
    persistence NUMERIC(5,2) NOT NULL CHECK (persistence >= 0 AND persistence <= 100),
    acceleration NUMERIC(5,2) NOT NULL CHECK (acceleration >= -100 AND acceleration <= 100),
    saturation_index NUMERIC(5,2) NOT NULL CHECK (saturation_index >= 0 AND saturation_index <= 100),
    
    demand_score NUMERIC(5,2) NOT NULL CHECK (demand_score >= 0 AND demand_score <= 100),
    market_state TEXT NOT NULL CHECK (market_state IN ('TREND', 'SEARCH_DEMAND', 'COMMERCIAL_INTENT', 'COMMERCE_OPPORTUNITY', 'HYBRID_ACCELERATING', 'INACTIVE')),
    source_diversity_count INTEGER NOT NULL DEFAULT 1,
    
    scoring_policy_version TEXT NOT NULL REFERENCES public.atlas_demand_scoring_policies(scoring_policy_version),
    input_snapshot_hash TEXT NOT NULL,
    is_stale BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demand_snapshots_cluster ON public.atlas_demand_snapshots(cluster_id, as_of DESC);

-- Append-Only Trigger on Snapshots
CREATE OR REPLACE FUNCTION public.trg_enforce_append_only_demand_snapshots()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'APPEND_ONLY_VIOLATION: Historical demand snapshots are immutable. Update and Delete are prohibited.';
END;
$$;

DROP TRIGGER IF EXISTS trg_demand_snapshots_append_only ON public.atlas_demand_snapshots;
CREATE TRIGGER trg_demand_snapshots_append_only
BEFORE UPDATE OR DELETE ON public.atlas_demand_snapshots
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_append_only_demand_snapshots();

-- ============================================================================
-- 6. DEMAND OPPORTUNITIES & COMMERCE MATCHES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_demand_opportunities (
    opportunity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id UUID NOT NULL REFERENCES public.atlas_demand_clusters(cluster_id) ON DELETE CASCADE,
    snapshot_id UUID NOT NULL REFERENCES public.atlas_demand_snapshots(snapshot_id) ON DELETE CASCADE,
    site_id TEXT NOT NULL, -- e.g. 'MLA'
    
    demand_score NUMERIC(5,2) NOT NULL,
    commerce_match_score NUMERIC(5,2) NOT NULL,
    overall_opportunity_score NUMERIC(5,2) NOT NULL,
    opportunity_gap_score NUMERIC(5,2) NOT NULL,
    opportunity_tier TEXT NOT NULL CHECK (opportunity_tier IN ('TIER_1_EXPEDITE', 'TIER_2_VIABLE', 'TIER_3_MONITOR', 'INELIGIBLE')),
    market_state TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('DETECTED', 'MATCHED', 'ACTIONABLE', 'ARCHIVED')),
    evaluation_reason TEXT NOT NULL,
    
    scoring_policy_version TEXT NOT NULL REFERENCES public.atlas_demand_scoring_policies(scoring_policy_version),
    input_snapshot_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demand_opportunities_tier ON public.atlas_demand_opportunities(opportunity_tier, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demand_opportunities_site ON public.atlas_demand_opportunities(site_id, overall_opportunity_score DESC);

CREATE TABLE IF NOT EXISTS public.atlas_demand_commerce_matches (
    match_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES public.atlas_demand_opportunities(opportunity_id) ON DELETE CASCADE,
    site_id TEXT NOT NULL,
    
    matched_items_count INTEGER NOT NULL DEFAULT 0,
    eligible_items_count INTEGER NOT NULL DEFAULT 0,
    top_eligible_item_ids TEXT[] NOT NULL DEFAULT '{}',
    avg_quality_score NUMERIC(5,2) NOT NULL DEFAULT 0,
    avg_commission_rate NUMERIC(6,4) NOT NULL DEFAULT 0,
    estimated_unit_commission NUMERIC(12,2) NOT NULL DEFAULT 0,
    best_product_condition TEXT NOT NULL DEFAULT 'NONE',
    fulfillment_available BOOLEAN NOT NULL DEFAULT false,
    matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(opportunity_id)
);

-- ============================================================================
-- 7. LEAD / LAG EMPIRICAL PROFILES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_demand_lead_lag_profiles (
    profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    region_code TEXT NOT NULL,
    leading_source TEXT NOT NULL,
    lag_to_search_seconds INTEGER,
    lag_to_commerce_seconds INTEGER,
    confidence NUMERIC(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1.0),
    sample_size INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(category, region_code, leading_source)
);

-- ============================================================================
-- 8. CONTROLLED INGESTION RPC (SECURITY DEFINER & PII SAFE)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ingest_demand_signal_v1(
    p_source_platform TEXT,
    p_metric_value NUMERIC,
    p_raw_query_topic TEXT,
    p_region_code TEXT DEFAULT 'GLOBAL',
    p_is_sampled BOOLEAN DEFAULT false,
    p_source_confidence NUMERIC DEFAULT 0.90,
    p_provider_observed_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_cap RECORD;
    v_norm_query TEXT;
    v_sig_hash TEXT;
    v_signal_id UUID;
    v_freshness_seconds INTEGER;
BEGIN
    -- 1. Capability Verification Gate (Fail-Closed)
    SELECT * INTO v_cap
    FROM public.atlas_demand_source_capabilities
    WHERE source_platform = p_source_platform;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'REJECTED', 'reason', 'SOURCE_PLATFORM_NOT_FOUND');
    END IF;

    IF v_cap.contract_status NOT IN ('SUPPORTED', 'LIMITED_ALPHA') OR
       v_cap.access_status != 'ACTIVE_CONFIGURED' OR
       v_cap.live_status != 'LIVE_VERIFIED' THEN
        RETURN jsonb_build_object(
            'status', 'REJECTED',
            'reason', 'SOURCE_NOT_AUTHORIZED_OR_NOT_LIVE',
            'contract_status', v_cap.contract_status,
            'access_status', v_cap.access_status,
            'live_status', v_cap.live_status
        );
    END IF;

    -- 2. Freshness Gate
    v_freshness_seconds := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - p_provider_observed_at))::INTEGER);
    IF v_freshness_seconds > v_cap.max_freshness_seconds THEN
        RETURN jsonb_build_object(
            'status', 'REJECTED',
            'reason', 'SIGNAL_STALE',
            'freshness_seconds', v_freshness_seconds,
            'max_allowed_seconds', v_cap.max_freshness_seconds
        );
    END IF;

    -- 3. Normalized Query & Hash Generation
    v_norm_query := lower(trim(regexp_replace(p_raw_query_topic, '\s+', ' ', 'g')));
    v_sig_hash := encode(digest(p_source_platform || ':' || v_norm_query || ':' || p_region_code || ':' || date_trunc('hour', p_provider_observed_at)::text, 'sha256'), 'hex');

    -- 4. Idempotent Ingestion
    INSERT INTO public.atlas_demand_signals (
        source_platform,
        metric_kind,
        metric_value,
        metric_unit,
        window_seconds,
        is_sampled,
        freshness_seconds,
        raw_query_topic,
        normalized_query,
        region_code,
        source_confidence,
        provider_observed_at,
        signal_hash
    ) VALUES (
        p_source_platform,
        v_cap.metric_kind,
        p_metric_value,
        v_cap.metric_unit,
        v_cap.default_window_seconds,
        p_is_sampled,
        v_freshness_seconds,
        p_raw_query_topic,
        v_norm_query,
        p_region_code,
        p_source_confidence,
        p_provider_observed_at,
        v_sig_hash
    )
    ON CONFLICT (signal_hash) DO NOTHING
    RETURNING signal_id INTO v_signal_id;

    IF v_signal_id IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'IDEMPOTENT_IGNORED',
            'signal_hash', v_sig_hash,
            'normalized_query', v_norm_query
        );
    END IF;

    RETURN jsonb_build_object(
        'status', 'INSERTED',
        'signal_id', v_signal_id,
        'signal_hash', v_sig_hash,
        'normalized_query', v_norm_query
    );
END;
$$;

-- ============================================================================
-- 9. ROW LEVEL SECURITY & PERMISSION HARDENING
-- ============================================================================

ALTER TABLE public.atlas_demand_source_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_demand_scoring_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_demand_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_demand_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_demand_cluster_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_demand_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_demand_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_demand_commerce_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_demand_lead_lag_profiles ENABLE ROW LEVEL SECURITY;

-- Select policies: Public Read for market intelligence catalogs and opportunities
CREATE POLICY "allow_read_demand_source_capabilities" ON public.atlas_demand_source_capabilities FOR SELECT USING (true);
CREATE POLICY "allow_read_demand_scoring_policies" ON public.atlas_demand_scoring_policies FOR SELECT USING (true);
CREATE POLICY "allow_read_demand_signals" ON public.atlas_demand_signals FOR SELECT USING (true);
CREATE POLICY "allow_read_demand_clusters" ON public.atlas_demand_clusters FOR SELECT USING (true);
CREATE POLICY "allow_read_demand_cluster_memberships" ON public.atlas_demand_cluster_memberships FOR SELECT USING (true);
CREATE POLICY "allow_read_demand_snapshots" ON public.atlas_demand_snapshots FOR SELECT USING (true);
CREATE POLICY "allow_read_demand_opportunities" ON public.atlas_demand_opportunities FOR SELECT USING (true);
CREATE POLICY "allow_read_demand_commerce_matches" ON public.atlas_demand_commerce_matches FOR SELECT USING (true);
CREATE POLICY "allow_read_demand_lead_lag_profiles" ON public.atlas_demand_lead_lag_profiles FOR SELECT USING (true);

-- Revoke direct mutations from anon & authenticated
REVOKE INSERT, UPDATE, DELETE ON public.atlas_demand_source_capabilities FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.atlas_demand_scoring_policies FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.atlas_demand_signals FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.atlas_demand_clusters FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.atlas_demand_cluster_memberships FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.atlas_demand_snapshots FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.atlas_demand_opportunities FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.atlas_demand_commerce_matches FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.atlas_demand_lead_lag_profiles FROM anon, authenticated;

-- Grant RPC execution
GRANT EXECUTE ON FUNCTION public.ingest_demand_signal_v1 TO anon, authenticated, service_role;
