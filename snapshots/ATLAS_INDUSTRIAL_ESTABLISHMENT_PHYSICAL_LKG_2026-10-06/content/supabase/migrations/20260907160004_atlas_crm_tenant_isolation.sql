-- Phase 10D: Security Closure - Add tenant_id to global CRM tables to enforce real tenant isolation

-- 1. atlas_contacts
ALTER TABLE public.atlas_contacts ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.atlas_contacts DROP CONSTRAINT IF EXISTS atlas_contacts_email_hash_key;
ALTER TABLE public.atlas_contacts ADD CONSTRAINT atlas_contacts_tenant_email_hash_key UNIQUE (tenant_id, email_hash);

ALTER TABLE public.atlas_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS atlas_contacts_tenant_isolation ON public.atlas_contacts;
CREATE POLICY atlas_contacts_tenant_isolation ON public.atlas_contacts FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- 2. atlas_audience_searches
ALTER TABLE public.atlas_audience_searches ADD COLUMN IF NOT EXISTS tenant_id UUID;

ALTER TABLE public.atlas_audience_searches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS atlas_audience_searches_tenant_isolation ON public.atlas_audience_searches;
CREATE POLICY atlas_audience_searches_tenant_isolation ON public.atlas_audience_searches FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- 3. atlas_audience_matches
ALTER TABLE public.atlas_audience_matches ADD COLUMN IF NOT EXISTS tenant_id UUID;

ALTER TABLE public.atlas_audience_matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS atlas_audience_matches_tenant_isolation ON public.atlas_audience_matches;
CREATE POLICY atlas_audience_matches_tenant_isolation ON public.atlas_audience_matches FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- 4. atlas_contact_decisions
ALTER TABLE public.atlas_contact_decisions ADD COLUMN IF NOT EXISTS tenant_id UUID;

ALTER TABLE public.atlas_contact_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS atlas_contact_decisions_all ON public.atlas_contact_decisions;
DROP POLICY IF EXISTS atlas_contact_decisions_tenant_isolation ON public.atlas_contact_decisions;
CREATE POLICY atlas_contact_decisions_tenant_isolation ON public.atlas_contact_decisions FOR ALL USING (tenant_id = public.get_auth_tenant_id());
