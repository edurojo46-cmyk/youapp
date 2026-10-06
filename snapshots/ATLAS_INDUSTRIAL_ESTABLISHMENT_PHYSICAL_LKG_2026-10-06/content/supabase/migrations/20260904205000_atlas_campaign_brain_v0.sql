-- ==========================================
-- ATLAS OUTREACH - CAMPAIGN BRAIN V0
-- ==========================================

-- 1. Audiences
CREATE TABLE IF NOT EXISTS public.atlas_campaign_audiences (
    audience_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.atlas_outreach_campaigns(campaign_id) ON DELETE CASCADE,
    target_criteria JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Templates
CREATE TABLE IF NOT EXISTS public.atlas_message_templates (
    template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES public.atlas_outreach_campaigns(campaign_id) ON DELETE CASCADE,
    prompt_template TEXT NOT NULL,
    tone TEXT NOT NULL,
    cta TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Message Queue (Decoupled generation queue)
CREATE TABLE IF NOT EXISTS public.atlas_message_queue (
    job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.atlas_outreach_campaigns(campaign_id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.atlas_contacts(contact_id) ON DELETE CASCADE,
    
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'RETRY', 'GENERATED', 'REJECTED', 'DEAD_LETTER')),
    
    locked_by TEXT,
    locked_at TIMESTAMPTZ,
    lock_expires_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_atlas_message_queue_fetch ON public.atlas_message_queue(status, created_at);

-- 4. Message Generations
CREATE TABLE IF NOT EXISTS public.atlas_message_generations (
    generation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES public.atlas_message_queue(job_id) ON DELETE SET NULL,
    campaign_id UUID NOT NULL REFERENCES public.atlas_outreach_campaigns(campaign_id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.atlas_contacts(contact_id) ON DELETE CASCADE,
    
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'GENERATED', 'VALIDATED', 'APPROVED', 'REJECTED', 'STALE')),
    
    subject TEXT,
    body TEXT,
    model TEXT NOT NULL,
    prompt_version TEXT,
    
    evidence_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    generated_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Claims
CREATE TABLE IF NOT EXISTS public.atlas_message_claims (
    claim_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    generation_id UUID NOT NULL REFERENCES public.atlas_message_generations(generation_id) ON DELETE CASCADE,
    
    claim_text TEXT NOT NULL,
    claim_type TEXT NOT NULL,
    evidence_id UUID REFERENCES public.atlas_contact_evidence(evidence_id) ON DELETE SET NULL,
    confidence NUMERIC,
    
    validation_status TEXT NOT NULL CHECK (validation_status IN ('SUPPORTED', 'UNSUPPORTED', 'AMBIGUOUS')),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Results
CREATE TABLE IF NOT EXISTS public.atlas_campaign_results (
    campaign_id UUID PRIMARY KEY REFERENCES public.atlas_outreach_campaigns(campaign_id) ON DELETE CASCADE,
    total_contacts INT DEFAULT 0,
    generated INT DEFAULT 0,
    sent INT DEFAULT 0,
    delivered INT DEFAULT 0,
    opened INT DEFAULT 0,
    replied INT DEFAULT 0,
    meetings_booked INT DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);
