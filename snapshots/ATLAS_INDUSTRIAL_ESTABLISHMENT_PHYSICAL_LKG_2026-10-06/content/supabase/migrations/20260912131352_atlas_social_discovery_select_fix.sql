-- Allow anon select for projection script
CREATE POLICY "Allow anon select" ON public.atlas_subject_social_profiles FOR SELECT TO anon USING (true);
