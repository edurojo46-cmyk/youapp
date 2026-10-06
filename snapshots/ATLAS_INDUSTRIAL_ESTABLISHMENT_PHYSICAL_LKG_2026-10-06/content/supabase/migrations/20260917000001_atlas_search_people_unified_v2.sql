-- Migration: 20260917000001_atlas_search_people_unified_v2.sql
-- Description: Progressive Cascading Search for Atlas People Search V2
-- Features:
--  1. Deterministic tier-based ranking:
--     - Organization intent: organization > role > display_name
--     - Role intent: role > profession > organization > display_name
--     - Default (Person name): display_name > profession > role > organization
--  2. Strict deduplication by canonical person identity (1 RESULT = 1 PERSON)
--  3. Early-exit AFTER deduplication (stops once target unique people found)
--  4. Accent-aware matching for Spanish corporate and name morphology (eliminating index recheck storms)
--  5. Full filter preservation (source, organization, role, geography, evidence_state)

CREATE OR REPLACE FUNCTION public.spanish_accent_variant(p_text TEXT) 
RETURNS TEXT 
LANGUAGE plpgsql 
IMMUTABLE 
AS $$
DECLARE
  v TEXT := UPPER(p_text);
BEGIN
  IF v IS NULL THEN
    RETURN NULL;
  END IF;
  v := REGEXP_REPLACE(v, 'CION\M', 'CIÓN', 'g');
  v := REGEXP_REPLACE(v, 'SION\M', 'SIÓN', 'g');
  v := REPLACE(v, 'ANONIMA', 'ANÓNIMA');
  v := REPLACE(v, 'MEDICO', 'MÉDICO');
  v := REPLACE(v, 'MARTINEZ', 'MARTÍNEZ');
  v := REPLACE(v, 'PEREZ', 'PÉREZ');
  v := REPLACE(v, 'LOPEZ', 'LÓPEZ');
  v := REPLACE(v, 'GONZALEZ', 'GONZÁLEZ');
  v := REPLACE(v, 'RODRIGUEZ', 'RODRÍGUEZ');
  v := REPLACE(v, 'ALVAREZ', 'ÁLVAREZ');
  v := REPLACE(v, 'SANCHEZ', 'SÁNCHEZ');
  v := REPLACE(v, 'DIAZ', 'DÍAZ');
  v := REPLACE(v, 'GOMEZ', 'GÓMEZ');
  v := REPLACE(v, 'FERNANDEZ', 'FERNÁNDEZ');
  RETURN v;
END;
$$;

DROP FUNCTION IF EXISTS public.atlas_search_people_unified_v2(text,text,text,text,text,text,text,integer,integer);

CREATE OR REPLACE FUNCTION public.atlas_search_people_unified_v2(
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
    v_needed INTEGER := v_offset + v_target_limit;
    
    v_seen_ids TEXT[] := '{}';
    v_unique_count INTEGER := 0;
    
    r RECORD;
    v_key TEXT;
    
    v_has_specific_filters BOOLEAN := (v_clean_org IS NOT NULL OR v_clean_role IS NOT NULL OR v_clean_prof IS NOT NULL OR v_clean_src IS NOT NULL OR v_clean_geo IS NOT NULL);
    
    -- Intent detection for optimal cascade order
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
    -- CASE 2: Text Search with Progressive Cascading Ranking
    -- When Org Intent: Organization -> Role -> Display Name
    -- When Role Intent: Role -> Profession -> Organization -> Display Name
    -- Default (Person): Display Name -> Profession -> Role -> Organization
    -- =========================================================================

    -- -------------------------------------------------------------------------
    -- BRANCH A: ORGANIZATION INTENT
    -- -------------------------------------------------------------------------
    IF v_is_org_intent THEN
        -- Step A1: Organization (Rank 1 for corporate/org queries)
        FOR r IN
            SELECT 
                c.discovery_id, COALESCE(c.atlas_person_id, c.discovery_id) AS atlas_person_id,
                c.display_name, c.profession, c.role, c.organization,
                c.neighborhood, c.location_relation_type, c.source_id, c.person_source_url,
                c.current_activity_state, c.location_evidence, c.public_email, c.public_phone,
                c.social_profiles, c.last_seen_at, c.created_at
            FROM public.atlas_people_discovery_candidates c
            WHERE (c.organization ILIKE ('%' || v_clean_q || '%') OR (v_accented_q IS NOT NULL AND c.organization ILIKE ('%' || v_accented_q || '%')))
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
            LIMIT v_needed + 5
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
                        r.social_profiles, r.last_seen_at, r.created_at, 1;
                END IF;
                IF v_unique_count >= v_needed THEN
                    RETURN;
                END IF;
            END IF;
        END LOOP;

        IF v_unique_count >= v_needed THEN
            RETURN;
        END IF;

        -- Step A2: Role
        FOR r IN
            SELECT 
                c.discovery_id, COALESCE(c.atlas_person_id, c.discovery_id) AS atlas_person_id,
                c.display_name, c.profession, c.role, c.organization,
                c.neighborhood, c.location_relation_type, c.source_id, c.person_source_url,
                c.current_activity_state, c.location_evidence, c.public_email, c.public_phone,
                c.social_profiles, c.last_seen_at, c.created_at
            FROM public.atlas_people_discovery_candidates c
            WHERE (c.role ILIKE ('%' || v_clean_q || '%') OR (v_accented_q IS NOT NULL AND c.role ILIKE ('%' || v_accented_q || '%')))
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
            LIMIT (v_needed - v_unique_count) * 3
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
                        r.social_profiles, r.last_seen_at, r.created_at, 2;
                END IF;
                IF v_unique_count >= v_needed THEN
                    RETURN;
                END IF;
            END IF;
        END LOOP;

        IF v_unique_count >= v_needed THEN
            RETURN;
        END IF;

        -- Step A3: Display Name
        FOR r IN
            SELECT 
                c.discovery_id, COALESCE(c.atlas_person_id, c.discovery_id) AS atlas_person_id,
                c.display_name, c.profession, c.role, c.organization,
                c.neighborhood, c.location_relation_type, c.source_id, c.person_source_url,
                c.current_activity_state, c.location_evidence, c.public_email, c.public_phone,
                c.social_profiles, c.last_seen_at, c.created_at
            FROM public.atlas_people_discovery_candidates c
            WHERE (c.display_name ILIKE ('%' || v_clean_q || '%') OR (v_accented_q IS NOT NULL AND c.display_name ILIKE ('%' || v_accented_q || '%')))
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
            LIMIT (v_needed - v_unique_count) * 3
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
                        r.social_profiles, r.last_seen_at, r.created_at, 3;
                END IF;
                IF v_unique_count >= v_needed THEN
                    RETURN;
                END IF;
            END IF;
        END LOOP;

        RETURN;
    END IF;

    -- -------------------------------------------------------------------------
    -- BRANCH B: ROLE / PROFESSION INTENT
    -- -------------------------------------------------------------------------
    IF v_is_role_intent THEN
        -- Step B1: Role (Rank 1 for role queries)
        FOR r IN
            SELECT 
                c.discovery_id, COALESCE(c.atlas_person_id, c.discovery_id) AS atlas_person_id,
                c.display_name, c.profession, c.role, c.organization,
                c.neighborhood, c.location_relation_type, c.source_id, c.person_source_url,
                c.current_activity_state, c.location_evidence, c.public_email, c.public_phone,
                c.social_profiles, c.last_seen_at, c.created_at
            FROM public.atlas_people_discovery_candidates c
            WHERE (c.role ILIKE ('%' || v_clean_q || '%') OR (v_accented_q IS NOT NULL AND c.role ILIKE ('%' || v_accented_q || '%')))
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
            LIMIT v_needed + 5
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
                        r.social_profiles, r.last_seen_at, r.created_at, 1;
                END IF;
                IF v_unique_count >= v_needed THEN
                    RETURN;
                END IF;
            END IF;
        END LOOP;

        IF v_unique_count >= v_needed THEN
            RETURN;
        END IF;

        -- Step B2: Profession
        FOR r IN
            SELECT 
                c.discovery_id, COALESCE(c.atlas_person_id, c.discovery_id) AS atlas_person_id,
                c.display_name, c.profession, c.role, c.organization,
                c.neighborhood, c.location_relation_type, c.source_id, c.person_source_url,
                c.current_activity_state, c.location_evidence, c.public_email, c.public_phone,
                c.social_profiles, c.last_seen_at, c.created_at
            FROM public.atlas_people_discovery_candidates c
            WHERE (c.profession ILIKE ('%' || v_clean_q || '%') OR (v_accented_q IS NOT NULL AND c.profession ILIKE ('%' || v_accented_q || '%')))
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
            LIMIT (v_needed - v_unique_count) * 3
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
                        r.social_profiles, r.last_seen_at, r.created_at, 2;
                END IF;
                IF v_unique_count >= v_needed THEN
                    RETURN;
                END IF;
            END IF;
        END LOOP;

        IF v_unique_count >= v_needed THEN
            RETURN;
        END IF;

        -- Step B3: Organization
        FOR r IN
            SELECT 
                c.discovery_id, COALESCE(c.atlas_person_id, c.discovery_id) AS atlas_person_id,
                c.display_name, c.profession, c.role, c.organization,
                c.neighborhood, c.location_relation_type, c.source_id, c.person_source_url,
                c.current_activity_state, c.location_evidence, c.public_email, c.public_phone,
                c.social_profiles, c.last_seen_at, c.created_at
            FROM public.atlas_people_discovery_candidates c
            WHERE (c.organization ILIKE ('%' || v_clean_q || '%') OR (v_accented_q IS NOT NULL AND c.organization ILIKE ('%' || v_accented_q || '%')))
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
            LIMIT (v_needed - v_unique_count) * 3
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
                        r.social_profiles, r.last_seen_at, r.created_at, 3;
                END IF;
                IF v_unique_count >= v_needed THEN
                    RETURN;
                END IF;
            END IF;
        END LOOP;

        RETURN;
    END IF;

    -- -------------------------------------------------------------------------
    -- BRANCH C: DEFAULT / PERSON NAME (display_name > profession > role > org)
    -- -------------------------------------------------------------------------
    -- Step C1: Display Name
    FOR r IN
        SELECT 
            c.discovery_id, COALESCE(c.atlas_person_id, c.discovery_id) AS atlas_person_id,
            c.display_name, c.profession, c.role, c.organization,
            c.neighborhood, c.location_relation_type, c.source_id, c.person_source_url,
            c.current_activity_state, c.location_evidence, c.public_email, c.public_phone,
            c.social_profiles, c.last_seen_at, c.created_at
        FROM public.atlas_people_discovery_candidates c
        WHERE (c.display_name ILIKE ('%' || v_clean_q || '%') OR (v_accented_q IS NOT NULL AND c.display_name ILIKE ('%' || v_accented_q || '%')))
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
                    r.social_profiles, r.last_seen_at, r.created_at, 1;
            END IF;
            IF v_unique_count >= v_needed THEN
                RETURN;
            END IF;
        END IF;
    END LOOP;

    -- If a specific multi-word person query (e.g. contains space) matched in display_name, stop early!
    IF v_unique_count > 0 AND v_clean_q LIKE '% %' THEN
        RETURN;
    END IF;

    IF v_unique_count >= v_needed THEN
        RETURN;
    END IF;

    -- Step C2: Profession
    FOR r IN
        SELECT 
            c.discovery_id, COALESCE(c.atlas_person_id, c.discovery_id) AS atlas_person_id,
            c.display_name, c.profession, c.role, c.organization,
            c.neighborhood, c.location_relation_type, c.source_id, c.person_source_url,
            c.current_activity_state, c.location_evidence, c.public_email, c.public_phone,
            c.social_profiles, c.last_seen_at, c.created_at
        FROM public.atlas_people_discovery_candidates c
        WHERE (c.profession ILIKE ('%' || v_clean_q || '%') OR (v_accented_q IS NOT NULL AND c.profession ILIKE ('%' || v_accented_q || '%')))
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
        LIMIT (v_needed - v_unique_count) * 3
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
                    r.social_profiles, r.last_seen_at, r.created_at, 2;
            END IF;
            IF v_unique_count >= v_needed THEN
                RETURN;
            END IF;
        END IF;
    END LOOP;

    IF v_unique_count >= v_needed THEN
        RETURN;
    END IF;

    -- Step C3: Role
    FOR r IN
        SELECT 
            c.discovery_id, COALESCE(c.atlas_person_id, c.discovery_id) AS atlas_person_id,
            c.display_name, c.profession, c.role, c.organization,
            c.neighborhood, c.location_relation_type, c.source_id, c.person_source_url,
            c.current_activity_state, c.location_evidence, c.public_email, c.public_phone,
            c.social_profiles, c.last_seen_at, c.created_at
        FROM public.atlas_people_discovery_candidates c
        WHERE (c.role ILIKE ('%' || v_clean_q || '%') OR (v_accented_q IS NOT NULL AND c.role ILIKE ('%' || v_accented_q || '%')))
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
        LIMIT (v_needed - v_unique_count) * 3
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
                    r.social_profiles, r.last_seen_at, r.created_at, 3;
            END IF;
            IF v_unique_count >= v_needed THEN
                RETURN;
            END IF;
        END IF;
    END LOOP;

    IF v_unique_count >= v_needed THEN
        RETURN;
    END IF;

    -- Step C4: Organization
    FOR r IN
        SELECT 
            c.discovery_id, COALESCE(c.atlas_person_id, c.discovery_id) AS atlas_person_id,
            c.display_name, c.profession, c.role, c.organization,
            c.neighborhood, c.location_relation_type, c.source_id, c.person_source_url,
            c.current_activity_state, c.location_evidence, c.public_email, c.public_phone,
            c.social_profiles, c.last_seen_at, c.created_at
        FROM public.atlas_people_discovery_candidates c
        WHERE (c.organization ILIKE ('%' || v_clean_q || '%') OR (v_accented_q IS NOT NULL AND c.organization ILIKE ('%' || v_accented_q || '%')))
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
        LIMIT (v_needed - v_unique_count) * 3
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
                    r.social_profiles, r.last_seen_at, r.created_at, 4;
            END IF;
            IF v_unique_count >= v_needed THEN
                RETURN;
            END IF;
        END IF;
    END LOOP;

END;
$$;
