-- ==============================================================================
-- Migration: 20260914180000_atlas_search_trgm_indexes.sql
-- Description: Enable pg_trgm and add GIN trigram indexes for high-speed ILIKE text search
-- Targets: atlas_people_discovery_candidates (display_name, organization, role, profession)
-- ==============================================================================

-- 1. Enable pg_trgm extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. GIN trigram index on display_name
CREATE INDEX IF NOT EXISTS idx_discovery_candidates_display_name_trgm 
  ON public.atlas_people_discovery_candidates 
  USING gin (display_name gin_trgm_ops);

-- 3. GIN trigram index on organization
CREATE INDEX IF NOT EXISTS idx_discovery_candidates_org_trgm 
  ON public.atlas_people_discovery_candidates 
  USING gin (organization gin_trgm_ops);

-- 4. GIN trigram index on role
CREATE INDEX IF NOT EXISTS idx_discovery_candidates_role_trgm 
  ON public.atlas_people_discovery_candidates 
  USING gin (role gin_trgm_ops);

-- 5. GIN trigram index on profession
CREATE INDEX IF NOT EXISTS idx_discovery_candidates_profession_trgm 
  ON public.atlas_people_discovery_candidates 
  USING gin (profession gin_trgm_ops);
