-- Revert anon insert/select policies created during pilot debugging
DROP POLICY IF EXISTS "Allow anon insert" ON public.atlas_subject_social_profiles;
DROP POLICY IF EXISTS "Allow anon select" ON public.atlas_subject_social_profiles;

-- Deny all by default for anon (already covered by RLS, but explicitly replacing if needed)
DROP POLICY IF EXISTS "Deny anon insert" ON public.atlas_subject_social_profiles;
DROP POLICY IF EXISTS "Deny anon select" ON public.atlas_subject_social_profiles;

CREATE POLICY "Deny anon insert" ON public.atlas_subject_social_profiles FOR INSERT TO anon WITH CHECK (false);
CREATE POLICY "Deny anon select" ON public.atlas_subject_social_profiles FOR SELECT TO anon USING (false);
