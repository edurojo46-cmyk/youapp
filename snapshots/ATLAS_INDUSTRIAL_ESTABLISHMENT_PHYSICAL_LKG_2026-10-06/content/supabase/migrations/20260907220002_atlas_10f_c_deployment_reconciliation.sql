-- 1. Create atlas_tenants to satisfy the FK requirement
CREATE TABLE IF NOT EXISTS public.atlas_tenants (
    tenant_id UUID PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backfill known tenants to satisfy FK
INSERT INTO public.atlas_tenants (tenant_id)
SELECT DISTINCT tenant_id FROM public.atlas_outreach_suppressions
ON CONFLICT DO NOTHING;

INSERT INTO public.atlas_tenants (tenant_id)
SELECT DISTINCT tenant_id FROM public.atlas_execution_jit_authorizations
ON CONFLICT DO NOTHING;

-- 1b. Create trigger on auth.users to auto-provision atlas_tenants
CREATE OR REPLACE FUNCTION public.trg_auto_provision_tenant()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.atlas_tenants (tenant_id) VALUES (NEW.id)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.trg_auto_provision_tenant();

-- 2. Add FK to atlas_outreach_suppressions for tenant integrity
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'atlas_outreach_suppressions_tenant_id_fkey'
    ) THEN
        ALTER TABLE public.atlas_outreach_suppressions
            ADD CONSTRAINT atlas_outreach_suppressions_tenant_id_fkey
            FOREIGN KEY (tenant_id) REFERENCES public.atlas_tenants(tenant_id)
            ON DELETE CASCADE;
    END IF;
END $$;

-- 3. Add FK to atlas_execution_jit_authorizations (optional but good for consistency)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'atlas_execution_jit_authorizations_tenant_id_fkey'
    ) THEN
        ALTER TABLE public.atlas_execution_jit_authorizations
            ADD CONSTRAINT atlas_execution_jit_authorizations_tenant_id_fkey
            FOREIGN KEY (tenant_id) REFERENCES public.atlas_tenants(tenant_id)
            ON DELETE CASCADE;
    END IF;
END $$;

-- 4. Revoke PUBLIC execute on the SECURITY DEFINER RPC to prevent accidental public execution
REVOKE EXECUTE ON FUNCTION public.authorize_execution_jit(jsonb) FROM PUBLIC;

-- 5. Explicitly grant execute only to intended trusted roles
GRANT EXECUTE ON FUNCTION public.authorize_execution_jit(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.authorize_execution_jit(jsonb) TO authenticated;
