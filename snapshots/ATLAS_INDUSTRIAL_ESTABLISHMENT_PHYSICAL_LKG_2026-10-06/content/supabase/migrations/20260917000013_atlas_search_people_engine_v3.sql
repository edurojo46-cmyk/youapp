-- Migration: 20260917000013_atlas_search_people_engine_v3.sql
-- Description: High-Throughput Bounded Index-Backed Search Engine V3.2 and Batch Engine V3.2 for Atlas People
-- Features:
--  1. Index-Backed Candidate Retrieval: Uses dedicated GIN trigram indexes per intent branch with bounded candidate limits
--  2. In-engine intent scoring matching V2 precedence exactly
--  3. Intra-tier sequential ordering preservation (tier_ord) to match V2 cascade exactly
--  4. Efficient SQL-level deduplication by atlas_person_id over bounded candidate set
--  5. Full filter preservation (geography, source, role, org, evidence_state)
--  6. Batch Search RPC (atlas_search_people_batch_v3) evaluating arrays of logical searches in 1 roundtrip
--  7. Zero disruption to V2 baseline

-- =============================================================================
-- 1. INDIVIDUAL SEARCH ENGINE V3.2 (Single Query)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.atlas_search_people_engine_v3(
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
AS $$
DECLARE
    v_clean_q TEXT := NULLIF(TRIM(p_query), '');
    v_accented_q TEXT := NULLIF(public.spanish_accent_variant(v_clean_q), v_clean_q);
    v_upper_q TEXT := UPPER(COALESCE(v_clean_q, ''));
    
    v_clean_org TEXT := NULLIF(TRIM(p_organization), '');
    v_clean_role TEXT := NULLIF(TRIM(p_role), '');
    v_clean_prof TEXT := NULLIF(TRIM(p_profession), '');
    v_clean_src TEXT := NULLIF(TRIM(p_source), '');
    v_clean_geo TEXT := NULLIF(TRIM(p_geography), '');
    v_evidence_state TEXT := COALESCE(NULLIF(TRIM(p_evidence_state), ''), 'ALL_ARGENTINA');
    
    v_target_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
    v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
    v_fetch_k INTEGER := (v_offset + v_target_limit) * 4 + 20;
    
    v_has_specific_filters BOOLEAN := (v_clean_org IS NOT NULL OR v_clean_role IS NOT NULL OR v_clean_prof IS NOT NULL OR v_clean_src IS NOT NULL OR v_clean_geo IS NOT NULL);
    
    v_is_org_intent BOOLEAN := FALSE;
    v_is_role_intent BOOLEAN := FALSE;
BEGIN
    -- Intent detection (matching V2 contract)
    IF v_upper_q ~* '\y(SOCIEDAD|ANONIMA|ANÓNIMA|S\.?A\.?|S\.?R\.?L\.?|MINISTERIO|SECRETARIA|SECRETARÍA|HOSPITAL|UNIVERSIDAD|FACULTAD|BANCO|ASOCIACION|ASOCIACIÓN|FUNDACION|FUNDACIÓN|LEGISLATURA|GOBIERNO|INSTITUTO|EMPRESA|BUENOS AIRES|CAPITAL FEDERAL|ARGENTINA|NACIONAL)\y' THEN
        v_is_org_intent := TRUE;
    ELSIF v_upper_q ~* '\y(DIRECTOR|DIRECTORA|PRESIDENTE|PRESIDENTA|GERENTE|SUBGERENTE|VICEPRESIDENTE|VOCAL|SINDICO|SÍNDICO|CONTROLADOR|INVESTIGADOR|MEDICO|MÉDICO|ABOGADO|ABOGADA|ESCRIBANO|ESCRIBANA|ARQUITECTO|ARQUITECTA)\y' THEN
        v_is_role_intent := TRUE;
    END IF;

    -- CASE 1: Empty Query and No Specific Field Filters -> Recent candidates
    IF v_clean_q IS NULL AND NOT v_has_specific_filters THEN
        RETURN QUERY
        WITH raw_recent AS (
            SELECT 
                c.discovery_id,
                COALESCE(c.atlas_person_id, c.discovery_id) AS atlas_person_id,
                c.display_name, c.profession, c.role, c.organization,
                c.neighborhood, c.location_relation_type, c.source_id, c.person_source_url,
                c.current_activity_state, c.location_evidence, c.public_email, c.public_phone,
                c.social_profiles, c.last_seen_at, c.created_at,
                0 AS intent_rank,
                c.created_at AS sort_date,
                ROW_NUMBER() OVER () AS tier_ord
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
            LIMIT v_fetch_k
        ),
        deduped_recent AS (
            SELECT DISTINCT ON (rr.atlas_person_id)
                rr.*
            FROM raw_recent rr
            ORDER BY rr.atlas_person_id, rr.sort_date DESC NULLS LAST
        )
        SELECT 
            dr.discovery_id, dr.atlas_person_id, dr.display_name, dr.profession, dr.role,
            dr.organization, dr.neighborhood, dr.location_relation_type, dr.source_id,
            dr.person_source_url, dr.current_activity_state, dr.location_evidence,
            dr.public_email, dr.public_phone, dr.social_profiles, dr.last_seen_at,
            dr.created_at, 0 AS search_rank
        FROM deduped_recent dr
        ORDER BY dr.sort_date DESC NULLS LAST
        LIMIT v_target_limit
        OFFSET v_offset;
        RETURN;
    END IF;

    -- CASE 2: Text Search with Intent-Guided Bounded Retrieval
    RETURN QUERY
    WITH candidates_pool AS (
        -- TIER 1: Match by display_name (Uses idx_discovery_candidates_display_name_trgm)
        (
            SELECT 
                c.discovery_id, COALESCE(c.atlas_person_id, c.discovery_id) AS atlas_person_id,
                c.display_name, c.profession, c.role, c.organization,
                c.neighborhood, c.location_relation_type, c.source_id, c.person_source_url,
                c.current_activity_state, c.location_evidence, c.public_email, c.public_phone,
                c.social_profiles, c.last_seen_at, c.created_at,
                CASE 
                    WHEN v_is_org_intent THEN 3
                    WHEN v_is_role_intent THEN 4
                    ELSE 1
                END AS intent_rank,
                ROW_NUMBER() OVER () AS tier_ord
            FROM public.atlas_people_discovery_candidates c
            WHERE (v_clean_q IS NULL OR c.display_name ILIKE ('%' || v_clean_q || '%') OR (v_accented_q IS NOT NULL AND c.display_name ILIKE ('%' || v_accented_q || '%')))
              AND (v_clean_org IS NULL OR c.organization ILIKE ('%' || v_clean_org || '%'))
              AND (v_clean_role IS NULL OR c.role ILIKE ('%' || v_clean_role || '%') OR c.profession ILIKE ('%' || v_clean_role || '%'))
              AND (v_clean_prof IS NULL OR c.profession ILIKE ('%' || v_clean_prof || '%'))
              AND (v_clean_src IS NULL OR c.source_id = v_clean_src)
              AND (v_clean_geo IS NULL OR c.neighborhood ILIKE ('%' || v_clean_geo || '%') OR c.location_evidence ILIKE ('%' || v_clean_geo || '%') OR c.geography_id ILIKE ('%' || v_clean_geo || '%'))
              AND (
                  v_evidence_state IN ('ALL_ARGENTINA', 'NATIONAL_SSOT')
                  OR (v_evidence_state = 'WITH_EVIDENCE' AND (c.public_email IS NOT NULL OR c.public_phone IS NOT NULL OR c.social_profiles IS NOT NULL))
                  OR (v_evidence_state = 'WITHOUT_EVIDENCE' AND c.public_email IS NULL AND c.public_phone IS NULL AND c.social_profiles IS NULL)
                  OR (v_evidence_state = 'HISTORICAL' AND c.current_activity_state = 'HISTORICAL')
                  OR (v_evidence_state = 'RECENT' AND c.source_id = 'OPENALEX_CABA' AND c.location_relation_type = 'CABA_INSTITUTION_ASSOCIATED' AND c.current_activity_state = 'ACTIVE')
                  OR (v_evidence_state = 'CURRENT' AND c.current_activity_state = 'ACTIVE' AND c.location_relation_type NOT IN ('PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE', 'CABA_INSTITUTION_ASSOCIATED', 'NATIONAL_PUBLIC_EMPLOYEE') AND (c.location_evidence NOT ILIKE '%radicada fuera de CABA%' OR c.location_evidence IS NULL))
                  OR (v_evidence_state = 'ASSOCIATED_STALE' AND c.current_activity_state = 'STALE' AND c.location_relation_type NOT IN ('PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE', 'NATIONAL_PUBLIC_EMPLOYEE') AND (c.location_evidence NOT ILIKE '%radicada fuera de CABA%' OR c.location_evidence IS NULL))
                  OR (v_evidence_state NOT IN ('HISTORICAL', 'RECENT', 'CURRENT', 'ASSOCIATED_STALE', 'ALL_ARGENTINA', 'NATIONAL_SSOT', 'WITH_EVIDENCE', 'WITHOUT_EVIDENCE') AND c.current_activity_state != 'HISTORICAL' AND c.location_relation_type NOT IN ('PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE', 'NATIONAL_PUBLIC_EMPLOYEE') AND (c.location_evidence NOT ILIKE '%radicada fuera de CABA%' OR c.location_evidence IS NULL))
              )
            LIMIT v_fetch_k
        )

        UNION ALL

        -- TIER 2: Match by role (Uses idx_discovery_candidates_role_trgm)
        (
            SELECT 
                c.discovery_id, COALESCE(c.atlas_person_id, c.discovery_id) AS atlas_person_id,
                c.display_name, c.profession, c.role, c.organization,
                c.neighborhood, c.location_relation_type, c.source_id, c.person_source_url,
                c.current_activity_state, c.location_evidence, c.public_email, c.public_phone,
                c.social_profiles, c.last_seen_at, c.created_at,
                CASE 
                    WHEN v_is_org_intent THEN 2
                    WHEN v_is_role_intent THEN 1
                    ELSE 2
                END AS intent_rank,
                ROW_NUMBER() OVER () AS tier_ord
            FROM public.atlas_people_discovery_candidates c
            WHERE (c.role ILIKE ('%' || v_clean_q || '%') OR (v_accented_q IS NOT NULL AND c.role ILIKE ('%' || v_accented_q || '%')))
              AND (v_clean_org IS NULL OR c.organization ILIKE ('%' || v_clean_org || '%'))
              AND (v_clean_role IS NULL OR c.role ILIKE ('%' || v_clean_role || '%') OR c.profession ILIKE ('%' || v_clean_role || '%'))
              AND (v_clean_prof IS NULL OR c.profession ILIKE ('%' || v_clean_prof || '%'))
              AND (v_clean_src IS NULL OR c.source_id = v_clean_src)
              AND (v_clean_geo IS NULL OR c.neighborhood ILIKE ('%' || v_clean_geo || '%') OR c.location_evidence ILIKE ('%' || v_clean_geo || '%') OR c.geography_id ILIKE ('%' || v_clean_geo || '%'))
              AND (
                  v_evidence_state IN ('ALL_ARGENTINA', 'NATIONAL_SSOT')
                  OR (v_evidence_state = 'WITH_EVIDENCE' AND (c.public_email IS NOT NULL OR c.public_phone IS NOT NULL OR c.social_profiles IS NOT NULL))
                  OR (v_evidence_state = 'WITHOUT_EVIDENCE' AND c.public_email IS NULL AND c.public_phone IS NULL AND c.social_profiles IS NULL)
                  OR (v_evidence_state = 'HISTORICAL' AND c.current_activity_state = 'HISTORICAL')
                  OR (v_evidence_state = 'RECENT' AND c.source_id = 'OPENALEX_CABA' AND c.location_relation_type = 'CABA_INSTITUTION_ASSOCIATED' AND c.current_activity_state = 'ACTIVE')
                  OR (v_evidence_state = 'CURRENT' AND c.current_activity_state = 'ACTIVE' AND c.location_relation_type NOT IN ('PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE', 'CABA_INSTITUTION_ASSOCIATED', 'NATIONAL_PUBLIC_EMPLOYEE') AND (c.location_evidence NOT ILIKE '%radicada fuera de CABA%' OR c.location_evidence IS NULL))
                  OR (v_evidence_state = 'ASSOCIATED_STALE' AND c.current_activity_state = 'STALE' AND c.location_relation_type NOT IN ('PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE', 'NATIONAL_PUBLIC_EMPLOYEE') AND (c.location_evidence NOT ILIKE '%radicada fuera de CABA%' OR c.location_evidence IS NULL))
                  OR (v_evidence_state NOT IN ('HISTORICAL', 'RECENT', 'CURRENT', 'ASSOCIATED_STALE', 'ALL_ARGENTINA', 'NATIONAL_SSOT', 'WITH_EVIDENCE', 'WITHOUT_EVIDENCE') AND c.current_activity_state != 'HISTORICAL' AND c.location_relation_type NOT IN ('PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE', 'NATIONAL_PUBLIC_EMPLOYEE') AND (c.location_evidence NOT ILIKE '%radicada fuera de CABA%' OR c.location_evidence IS NULL))
              )
            LIMIT v_fetch_k
        )

        UNION ALL

        -- TIER 3: Match by organization (Uses idx_discovery_candidates_org_trgm)
        (
            SELECT 
                c.discovery_id, COALESCE(c.atlas_person_id, c.discovery_id) AS atlas_person_id,
                c.display_name, c.profession, c.role, c.organization,
                c.neighborhood, c.location_relation_type, c.source_id, c.person_source_url,
                c.current_activity_state, c.location_evidence, c.public_email, c.public_phone,
                c.social_profiles, c.last_seen_at, c.created_at,
                CASE 
                    WHEN v_is_org_intent THEN 1
                    WHEN v_is_role_intent THEN 3
                    ELSE 3
                END AS intent_rank,
                ROW_NUMBER() OVER () AS tier_ord
            FROM public.atlas_people_discovery_candidates c
            WHERE (c.organization ILIKE ('%' || v_clean_q || '%') OR (v_accented_q IS NOT NULL AND c.organization ILIKE ('%' || v_accented_q || '%')))
              AND (v_clean_org IS NULL OR c.organization ILIKE ('%' || v_clean_org || '%'))
              AND (v_clean_role IS NULL OR c.role ILIKE ('%' || v_clean_role || '%') OR c.profession ILIKE ('%' || v_clean_role || '%'))
              AND (v_clean_prof IS NULL OR c.profession ILIKE ('%' || v_clean_prof || '%'))
              AND (v_clean_src IS NULL OR c.source_id = v_clean_src)
              AND (v_clean_geo IS NULL OR c.neighborhood ILIKE ('%' || v_clean_geo || '%') OR c.location_evidence ILIKE ('%' || v_clean_geo || '%') OR c.geography_id ILIKE ('%' || v_clean_geo || '%'))
              AND (
                  v_evidence_state IN ('ALL_ARGENTINA', 'NATIONAL_SSOT')
                  OR (v_evidence_state = 'WITH_EVIDENCE' AND (c.public_email IS NOT NULL OR c.public_phone IS NOT NULL OR c.social_profiles IS NOT NULL))
                  OR (v_evidence_state = 'WITHOUT_EVIDENCE' AND c.public_email IS NULL AND c.public_phone IS NULL AND c.social_profiles IS NULL)
                  OR (v_evidence_state = 'HISTORICAL' AND c.current_activity_state = 'HISTORICAL')
                  OR (v_evidence_state = 'RECENT' AND c.source_id = 'OPENALEX_CABA' AND c.location_relation_type = 'CABA_INSTITUTION_ASSOCIATED' AND c.current_activity_state = 'ACTIVE')
                  OR (v_evidence_state = 'CURRENT' AND c.current_activity_state = 'ACTIVE' AND c.location_relation_type NOT IN ('PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE', 'CABA_INSTITUTION_ASSOCIATED', 'NATIONAL_PUBLIC_EMPLOYEE') AND (c.location_evidence NOT ILIKE '%radicada fuera de CABA%' OR c.location_evidence IS NULL))
                  OR (v_evidence_state = 'ASSOCIATED_STALE' AND c.current_activity_state = 'STALE' AND c.location_relation_type NOT IN ('PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE', 'NATIONAL_PUBLIC_EMPLOYEE') AND (c.location_evidence NOT ILIKE '%radicada fuera de CABA%' OR c.location_evidence IS NULL))
                  OR (v_evidence_state NOT IN ('HISTORICAL', 'RECENT', 'CURRENT', 'ASSOCIATED_STALE', 'ALL_ARGENTINA', 'NATIONAL_SSOT', 'WITH_EVIDENCE', 'WITHOUT_EVIDENCE') AND c.current_activity_state != 'HISTORICAL' AND c.location_relation_type NOT IN ('PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE', 'NATIONAL_PUBLIC_EMPLOYEE') AND (c.location_evidence NOT ILIKE '%radicada fuera de CABA%' OR c.location_evidence IS NULL))
              )
            LIMIT v_fetch_k
        )

        UNION ALL

        -- TIER 4: Match by profession (Uses idx_discovery_candidates_profession_trgm)
        (
            SELECT 
                c.discovery_id, COALESCE(c.atlas_person_id, c.discovery_id) AS atlas_person_id,
                c.display_name, c.profession, c.role, c.organization,
                c.neighborhood, c.location_relation_type, c.source_id, c.person_source_url,
                c.current_activity_state, c.location_evidence, c.public_email, c.public_phone,
                c.social_profiles, c.last_seen_at, c.created_at,
                CASE 
                    WHEN v_is_org_intent THEN 4
                    WHEN v_is_role_intent THEN 2
                    ELSE 4
                END AS intent_rank,
                ROW_NUMBER() OVER () AS tier_ord
            FROM public.atlas_people_discovery_candidates c
            WHERE (c.profession ILIKE ('%' || v_clean_q || '%') OR (v_accented_q IS NOT NULL AND c.profession ILIKE ('%' || v_accented_q || '%')))
              AND (v_clean_org IS NULL OR c.organization ILIKE ('%' || v_clean_org || '%'))
              AND (v_clean_role IS NULL OR c.role ILIKE ('%' || v_clean_role || '%') OR c.profession ILIKE ('%' || v_clean_role || '%'))
              AND (v_clean_prof IS NULL OR c.profession ILIKE ('%' || v_clean_prof || '%'))
              AND (v_clean_src IS NULL OR c.source_id = v_clean_src)
              AND (v_clean_geo IS NULL OR c.neighborhood ILIKE ('%' || v_clean_geo || '%') OR c.location_evidence ILIKE ('%' || v_clean_geo || '%') OR c.geography_id ILIKE ('%' || v_clean_geo || '%'))
              AND (
                  v_evidence_state IN ('ALL_ARGENTINA', 'NATIONAL_SSOT')
                  OR (v_evidence_state = 'WITH_EVIDENCE' AND (c.public_email IS NOT NULL OR c.public_phone IS NOT NULL OR c.social_profiles IS NOT NULL))
                  OR (v_evidence_state = 'WITHOUT_EVIDENCE' AND c.public_email IS NULL AND c.public_phone IS NULL AND c.social_profiles IS NULL)
                  OR (v_evidence_state = 'HISTORICAL' AND c.current_activity_state = 'HISTORICAL')
                  OR (v_evidence_state = 'RECENT' AND c.source_id = 'OPENALEX_CABA' AND c.location_relation_type = 'CABA_INSTITUTION_ASSOCIATED' AND c.current_activity_state = 'ACTIVE')
                  OR (v_evidence_state = 'CURRENT' AND c.current_activity_state = 'ACTIVE' AND c.location_relation_type NOT IN ('PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE', 'CABA_INSTITUTION_ASSOCIATED', 'NATIONAL_PUBLIC_EMPLOYEE') AND (c.location_evidence NOT ILIKE '%radicada fuera de CABA%' OR c.location_evidence IS NULL))
                  OR (v_evidence_state = 'ASSOCIATED_STALE' AND c.current_activity_state = 'STALE' AND c.location_relation_type NOT IN ('PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE', 'NATIONAL_PUBLIC_EMPLOYEE') AND (c.location_evidence NOT ILIKE '%radicada fuera de CABA%' OR c.location_evidence IS NULL))
                  OR (v_evidence_state NOT IN ('HISTORICAL', 'RECENT', 'CURRENT', 'ASSOCIATED_STALE', 'ALL_ARGENTINA', 'NATIONAL_SSOT', 'WITH_EVIDENCE', 'WITHOUT_EVIDENCE') AND c.current_activity_state != 'HISTORICAL' AND c.location_relation_type NOT IN ('PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE', 'NATIONAL_PUBLIC_EMPLOYEE') AND (c.location_evidence NOT ILIKE '%radicada fuera de CABA%' OR c.location_evidence IS NULL))
              )
            LIMIT v_fetch_k
        )
    ),
    deduped_candidates AS (
        SELECT DISTINCT ON (cp.atlas_person_id)
            cp.discovery_id,
            cp.atlas_person_id,
            cp.display_name,
            cp.profession,
            cp.role,
            cp.organization,
            cp.neighborhood,
            cp.location_relation_type,
            cp.source_id,
            cp.person_source_url,
            cp.current_activity_state,
            cp.location_evidence,
            cp.public_email,
            cp.public_phone,
            cp.social_profiles,
            cp.last_seen_at,
            cp.created_at,
            cp.intent_rank,
            cp.tier_ord
        FROM candidates_pool cp
        ORDER BY cp.atlas_person_id, cp.intent_rank ASC, cp.tier_ord ASC
    )
    SELECT 
        dc.discovery_id,
        dc.atlas_person_id,
        dc.display_name,
        dc.profession,
        dc.role,
        dc.organization,
        dc.neighborhood,
        dc.location_relation_type,
        dc.source_id,
        dc.person_source_url,
        dc.current_activity_state,
        dc.location_evidence,
        dc.public_email,
        dc.public_phone,
        dc.social_profiles,
        dc.last_seen_at,
        dc.created_at,
        dc.intent_rank AS search_rank
    FROM deduped_candidates dc
    ORDER BY dc.intent_rank ASC, dc.tier_ord ASC
    LIMIT v_target_limit
    OFFSET v_offset;
END;
$$;

-- =============================================================================
-- 2. BATCH SEARCH RPC V3.2
-- =============================================================================
CREATE OR REPLACE FUNCTION public.atlas_search_people_batch_v3(
    p_queries JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_item JSONB;
    v_idx INTEGER;
    v_q TEXT;
    v_org TEXT;
    v_role TEXT;
    v_prof TEXT;
    v_src TEXT;
    v_geo TEXT;
    v_ev TEXT;
    v_lim INTEGER;
    v_off INTEGER;
    v_res JSONB;
    v_batch_output JSONB := '[]'::JSONB;
BEGIN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_queries)
    LOOP
        v_idx  := COALESCE((v_item->>'index')::INTEGER, 0);
        v_q    := NULLIF(TRIM(v_item->>'query'), '');
        v_org  := NULLIF(TRIM(v_item->>'organization'), '');
        v_role := NULLIF(TRIM(v_item->>'role'), '');
        v_prof := NULLIF(TRIM(v_item->>'profession'), '');
        v_src  := NULLIF(TRIM(v_item->>'source'), '');
        v_geo  := NULLIF(TRIM(v_item->>'geography'), '');
        v_ev   := COALESCE(NULLIF(TRIM(v_item->>'evidence_state'), ''), 'ALL_ARGENTINA');
        v_lim  := LEAST(GREATEST(COALESCE((v_item->>'limit')::INTEGER, 20), 1), 100);
        v_off  := GREATEST(COALESCE((v_item->>'offset')::INTEGER, 0), 0);

        SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
        INTO v_res
        FROM (
            SELECT * FROM public.atlas_search_people_engine_v3(
                p_query => v_q,
                p_organization => v_org,
                p_role => v_role,
                p_profession => v_prof,
                p_source => v_src,
                p_geography => v_geo,
                p_evidence_state => v_ev,
                p_limit => v_lim,
                p_offset => v_off
            )
        ) r;

        v_batch_output := v_batch_output || jsonb_build_object(
            'index', v_idx,
            'count', jsonb_array_length(v_res),
            'results', v_res
        );
    END LOOP;
    
    RETURN v_batch_output;
END;
$$;

GRANT EXECUTE ON FUNCTION public.atlas_search_people_engine_v3(text,text,text,text,text,text,text,integer,integer) TO anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.atlas_search_people_batch_v3(jsonb) TO anon, authenticated, service_role, postgres;
NOTIFY pgrst, 'reload schema';
