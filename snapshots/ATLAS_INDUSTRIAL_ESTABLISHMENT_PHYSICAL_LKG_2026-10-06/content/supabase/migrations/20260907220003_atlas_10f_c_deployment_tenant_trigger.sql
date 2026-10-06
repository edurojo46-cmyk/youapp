-- 1. Create trigger on auth.users to auto-provision atlas_tenants
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
