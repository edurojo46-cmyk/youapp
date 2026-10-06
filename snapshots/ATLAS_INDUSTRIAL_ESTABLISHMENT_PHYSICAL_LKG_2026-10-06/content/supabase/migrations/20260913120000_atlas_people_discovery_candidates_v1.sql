-- ==============================================================================
-- Migration: 20260913120000_atlas_people_discovery_candidates_v1.sql
-- Description: Durable Atlas Discovery Index V1 (Supabase Postgres)
-- Constraints:
--   1. ZERO CANONICAL DELTA: Completely isolated from people_subjects, person_observations, etc.
--   2. ZERO FOREIGN KEYS to canonical identity tables.
--   3. SOURCE-SCOPED IDENTITY: UNIQUE(source_id, source_record_id).
--   4. RAW_DNI = 0, RAW_CUIL = 0: No sensitive national IDs stored.
--   5. REBUILDABLE: Dropping or truncating this table does not affect canonical tables.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_people_discovery_candidates (
  discovery_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  profession TEXT,
  occupation TEXT,
  activity TEXT,
  role TEXT,
  organization TEXT,
  geography_id TEXT DEFAULT 'caba_comuna_6_caballito',
  neighborhood TEXT NOT NULL DEFAULT 'Caballito',
  location_relation_type TEXT NOT NULL,
  location_evidence TEXT NOT NULL,
  location_source_url TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  person_source_url TEXT NOT NULL,
  current_activity_state TEXT DEFAULT 'ACTIVE',
  public_email TEXT,
  email_type TEXT,
  email_source_url TEXT,
  public_phone TEXT,
  phone_type TEXT,
  phone_source_url TEXT,
  website TEXT,
  social_profiles JSONB DEFAULT '[]'::jsonb,
  evidence_strength TEXT DEFAULT 'MEDIUM',
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  source_last_checked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_discovery_candidate_source UNIQUE (source_id, source_record_id)
);

-- Common Query Performance Indexes (Directive Section 17)
CREATE INDEX IF NOT EXISTS idx_discovery_candidates_neighborhood 
  ON public.atlas_people_discovery_candidates (neighborhood);

CREATE INDEX IF NOT EXISTS idx_discovery_candidates_geography_id 
  ON public.atlas_people_discovery_candidates (geography_id);

CREATE INDEX IF NOT EXISTS idx_discovery_candidates_profession 
  ON public.atlas_people_discovery_candidates (profession);

CREATE INDEX IF NOT EXISTS idx_discovery_candidates_organization 
  ON public.atlas_people_discovery_candidates (organization);

CREATE INDEX IF NOT EXISTS idx_discovery_candidates_location_relation 
  ON public.atlas_people_discovery_candidates (location_relation_type);

CREATE INDEX IF NOT EXISTS idx_discovery_candidates_source_id 
  ON public.atlas_people_discovery_candidates (source_id);

CREATE INDEX IF NOT EXISTS idx_discovery_candidates_activity_state 
  ON public.atlas_people_discovery_candidates (current_activity_state);

CREATE INDEX IF NOT EXISTS idx_discovery_candidates_email 
  ON public.atlas_people_discovery_candidates (public_email) 
  WHERE public_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_discovery_candidates_phone 
  ON public.atlas_people_discovery_candidates (public_phone) 
  WHERE public_phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_discovery_candidates_last_seen 
  ON public.atlas_people_discovery_candidates (last_seen_at DESC);

-- Row Level Security (Directive Section 16)
ALTER TABLE public.atlas_people_discovery_candidates ENABLE ROW LEVEL SECURITY;

-- Read policy: Public / authenticated users can search discovery candidates
DROP POLICY IF EXISTS "Allow public read for discovery search" ON public.atlas_people_discovery_candidates;
CREATE POLICY "Allow public read for discovery search" 
  ON public.atlas_people_discovery_candidates 
  FOR SELECT 
  USING (true);

-- Write policy: Restricted to service_role only (server-side operations)
DROP POLICY IF EXISTS "Allow service role write access" ON public.atlas_people_discovery_candidates;
CREATE POLICY "Allow service role write access" 
  ON public.atlas_people_discovery_candidates 
  FOR ALL 
  TO service_role 
  USING (true) 
  WITH CHECK (true);

-- RPC for atomic source-scoped discovery upsert & invariant counting
CREATE OR REPLACE FUNCTION public.upsert_discovery_candidate_v1(
  p_candidate JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_id TEXT := p_candidate->>'source_id';
  v_source_record_id TEXT := p_candidate->>'source_record_id';
  v_discovery_id TEXT := p_candidate->>'discovery_id';
  v_existing_id TEXT;
  v_is_insert BOOLEAN := false;
BEGIN
  -- Check existing candidate by deterministic source key
  SELECT discovery_id INTO v_existing_id
  FROM public.atlas_people_discovery_candidates
  WHERE source_id = v_source_id AND source_record_id = v_source_record_id;

  IF v_existing_id IS NULL THEN
    v_is_insert := true;
    INSERT INTO public.atlas_people_discovery_candidates (
      discovery_id,
      display_name,
      profession,
      occupation,
      activity,
      role,
      organization,
      geography_id,
      neighborhood,
      location_relation_type,
      location_evidence,
      location_source_url,
      source_id,
      source_record_id,
      person_source_url,
      current_activity_state,
      public_email,
      email_type,
      email_source_url,
      public_phone,
      phone_type,
      phone_source_url,
      website,
      social_profiles,
      evidence_strength,
      first_seen_at,
      last_seen_at,
      source_last_checked_at,
      created_at,
      updated_at
    ) VALUES (
      COALESCE(v_discovery_id, 'disc_' || v_source_id || '_' || v_source_record_id),
      p_candidate->>'display_name',
      p_candidate->>'profession',
      p_candidate->>'occupation',
      p_candidate->>'activity',
      p_candidate->>'role',
      p_candidate->>'organization',
      COALESCE(p_candidate->>'geography_id', 'caba_comuna_6_caballito'),
      COALESCE(p_candidate->>'neighborhood', 'Caballito'),
      p_candidate->>'location_relation_type',
      p_candidate->>'location_evidence',
      p_candidate->>'location_source_url',
      v_source_id,
      v_source_record_id,
      p_candidate->>'person_source_url',
      COALESCE(p_candidate->>'current_activity_state', 'ACTIVE'),
      p_candidate->>'public_email',
      p_candidate->>'email_type',
      p_candidate->>'email_source_url',
      p_candidate->>'public_phone',
      p_candidate->>'phone_type',
      p_candidate->>'phone_source_url',
      p_candidate->>'website',
      COALESCE(p_candidate->'social_profiles', '[]'::jsonb),
      COALESCE(p_candidate->>'evidence_strength', 'MEDIUM'),
      COALESCE((p_candidate->>'first_seen_at')::TIMESTAMPTZ, NOW()),
      COALESCE((p_candidate->>'last_seen_at')::TIMESTAMPTZ, NOW()),
      COALESCE((p_candidate->>'source_last_checked_at')::TIMESTAMPTZ, NOW()),
      NOW(),
      NOW()
    );
  ELSE
    UPDATE public.atlas_people_discovery_candidates SET
      display_name = COALESCE(p_candidate->>'display_name', display_name),
      profession = COALESCE(p_candidate->>'profession', profession),
      occupation = COALESCE(p_candidate->>'occupation', occupation),
      activity = COALESCE(p_candidate->>'activity', activity),
      role = COALESCE(p_candidate->>'role', role),
      organization = COALESCE(p_candidate->>'organization', organization),
      location_relation_type = COALESCE(p_candidate->>'location_relation_type', location_relation_type),
      location_evidence = COALESCE(p_candidate->>'location_evidence', location_evidence),
      location_source_url = COALESCE(p_candidate->>'location_source_url', location_source_url),
      person_source_url = COALESCE(p_candidate->>'person_source_url', person_source_url),
      current_activity_state = COALESCE(p_candidate->>'current_activity_state', current_activity_state),
      public_email = COALESCE(p_candidate->>'public_email', public_email),
      email_type = COALESCE(p_candidate->>'email_type', email_type),
      email_source_url = COALESCE(p_candidate->>'email_source_url', email_source_url),
      public_phone = COALESCE(p_candidate->>'public_phone', public_phone),
      phone_type = COALESCE(p_candidate->>'phone_type', phone_type),
      phone_source_url = COALESCE(p_candidate->>'phone_source_url', phone_source_url),
      website = COALESCE(p_candidate->>'website', website),
      social_profiles = COALESCE(p_candidate->'social_profiles', social_profiles),
      evidence_strength = COALESCE(p_candidate->>'evidence_strength', evidence_strength),
      last_seen_at = COALESCE((p_candidate->>'last_seen_at')::TIMESTAMPTZ, NOW()),
      source_last_checked_at = NOW(),
      updated_at = NOW()
    WHERE source_id = v_source_id AND source_record_id = v_source_record_id;
  END IF;

  RETURN jsonb_build_object(
    'is_insert', v_is_insert,
    'source_id', v_source_id,
    'source_record_id', v_source_record_id
  );
END;
$$;
