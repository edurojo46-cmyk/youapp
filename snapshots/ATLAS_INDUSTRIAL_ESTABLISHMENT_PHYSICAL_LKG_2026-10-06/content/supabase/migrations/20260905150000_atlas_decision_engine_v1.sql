-- ==========================================
-- PHASE 9B: ATLAS DECISION ENGINE V1
-- ==========================================

-- 1. CONTACT DECISIONS
CREATE TABLE IF NOT EXISTS public.atlas_contact_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES public.atlas_contacts(contact_id) ON DELETE CASCADE,
    canonical_contact_id UUID REFERENCES public.atlas_contacts(contact_id) ON DELETE CASCADE,
    audience_search_id UUID NOT NULL REFERENCES public.atlas_audience_searches(id) ON DELETE CASCADE,
    campaign_id UUID, -- Optional linkage to specific campaign context if evaluating for one
    
    decision TEXT NOT NULL CHECK (decision IN ('CONTACT_NOW', 'REVIEW_REQUIRED', 'DO_NOT_CONTACT')),
    
    -- Priority only exists for CONTACT_NOW
    priority_score INT,
    priority_tier TEXT CHECK (priority_tier IN ('PRIORITY_A', 'PRIORITY_B', 'PRIORITY_C', 'LOW_PRIORITY')),
    
    -- We can enforce priority is null if decision != CONTACT_NOW
    CONSTRAINT chk_priority_only_for_contact_now CHECK (
        (decision = 'CONTACT_NOW' AND priority_score IS NOT NULL AND priority_tier IS NOT NULL) OR
        (decision != 'CONTACT_NOW' AND priority_score IS NULL AND priority_tier IS NULL)
    ),

    hard_gates_passed BOOLEAN NOT NULL,
    
    gate_results JSONB NOT NULL DEFAULT '{}'::jsonb,
    decision_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
    blocking_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
    score_components JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    audience_match_id UUID NOT NULL REFERENCES public.atlas_audience_matches(id) ON DELETE CASCADE,
    
    decision_policy_version TEXT NOT NULL,
    scoring_version TEXT NOT NULL,
    decision_hash TEXT NOT NULL,
    
    evidence_snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX idx_atlas_contact_decisions_candidate ON public.atlas_contact_decisions(candidate_id);
CREATE INDEX idx_atlas_contact_decisions_campaign ON public.atlas_contact_decisions(campaign_id);
CREATE INDEX idx_atlas_contact_decisions_search ON public.atlas_contact_decisions(audience_search_id);
