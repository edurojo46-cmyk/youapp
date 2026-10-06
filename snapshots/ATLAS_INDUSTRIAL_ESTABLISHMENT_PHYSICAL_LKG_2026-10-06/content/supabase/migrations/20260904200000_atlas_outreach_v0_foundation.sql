-- MIGRATION: ATLAS OUTREACH V0 FOUNDATION
-- 20260904200000_atlas_outreach_v0_foundation.sql

-- ==========================================
-- 0. Extensions
-- ==========================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================
-- 1. Configuration
-- ==========================================
CREATE TABLE IF NOT EXISTS public.atlas_outreach_config (
    id INT PRIMARY KEY CHECK (id = 1),
    
    outreach_enabled BOOLEAN NOT NULL DEFAULT false,
    send_enabled BOOLEAN NOT NULL DEFAULT false,
    
    max_daily_sends INT NOT NULL DEFAULT 500 CHECK (max_daily_sends >= 0),
    max_hourly_sends INT NOT NULL DEFAULT 100 CHECK (max_hourly_sends >= 0),
    max_per_domain_daily INT NOT NULL DEFAULT 10 CHECK (max_per_domain_daily >= 0),
    max_per_campaign_daily INT NOT NULL DEFAULT 200 CHECK (max_per_campaign_daily >= 0),
    
    max_hard_bounce_rate NUMERIC NOT NULL DEFAULT 0.05 CHECK (max_hard_bounce_rate >= 0 AND max_hard_bounce_rate <= 1),
    max_complaint_rate NUMERIC NOT NULL DEFAULT 0.01 CHECK (max_complaint_rate >= 0 AND max_complaint_rate <= 1),
    
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.atlas_outreach_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- 2. Identity & Evidence
-- ==========================================
CREATE TABLE IF NOT EXISTS public.atlas_contacts (
    contact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID, -- If linked to an internal system entity (company, etc.)
    
    full_name TEXT,
    email TEXT NOT NULL,
    email_normalized TEXT NOT NULL,
    email_hash TEXT NOT NULL UNIQUE,
    
    country_code VARCHAR(2),
    region TEXT,
    city TEXT,
    
    recipient_type TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (recipient_type IN ('PERSON', 'CORPORATE_EMPLOYEE', 'CORPORATE_GENERIC', 'SOLE_TRADER', 'ORGANIZATION', 'UNKNOWN')),
    
    company TEXT,
    job_title TEXT,
    
    email_source_type TEXT,
    email_source_url TEXT,
    email_source_date TIMESTAMPTZ,
    
    status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (status IN ('ACTIVE', 'UNVERIFIED', 'SUPPRESSED', 'INVALID')),
    
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.atlas_contact_evidence (
    evidence_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES public.atlas_contacts(contact_id) ON DELETE CASCADE,
    field TEXT NOT NULL, -- e.g., 'email', 'job_title'
    value TEXT NOT NULL,
    source_url TEXT,
    source_type TEXT,
    confidence NUMERIC CHECK (confidence >= 0 AND confidence <= 1),
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_atlas_contact_evidence_contact ON public.atlas_contact_evidence(contact_id);

-- Normalization and Hashing Trigger for Contacts
CREATE OR REPLACE FUNCTION public.tf_normalize_contact_email()
RETURNS TRIGGER AS $$
DECLARE
    v_secret TEXT;
BEGIN
    -- 1. Normalization: lowercase and trim
    NEW.email_normalized := lower(trim(NEW.email));
    
    -- 2. Hashing (HMAC-SHA256)
    -- We read the pepper from a custom GUC or fallback if not set. 
    -- The app must ensure this setting exists, or we use a fallback for tests.
    BEGIN
        v_secret := current_setting('app.settings.outreach_secret');
    EXCEPTION WHEN OTHERS THEN
        v_secret := 'default_dev_secret_do_not_use_in_prod';
    END;
    
    NEW.email_hash := encode(hmac(NEW.email_normalized, v_secret, 'sha256'), 'hex');
    
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_normalize_contact_email
BEFORE INSERT OR UPDATE OF email ON public.atlas_contacts
FOR EACH ROW
EXECUTE FUNCTION public.tf_normalize_contact_email();


-- ==========================================
-- 3. Compliance & Policy
-- ==========================================
CREATE TABLE IF NOT EXISTS public.atlas_outreach_policies (
    policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code VARCHAR(2) NOT NULL,
    policy_version TEXT NOT NULL,
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ,
    
    recipient_type TEXT NOT NULL,
    message_type TEXT NOT NULL,
    
    rules JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'RETIRED')),
    
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    source_urls TEXT[],
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_atlas_policies_active ON public.atlas_outreach_policies(country_code, policy_version) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS public.atlas_outreach_compliance (
    evaluation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES public.atlas_contacts(contact_id) ON DELETE CASCADE,
    campaign_id UUID, -- Will link to campaigns later, UUID type for now
    
    jurisdiction VARCHAR(2),
    recipient_type TEXT,
    message_type TEXT,
    policy_version TEXT,
    
    decision TEXT NOT NULL CHECK (decision IN ('ALLOWED', 'CONSENT_REQUIRED', 'REVIEW_REQUIRED', 'BLOCKED')),
    legal_basis TEXT,
    reason_codes JSONB,
    evidence JSONB,
    
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX idx_atlas_outreach_compliance_contact ON public.atlas_outreach_compliance(contact_id, campaign_id);

-- Append-Only constraint for Compliance
CREATE OR REPLACE FUNCTION public.tf_prevent_compliance_update()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'atlas_outreach_compliance is append-only. UPDATEs are not allowed.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_prevent_compliance_update
BEFORE UPDATE ON public.atlas_outreach_compliance
FOR EACH ROW
EXECUTE FUNCTION public.tf_prevent_compliance_update();


-- ==========================================
-- 4. Suppression Registry
-- ==========================================
CREATE TABLE IF NOT EXISTS public.atlas_outreach_suppressions (
    suppression_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_hash TEXT NOT NULL,
    contact_id UUID REFERENCES public.atlas_contacts(contact_id) ON DELETE SET NULL,
    
    scope TEXT NOT NULL CHECK (scope IN ('ALL', 'MARKETING', 'CAMPAIGN', 'ORGANIZATION')),
    reason TEXT NOT NULL CHECK (reason IN ('UNSUBSCRIBED', 'COMPLAINT', 'MANUAL_BLOCK', 'LEGAL_REQUEST', 'HARD_BOUNCE')),
    
    source TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_atlas_outreach_suppressions_hash_scope ON public.atlas_outreach_suppressions(email_hash, scope);

-- ==========================================
-- 5. Campaigns
-- ==========================================
CREATE TABLE IF NOT EXISTS public.atlas_outreach_campaigns (
    campaign_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    purpose TEXT NOT NULL,
    message_type TEXT NOT NULL,
    
    countries_allowed TEXT[], -- NULL means all, but engine will fail-closed if unknown
    recipient_types_allowed TEXT[],
    template_id UUID,
    
    campaign_enabled BOOLEAN NOT NULL DEFAULT false,
    
    max_daily_sends INT NOT NULL DEFAULT 100 CHECK (max_daily_sends >= 0),
    max_per_hour INT NOT NULL DEFAULT 20 CHECK (max_per_hour >= 0),
    max_per_domain_daily INT NOT NULL DEFAULT 5 CHECK (max_per_domain_daily >= 0),
    min_days_between_contacts INT NOT NULL DEFAULT 30 CHECK (min_days_between_contacts >= 0),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 6. Outreach Queue & Events
-- ==========================================
CREATE TABLE IF NOT EXISTS public.atlas_outreach_queue (
    job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.atlas_outreach_campaigns(campaign_id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.atlas_contacts(contact_id) ON DELETE CASCADE,
    
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'RETRY', 'SENT', 'BLOCKED', 'DEAD_LETTER')),
    priority INT NOT NULL DEFAULT 5 CHECK (priority >= 0),
    
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    attempt_count INT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    max_attempts INT NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
    
    locked_by TEXT,
    locked_at TIMESTAMPTZ,
    lock_expires_at TIMESTAMPTZ,
    lock_token TEXT,
    
    idempotency_key TEXT UNIQUE NOT NULL,
    compliance_evaluation_id UUID REFERENCES public.atlas_outreach_compliance(evaluation_id) ON DELETE SET NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_atlas_outreach_queue_fetch ON public.atlas_outreach_queue(status, available_at, priority DESC);

CREATE TABLE IF NOT EXISTS public.atlas_outreach_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES public.atlas_outreach_queue(job_id) ON DELETE SET NULL,
    contact_id UUID REFERENCES public.atlas_contacts(contact_id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES public.atlas_outreach_campaigns(campaign_id) ON DELETE SET NULL,
    
    event_type TEXT NOT NULL CHECK (event_type IN ('QUEUED', 'COMPLIANCE_ALLOWED', 'COMPLIANCE_BLOCKED', 'SENT', 'DELIVERED', 'REPLIED', 'BOUNCED', 'COMPLAINT', 'UNSUBSCRIBED', 'FAILED')),
    details JSONB,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_atlas_outreach_events_tracking ON public.atlas_outreach_events(contact_id, campaign_id);

-- ==========================================
-- 7. Daily Usage (Budget)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.atlas_outreach_daily_usage (
    usage_date DATE NOT NULL,
    metric TEXT NOT NULL CHECK (metric IN ('GLOBAL_SEND', 'CAMPAIGN_SEND', 'DOMAIN_SEND', 'CONTACT_SEND', 'COUNTRY_SEND')),
    entity_id TEXT, -- e.g., campaign_id, domain string, contact_id, country_code. NULL for GLOBAL_SEND
    
    usage_count INT NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_atlas_outreach_daily_usage_unique ON public.atlas_outreach_daily_usage (usage_date, metric, entity_id) NULLS NOT DISTINCT;
