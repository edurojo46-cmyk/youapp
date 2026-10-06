-- ============================================================================
-- ATLAS MIGRATION: 20260908043000_atlas_admin_global_search_v1.sql
-- DOMAIN: ADMIN GLOBAL CROSS-TENANT PERSON SEARCH V1
-- PURPOSE:
--   Provides an administrator-only RPC that queries atlas_people across
--   ALL tenants, bypassing the single-tenant isolation enforced by
--   search_canonical_persons_v1. This enables Admin Total to display the
--   full 4.550+ person universe without breaking normal-user isolation.
-- SECURITY CONTRACT:
--   - Role verified STRICTLY server-side: auth.jwt()->'app_metadata'->>'role' = 'admin'
--   - No caller-controlled tenant bypass parameter accepted
--   - REVOKED from PUBLIC and anon; GRANT only to authenticated
--   - SECURITY DEFINER with explicit search_path = pg_catalog, public
--   - Cross-tenant access is exclusively internal to this RPC
--   - NO service_role key needed in browser
-- COMPATIBILITY:
--   - search_canonical_persons_v1 is NOT modified; still serves normal users
--   - Same parameter interface as search_canonical_persons_v1 for drop-in compat
--   - Adds tenant_id to each result item for cross-tenant identification
-- ============================================================================

-- 1. Admin Global Cross-Tenant Person Search RPC
CREATE OR REPLACE FUNCTION public.search_admin_all_persons_v1(
    p_search_query TEXT DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_coverage_email BOOLEAN DEFAULT NULL,
    p_coverage_phone BOOLEAN DEFAULT NULL,
    p_eligibility_channel TEXT DEFAULT NULL,
    p_eligibility_action_type TEXT DEFAULT NULL,
    p_eligibility_status TEXT DEFAULT 'ELIGIBLE',
    p_residence_country TEXT DEFAULT NULL,
    p_residence_city TEXT DEFAULT NULL,
    p_residence_neighborhood TEXT DEFAULT NULL,
    p_profession TEXT DEFAULT NULL,
    p_company TEXT DEFAULT NULL,
    p_work_city TEXT DEFAULT NULL,
    p_has_photo BOOLEAN DEFAULT NULL,
    p_has_recent_signal BOOLEAN DEFAULT NULL,
    p_signal_topic TEXT DEFAULT NULL,
    p_signal_freshness_days INT DEFAULT NULL,
    p_interest_topic TEXT DEFAULT NULL,
    p_interest_level TEXT DEFAULT NULL,
    p_intent_topic TEXT DEFAULT NULL,
    p_intent_level TEXT DEFAULT NULL,
    p_min_intent_score NUMERIC DEFAULT NULL,
    p_product_id UUID DEFAULT NULL,
    p_offer_id UUID DEFAULT NULL,
    p_product_fit_level TEXT DEFAULT NULL,
    p_min_fit_score NUMERIC DEFAULT NULL,
    p_nba_status TEXT DEFAULT NULL,
    p_nba_action TEXT DEFAULT NULL,
    p_min_evidence_confidence NUMERIC DEFAULT NULL,
    p_age_from INT DEFAULT NULL,
    p_age_to INT DEFAULT NULL,
    p_sort_by TEXT DEFAULT 'created_at',
    p_sort_asc BOOLEAN DEFAULT FALSE,
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 25
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_role TEXT;
    v_caller_uid UUID;
    v_sort_by TEXT;
    v_sort_asc BOOLEAN;
    v_page INT;
    v_page_size INT;
    v_offset INT;
    v_total_count BIGINT := 0;
    v_items JSONB := '[]'::jsonb;
    -- Effective filter: NULL means no filter (canonical semantics)
    v_status TEXT;
BEGIN
    -- =========================================================
    -- AUTHORIZATION: Server-side admin role check. Non-negotiable.
    -- =========================================================
    v_caller_uid := auth.uid();
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'ACCESS_DENIED: unauthenticated caller';
    END IF;

    v_caller_role := (auth.jwt() -> 'app_metadata' ->> 'role');
    IF v_caller_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'ACCESS_DENIED: admin role required, caller role=%', COALESCE(v_caller_role, 'NULL');
    END IF;

    -- =========================================================
    -- FILTER CANONICALIZATION: NULL = no filter (canonical rule)
    -- Empty string and sentinel values normalize to NULL
    -- =========================================================
    v_status := CASE
        WHEN p_status IS NULL OR TRIM(p_status) = '' OR TRIM(p_status) = 'ALL' OR TRIM(p_status) = 'TODOS'
        THEN NULL
        ELSE TRIM(p_status)
    END;

    -- =========================================================
    -- SORT WHITELIST
    -- =========================================================
    IF p_sort_by IN ('created_at', 'full_name', 'nba_priority', 'fit_score', 'intent_score', 'last_signal_at') THEN
        v_sort_by := p_sort_by;
    ELSE
        v_sort_by := 'created_at';
    END IF;
    v_sort_asc := COALESCE(p_sort_asc, FALSE);

    -- =========================================================
    -- PAGINATION CLAMPING
    -- =========================================================
    IF p_page_size IN (25, 50, 100) THEN
        v_page_size := p_page_size;
    ELSE
        v_page_size := 25;
    END IF;

    IF p_page IS NULL OR p_page < 1 THEN
        v_page := 1;
    ELSE
        v_page := p_page;
    END IF;
    v_offset := (v_page - 1) * v_page_size;

    -- =========================================================
    -- 3-TIER QUERY (identical logic to tenant RPC but WITHOUT tenant_id filter)
    -- Tier 1: filtered_people — predicates across ALL tenants
    -- Tier 2: paged_people — windowed COUNT(*) + LIMIT/OFFSET
    -- Tier 3: Lateral enrichment joins for only the paged rows
    -- =========================================================
    WITH filtered_people AS (
        SELECT p.person_id, p.tenant_id, p.full_name, p.status, p.created_at
        FROM public.atlas_people p
        WHERE
            -- Status filter (NULL = no filter; canonical null semantics)
            (v_status IS NULL OR p.status::TEXT = v_status)
            -- Full-text / ID search
            AND (
                p_search_query IS NULL OR TRIM(p_search_query) = ''
                OR p.full_name ILIKE ('%' || TRIM(p_search_query) || '%')
                OR (
                    TRIM(p_search_query) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    AND p.person_id = TRIM(p_search_query)::UUID
                )
            )
            -- Coverage filters
            AND (
                p_coverage_email IS NULL
                OR EXISTS (
                    SELECT 1 FROM public.atlas_person_coverage cov
                    WHERE cov.person_id = p.person_id
                      AND cov.tenant_id = p.tenant_id
                      AND cov.email_known = p_coverage_email
                )
            )
            AND (
                p_coverage_phone IS NULL
                OR EXISTS (
                    SELECT 1 FROM public.atlas_person_coverage cov
                    WHERE cov.person_id = p.person_id
                      AND cov.tenant_id = p.tenant_id
                      AND cov.phone_known = p_coverage_phone
                )
            )
            -- Channel Eligibility (10C)
            AND (
                p_eligibility_channel IS NULL
                OR EXISTS (
                    SELECT 1 FROM public.atlas_channel_eligibility ce
                    WHERE ce.subject_id = p.person_id
                      AND ce.channel = p_eligibility_channel
                      AND (p_eligibility_action_type IS NULL OR ce.action_type::TEXT = p_eligibility_action_type)
                      AND (p_eligibility_status IS NULL OR ce.eligibility_status::TEXT = p_eligibility_status)
                      AND (ce.expires_at IS NULL OR ce.expires_at > NOW())
                )
            )
            -- Location filters
            AND (
                p_residence_country IS NULL
                OR EXISTS (
                    SELECT 1 FROM public.atlas_person_attribute_evidence ev
                    WHERE ev.person_id = p.person_id AND ev.tenant_id = p.tenant_id
                      AND ev.attribute_key = 'residence_country'
                      AND ev.normalized_value ILIKE p_residence_country
                      AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
                )
            )
            AND (
                p_residence_city IS NULL
                OR EXISTS (
                    SELECT 1 FROM public.atlas_person_attribute_evidence ev
                    WHERE ev.person_id = p.person_id AND ev.tenant_id = p.tenant_id
                      AND ev.attribute_key = 'residence_city'
                      AND ev.normalized_value ILIKE p_residence_city
                      AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
                )
            )
            AND (
                p_residence_neighborhood IS NULL
                OR EXISTS (
                    SELECT 1 FROM public.atlas_person_attribute_evidence ev
                    WHERE ev.person_id = p.person_id AND ev.tenant_id = p.tenant_id
                      AND ev.attribute_key = 'residence_neighborhood'
                      AND ev.normalized_value ILIKE p_residence_neighborhood
                      AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
                )
            )
            -- Work filters
            AND (
                p_profession IS NULL
                OR EXISTS (
                    SELECT 1 FROM public.atlas_person_attribute_evidence ev
                    WHERE ev.person_id = p.person_id AND ev.tenant_id = p.tenant_id
                      AND ev.attribute_key = 'profession'
                      AND ev.normalized_value ILIKE ('%' || p_profession || '%')
                      AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
                )
            )
            AND (
                p_company IS NULL
                OR EXISTS (
                    SELECT 1 FROM public.atlas_person_attribute_evidence ev
                    WHERE ev.person_id = p.person_id AND ev.tenant_id = p.tenant_id
                      AND ev.attribute_key = 'company'
                      AND ev.normalized_value ILIKE ('%' || p_company || '%')
                      AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
                )
            )
            AND (
                p_work_city IS NULL
                OR EXISTS (
                    SELECT 1 FROM public.atlas_person_attribute_evidence ev
                    WHERE ev.person_id = p.person_id AND ev.tenant_id = p.tenant_id
                      AND ev.attribute_key = 'work_city'
                      AND ev.normalized_value ILIKE p_work_city
                      AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
                )
            )
            -- Photo evidence filter
            AND (
                p_has_photo IS NULL
                OR (
                    p_has_photo = TRUE AND EXISTS (
                        SELECT 1 FROM public.atlas_person_attribute_evidence ev
                        WHERE ev.person_id = p.person_id AND ev.tenant_id = p.tenant_id
                          AND ev.attribute_key IN ('photo_url', 'avatar_url', 'profile_photo')
                          AND ev.normalized_value IS NOT NULL
                          AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
                    )
                )
                OR (
                    p_has_photo = FALSE AND NOT EXISTS (
                        SELECT 1 FROM public.atlas_person_attribute_evidence ev
                        WHERE ev.person_id = p.person_id AND ev.tenant_id = p.tenant_id
                          AND ev.attribute_key IN ('photo_url', 'avatar_url', 'profile_photo')
                          AND ev.normalized_value IS NOT NULL
                          AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
                    )
                )
            )
            -- Age filter
            AND (
                p_age_from IS NULL AND p_age_to IS NULL
                OR EXISTS (
                    SELECT 1 FROM public.atlas_person_attribute_evidence ev
                    WHERE ev.person_id = p.person_id AND ev.tenant_id = p.tenant_id
                      AND ev.attribute_key = 'DOB'
                      AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
                      AND public.safe_parse_iso_date(ev.normalized_value) IS NOT NULL
                      AND (
                          p_age_from IS NULL
                          OR date_part('year', age(CURRENT_DATE, public.safe_parse_iso_date(ev.normalized_value))) >= p_age_from
                      )
                      AND (
                          p_age_to IS NULL
                          OR date_part('year', age(CURRENT_DATE, public.safe_parse_iso_date(ev.normalized_value))) <= p_age_to
                      )
                )
            )
            -- Signal freshness
            AND (
                p_has_recent_signal IS NULL
                OR (
                    p_has_recent_signal = TRUE AND (
                        EXISTS (
                            SELECT 1 FROM public.atlas_person_behavior_events bev
                            WHERE bev.person_id = p.person_id AND bev.tenant_id = p.tenant_id
                              AND (p_signal_topic IS NULL OR bev.topic = p_signal_topic)
                              AND (
                                  p_signal_freshness_days IS NULL
                                  OR bev.observed_at >= (NOW() - (p_signal_freshness_days || ' days')::INTERVAL)
                              )
                        )
                        OR EXISTS (
                            SELECT 1 FROM public.atlas_social_signals ss
                            WHERE ss.canonical_entity_type = 'PERSON'
                              AND ss.canonical_entity_id = p.person_id
                              AND (
                                  p_signal_freshness_days IS NULL
                                  OR ss.detected_at >= (NOW() - (p_signal_freshness_days || ' days')::INTERVAL)
                              )
                        )
                    )
                )
            )
            -- Intent (10P-B)
            AND (
                p_intent_topic IS NULL AND p_intent_level IS NULL AND p_min_intent_score IS NULL
                OR EXISTS (
                    SELECT 1 FROM public.atlas_person_intent_state it
                    WHERE it.person_id = p.person_id AND it.tenant_id = p.tenant_id
                      AND (p_intent_topic IS NULL OR it.topic = p_intent_topic)
                      AND (p_intent_level IS NULL OR it.intent_level::TEXT = p_intent_level)
                      AND (p_min_intent_score IS NULL OR it.intent_score >= p_min_intent_score)
                      AND (it.expires_at IS NULL OR it.expires_at > NOW())
                )
            )
            -- Interest (10P-B)
            AND (
                p_interest_topic IS NULL AND p_interest_level IS NULL
                OR EXISTS (
                    SELECT 1 FROM public.atlas_person_interest_state intst
                    WHERE intst.person_id = p.person_id AND intst.tenant_id = p.tenant_id
                      AND (p_interest_topic IS NULL OR intst.topic = p_interest_topic)
                      AND (p_interest_level IS NULL OR intst.interest_level::TEXT = p_interest_level)
                      AND (intst.expires_at IS NULL OR intst.expires_at > NOW())
                )
            )
            -- Product Fit (10P-C)
            AND (
                p_product_fit_level IS NULL AND p_min_fit_score IS NULL AND p_product_id IS NULL AND p_offer_id IS NULL
                OR EXISTS (
                    SELECT 1 FROM public.atlas_person_product_fit_state pf
                    WHERE pf.person_id = p.person_id AND pf.tenant_id = p.tenant_id
                      AND (p_product_id IS NULL OR pf.product_id = p_product_id)
                      AND (p_offer_id IS NULL OR pf.offer_id = p_offer_id)
                      AND (p_product_fit_level IS NULL OR pf.fit_level = p_product_fit_level)
                      AND (p_min_fit_score IS NULL OR pf.fit_score >= p_min_fit_score)
                      AND (pf.expires_at IS NULL OR pf.expires_at > NOW())
                )
            )
            -- NBA (10D)
            AND (
                p_nba_status IS NULL AND p_nba_action IS NULL
                OR EXISTS (
                    SELECT 1 FROM public.atlas_next_best_action_state nba
                    WHERE nba.subject_id = p.person_id AND nba.tenant_id = p.tenant_id
                      AND (p_nba_status IS NULL OR nba.decision_status::TEXT = p_nba_status)
                      AND (p_nba_action IS NULL OR nba.recommended_action::TEXT = p_nba_action)
                      AND (nba.expires_at IS NULL OR nba.expires_at > NOW())
                )
            )
            -- Evidence confidence threshold
            AND (
                p_min_evidence_confidence IS NULL
                OR EXISTS (
                    SELECT 1 FROM public.atlas_person_attribute_evidence ev
                    WHERE ev.person_id = p.person_id AND ev.tenant_id = p.tenant_id
                      AND ev.confidence >= p_min_evidence_confidence
                      AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
                )
            )
    ),
    paged_people AS (
        SELECT
            fp.person_id,
            fp.tenant_id,
            fp.full_name,
            fp.status,
            fp.created_at,
            COUNT(*) OVER() AS total_count
        FROM filtered_people fp
        ORDER BY
            CASE WHEN v_sort_by = 'created_at' AND NOT v_sort_asc THEN fp.created_at END DESC NULLS LAST,
            CASE WHEN v_sort_by = 'created_at' AND v_sort_asc THEN fp.created_at END ASC NULLS LAST,
            CASE WHEN v_sort_by = 'full_name' AND NOT v_sort_asc THEN fp.full_name END DESC NULLS LAST,
            CASE WHEN v_sort_by = 'full_name' AND v_sort_asc THEN fp.full_name END ASC NULLS LAST,
            fp.person_id DESC
        LIMIT v_page_size
        OFFSET v_offset
    )
    SELECT
        COALESCE(MAX(pp.total_count), 0),
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'person_id', pp.person_id,
                    'tenant_id', pp.tenant_id,
                    'full_name', pp.full_name,
                    'status', pp.status,
                    'created_at', pp.created_at,
                    'coverage', jsonb_build_object(
                        'email_known', COALESCE(cov.email_known, FALSE),
                        'phone_known', COALESCE(cov.phone_known, FALSE),
                        'telegram_known', COALESCE(cov.telegram_known, FALSE),
                        'instagram_known', COALESCE(cov.instagram_known, FALSE),
                        'linkedin_known', COALESCE(cov.linkedin_known, FALSE),
                        'identity_known', COALESCE(cov.identity_known, FALSE),
                        'last_updated_at', cov.last_updated_at
                    ),
                    'identifiers', COALESCE(idents.data, '[]'::jsonb),
                    'attributes', COALESCE(attr_lateral.attr_obj, '{}'::jsonb),
                    'age', CASE
                        WHEN attr_lateral.attr_obj -> 'DOB' ->> 'status' = 'KNOWN'
                             AND public.safe_parse_iso_date(attr_lateral.attr_obj -> 'DOB' ->> 'value') IS NOT NULL
                        THEN date_part('year', age(CURRENT_DATE, public.safe_parse_iso_date(attr_lateral.attr_obj -> 'DOB' ->> 'value')))::INT
                        ELSE NULL
                    END,
                    'product_fit', CASE
                        WHEN fit_lateral.fit_level IS NOT NULL THEN
                            jsonb_build_object(
                                'fit_level', fit_lateral.fit_level,
                                'fit_score', fit_lateral.fit_score,
                                'evidence_count', fit_lateral.evidence_count,
                                'reason_codes', fit_lateral.reason_codes
                            )
                        ELSE
                            jsonb_build_object(
                                'fit_level', 'UNKNOWN',
                                'fit_score', NULL,
                                'evidence_count', 0,
                                'reason_codes', '[]'::jsonb
                            )
                    END,
                    'nba', CASE
                        WHEN nba_lateral.decision_status IS NOT NULL THEN
                            jsonb_build_object(
                                'recommended_action', nba_lateral.recommended_action,
                                'recommended_channel', nba_lateral.recommended_channel,
                                'decision_status', nba_lateral.decision_status,
                                'priority_score', nba_lateral.priority_score,
                                'estimated_action_cost', nba_lateral.estimated_action_cost,
                                'reason_codes', nba_lateral.reason_codes
                            )
                        ELSE NULL
                    END,
                    'channel_eligibility', COALESCE(elig_lateral.data, '[]'::jsonb),
                    'intent', CASE
                        WHEN intent_lateral.intent_level IS NOT NULL THEN
                            jsonb_build_object(
                                'topic', intent_lateral.topic,
                                'intent_level', intent_lateral.intent_level,
                                'intent_score', intent_lateral.intent_score,
                                'last_signal_at', intent_lateral.last_signal_at
                            )
                        ELSE NULL
                    END,
                    'interest', CASE
                        WHEN interest_lateral.interest_level IS NOT NULL THEN
                            jsonb_build_object(
                                'topic', interest_lateral.topic,
                                'interest_level', interest_lateral.interest_level,
                                'interest_score', interest_lateral.interest_score
                            )
                        ELSE NULL
                    END,
                    'has_photo_evidence', COALESCE(attr_lateral.attr_obj -> 'photo_url' ->> 'status' = 'KNOWN', FALSE),
                    'photo_displayable', FALSE
                )
                ORDER BY
                    CASE WHEN v_sort_by = 'created_at' AND NOT v_sort_asc THEN pp.created_at END DESC NULLS LAST,
                    CASE WHEN v_sort_by = 'created_at' AND v_sort_asc THEN pp.created_at END ASC NULLS LAST,
                    CASE WHEN v_sort_by = 'full_name' AND NOT v_sort_asc THEN pp.full_name END DESC NULLS LAST,
                    CASE WHEN v_sort_by = 'full_name' AND v_sort_asc THEN pp.full_name END ASC NULLS LAST,
                    pp.person_id DESC
            ),
            '[]'::jsonb
        )
    INTO v_total_count, v_items
    FROM paged_people pp
    -- Coverage (scoped to person's own tenant)
    LEFT JOIN public.atlas_person_coverage cov
        ON cov.person_id = pp.person_id AND cov.tenant_id = pp.tenant_id
    -- Contact identifiers (scoped to person's own tenant)
    LEFT JOIN LATERAL (
        SELECT jsonb_agg(
            jsonb_build_object(
                'identifier_type', id.identifier_type::TEXT,
                'display_value', COALESCE(id.display_value, id.safe_value),
                'verification_status', id.verification_status
            )
        ) AS data
        FROM public.atlas_person_identifiers id
        WHERE id.person_id = pp.person_id AND id.tenant_id = pp.tenant_id
    ) idents ON TRUE
    -- Attributes (scoped to person's own tenant — no cross-tenant attribute bleed)
    LEFT JOIN LATERAL (
        SELECT jsonb_object_agg(
            attr_agg.attribute_key,
            jsonb_build_object(
                'value', CASE WHEN attr_agg.val_count > 1 THEN 'CONFLICT' ELSE attr_agg.sample_val END,
                'status', CASE WHEN attr_agg.val_count > 1 THEN 'CONFLICT' ELSE 'KNOWN' END,
                'confidence', attr_agg.max_conf
            )
        ) AS attr_obj
        FROM (
            SELECT
                ev.attribute_key,
                COUNT(DISTINCT ev.normalized_value) AS val_count,
                MAX(ev.normalized_value) AS sample_val,
                MAX(ev.confidence) AS max_conf
            FROM public.atlas_person_attribute_evidence ev
            WHERE ev.person_id = pp.person_id
              AND ev.tenant_id = pp.tenant_id
              AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
            GROUP BY ev.attribute_key
        ) attr_agg
    ) attr_lateral ON TRUE
    -- Product Fit (scoped)
    LEFT JOIN LATERAL (
        SELECT pf.fit_level, pf.fit_score, pf.evidence_count, pf.reason_codes
        FROM public.atlas_person_product_fit_state pf
        WHERE pf.person_id = pp.person_id AND pf.tenant_id = pp.tenant_id
          AND (pf.expires_at IS NULL OR pf.expires_at > NOW())
        ORDER BY pf.fit_score DESC
        LIMIT 1
    ) fit_lateral ON TRUE
    -- NBA (scoped)
    LEFT JOIN LATERAL (
        SELECT
            nba.recommended_action::TEXT AS recommended_action,
            nba.recommended_channel,
            nba.decision_status::TEXT AS decision_status,
            nba.priority_score,
            nba.estimated_action_cost::TEXT AS estimated_action_cost,
            nba.reason_codes
        FROM public.atlas_next_best_action_state nba
        WHERE nba.subject_id = pp.person_id AND nba.tenant_id = pp.tenant_id
          AND (nba.expires_at IS NULL OR nba.expires_at > NOW())
        ORDER BY nba.priority_score DESC NULLS LAST
        LIMIT 1
    ) nba_lateral ON TRUE
    -- Channel Eligibility (subject_id-scoped, no tenant column on this table)
    LEFT JOIN LATERAL (
        SELECT jsonb_agg(
            jsonb_build_object(
                'channel', ce.channel,
                'action_type', ce.action_type::TEXT,
                'eligibility_status', ce.eligibility_status::TEXT,
                'reason_codes', ce.reason_codes
            )
        ) AS data
        FROM public.atlas_channel_eligibility ce
        WHERE ce.subject_id = pp.person_id
          AND (ce.expires_at IS NULL OR ce.expires_at > NOW())
    ) elig_lateral ON TRUE
    -- Intent (scoped)
    LEFT JOIN LATERAL (
        SELECT it.topic, it.intent_level::TEXT AS intent_level, it.intent_score, it.last_signal_at
        FROM public.atlas_person_intent_state it
        WHERE it.person_id = pp.person_id AND it.tenant_id = pp.tenant_id
          AND (it.expires_at IS NULL OR it.expires_at > NOW())
        ORDER BY it.intent_score DESC
        LIMIT 1
    ) intent_lateral ON TRUE
    -- Interest (scoped)
    LEFT JOIN LATERAL (
        SELECT intst.topic, intst.interest_level::TEXT AS interest_level, intst.interest_score
        FROM public.atlas_person_interest_state intst
        WHERE intst.person_id = pp.person_id AND intst.tenant_id = pp.tenant_id
          AND (intst.expires_at IS NULL OR intst.expires_at > NOW())
        ORDER BY intst.interest_score DESC
        LIMIT 1
    ) interest_lateral ON TRUE;

    RETURN jsonb_build_object(
        'page', v_page,
        'page_size', v_page_size,
        'total_count', v_total_count,
        'total_pages', CASE WHEN v_total_count = 0 THEN 0 ELSE CEIL(v_total_count::NUMERIC / v_page_size::NUMERIC)::INT END,
        'items', v_items
    );
END;
$$;

-- 2. Access Control: strictly revoke from public/anon; grant only to authenticated
--    The RPC still enforces app_metadata.role = 'admin' internally.
REVOKE ALL ON FUNCTION public.search_admin_all_persons_v1 FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_admin_all_persons_v1 FROM anon;
GRANT EXECUTE ON FUNCTION public.search_admin_all_persons_v1 TO authenticated, service_role;
