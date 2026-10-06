-- Phase 10E-A: Message Contract & Evidence Authority
DROP TABLE IF EXISTS public.atlas_message_evidence_links CASCADE;
DROP TABLE IF EXISTS public.atlas_message_claims CASCADE;
DROP TABLE IF EXISTS public.atlas_message_drafts CASCADE;
DROP TABLE IF EXISTS public.atlas_message_policies CASCADE;

-- Universal Canonical Evidence Registry Bridge
CREATE TABLE public.atlas_evidence_registry (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    evidence_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    entity_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, id)
);
ALTER TABLE public.atlas_evidence_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY trg_rls_evidence_registry ON public.atlas_evidence_registry FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- Message Policies
CREATE TABLE public.atlas_message_policies (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    policy_version TEXT NOT NULL,
    policy_hash TEXT NOT NULL,
    channel TEXT,
    action_type TEXT,
    language TEXT,
    tone TEXT,
    max_length INT,
    personalization_level TEXT,
    allowed_claim_types JSONB,
    forbidden_claim_types JSONB,
    required_disclosures JSONB,
    required_cta_rules JSONB,
    ai_generation_allowed BOOLEAN,
    effective_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, id)
);
ALTER TABLE public.atlas_message_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY trg_rls_message_policies ON public.atlas_message_policies FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- Immutability Trigger for ACTIVE policies
CREATE OR REPLACE FUNCTION trg_enforce_policy_immutability() RETURNS trigger AS $$
BEGIN
    IF OLD.status = 'ACTIVE' THEN
        IF NEW.policy_version <> OLD.policy_version OR NEW.policy_hash <> OLD.policy_hash OR NEW.allowed_claim_types::TEXT <> OLD.allowed_claim_types::TEXT THEN
            RAISE EXCEPTION 'Cannot mutate semantic fields of an ACTIVE policy. Create a new version instead.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_atlas_message_policies_immutability
BEFORE UPDATE ON public.atlas_message_policies
FOR EACH ROW EXECUTE FUNCTION trg_enforce_policy_immutability();

-- Message Drafts
CREATE TABLE public.atlas_message_drafts (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    subject_type TEXT NOT NULL,
    subject_id UUID NOT NULL,
    nba_state_id UUID NOT NULL,
    nba_decision_hash TEXT NOT NULL,
    channel TEXT,
    action_type TEXT,
    policy_id UUID NOT NULL,
    policy_version TEXT NOT NULL,
    policy_hash TEXT NOT NULL,
    language TEXT,
    tone TEXT,
    generation_mode TEXT,
    generation_request_id TEXT NOT NULL,
    message_subject TEXT,
    message_body TEXT,
    status TEXT NOT NULL,
    evidence_snapshot_hash TEXT,
    claim_snapshot_hash TEXT,
    reason_codes JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, id),
    CONSTRAINT atlas_message_drafts_idempotency UNIQUE (tenant_id, subject_type, subject_id, nba_state_id, policy_version, generation_request_id)
);
ALTER TABLE public.atlas_message_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY trg_rls_message_drafts ON public.atlas_message_drafts FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- Message Claims
CREATE TABLE public.atlas_message_claims (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    draft_id UUID NOT NULL,
    claim_type TEXT NOT NULL,
    claim_text TEXT,
    claim_value JSONB,
    support_status TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, id),
    FOREIGN KEY (tenant_id, draft_id) REFERENCES public.atlas_message_drafts(tenant_id, id) ON DELETE CASCADE
);
ALTER TABLE public.atlas_message_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY trg_rls_message_claims ON public.atlas_message_claims FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- Message Evidence Links
CREATE TABLE public.atlas_message_evidence_links (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    claim_id UUID NOT NULL,
    evidence_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, id),
    FOREIGN KEY (tenant_id, claim_id) REFERENCES public.atlas_message_claims(tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, evidence_id) REFERENCES public.atlas_evidence_registry(tenant_id, id) ON DELETE CASCADE
);
ALTER TABLE public.atlas_message_evidence_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY trg_rls_message_evidence_links ON public.atlas_message_evidence_links FOR ALL USING (tenant_id = public.get_auth_tenant_id());
