-- 20260912122355_atlas_facets_rpc_update.sql

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
    v_total_subjects INTEGER;
    v_professions JSONB;
    v_relations JSONB;
    v_sources JSONB;
BEGIN
    -- Temporary table to hold all matching projection rows (multiple rows per subject allowed here)
    CREATE TEMP TABLE tmp_matching_rows ON COMMIT DROP AS
    SELECT p.*
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
        ));

    -- Total Distinct Subjects
    SELECT COUNT(DISTINCT subject_id) INTO v_total_subjects FROM tmp_matching_rows;

    -- Facet: Professions (Count DISTINCT subjects per profession)
    SELECT COALESCE(jsonb_object_agg(COALESCE(normalized_profession_id, 'UNKNOWN'), cnt), '{}'::jsonb)
    INTO v_professions
    FROM (
        SELECT normalized_profession_id, COUNT(DISTINCT subject_id) as cnt
        FROM tmp_matching_rows
        GROUP BY normalized_profession_id
    ) t;

    -- Facet: Relations
    SELECT COALESCE(jsonb_object_agg(COALESCE(relation_type, 'UNKNOWN'), cnt), '{}'::jsonb)
    INTO v_relations
    FROM (
        SELECT relation_type, COUNT(DISTINCT subject_id) as cnt
        FROM tmp_matching_rows
        GROUP BY relation_type
    ) t;

    -- Facet: Sources
    SELECT COALESCE(jsonb_object_agg(COALESCE(source_id, 'UNKNOWN'), cnt), '{}'::jsonb)
    INTO v_sources
    FROM (
        SELECT source_id, COUNT(DISTINCT subject_id) as cnt
        FROM tmp_matching_rows
        GROUP BY source_id
    ) t;

    -- Results (Pagination based on DISTINCT subjects)
    WITH paginated_subjects AS (
        SELECT DISTINCT subject_id
        FROM tmp_matching_rows
        ORDER BY subject_id
        LIMIT p_limit OFFSET p_offset
    ),
    full_rows AS (
        SELECT r.*
        FROM tmp_matching_rows r
        JOIN paginated_subjects ps ON r.subject_id = ps.subject_id
    )
    SELECT jsonb_build_object(
        'total_matching_subjects', v_total_subjects,
        'facets', jsonb_build_object(
            'professions', v_professions,
            'relations', v_relations,
            'sources', v_sources
        ),
        'results', (SELECT COALESCE(jsonb_agg(row_to_json(f)), '[]'::jsonb) FROM full_rows f)
    ) INTO v_results;

    RETURN v_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
