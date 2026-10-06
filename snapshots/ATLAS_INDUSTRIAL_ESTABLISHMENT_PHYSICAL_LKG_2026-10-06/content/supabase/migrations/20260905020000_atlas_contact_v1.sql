-- ==========================================
-- ATLAS CONTACT V1 - PHASE 8A
-- ==========================================

-- 1. Searches Table
CREATE TABLE IF NOT EXISTS public.atlas_contact_searches (
    search_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    query_text TEXT NOT NULL,

    -- legacy fields kept for backwards compatibility conceptually, but using JSONB is preferred
    target_country TEXT,
    target_region TEXT,
    target_city TEXT,
    target_sector TEXT,
    target_role TEXT,
    target_company_size TEXT,
    target_limit INT NOT NULL DEFAULT 100,

    -- Phase 8A structured fields
    criteria JSONB,
    criteria_version TEXT,
    planner_provider TEXT,
    planner_model TEXT,
    planner_confidence NUMERIC,

    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- 2. Discovered Companies
CREATE TABLE IF NOT EXISTS public.atlas_discovered_companies (
    company_candidate_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    search_id UUID NOT NULL REFERENCES public.atlas_contact_searches(search_id) ON DELETE CASCADE,

    company_name TEXT NOT NULL,
    canonical_name TEXT,
    website TEXT,
    domain TEXT,

    country TEXT,
    region TEXT,
    city TEXT,

    sector TEXT,
    employee_range TEXT,

    source_url TEXT,
    source_type TEXT,

    confidence NUMERIC CHECK (confidence >= 0 AND confidence <= 1),
    status TEXT NOT NULL DEFAULT 'DISCOVERED' CHECK (status IN ('DISCOVERED', 'VERIFIED', 'DUPLICATE', 'REJECTED')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Discovered People
CREATE TABLE IF NOT EXISTS public.atlas_discovered_people (
    person_candidate_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    search_id UUID NOT NULL REFERENCES public.atlas_contact_searches(search_id) ON DELETE CASCADE,
    company_candidate_id UUID REFERENCES public.atlas_discovered_companies(company_candidate_id) ON DELETE SET NULL,

    full_name TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,

    job_title TEXT,
    department TEXT,
    seniority TEXT,

    company_name TEXT,
    company_domain TEXT,

    country TEXT,
    region TEXT,
    city TEXT,
    
    email TEXT,
    email_normalized TEXT,
    email_hash TEXT,

    source_url TEXT,
    source_type TEXT,
    source_date TIMESTAMPTZ,

    confidence NUMERIC CHECK (confidence >= 0 AND confidence <= 1),
    status TEXT NOT NULL DEFAULT 'DISCOVERED' CHECK (status IN ('DISCOVERED', 'RESOLVING', 'VERIFIED', 'CONTACT_READY', 'REVIEW_REQUIRED', 'DUPLICATE', 'REJECTED', 'PROMOTED')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Contact Queue (for async processing: discovery, enrichment, resolution)
CREATE TABLE IF NOT EXISTS public.atlas_contact_queue (
    job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    search_id UUID REFERENCES public.atlas_contact_searches(search_id) ON DELETE CASCADE,
    entity_id UUID, -- Can be company_candidate_id or person_candidate_id

    job_type TEXT NOT NULL CHECK (job_type IN ('DISCOVER_COMPANY', 'DISCOVER_PERSON', 'ENRICH_PERSON', 'VERIFY_CONTACT', 'RESOLVE_ENTITY')),
    
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'RETRY', 'COMPLETED', 'REJECTED', 'DEAD_LETTER')),
    priority INT NOT NULL DEFAULT 5,
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    attempt_count INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    
    locked_by TEXT,
    lock_token TEXT,
    lock_expires_at TIMESTAMPTZ,
    
    payload JSONB,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_atlas_contact_queue_fetch ON public.atlas_contact_queue(status, available_at, priority DESC);
