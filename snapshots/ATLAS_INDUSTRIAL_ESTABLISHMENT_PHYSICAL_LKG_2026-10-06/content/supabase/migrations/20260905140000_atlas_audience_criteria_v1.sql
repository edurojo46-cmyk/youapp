-- ==========================================
-- PHASE 9A: ATLAS AUDIENCE CRITERIA ENGINE V1
-- ==========================================

-- 1. ATTRIBUTE REGISTRY
CREATE TABLE IF NOT EXISTS public.atlas_attribute_registry (
    attribute TEXT PRIMARY KEY,
    data_type TEXT NOT NULL CHECK (data_type IN ('TEXT', 'NUMBER', 'BOOLEAN', 'ARRAY', 'DATE')),
    entity_type TEXT NOT NULL CHECK (entity_type IN ('PERSON', 'COMPANY')),
    allowed_operators TEXT[] NOT NULL,
    evidence_required BOOLEAN NOT NULL DEFAULT TRUE,
    max_age_days INT,
    targeting_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    sensitivity_class TEXT NOT NULL DEFAULT 'NONE' CHECK (sensitivity_class IN ('NONE', 'PERSONAL_SENSITIVE', 'FINANCIAL', 'HEALTH', 'POLITICAL')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. AUDIENCE SEARCHES
CREATE TABLE IF NOT EXISTS public.atlas_audience_searches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_query TEXT,
    criteria_version TEXT NOT NULL DEFAULT '1',
    criteria_hash TEXT,
    normalized_spec JSONB,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 3. AUDIENCE CRITERIA
CREATE TABLE IF NOT EXISTS public.atlas_audience_criteria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    search_id UUID NOT NULL REFERENCES public.atlas_audience_searches(id) ON DELETE CASCADE,
    attribute TEXT NOT NULL REFERENCES public.atlas_attribute_registry(attribute),
    operator TEXT NOT NULL CHECK (operator IN ('EQ', 'NEQ', 'IN', 'NOT_IN', 'GT', 'GTE', 'LT', 'LTE', 'BETWEEN', 'EXISTS')),
    expected_value JSONB,
    required BOOLEAN NOT NULL DEFAULT TRUE,
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. CANDIDATE ATTRIBUTE EVIDENCE
CREATE TABLE IF NOT EXISTS public.atlas_candidate_attribute_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES public.atlas_contacts(contact_id) ON DELETE CASCADE,
    subject_type TEXT NOT NULL CHECK (subject_type IN ('PERSON', 'COMPANY')),
    attribute TEXT NOT NULL REFERENCES public.atlas_attribute_registry(attribute),
    value JSONB NOT NULL,
    
    assertion_type TEXT NOT NULL CHECK (assertion_type IN ('VERIFIED', 'DECLARED', 'OBSERVED', 'INFERRED')),
    raw_evidence_id UUID, -- Can link back to atlas_contact_evidence.evidence_id if needed
    source_type TEXT,
    confidence FLOAT NOT NULL DEFAULT 1.0,
    
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_candidate_attribute_evidence_candidate ON public.atlas_candidate_attribute_evidence(candidate_id, attribute);

-- 5. AUDIENCE MATCHES
CREATE TABLE IF NOT EXISTS public.atlas_audience_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    search_id UUID NOT NULL REFERENCES public.atlas_audience_searches(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES public.atlas_contacts(contact_id) ON DELETE CASCADE,
    
    match_status TEXT NOT NULL CHECK (match_status IN ('MATCH', 'NOT_MATCH')),
    evaluation_state TEXT NOT NULL CHECK (evaluation_state IN ('COMPLETE', 'INCOMPLETE', 'CONFLICT', 'REVIEW_REQUIRED')),
    
    criteria_total INT NOT NULL DEFAULT 0,
    criteria_confirmed INT NOT NULL DEFAULT 0,
    criteria_not_match INT NOT NULL DEFAULT 0,
    criteria_unknown INT NOT NULL DEFAULT 0,
    criteria_conflict INT NOT NULL DEFAULT 0,
    
    evaluation_reasons JSONB,
    evaluation_version TEXT,
    criteria_hash TEXT,
    evidence_snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    
    UNIQUE(search_id, candidate_id)
);
