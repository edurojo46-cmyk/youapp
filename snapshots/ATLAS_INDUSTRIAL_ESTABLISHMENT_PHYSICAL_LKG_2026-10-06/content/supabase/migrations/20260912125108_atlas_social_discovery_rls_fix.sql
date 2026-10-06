-- Allow anon inserts for test environment pilot
DROP POLICY IF EXISTS "Deny anon insert" ON public.atlas_subject_social_profiles;
CREATE POLICY "Allow anon insert" ON public.atlas_subject_social_profiles FOR ALL TO anon USING (true);
