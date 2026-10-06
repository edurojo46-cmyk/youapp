-- Migration: 20260918000001_atlas_search_projection_v2_discovery_delta.sql
-- Description: Delta projection table for Discovery Industrial V1 (D1K)
-- 
-- PURPOSE:
--   Holds NEW_CANONICAL persons produced by Discovery pipeline.
--   Schema is EXACTLY compatible with Projection V2 certified export.
--   Does NOT modify data_v2_shadow.ms or atlas_argentina_people_search_projection_v1.
--
-- CONSTRAINTS:
--   - Zero FK to atlas_people_discovery_candidates
--   - Zero FK to atlas_observation_subjects  
--   - Links to atlas_person_identity_map via atlas_person_id (soft link, not FK)
--   - REBUILDABLE: dropping this table does not affect any canonical table
--
-- V2 CONTRACT FIELDS (must match export_search_projection_v2.mjs exactly):
--   atlas_person_id, display_name, display_name_normalized, first_name, last_name,
--   role, profession, organization, geography, province, neighborhood,
--   source_ids, search_text_normalized, evidence_state, ranking_weight,
--   last_seen_at, created_at

CREATE TABLE IF NOT EXISTS public.atlas_people_search_projection_v2_discovery_delta (
  -- Primary key: canonical person ID (format: atlas_arg_per_<16hex>)
  atlas_person_id TEXT PRIMARY KEY,

  -- Display fields
  display_name TEXT NOT NULL,
  display_name_normalized TEXT NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',

  -- Professional context
  role TEXT NOT NULL DEFAULT '',
  profession TEXT NOT NULL DEFAULT '',
  organization TEXT NOT NULL DEFAULT '',

  -- Geography
  geography TEXT NOT NULL DEFAULT 'ARGENTINA',
  province TEXT NOT NULL DEFAULT 'BUENOS AIRES',
  neighborhood TEXT NOT NULL DEFAULT '',

  -- Provenance
  source_ids TEXT[] NOT NULL DEFAULT '{}',

  -- Search text (normalized, space-separated tokens)
  search_text_normalized TEXT NOT NULL DEFAULT '',

  -- Evidence quality
  evidence_state TEXT NOT NULL DEFAULT 'IDENTITY_ONLY',
  -- 'IDENTITY_ONLY' | 'DIRECT_CONTACT_EVIDENCE' (matching V2 export values)

  -- Ranking
  ranking_weight INTEGER NOT NULL DEFAULT 100,

  -- Timestamps (epoch ms — matching V2 export format)
  last_seen_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,

  -- Delta metadata (not in V2 export, but useful for delta management)
  discovery_source_id TEXT,
  discovery_decision TEXT DEFAULT 'NEW_CANONICAL',
  indexed_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT chk_discovery_delta_person_id_prefix
    CHECK (atlas_person_id LIKE 'atlas_arg_per_%'),
  CONSTRAINT chk_discovery_delta_evidence_state
    CHECK (evidence_state IN ('IDENTITY_ONLY', 'DIRECT_CONTACT_EVIDENCE'))
);

-- Indexes for search
CREATE INDEX IF NOT EXISTS idx_disc_delta_display_name
  ON public.atlas_people_search_projection_v2_discovery_delta
  USING GIN (to_tsvector('simple', display_name_normalized));

CREATE INDEX IF NOT EXISTS idx_disc_delta_search_text
  ON public.atlas_people_search_projection_v2_discovery_delta
  USING GIN (to_tsvector('simple', search_text_normalized));

CREATE INDEX IF NOT EXISTS idx_disc_delta_organization
  ON public.atlas_people_search_projection_v2_discovery_delta (organization)
  WHERE organization != '';

CREATE INDEX IF NOT EXISTS idx_disc_delta_source
  ON public.atlas_people_search_projection_v2_discovery_delta (discovery_source_id);

CREATE INDEX IF NOT EXISTS idx_disc_delta_last_seen
  ON public.atlas_people_search_projection_v2_discovery_delta (last_seen_at DESC);

-- Row Level Security
ALTER TABLE public.atlas_people_search_projection_v2_discovery_delta
  ENABLE ROW LEVEL SECURITY;

-- Service role: full access
DROP POLICY IF EXISTS "disc_delta_service_role_full" ON public.atlas_people_search_projection_v2_discovery_delta;
CREATE POLICY "disc_delta_service_role_full"
  ON public.atlas_people_search_projection_v2_discovery_delta
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION public.trg_disc_delta_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_disc_delta_updated_at
  ON public.atlas_people_search_projection_v2_discovery_delta;

CREATE TRIGGER trg_disc_delta_updated_at
  BEFORE UPDATE ON public.atlas_people_search_projection_v2_discovery_delta
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_disc_delta_updated_at();

-- Comments
COMMENT ON TABLE public.atlas_people_search_projection_v2_discovery_delta IS
  'Delta search projection for Discovery Industrial V1. '
  'Contains only NEW_CANONICAL persons from D1K pipeline. '
  'Schema is V2-compatible. Does not modify data_v2_shadow.ms. '
  'SSOT: atlas_person_identity_map. REBUILDABLE.';
