-- MIGRATION: ATLAS CHANNEL ELIGIBILITY ENGINE (10C)
-- 20260907040000_atlas_channel_eligibility_10c.sql
-- Description: Phase 10C deterministic eligibility layer for omnichannel actions.

-- 1. ENUMS

DO $$ BEGIN
    CREATE TYPE public.atlas_subject_type AS ENUM (
        'PERSON',
        'COMPANY'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.atlas_action_type AS ENUM (
        'EMAIL_SEND',
        'WHATSAPP_MARKETING_MESSAGE',
        'WHATSAPP_SERVICE_REPLY',
        'INSTAGRAM_DM',
        'INSTAGRAM_PUBLIC_REPLY',
        'X_DM',
        'X_PUBLIC_REPLY',
        'YOUTUBE_COMMENT',
        'YOUTUBE_LIVE_CHAT',
        'LINKEDIN_COMMENT',
        'META_AD_AUDIENCE',
        'GOOGLE_AD_AUDIENCE'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.atlas_eligibility_status AS ENUM (
        'ELIGIBLE',
        'INELIGIBLE',
        'CONSENT_REQUIRED',
        'REVIEW_REQUIRED',
        'UNKNOWN'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.atlas_permission_status AS ENUM (
        'GRANTED',
        'DENIED',
        'UNKNOWN',
        'EXPIRED'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.atlas_permission_basis AS ENUM (
        'EXPLICIT_CONSENT',
        'PLATFORM_INITIATED_CONTEXT',
        'FIRST_PARTY_RELATIONSHIP',
        'CONTRACTUAL_BASIS',
        'OTHER_VERIFIED_BASIS',
        'NONE'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. SUBJECT REGISTRY (THIN BRIDGE)
CREATE TABLE IF NOT EXISTS public.atlas_subject_registry (
    subject_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_type public.atlas_subject_type NOT NULL,
    
    person_id UUID,
    company_id UUID,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT chk_subject_resolution 
    CHECK (
        (subject_type = 'PERSON' AND person_id IS NOT NULL AND company_id IS NULL) OR
        (subject_type = 'COMPANY' AND company_id IS NOT NULL AND person_id IS NULL)
    ),

    CONSTRAINT uq_subject_person UNIQUE (person_id),
    CONSTRAINT uq_subject_company UNIQUE (company_id)
);

-- 3. CHANNEL POLICY REGISTRY
CREATE TABLE IF NOT EXISTS public.atlas_channel_policy_registry (
    policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    platform TEXT NOT NULL,
    action_type public.atlas_action_type NOT NULL,
    policy_version TEXT NOT NULL,
    
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until TIMESTAMPTZ,
    
    requires_identifier BOOLEAN NOT NULL DEFAULT true,
    requires_consent BOOLEAN NOT NULL DEFAULT false,
    requires_prior_interaction BOOLEAN NOT NULL DEFAULT false,
    requires_connected_account BOOLEAN NOT NULL DEFAULT true,
    api_supported BOOLEAN NOT NULL DEFAULT true,
    
    policy_source TEXT,
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_channel_policy UNIQUE (platform, action_type, policy_version)
);

-- 4. CHANNEL CAPABILITIES
CREATE TABLE IF NOT EXISTS public.atlas_channel_capabilities (
    capability_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    channel TEXT NOT NULL,
    action_type public.atlas_action_type NOT NULL,
    account_id UUID, -- References internal connected account, e.g. atlas_social_accounts
    
    enabled BOOLEAN NOT NULL DEFAULT false,
    read_supported BOOLEAN NOT NULL DEFAULT false,
    write_supported BOOLEAN NOT NULL DEFAULT false,
    health_status TEXT NOT NULL DEFAULT 'HEALTHY',
    capability_version TEXT NOT NULL,
    
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. CHANNEL PERMISSIONS
CREATE TABLE IF NOT EXISTS public.atlas_channel_permissions (
    permission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    subject_id UUID NOT NULL REFERENCES public.atlas_subject_registry(subject_id) ON DELETE CASCADE,
    channel TEXT NOT NULL,
    action_type public.atlas_action_type NOT NULL,
    
    permission_status public.atlas_permission_status NOT NULL,
    permission_basis public.atlas_permission_basis NOT NULL,
    
    source TEXT,
    evidence_id UUID,
    
    granted_at TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    policy_version TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. CHANNEL ELIGIBILITY
CREATE TABLE IF NOT EXISTS public.atlas_channel_eligibility (
    eligibility_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    subject_id UUID NOT NULL REFERENCES public.atlas_subject_registry(subject_id) ON DELETE CASCADE,
    channel TEXT NOT NULL,
    action_type public.atlas_action_type NOT NULL,
    
    eligibility_status public.atlas_eligibility_status NOT NULL,
    reason_codes TEXT[] NOT NULL DEFAULT '{}',
    
    upstream_decision_id UUID,
    policy_version TEXT,
    capability_version TEXT,
    permission_version UUID REFERENCES public.atlas_channel_permissions(permission_id) ON DELETE SET NULL,
    evidence_snapshot_hash TEXT,
    
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    
    CONSTRAINT uq_channel_eligibility UNIQUE (subject_id, channel, action_type)
);

-- RLS
ALTER TABLE public.atlas_subject_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_channel_policy_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_channel_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_channel_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_channel_eligibility ENABLE ROW LEVEL SECURITY;
