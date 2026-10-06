-- ==============================================================================
-- Migration: 20260915120000_atlas_people_search_normalized.sql
-- Description: Implement unified search_text_normalized projection document
-- Targets: atlas_people_discovery_candidates (display_name, role, organization, profession)
-- Guarantees: SEARCH_DOCUMENT_STALE_ROWS = 0 via BEFORE INSERT/UPDATE trigger
-- Single GIN trigram index eliminating multi-index BitmapOr storms
-- ==============================================================================

-- 1. Add search_text_normalized column if not exists
ALTER TABLE public.atlas_people_discovery_candidates 
ADD COLUMN IF NOT EXISTS search_text_normalized TEXT;

-- 2. Normalization function (IMMUTABLE)
CREATE OR REPLACE FUNCTION public.normalize_search_document(
  p_display_name TEXT,
  p_role TEXT,
  p_organization TEXT,
  p_profession TEXT
) RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN LOWER(
    TRIM(
      REGEXP_REPLACE(
        COALESCE(p_display_name, '') || ' ' ||
        COALESCE(p_role, '') || ' ' ||
        COALESCE(p_organization, '') || ' ' ||
        COALESCE(p_profession, ''),
        '\s+', ' ', 'g'
      )
    )
  );
END;
$$;

-- 3. Trigger to maintain search_text_normalized automatically
CREATE OR REPLACE FUNCTION public.trg_maintain_search_text_normalized()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_text_normalized := public.normalize_search_document(
    NEW.display_name,
    NEW.role,
    NEW.organization,
    NEW.profession
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_atlas_people_search_normalized ON public.atlas_people_discovery_candidates;
CREATE TRIGGER trg_atlas_people_search_normalized
BEFORE INSERT OR UPDATE OF display_name, role, organization, profession
ON public.atlas_people_discovery_candidates
FOR EACH ROW
EXECUTE FUNCTION public.trg_maintain_search_text_normalized();

-- 4. Single dedicated GIN/TRGM index
CREATE INDEX IF NOT EXISTS idx_discovery_candidates_search_normalized_trgm 
  ON public.atlas_people_discovery_candidates 
  USING gin (search_text_normalized gin_trgm_ops);
