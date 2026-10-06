-- ==========================================
-- ATLAS PHASE 10P-A: PERSON IDENTITY & EVIDENCE LAYER V1
-- ==========================================

-- 1. Enums
DO $$ BEGIN
    CREATE TYPE public.atlas_identifier_type AS ENUM (
        'EMAIL',
        'PHONE',
        'INSTAGRAM',
        'X',
        'YOUTUBE',
        'LINKEDIN',
        'TELEGRAM',
        'CUSTOMER_ID',
        'OTHER'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.atlas_assertion_type AS ENUM (
        'VERIFIED',
        'DECLARED',
        'OBSERVED',
        'INFERRED'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.atlas_person_status AS ENUM (
        'ACTIVE',
        'MERGED',
        'DELETED'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Core Person Table
CREATE TABLE IF NOT EXISTS public.atlas_people (
    person_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    full_name TEXT,
    status public.atlas_person_status NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_atlas_people_tenant ON public.atlas_people(tenant_id);

-- 3. Person Identifiers
CREATE TABLE IF NOT EXISTS public.atlas_person_identifiers (
    identifier_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    person_id UUID NOT NULL REFERENCES public.atlas_people(person_id) ON DELETE CASCADE,
    
    identifier_type public.atlas_identifier_type NOT NULL,
    normalized_value_hash TEXT NOT NULL,
    
    display_value TEXT,
    safe_value TEXT,
    
    verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
    source_evidence_id TEXT,
    
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(tenant_id, identifier_type, normalized_value_hash)
);

CREATE INDEX idx_atlas_identifiers_person ON public.atlas_person_identifiers(person_id);

-- 4. Attribute Evidence
CREATE TABLE IF NOT EXISTS public.atlas_person_attribute_evidence (
    evidence_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    person_id UUID NOT NULL REFERENCES public.atlas_people(person_id) ON DELETE CASCADE,
    
    attribute_key TEXT NOT NULL,
    normalized_value TEXT,
    assertion_type public.atlas_assertion_type NOT NULL,
    
    confidence NUMERIC,
    source_ref TEXT,
    
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    evidence_hash TEXT
);

CREATE INDEX idx_atlas_evidence_person ON public.atlas_person_attribute_evidence(person_id);

-- 5. Coverage
CREATE TABLE IF NOT EXISTS public.atlas_person_coverage (
    person_id UUID PRIMARY KEY REFERENCES public.atlas_people(person_id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    
    identity_known BOOLEAN NOT NULL DEFAULT FALSE,
    location_known BOOLEAN NOT NULL DEFAULT FALSE,
    email_known BOOLEAN NOT NULL DEFAULT FALSE,
    phone_known BOOLEAN NOT NULL DEFAULT FALSE,
    instagram_known BOOLEAN NOT NULL DEFAULT FALSE,
    telegram_known BOOLEAN NOT NULL DEFAULT FALSE,
    youtube_known BOOLEAN NOT NULL DEFAULT FALSE,
    linkedin_known BOOLEAN NOT NULL DEFAULT FALSE,
    age_range_known BOOLEAN NOT NULL DEFAULT FALSE,
    occupation_known BOOLEAN NOT NULL DEFAULT FALSE,
    
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Trigger to sync atlas_subject_registry
-- We need to ensure every PERSON is registered in the thin bridge.
CREATE OR REPLACE FUNCTION public.trg_sync_person_subject_registry()
RETURNS TRIGGER AS $$
BEGIN
    -- We assume subject_id = person_id to keep 1:1 bridge identity map simple
    INSERT INTO public.atlas_subject_registry (subject_id, subject_type, person_id)
    VALUES (NEW.person_id, 'PERSON', NEW.person_id)
    ON CONFLICT (subject_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_person_subject ON public.atlas_people;
CREATE TRIGGER sync_person_subject
AFTER INSERT ON public.atlas_people
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_person_subject_registry();
