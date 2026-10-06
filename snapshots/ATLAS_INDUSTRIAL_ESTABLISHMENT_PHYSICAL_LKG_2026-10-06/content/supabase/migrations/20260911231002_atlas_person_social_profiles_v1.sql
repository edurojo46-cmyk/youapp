-- 20260911231002_atlas_person_social_profiles_v1.sql
-- Create atlas_person_social_profiles table

CREATE TABLE IF NOT EXISTS public.atlas_person_social_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES public.atlas_people(person_id) ON DELETE CASCADE,
    
    platform_id TEXT NOT NULL REFERENCES public.atlas_social_platforms(id),
    
    profile_url TEXT,
    handle TEXT,
    external_id TEXT,
    
    profile_photo_url TEXT,
    
    identity_status TEXT NOT NULL CHECK (identity_status IN ('VERIFIED', 'PROBABLE', 'POSSIBLE', 'UNVERIFIED')),
    profile_status TEXT NOT NULL CHECK (profile_status IN ('ACTIVE', 'STALE', 'REMOVED', 'UNAVAILABLE')),
    
    is_professional BOOLEAN DEFAULT false,
    
    source_id TEXT NOT NULL,
    source_record_id TEXT NOT NULL,
    
    observed_at TIMESTAMPTZ NOT NULL,
    last_verified_at TIMESTAMPTZ,
    
    confidence NUMERIC,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_atlas_social_person ON public.atlas_person_social_profiles(person_id);
CREATE INDEX IF NOT EXISTS idx_atlas_social_platform ON public.atlas_person_social_profiles(platform_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_social_unique_url ON public.atlas_person_social_profiles(profile_url) WHERE profile_url IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_social_profile_identity ON public.atlas_person_social_profiles(person_id, platform_id, external_id) WHERE external_id IS NOT NULL;

-- RLS
ALTER TABLE public.atlas_person_social_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny anon insert social" ON public.atlas_person_social_profiles;
CREATE POLICY "Deny anon insert social" ON public.atlas_person_social_profiles FOR INSERT TO anon WITH CHECK (false);

DROP POLICY IF EXISTS "Deny anon update social" ON public.atlas_person_social_profiles;
CREATE POLICY "Deny anon update social" ON public.atlas_person_social_profiles FOR UPDATE TO anon WITH CHECK (false);
