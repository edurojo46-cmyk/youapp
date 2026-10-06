-- Drop any existing generic ALL policy that allowed authenticated users to bypass
DROP POLICY IF EXISTS "Allow public read atlas_admin_memberships" ON public.atlas_admin_memberships;

-- Only allow authenticated users to SELECT (read)
CREATE POLICY "Allow auth read atlas_admin_memberships" ON public.atlas_admin_memberships
FOR SELECT TO authenticated USING (true);

-- Ensure anon cannot do anything
-- The default deny applies, but let's be explicit for mutations
-- Ensure mutations (INSERT/UPDATE/DELETE) are only allowed by service_role
CREATE POLICY "Service role can mutate atlas_admin_memberships" ON public.atlas_admin_memberships
FOR ALL USING (auth.role() = 'service_role');
