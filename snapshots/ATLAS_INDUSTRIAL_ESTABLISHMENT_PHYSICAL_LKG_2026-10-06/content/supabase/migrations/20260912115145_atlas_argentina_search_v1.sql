-- 20260912115145_atlas_argentina_search_v1.sql

-- 1. Stable Observation Subjects
CREATE TABLE IF NOT EXISTS public.atlas_observation_subjects (
    subject_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id TEXT NOT NULL,
    subject_external_key TEXT NOT NULL,
    
    canonical_person_id UUID REFERENCES public.atlas_people(person_id) ON DELETE SET NULL,
    
    identity_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
    
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(source_id, subject_external_key)
);

CREATE INDEX IF NOT EXISTS idx_atlas_obs_subj_canonical ON public.atlas_observation_subjects(canonical_person_id);

-- 2. Subject Geographies (Evidence-linked)
CREATE TABLE IF NOT EXISTS public.atlas_subject_geographies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES public.atlas_observation_subjects(subject_id) ON DELETE CASCADE,
    geography_id UUID NOT NULL REFERENCES public.atlas_geographies(geography_id) ON DELETE CASCADE,
    
    relation_type TEXT NOT NULL, -- PUBLIC_ROLE_IN, WORKS_IN, RESIDES_IN, etc.
    
    evidence_observation_id UUID REFERENCES public.atlas_person_observations(id) ON DELETE SET NULL,
    source_id TEXT NOT NULL,
    source_url TEXT,
    
    verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
    confidence NUMERIC,
    
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(subject_id, geography_id, relation_type)
);

-- 3. Subject Social Profiles (Pre-canonical)
CREATE TABLE IF NOT EXISTS public.atlas_subject_social_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES public.atlas_observation_subjects(subject_id) ON DELETE CASCADE,
    platform_id TEXT NOT NULL REFERENCES public.atlas_social_platforms(id) ON DELETE CASCADE,
    
    profile_url TEXT NOT NULL,
    handle TEXT,
    
    identity_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
    profile_status TEXT NOT NULL DEFAULT 'ACTIVE',
    
    source_id TEXT NOT NULL,
    source_record_id TEXT NOT NULL,
    evidence_observation_id UUID REFERENCES public.atlas_person_observations(id) ON DELETE SET NULL,
    
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ,
    confidence NUMERIC,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(subject_id, platform_id, profile_url)
);

-- 4. Unified Social Profiles View
CREATE OR REPLACE VIEW public.atlas_all_social_profiles AS
SELECT 
    'CANONICAL' as origin_type,
    person_id as entity_id,
    platform_id,
    profile_url,
    handle,
    identity_status
FROM public.atlas_person_social_profiles
UNION ALL
SELECT 
    'SUBJECT' as origin_type,
    subject_id as entity_id,
    platform_id,
    profile_url,
    handle,
    identity_status
FROM public.atlas_subject_social_profiles;

-- 5. Search Projection Table
CREATE TABLE IF NOT EXISTS public.atlas_argentina_people_search_projection_v1 (
    subject_id UUID PRIMARY KEY, -- Maps to canonical_person_id OR subject_id
    canonical_person_id UUID REFERENCES public.atlas_people(person_id) ON DELETE SET NULL,
    
    origin_type TEXT NOT NULL, -- CANONICAL_PERSON, OBSERVATION_ONLY, CANONICAL_PLUS_OBSERVATION
    
    display_name TEXT,
    person_category TEXT,
    profession TEXT,
    role TEXT,
    organization TEXT,
    
    geography_id UUID REFERENCES public.atlas_geographies(geography_id) ON DELETE SET NULL,
    geography_name TEXT,
    relation_type TEXT,
    
    photo_url TEXT,
    social_profiles JSONB DEFAULT '[]'::jsonb,
    
    source_id TEXT,
    source_url TEXT,
    
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    identity_status TEXT,
    verification_status TEXT,
    match_reason TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Search Projection Indexes
CREATE INDEX IF NOT EXISTS idx_atlas_srch_proj_geo ON public.atlas_argentina_people_search_projection_v1(geography_id);
CREATE INDEX IF NOT EXISTS idx_atlas_srch_proj_rel ON public.atlas_argentina_people_search_projection_v1(relation_type);
CREATE INDEX IF NOT EXISTS idx_atlas_srch_proj_source ON public.atlas_argentina_people_search_projection_v1(source_id);
CREATE INDEX IF NOT EXISTS idx_atlas_srch_proj_name_trgm ON public.atlas_argentina_people_search_projection_v1 USING gin (display_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_atlas_srch_proj_socials ON public.atlas_argentina_people_search_projection_v1 USING gin (social_profiles);

-- 6. Thin stable API View over Projection
CREATE OR REPLACE VIEW public.atlas_argentina_people_search_v1 AS
SELECT * FROM public.atlas_argentina_people_search_projection_v1;

-- RLS
ALTER TABLE public.atlas_observation_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_subject_geographies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_subject_social_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_argentina_people_search_projection_v1 ENABLE ROW LEVEL SECURITY;

-- Allow anon read on search projection for now
CREATE POLICY "Allow public read search projection" ON public.atlas_argentina_people_search_projection_v1 FOR SELECT TO anon USING (true);
CREATE POLICY "Allow auth read search projection" ON public.atlas_argentina_people_search_projection_v1 FOR SELECT TO authenticated USING (true);

-- Deny writes from anon
CREATE POLICY "Deny anon insert" ON public.atlas_observation_subjects FOR ALL TO anon USING (false);
CREATE POLICY "Deny anon insert" ON public.atlas_subject_geographies FOR ALL TO anon USING (false);
CREATE POLICY "Deny anon insert" ON public.atlas_subject_social_profiles FOR ALL TO anon USING (false);
