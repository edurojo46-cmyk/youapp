-- 20260912122104_atlas_age_and_facets_v1.sql

-- 1. Add new columns to projection table
ALTER TABLE public.atlas_argentina_people_search_projection_v1
ADD COLUMN IF NOT EXISTS age_evidence_type TEXT, -- EXACT_DOB, BIRTH_YEAR, REPORTED_AGE, SUPPORTED_RANGE, UNKNOWN
ADD COLUMN IF NOT EXISTS age_min_current INTEGER,
ADD COLUMN IF NOT EXISTS age_max_current INTEGER,
ADD COLUMN IF NOT EXISTS birth_date DATE,
ADD COLUMN IF NOT EXISTS birth_year INTEGER,
ADD COLUMN IF NOT EXISTS reported_age INTEGER,
ADD COLUMN IF NOT EXISTS reported_age_observed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS normalized_profession_id TEXT;

-- 2. Create indices for faceted search on the new columns
CREATE INDEX IF NOT EXISTS idx_atlas_arg_people_age_min ON public.atlas_argentina_people_search_projection_v1(age_min_current);
CREATE INDEX IF NOT EXISTS idx_atlas_arg_people_age_max ON public.atlas_argentina_people_search_projection_v1(age_max_current);
CREATE INDEX IF NOT EXISTS idx_atlas_arg_people_norm_prof ON public.atlas_argentina_people_search_projection_v1(normalized_profession_id);

-- 3. Replace the existing VIEW to include the new columns
DROP VIEW IF EXISTS public.atlas_argentina_people_search_v1;
CREATE VIEW public.atlas_argentina_people_search_v1 AS
SELECT 
    subject_id,
    display_name,
    geography_id,
    geography_name,
    relation_type,
    organization,
    role,
    profession,
    normalized_profession_id,
    age_evidence_type,
    age_min_current,
    age_max_current,
    birth_date,
    birth_year,
    reported_age,
    reported_age_observed_at,
    source_id,
    source_url,
    observed_at,
    social_profiles
FROM public.atlas_argentina_people_search_projection_v1;

-- 4. Create the Faceted Search RPC
-- We will build this as a PL/pgSQL function to allow dynamic filtering and distinct subject counting.
-- The function returns a JSON object containing { results, total_matching_subjects, facets, next_cursor }

CREATE OR REPLACE FUNCTION public.search_argentina_people_v1(
    p_age_min INTEGER DEFAULT NULL,
    p_age_max INTEGER DEFAULT NULL,
    p_geography_id UUID DEFAULT NULL,
    p_profession_ids TEXT[] DEFAULT NULL,
    p_relation_types TEXT[] DEFAULT NULL,
    p_social_platforms TEXT[] DEFAULT NULL,
    p_source_ids TEXT[] DEFAULT NULL,
    p_limit INTEGER DEFAULT 25,
    p_offset INTEGER DEFAULT 0
) RETURNS JSONB AS $$
DECLARE
    v_results JSONB;
BEGIN
    WITH matching_subjects AS (
        SELECT DISTINCT subject_id
        FROM public.atlas_argentina_people_search_projection_v1 p
        WHERE 
            (p_age_min IS NULL OR p.age_max_current >= p_age_min)
            AND (p_age_max IS NULL OR p.age_min_current <= p_age_max)
            AND (p_profession_ids IS NULL OR p.normalized_profession_id = ANY(p_profession_ids))
            AND (p_relation_types IS NULL OR p.relation_type = ANY(p_relation_types))
            AND (p_source_ids IS NULL OR p.source_id = ANY(p_source_ids))
            AND (p_geography_id IS NULL OR p.geography_id = p_geography_id)
            AND (p_social_platforms IS NULL OR (
                EXISTS (
                    SELECT 1 
                    FROM jsonb_array_elements(p.social_profiles) AS sp
                    WHERE sp->>'platform' = ANY(p_social_platforms)
                )
            ))
    ),
    total_count AS (
        SELECT COUNT(*) as cnt FROM matching_subjects
    ),
    paginated_subjects AS (
        SELECT subject_id FROM matching_subjects
        ORDER BY subject_id
        LIMIT p_limit OFFSET p_offset
    ),
    full_rows AS (
        SELECT p.*
        FROM public.atlas_argentina_people_search_projection_v1 p
        JOIN paginated_subjects ps ON p.subject_id = ps.subject_id
    )
    SELECT jsonb_build_object(
        'total_matching_subjects', (SELECT cnt FROM total_count),
        'results', (SELECT COALESCE(jsonb_agg(row_to_json(f)), '[]'::jsonb) FROM full_rows f)
    ) INTO v_results;

    RETURN v_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
