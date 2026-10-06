-- MIGRATION: ATLAS SOCIAL ACCOUNTS & IDENTITY LAYER (10A)
-- 20260907000000_atlas_social_accounts_10a.sql
-- Description: Phase 10A foundation for read-only social ingestion.

-- 1. ENUMS
DO $$ BEGIN
    CREATE TYPE public.atlas_social_platform AS ENUM (
        'YOUTUBE',
        'X',
        'INSTAGRAM',
        'LINKEDIN',
        'REDDIT',
        'UNKNOWN'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.atlas_social_account_status AS ENUM (
        'ACTIVE',
        'RATE_LIMITED',
        'SUSPENDED',
        'AUTH_EXPIRED',
        'DISCONNECTED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. ATLAS SOCIAL ACCOUNTS (OWNED IDENTITIES)
CREATE TABLE IF NOT EXISTS public.atlas_social_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL, -- Core multitenancy isolation
    platform public.atlas_social_platform NOT NULL,
    external_account_id TEXT NOT NULL,
    username TEXT,
    account_type TEXT,
    status public.atlas_social_account_status NOT NULL DEFAULT 'ACTIVE',
    
    -- Security: NEVER store raw tokens in standard columns.
    -- Points to Vault / Secret Manager securely.
    credential_ref TEXT NOT NULL,
    oauth_scope_snapshot JSONB,
    
    -- Invariants: Strict Read-Only V1 Enforcement
    read_enabled BOOLEAN NOT NULL DEFAULT true,
    write_enabled BOOLEAN NOT NULL DEFAULT false,
    
    rate_limit_state JSONB,
    last_health_check_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Uniqueness constraint required by 10A architecture
    CONSTRAINT uq_atlas_social_accounts_tenant_platform_extid UNIQUE (tenant_id, platform, external_account_id),
    
    -- Hard database-level constraint preventing write operations
    CONSTRAINT chk_social_v1_read_only CHECK (write_enabled = false)
);

CREATE INDEX IF NOT EXISTS idx_atlas_social_accounts_platform ON public.atlas_social_accounts(platform, status);


-- 3. ATLAS SOCIAL PROFILES (OBSERVED EXTERNAL IDENTITIES)
CREATE TABLE IF NOT EXISTS public.atlas_social_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- The internal entity this profile resolves to (if known)
    canonical_entity_type TEXT, -- e.g., 'company', 'person', 'exact_work'
    canonical_entity_id UUID,
    
    platform public.atlas_social_platform NOT NULL,
    platform_profile_id TEXT NOT NULL,
    
    handle TEXT,
    canonical_url TEXT,
    display_name TEXT,
    profile_type TEXT,
    
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    source TEXT,
    evidence_id UUID, -- Reference to the content that triggered the discovery
    
    -- Uniqueness constraint required by 10A architecture
    CONSTRAINT uq_atlas_social_profiles_platform_profileid UNIQUE (platform, platform_profile_id)
);


-- 4. ATLAS SOCIAL CONTENT (OBSERVED CONTENT / PROVENANCE)
CREATE TABLE IF NOT EXISTS public.atlas_social_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    platform public.atlas_social_platform NOT NULL,
    content_id TEXT NOT NULL, -- Platform-specific natural ID
    profile_id UUID REFERENCES public.atlas_social_profiles(id) ON DELETE SET NULL,
    
    canonical_url TEXT,
    published_at TIMESTAMPTZ,
    
    -- Core Content
    text_excerpt TEXT,
    content_hash TEXT NOT NULL,
    content_type TEXT, -- 'POST', 'VIDEO', 'COMMENT'
    engagement_snapshot JSONB, -- Views, Likes, etc (No psychological attributes)
    
    -- Strict Provenance
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ingest_method TEXT NOT NULL, -- e.g. 'search.list', 'timeline'
    source_account_id UUID REFERENCES public.atlas_social_accounts(id) ON DELETE SET NULL,
    source_url TEXT,
    retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_policy_version TEXT,
    
    -- Uniqueness constraint required by 10A architecture
    CONSTRAINT uq_atlas_social_content_platform_contentid UNIQUE (platform, content_id)
);


-- 5. ATLAS SOCIAL INGEST STATE (RATE LIMIT & WATERMARKS)
CREATE TABLE IF NOT EXISTS public.atlas_social_ingest_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES public.atlas_social_accounts(id) ON DELETE CASCADE,
    ingest_job_key TEXT NOT NULL, -- e.g., 'YOUTUBE_KEYWORD_EXPANSION'
    
    cursor_watermark TEXT,
    last_run_at TIMESTAMPTZ,
    items_ingested_total BIGINT NOT NULL DEFAULT 0,
    api_calls_used_total BIGINT NOT NULL DEFAULT 0,
    
    is_exhausted BOOLEAN NOT NULL DEFAULT false,
    resume_after TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_atlas_social_ingest_state_job UNIQUE (account_id, ingest_job_key)
);

-- Basic RLS
ALTER TABLE public.atlas_social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_social_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_social_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_social_ingest_state ENABLE ROW LEVEL SECURITY;
