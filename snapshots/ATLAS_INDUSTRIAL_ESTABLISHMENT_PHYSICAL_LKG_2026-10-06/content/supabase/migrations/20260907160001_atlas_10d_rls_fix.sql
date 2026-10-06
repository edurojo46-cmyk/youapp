-- 10D RLS Fixes

-- Tenant Isolation Policies for 10D tables
CREATE POLICY atlas_nba_state_tenant_isolation ON public.atlas_next_best_action_state FOR ALL USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY atlas_nba_policies_tenant_isolation ON public.atlas_next_best_action_policies FOR ALL USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY atlas_nba_cost_registry_tenant_isolation ON public.atlas_action_cost_registry FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- Global Shared Tables (No tenant_id). Require active auth role.
CREATE POLICY atlas_subject_registry_all ON public.atlas_subject_registry FOR ALL TO authenticated USING (true);
CREATE POLICY atlas_channel_eligibility_all ON public.atlas_channel_eligibility FOR ALL TO authenticated USING (true);
CREATE POLICY atlas_contact_decisions_all ON public.atlas_contact_decisions FOR ALL TO authenticated USING (true);
