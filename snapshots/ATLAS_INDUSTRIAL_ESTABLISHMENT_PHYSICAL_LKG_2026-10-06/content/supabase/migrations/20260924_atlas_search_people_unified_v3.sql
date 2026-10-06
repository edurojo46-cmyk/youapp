-- ==============================================================================
-- Migration: 20260924_atlas_search_people_unified_v3.sql
-- Description: Unified search routing through search_text_normalized document
-- Eliminates legacy column-specific GIN dependencies while preserving 100%
-- functional coverage, ranking semantics, deduplication, and filters.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.atlas_search_people_unified_v3(
    p_query TEXT DEFAULT NULL,
    p_organization TEXT DEFAULT NULL,
    p_role TEXT DEFAULT NULL,
    p_profession TEXT DEFAULT NULL,
    p_source TEXT DEFAULT NULL,
    p_geography TEXT DEFAULT NULL,
    p_evidence_state TEXT DEFAULT 'ALL_ARGENTINA',
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    discovery_id TEXT,
    atlas_person_id TEXT,
    display_name TEXT,
    profession TEXT,
    role TEXT,
    organization TEXT,
    neighborhood TEXT,
    location_relation_type TEXT,
    source_id TEXT,
    person_source_url TEXT,
    current_activity_state TEXT,
    location_evidence TEXT,
    public_email TEXT,
    public_phone TEXT,
    social_profiles JSONB,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    search_rank INTEGER
)
LANGUAGE plpgsql
STABLE
SET statement_timeout TO '15s'
SET enable_seqscan TO 'off'
AS $$
DECLARE
    v_clean_q TEXT := NULLIF(TRIM(p_query), '');
    v_lower_q TEXT := LOWER(COALESCE(v_clean_q, ''));
    v_accented_q TEXT := NULLIF(LOWER(public.spanish_accent_variant(v_clean_q)), v_lower_q);
    v_upper_q TEXT := UPPER(COALESCE(v_clean_q, ''));
    
    v_clean_org TEXT := NULLIF(LOWER(TRIM(p_organization)), '');
    v_clean_role TEXT := NULLIF(LOWER(TRIM(p_role)), '');
    v_clean_prof TEXT := NULLIF(LOWER(TRIM(p_profession)), '');
    v_clean_src TEXT := NULLIF(TRIM(p_source), '');
    v_clean_geo TEXT := NULLIF(LOWER(TRIM(p_geography)), '');
    v_evidence_state TEXT := COALESCE(NULLIF(TRIM(p_evidence_state), ''), 'ALL_ARGENTINA');
    
    v_target_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
    v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
    v_needed INTEGER := v_offset + v_target_limit;
    
    v_seen_ids TEXT[] := '{}';
    v_unique_count INTEGER := 0;
    
    r RECORD;
    v_key TEXT;
    
    v_has_specific_filters BOOLEAN := (v_clean_org IS NOT NULL OR v_clean_role IS NOT NULL OR v_clean_prof IS NOT NULL OR v_clean_src IS NOT NULL OR v_clean_geo IS NOT NULL);
    
    -- Intent detection
    v_is_org_intent BOOLEAN := FALSE;
    v_is_role_intent BOOLEAN := FALSE;
BEGIN
    -- =========================================================================
    -- CASE 1: Empty Query and No Specific Field Filters -> Recent candidates
    -- =========================================================================
    IF v_clean_q IS NULL AND NOT v_has_specific_filters THEN
        FOR r IN
            SELECT 
                c.discovery_id,
                COALESCE(c.atlas_person_id, c.discovery_id) AS atlas_person_id,
                c.display_name, c.profession, c.role, c.organization,
                c.neighborhood, c.location_relation_type, c.source_id, c.person_source_url,
                c.current_activity_state, c.location_evidence, c.public_email, c.public_phone,
                c.social_profiles, c.last_seen_at, c.created_at
            FROM public.atlas_people_discovery_candidates c
            WHERE (
                v_evidence_state IN ('ALL_ARGENTINA', 'NATIONAL_SSOT')
                OR (v_evidence_state = 'HISTORICAL' AND c.current_activity_state = 'HISTORICAL')
                OR (v_evidence_state = 'RECENT' AND c.source_id = 'OPENALEX_CABA' AND c.location_relation_type = 'CABA_INSTITUTION_ASSOCIATED' AND c.current_activity_state = 'ACTIVE')
                OR (v_evidence_state = 'CURRENT' AND c.current_activity_state = 'ACTIVE' AND c.location_relation_type NOT IN ('PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE', 'CABA_INSTITUTION_ASSOCIATED', 'NATIONAL_PUBLIC_EMPLOYEE') AND (c.location_evidence NOT ILIKE '%radicada fuera de CABA%' OR c.location_evidence IS NULL))
                OR (v_evidence_state = 'ASSOCIATED_STALE' AND c.current_activity_state = 'STALE' AND c.location_relation_type NOT IN ('PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE', 'NATIONAL_PUBLIC_EMPLOYEE') AND (c.location_evidence NOT ILIKE '%radicada fuera de CABA%' OR c.location_evidence IS NULL))
                OR (v_evidence_state NOT IN ('HISTORICAL', 'RECENT', 'CURRENT', 'ASSOCIATED_STALE', 'ALL_ARGENTINA', 'NATIONAL_SSOT') AND c.current_activity_state != 'HISTORICAL' AND c.location_relation_type NOT IN ('PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE', 'NATIONAL_PUBLIC_EMPLOYEE') AND (c.location_evidence NOT ILIKE '%radicada fuera de CABA%' OR c.location_evidence IS NULL))
            )
            ORDER BY c.created_at DESC
            LIMIT v_needed * 3
        LOOP
            v_key := r.atlas_person_id;
            IF NOT (v_key = ANY(v_seen_ids)) THEN
                v_seen_ids := array_append(v_seen_ids, v_key);
                v_unique_count := v_unique_count + 1;
                IF v_unique_count > v_offset THEN
                    RETURN QUERY SELECT 
                        r.discovery_id, r.atlas_person_id, r.display_name, r.profession, r.role, r.organization,
                        r.neighborhood, r.location_relation_type, r.source_id, r.person_source_url,
                        r.current_activity_state, r.location_evidence, r.public_email, r.public_phone,
                        r.social_profiles, r.last_seen_at, r.created_at, 0;
                END IF;
                IF v_unique_count >= v_needed THEN
                    RETURN;
                END IF;
            END IF;
        END LOOP;
        RETURN;
    END IF;

    -- Detect Intent based on domain keywords
    IF v_upper_q ~* '\y(SOCIEDAD|ANONIMA|ANÓNIMA|S\.?A\.?|S\.?R\.?L\.?|MINISTERIO|SECRETARIA|SECRETARÍA|HOSPITAL|UNIVERSIDAD|FACULTAD|BANCO|ASOCIACION|ASOCIACIÓN|FUNDACION|FUNDACIÓN|LEGISLATURA|GOBIERNO|INSTITUTO|EMPRESA|BUENOS AIRES|CAPITAL FEDERAL|ARGENTINA|NACIONAL)\y' THEN
        v_is_org_intent := TRUE;
    ELSIF v_upper_q ~* '\y(DIRECTOR|DIRECTORA|PRESIDENTE|PRESIDENTA|GERENTE|SUBGERENTE|VICEPRESIDENTE|VOCAL|SINDICO|SÍNDICO|CONTROLADOR|INVESTIGADOR|MEDICO|MÉDICO|ABOGADO|ABOGADA|ESCRIBANO|ESCRIBANA|ARQUITECTO|ARQUITECTA)\y' THEN
        v_is_role_intent := TRUE;
    END IF;

    -- =========================================================================
    -- CASE 2: Text Search ROUTED THROUGH search_text_normalized
    -- Step 1: Subquery matched takes bounded LIMIT v_needed * 3 from index.
    -- Step 2: In-memory sort applies intent ranking in microseconds.
    -- =========================================================================
    FOR r IN
        WITH matched AS (
            SELECT 
                c.discovery_id, COALESCE(c.atlas_person_id, c.discovery_id) AS atlas_person_id,
                c.display_name, c.profession, c.role, c.organization,
                c.neighborhood, c.location_relation_type, c.source_id, c.person_source_url,
                c.current_activity_state, c.location_evidence, c.public_email, c.public_phone,
                c.social_profiles, c.last_seen_at, c.created_at,
                CASE 
                    WHEN v_is_org_intent AND (c.organization ILIKE ('%' || v_clean_q || '%') OR (v_accented_q IS NOT NULL AND c.organization ILIKE ('%' || v_accented_q || '%'))) THEN 1
                    WHEN v_is_org_intent AND (c.role ILIKE ('%' || v_clean_q || '%') OR (v_accented_q IS NOT NULL AND c.role ILIKE ('%' || v_accented_q || '%'))) THEN 2
                    WHEN v_is_org_intent THEN 3
                    
                    WHEN v_is_role_intent AND (c.role ILIKE ('%' || v_clean_q || '%') OR (v_accented_q IS NOT NULL AND c.role ILIKE ('%' || v_accented_q || '%'))) THEN 1
                    WHEN v_is_role_intent AND (c.profession ILIKE ('%' || v_clean_q || '%') OR (v_accented_q IS NOT NULL AND c.profession ILIKE ('%' || v_accented_q || '%'))) THEN 2
                    WHEN v_is_role_intent THEN 3

                    WHEN (c.display_name ILIKE ('%' || v_clean_q || '%') OR (v_accented_q IS NOT NULL AND c.display_name ILIKE ('%' || v_accented_q || '%'))) THEN 1
                    WHEN (c.profession ILIKE ('%' || v_clean_q || '%') OR (v_accented_q IS NOT NULL AND c.profession ILIKE ('%' || v_accented_q || '%'))) THEN 2
                    WHEN (c.role ILIKE ('%' || v_clean_q || '%') OR (v_accented_q IS NOT NULL AND c.role ILIKE ('%' || v_accented_q || '%'))) THEN 3
                    ELSE 4
                END AS calculated_rank
            FROM public.atlas_people_discovery_candidates c
            WHERE (
                v_clean_q IS NULL 
                OR c.search_text_normalized ILIKE ('%' || v_lower_q || '%')
                OR (v_accented_q IS NOT NULL AND c.search_text_normalized ILIKE ('%' || v_accented_q || '%'))
            )
              AND (v_clean_org IS NULL OR c.organization ILIKE ('%' || v_clean_org || '%'))
              AND (v_clean_role IS NULL OR c.role ILIKE ('%' || v_clean_role || '%') OR c.profession ILIKE ('%' || v_clean_role || '%'))
              AND (v_clean_prof IS NULL OR c.profession ILIKE ('%' || v_clean_prof || '%'))
              AND (v_clean_src IS NULL OR c.source_id ILIKE ('%' || v_clean_src || '%'))
              AND (v_clean_geo IS NULL OR c.neighborhood ILIKE ('%' || v_clean_geo || '%') OR c.geography_id ILIKE ('%' || v_clean_geo || '%'))
              AND (
                  v_evidence_state IN ('ALL_ARGENTINA', 'NATIONAL_SSOT')
                  OR (v_evidence_state = 'HISTORICAL' AND c.current_activity_state = 'HISTORICAL')
                  OR (v_evidence_state = 'RECENT' AND c.source_id = 'OPENALEX_CABA' AND c.location_relation_type = 'CABA_INSTITUTION_ASSOCIATED' AND c.current_activity_state = 'ACTIVE')
                  OR (v_evidence_state = 'CURRENT' AND c.current_activity_state = 'ACTIVE' AND c.location_relation_type NOT IN ('PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE', 'CABA_INSTITUTION_ASSOCIATED', 'NATIONAL_PUBLIC_EMPLOYEE') AND (c.location_evidence NOT ILIKE '%radicada fuera de CABA%' OR c.location_evidence IS NULL))
                  OR (v_evidence_state = 'ASSOCIATED_STALE' AND c.current_activity_state = 'STALE' AND c.location_relation_type NOT IN ('PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE', 'NATIONAL_PUBLIC_EMPLOYEE') AND (c.location_evidence NOT ILIKE '%radicada fuera de CABA%' OR c.location_evidence IS NULL))
                  OR (v_evidence_state NOT IN ('HISTORICAL', 'RECENT', 'CURRENT', 'ASSOCIATED_STALE', 'ALL_ARGENTINA', 'NATIONAL_SSOT') AND c.current_activity_state != 'HISTORICAL' AND c.location_relation_type NOT IN ('PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE', 'NATIONAL_PUBLIC_EMPLOYEE') AND (c.location_evidence NOT ILIKE '%radicada fuera de CABA%' OR c.location_evidence IS NULL))
              )
            LIMIT v_needed * 3
        )
        SELECT * FROM matched
        ORDER BY calculated_rank ASC, created_at DESC
    LOOP
        v_key := r.atlas_person_id;
        IF NOT (v_key = ANY(v_seen_ids)) THEN
            v_seen_ids := array_append(v_seen_ids, v_key);
            v_unique_count := v_unique_count + 1;
            IF v_unique_count > v_offset THEN
                RETURN QUERY SELECT 
                    r.discovery_id, r.atlas_person_id, r.display_name, r.profession, r.role, r.organization,
                    r.neighborhood, r.location_relation_type, r.source_id, r.person_source_url,
                    r.current_activity_state, r.location_evidence, r.public_email, r.public_phone,
                    r.social_profiles, r.last_seen_at, r.created_at, r.calculated_rank;
            END IF;
            IF v_unique_count >= v_needed THEN
                RETURN;
            END IF;
        END IF;
    END LOOP;

    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.atlas_search_people_unified_v3(text,text,text,text,text,text,text,integer,integer) TO anon, authenticated, service_role, postgres;
