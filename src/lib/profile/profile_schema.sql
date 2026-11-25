-- 1. Normalized Source Observations Layer (Never overwritten)
CREATE TABLE IF NOT EXISTS public.atlas_person_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id text,
  atlas_person_id text,
  source_id text,
  source_person_id text,
  source_record_id text,
  field_type text, -- NAME, ALIAS_NAME, PROFESSION, ROLE, TITLE, ORGANIZATION, LOCATION, PROVINCE, MUNICIPALITY, PUBLIC_CONTACT, SOURCE_STATUS, EVENT_DATE
  raw_value text,
  normalized_value text,
  observed_at timestamptz,
  source_published_at timestamptz,
  valid_from date,
  valid_to date,
  evidence_id text,
  ingested_at timestamptz DEFAULT NOW()
);

ALTER TABLE public.atlas_person_observations ADD COLUMN IF NOT EXISTS observation_id text;
ALTER TABLE public.atlas_person_observations ADD COLUMN IF NOT EXISTS atlas_person_id text;
ALTER TABLE public.atlas_person_observations ADD COLUMN IF NOT EXISTS source_person_id text;
ALTER TABLE public.atlas_person_observations ADD COLUMN IF NOT EXISTS field_type text;
ALTER TABLE public.atlas_person_observations ADD COLUMN IF NOT EXISTS raw_value text;
ALTER TABLE public.atlas_person_observations ADD COLUMN IF NOT EXISTS evidence_id text;
ALTER TABLE public.atlas_person_observations ADD COLUMN IF NOT EXISTS source_published_at timestamptz;
ALTER TABLE public.atlas_person_observations ADD COLUMN IF NOT EXISTS ingested_at timestamptz DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_obs_atlas_person_id ON public.atlas_person_observations (atlas_person_id);
CREATE INDEX IF NOT EXISTS idx_obs_observation_id ON public.atlas_person_observations (observation_id);
CREATE INDEX IF NOT EXISTS idx_obs_source_record ON public.atlas_person_observations (source_id, source_record_id);
CREATE INDEX IF NOT EXISTS idx_obs_field_type ON public.atlas_person_observations (field_type);

-- 2. First-Class Temporal Relationships Layer
CREATE TABLE IF NOT EXISTS public.atlas_person_organization_relations (
  relation_id text PRIMARY KEY,
  atlas_person_id text NOT NULL,
  organization_key text NOT NULL,
  organization_name text NOT NULL,
  role text,
  valid_from date,
  valid_to date,
  observation_id text,
  evidence_id text,
  observed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_rel_atlas_person_id ON public.atlas_person_organization_relations (atlas_person_id);
CREATE INDEX IF NOT EXISTS idx_rel_org_key ON public.atlas_person_organization_relations (organization_key);
CREATE INDEX IF NOT EXISTS idx_rel_obs_id ON public.atlas_person_organization_relations (observation_id);

-- 3. Explicit Contradiction / Conflict Registry
CREATE TABLE IF NOT EXISTS public.atlas_person_profile_conflicts (
  conflict_id text PRIMARY KEY,
  atlas_person_id text NOT NULL,
  field_type text NOT NULL,
  observation_a_id text,
  observation_b_id text,
  conflict_reason text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN', -- OPEN, RESOLVED, DISMISSED
  detected_at timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conflicts_person_id ON public.atlas_person_profile_conflicts (atlas_person_id);

-- 4. Derived Canonical Person Profile Projection (1 row per atlas_person_id)
CREATE TABLE IF NOT EXISTS public.atlas_person_profiles (
  atlas_person_id text PRIMARY KEY,
  display_name text,
  professions jsonb DEFAULT '[]'::jsonb,
  current_roles jsonb DEFAULT '[]'::jsonb,
  historical_roles jsonb DEFAULT '[]'::jsonb,
  organizations jsonb DEFAULT '[]'::jsonb,
  locations jsonb DEFAULT '[]'::jsonb,
  public_contacts jsonb DEFAULT '[]'::jsonb,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  source_count int DEFAULT 0,
  evidence_count int DEFAULT 0,
  profile_updated_at timestamptz DEFAULT NOW(),
  provenance jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON public.atlas_person_profiles (profile_updated_at);
