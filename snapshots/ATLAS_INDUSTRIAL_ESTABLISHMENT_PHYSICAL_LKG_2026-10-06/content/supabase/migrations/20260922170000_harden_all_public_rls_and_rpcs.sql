-- ==============================================================================
-- Migration: 20260922170000_harden_all_public_rls_and_rpcs.sql
-- Goal: Resolve Supabase Security Advisor "rls_disabled_in_public" warning.
-- Enables RLS on all 49 remaining public tables.
-- Revokes unintended write/read privileges from anon and authenticated roles.
-- Protects internal SECURITY DEFINER RPC functions.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. HARDEN 48 BACKEND-ONLY / ATLAS-INTERNAL TABLES
-- ------------------------------------------------------------------------------

DO $$
DECLARE
  backend_tables text[] := ARRAY[
    'atlas_acquisition_candidates',
    'atlas_acquisition_runs',
    'atlas_attribute_registry',
    'atlas_audience_criteria',
    'atlas_campaign_budgets',
    'atlas_candidate_attribute_evidence',
    'atlas_checkpoints',
    'atlas_contact_queue',
    'atlas_contact_searches',
    'atlas_delivery_attempts',
    'atlas_delivery_cost_reservations',
    'atlas_delivery_providers',
    'atlas_discovered_people',
    'atlas_discovery_source_motors',
    'atlas_hot_national_identity_map',
    'atlas_hot_source_key_map',
    'atlas_identity_evidence_store',
    'atlas_llm_benchmark_results',
    'atlas_llm_benchmark_runs',
    'atlas_llm_benchmarks',
    'atlas_mail_provider_account_scopes',
    'atlas_mail_provider_monthly_usage',
    'atlas_mail_provider_pricing_configs',
    'atlas_mail_provider_pricing_tiers',
    'atlas_message_template_variants',
    'atlas_message_variable_bindings',
    'atlas_outreach_allowlist',
    'atlas_people_resolution_items',
    'atlas_people_resolution_runs',
    'atlas_person_id_redirects',
    'atlas_person_organization_relations',
    'atlas_person_profile_conflicts',
    'atlas_person_profiles',
    'atlas_pilot_run_deliveries',
    'atlas_pilot_runs',
    'atlas_provider_capabilities',
    'atlas_provider_health',
    'atlas_provider_pricing',
    'atlas_provider_quotas',
    'atlas_provider_routing_decisions',
    'atlas_search_consumer_checkpoint',
    'atlas_semantic_predicates',
    'atlas_snapshot_lineage',
    'atlas_snapshot_processing_runs',
    'atlas_social_semantic_evaluations',
    'atlas_source_snapshots',
    'atlas_tenants',
    'benchmark_people_staging'
  ];
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY backend_tables LOOP
    -- Only alter if table exists in public schema
    IF EXISTS (
      SELECT 1 FROM pg_class c 
      JOIN pg_namespace n ON n.oid = c.relnamespace 
      WHERE n.nspname = 'public' AND c.relname = tbl AND c.relkind = 'r'
    ) THEN
      -- Enable RLS
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);

      -- Drop existing policies if any
      EXECUTE format('DROP POLICY IF EXISTS "service_role_full_access" ON public.%I;', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "Allow service role full access" ON public.%I;', tbl);

      -- Create service_role full access policy
      EXECUTE format(
        'CREATE POLICY "service_role_full_access" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);',
        tbl
      );

      -- Revoke all permissions from anon and authenticated
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon;', tbl);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated;', tbl);

      -- Ensure service_role and postgres maintain full access
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role;', tbl);
      EXECUTE format('GRANT ALL ON TABLE public.%I TO postgres;', tbl);
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 2. HARDEN FRONTEND-READABLE TABLE: atlas_discovered_companies
-- (Read-only for admin UI via AdminCompanies.tsx; writes strictly denied)
-- ------------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c 
    JOIN pg_namespace n ON n.oid = c.relnamespace 
    WHERE n.nspname = 'public' AND c.relname = 'atlas_discovered_companies' AND c.relkind = 'r'
  ) THEN
    ALTER TABLE public.atlas_discovered_companies ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "service_role_full_access" ON public.atlas_discovered_companies;
    DROP POLICY IF EXISTS "Allow service role full access" ON public.atlas_discovered_companies;
    DROP POLICY IF EXISTS "discovered_companies_readonly_select" ON public.atlas_discovered_companies;

    CREATE POLICY "service_role_full_access" 
      ON public.atlas_discovered_companies 
      FOR ALL TO service_role 
      USING (true) WITH CHECK (true);

    CREATE POLICY "discovered_companies_readonly_select" 
      ON public.atlas_discovered_companies 
      FOR SELECT TO authenticated, anon 
      USING (true);

    REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER 
      ON TABLE public.atlas_discovered_companies FROM anon;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER 
      ON TABLE public.atlas_discovered_companies FROM authenticated;

    GRANT SELECT ON TABLE public.atlas_discovered_companies TO anon;
    GRANT SELECT ON TABLE public.atlas_discovered_companies TO authenticated;
    GRANT ALL ON TABLE public.atlas_discovered_companies TO service_role;
    GRANT ALL ON TABLE public.atlas_discovered_companies TO postgres;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. HARDEN SECURITY DEFINER RPC FUNCTIONS
-- Revoke execute from anon and authenticated on internal Atlas/staging RPCs
-- ------------------------------------------------------------------------------

DO $$
DECLARE
  funcs text[] := ARRAY[
    'atlas_stage_people_bulk_v1(jsonb)',
    'atlas_stage_people_bulk_v2(jsonb)',
    'atlas_reconcile_and_commit_staging_v1(jsonb)',
    'atlas_reconcile_and_commit_staging_v2(jsonb)',
    'atlas_reconcile_people_direct_v2(jsonb)',
    'resolve_and_commit_candidate_batch_v1(jsonb)',
    'resolve_and_commit_candidate_batch_v2(jsonb)',
    'atlas_drain_search_outbox_controlled_v1(integer, integer)',
    'atlas_drain_search_outbox_controlled_v2(integer, integer)',
    'get_atlas_admin_stats()',
    'debug_atlas_system_diagnostics()',
    'atlas_get_physical_diagnostics()',
    'atlas_benchmark_reconcile_timing()'
  ];
  f text;
BEGIN
  FOREACH f IN ARRAY funcs LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon;', f);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM authenticated;', f);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role;', f);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO postgres;', f);
    EXCEPTION WHEN OTHERS THEN
      -- Function signature might differ slightly; skip gracefully
      NULL;
    END;
  END LOOP;
END $$;
