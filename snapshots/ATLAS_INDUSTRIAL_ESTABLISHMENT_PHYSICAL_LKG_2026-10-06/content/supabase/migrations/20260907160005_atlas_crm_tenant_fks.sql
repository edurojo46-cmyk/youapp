-- Phase 10D: Security Closure - Multi-Tenant Integrity
-- 1. Explicitly drop legacy orphan rows to ensure NOT NULL constraint can be applied
DELETE FROM public.atlas_contact_decisions WHERE tenant_id IS NULL;
DELETE FROM public.atlas_audience_matches WHERE tenant_id IS NULL;
DELETE FROM public.atlas_audience_criteria WHERE search_id IN (SELECT id FROM public.atlas_audience_searches WHERE tenant_id IS NULL);
DELETE FROM public.atlas_audience_searches WHERE tenant_id IS NULL;
DELETE FROM public.atlas_subject_registry WHERE company_id IN (SELECT contact_id FROM public.atlas_contacts WHERE tenant_id IS NULL);
DELETE FROM public.atlas_contacts WHERE tenant_id IS NULL;

-- 2. Set tenant_id NOT NULL
ALTER TABLE public.atlas_contacts ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.atlas_audience_searches ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.atlas_audience_matches ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.atlas_contact_decisions ALTER COLUMN tenant_id SET NOT NULL;

-- 3. Add composite unique constraints for tenant-aware FKs
ALTER TABLE public.atlas_contacts ADD CONSTRAINT atlas_contacts_tenant_id_contact_id_key UNIQUE (tenant_id, contact_id);
ALTER TABLE public.atlas_audience_searches ADD CONSTRAINT atlas_audience_searches_tenant_id_id_key UNIQUE (tenant_id, id);
ALTER TABLE public.atlas_audience_matches ADD CONSTRAINT atlas_audience_matches_tenant_id_id_key UNIQUE (tenant_id, id);

-- 4. Recreate Foreign Keys as composite tenant-aware FKs

-- atlas_audience_matches
ALTER TABLE public.atlas_audience_matches DROP CONSTRAINT IF EXISTS atlas_audience_matches_search_id_fkey;
ALTER TABLE public.atlas_audience_matches ADD CONSTRAINT atlas_audience_matches_tenant_search_fkey FOREIGN KEY (tenant_id, search_id) REFERENCES public.atlas_audience_searches(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE public.atlas_audience_matches DROP CONSTRAINT IF EXISTS atlas_audience_matches_candidate_id_fkey;
ALTER TABLE public.atlas_audience_matches ADD CONSTRAINT atlas_audience_matches_tenant_contact_fkey FOREIGN KEY (tenant_id, candidate_id) REFERENCES public.atlas_contacts(tenant_id, contact_id) ON DELETE CASCADE;

-- atlas_contact_decisions
ALTER TABLE public.atlas_contact_decisions DROP CONSTRAINT IF EXISTS atlas_contact_decisions_candidate_id_fkey;
ALTER TABLE public.atlas_contact_decisions ADD CONSTRAINT atlas_contact_decisions_tenant_candidate_fkey FOREIGN KEY (tenant_id, candidate_id) REFERENCES public.atlas_contacts(tenant_id, contact_id) ON DELETE CASCADE;

ALTER TABLE public.atlas_contact_decisions DROP CONSTRAINT IF EXISTS atlas_contact_decisions_canonical_contact_id_fkey;
ALTER TABLE public.atlas_contact_decisions ADD CONSTRAINT atlas_contact_decisions_tenant_canonical_fkey FOREIGN KEY (tenant_id, canonical_contact_id) REFERENCES public.atlas_contacts(tenant_id, contact_id) ON DELETE CASCADE;

ALTER TABLE public.atlas_contact_decisions DROP CONSTRAINT IF EXISTS atlas_contact_decisions_audience_search_id_fkey;
ALTER TABLE public.atlas_contact_decisions ADD CONSTRAINT atlas_contact_decisions_tenant_search_fkey FOREIGN KEY (tenant_id, audience_search_id) REFERENCES public.atlas_audience_searches(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE public.atlas_contact_decisions DROP CONSTRAINT IF EXISTS atlas_contact_decisions_audience_match_id_fkey;
ALTER TABLE public.atlas_contact_decisions ADD CONSTRAINT atlas_contact_decisions_tenant_match_fkey FOREIGN KEY (tenant_id, audience_match_id) REFERENCES public.atlas_audience_matches(tenant_id, id) ON DELETE CASCADE;
