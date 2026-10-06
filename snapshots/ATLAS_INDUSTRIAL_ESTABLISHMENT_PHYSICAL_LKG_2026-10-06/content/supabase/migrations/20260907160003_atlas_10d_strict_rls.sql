-- Fix RLS policies for atlas_people and related tables to allow full tenant access

DROP POLICY IF EXISTS atlas_people_tenant_isolation ON public.atlas_people;
CREATE POLICY atlas_people_tenant_isolation ON public.atlas_people 
FOR ALL USING (tenant_id = public.get_auth_tenant_id()) WITH CHECK (tenant_id = public.get_auth_tenant_id());

DROP POLICY IF EXISTS atlas_person_identifiers_tenant_isolation ON public.atlas_person_identifiers;
CREATE POLICY atlas_person_identifiers_tenant_isolation ON public.atlas_person_identifiers 
FOR ALL USING (tenant_id = public.get_auth_tenant_id()) WITH CHECK (tenant_id = public.get_auth_tenant_id());

DROP POLICY IF EXISTS atlas_person_evidence_tenant_isolation ON public.atlas_person_attribute_evidence;
CREATE POLICY atlas_person_evidence_tenant_isolation ON public.atlas_person_attribute_evidence 
FOR ALL USING (tenant_id = public.get_auth_tenant_id()) WITH CHECK (tenant_id = public.get_auth_tenant_id());

DROP POLICY IF EXISTS atlas_person_coverage_tenant_isolation ON public.atlas_person_coverage;
CREATE POLICY atlas_person_coverage_tenant_isolation ON public.atlas_person_coverage 
FOR ALL USING (tenant_id = public.get_auth_tenant_id()) WITH CHECK (tenant_id = public.get_auth_tenant_id());
