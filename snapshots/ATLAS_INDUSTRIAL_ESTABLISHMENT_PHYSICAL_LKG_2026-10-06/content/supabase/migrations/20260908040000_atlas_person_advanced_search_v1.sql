-- ============================================================================
-- ATLAS MIGRATION: 20260908040000_atlas_person_advanced_search_v1.sql
-- DOMAIN: ADMIN PERSON ADVANCED SEARCH V1
-- AUTHORITIES:
--   - 10P-A: Core Identity, Identifiers & Attribute Evidence
--   - 10P-B: Commercial Intent & Topic Interest State
--   - 10P-C: Product Fit Scoring
--   - 10C:   Channel & Action-Level Eligibility
--   - 10D:   Next Best Action Decision Engine
-- SECURITY & TENANCY:
--   - Strict single-user-per-tenant isolation via public.get_auth_tenant_id()
--   - Zero caller-controlled tenant parameters in browser-facing RPC
--   - Revoked from PUBLIC and anon, granted to authenticated and service_role
-- ============================================================================

-- 1. Trigram extension for fast ILIKE and substring matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Safe, fail-closed ISO-date parser (Immutable, catches calendar overflow like 2026-99-99)
CREATE OR REPLACE FUNCTION public.safe_parse_iso_date(p_val TEXT)
RETURNS DATE AS $$
BEGIN
    IF p_val IS NULL OR p_val !~ '^\d{4}-\d{2}-\d{2}$' THEN
        RETURN NULL;
    END IF;
    BEGIN
        RETURN p_val::DATE;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
        RETURN NULL;
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

REVOKE ALL ON FUNCTION public.safe_parse_iso_date(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.safe_parse_iso_date(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.safe_parse_iso_date(TEXT) TO authenticated, service_role;

-- 3. Predicate-backed indexes (Volatile time-dependent partial indexes strictly omitted)
CREATE INDEX IF NOT EXISTS idx_atlas_people_tenant_status_created 
ON public.atlas_people (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_people_full_name_trgm 
ON public.atlas_people USING gin (full_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_atlas_person_coverage_presence 
ON public.atlas_person_coverage (tenant_id, person_id, email_known, phone_known);

CREATE INDEX IF NOT EXISTS idx_atlas_person_attr_lookup 
ON public.atlas_person_attribute_evidence (tenant_id, attribute_key, normalized_value, person_id, valid_until);

CREATE INDEX IF NOT EXISTS idx_atlas_person_fit_search 
ON public.atlas_person_product_fit_state (tenant_id, product_id, fit_level, fit_score DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_person_intent_search 
ON public.atlas_person_intent_state (tenant_id, topic, intent_level, intent_score DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_channel_eligibility_search 
ON public.atlas_channel_eligibility (subject_id, channel, action_type, eligibility_status);

CREATE INDEX IF NOT EXISTS idx_atlas_nba_state_search 
ON public.atlas_next_best_action_state (tenant_id, decision_status, priority_score DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_behavior_freshness 
ON public.atlas_person_behavior_events (tenant_id, person_id, observed_at DESC);

-- 4. Authoritative Search RPC: public.search_canonical_persons_v1
-- NO caller-controlled tenant parameter. Tenant derived strictly from get_auth_tenant_id().
CREATE OR REPLACE FUNCTION public.search_canonical_persons_v1(
    p_search_query TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'ACTIVE',
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
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant_id UUID;
    v_sort_by TEXT;
    v_sort_asc BOOLEAN;
    v_page INT;
    v_page_size INT;
    v_offset INT;
    v_total_count BIGINT := 0;
    v_items JSONB := '[]'::jsonb;
BEGIN
    -- Derive tenant strictly from authentication context
    v_tenant_id := public.get_auth_tenant_id();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: missing auth tenant context';
    END IF;

    -- Strict sort whitelist
    IF p_sort_by IN ('created_at', 'full_name', 'nba_priority', 'fit_score', 'intent_score', 'last_signal_at') THEN
        v_sort_by := p_sort_by;
    ELSE
        v_sort_by := 'created_at';
    END IF;
    v_sort_asc := COALESCE(p_sort_asc, FALSE);

    -- Pagination clamping
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

    -- 3-Tier Query Execution:
    -- Tier 1: filtered_people (Semi-join predicates guarantee strictly 1 row per person_id)
    -- Tier 2: paged_people (Windowed COUNT(*) OVER() on deduplicated set + LIMIT/OFFSET)
    -- Tier 3: Lateral subquery projections for the 25 paged rows only
    WITH filtered_people AS (
        SELECT p.person_id, p.full_name, p.status, p.created_at
        FROM public.atlas_people p
        WHERE p.tenant_id = v_tenant_id
          AND (
              p_status IS NULL OR p_status = 'ALL' 
              OR p.status::TEXT = p_status
          )
          AND (
              p_search_query IS NULL OR TRIM(p_search_query) = ''
              OR p.full_name ILIKE ('%' || TRIM(p_search_query) || '%')
              OR (
                  TRIM(p_search_query) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  AND p.person_id = TRIM(p_search_query)::UUID
              )
          )
          -- Coverage filters (10P-A Factual Presence)
          AND (
              p_coverage_email IS NULL 
              OR EXISTS (
                  SELECT 1 FROM public.atlas_person_coverage cov 
                  WHERE cov.person_id = p.person_id 
                    AND cov.tenant_id = v_tenant_id 
                    AND cov.email_known = p_coverage_email
              )
          )
          AND (
              p_coverage_phone IS NULL 
              OR EXISTS (
                  SELECT 1 FROM public.atlas_person_coverage cov 
                  WHERE cov.person_id = p.person_id 
                    AND cov.tenant_id = v_tenant_id 
                    AND cov.phone_known = p_coverage_phone
              )
          )
          -- 10C Action-Level Channel Eligibility filter
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
                  WHERE ev.person_id = p.person_id
                    AND ev.tenant_id = v_tenant_id
                    AND ev.attribute_key = 'residence_country'
                    AND ev.normalized_value ILIKE p_residence_country
                    AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
              )
          )
          AND (
              p_residence_city IS NULL
              OR EXISTS (
                  SELECT 1 FROM public.atlas_person_attribute_evidence ev
                  WHERE ev.person_id = p.person_id
                    AND ev.tenant_id = v_tenant_id
                    AND ev.attribute_key = 'residence_city'
                    AND ev.normalized_value ILIKE p_residence_city
                    AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
              )
          )
          AND (
              p_residence_neighborhood IS NULL
              OR EXISTS (
                  SELECT 1 FROM public.atlas_person_attribute_evidence ev
                  WHERE ev.person_id = p.person_id
                    AND ev.tenant_id = v_tenant_id
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
                  WHERE ev.person_id = p.person_id
                    AND ev.tenant_id = v_tenant_id
                    AND ev.attribute_key = 'profession'
                    AND ev.normalized_value ILIKE ('%' || p_profession || '%')
                    AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
              )
          )
          AND (
              p_company IS NULL
              OR EXISTS (
                  SELECT 1 FROM public.atlas_person_attribute_evidence ev
                  WHERE ev.person_id = p.person_id
                    AND ev.tenant_id = v_tenant_id
                    AND ev.attribute_key = 'company'
                    AND ev.normalized_value ILIKE ('%' || p_company || '%')
                    AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
              )
          )
          AND (
              p_work_city IS NULL
              OR EXISTS (
                  SELECT 1 FROM public.atlas_person_attribute_evidence ev
                  WHERE ev.person_id = p.person_id
                    AND ev.tenant_id = v_tenant_id
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
                      WHERE ev.person_id = p.person_id
                        AND ev.tenant_id = v_tenant_id
                        AND ev.attribute_key IN ('photo_url', 'avatar_url', 'profile_photo')
                        AND ev.normalized_value IS NOT NULL
                        AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
                  )
              )
              OR (
                  p_has_photo = FALSE AND NOT EXISTS (
                      SELECT 1 FROM public.atlas_person_attribute_evidence ev
                      WHERE ev.person_id = p.person_id
                        AND ev.tenant_id = v_tenant_id
                        AND ev.attribute_key IN ('photo_url', 'avatar_url', 'profile_photo')
                        AND ev.normalized_value IS NOT NULL
                        AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
                  )
              )
          )
          -- Age filter via safe fail-closed ISO parser
          AND (
              p_age_from IS NULL AND p_age_to IS NULL
              OR EXISTS (
                  SELECT 1 FROM public.atlas_person_attribute_evidence ev
                  WHERE ev.person_id = p.person_id
                    AND ev.tenant_id = v_tenant_id
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
          -- Behavioral signal freshness filter
          AND (
              p_has_recent_signal IS NULL
              OR (
                  p_has_recent_signal = TRUE AND (
                      EXISTS (
                          SELECT 1 FROM public.atlas_person_behavior_events bev
                          WHERE bev.person_id = p.person_id
                            AND bev.tenant_id = v_tenant_id
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
          -- Commercial Intent filter (10P-B)
          AND (
              p_intent_topic IS NULL AND p_intent_level IS NULL AND p_min_intent_score IS NULL
              OR EXISTS (
                  SELECT 1 FROM public.atlas_person_intent_state it
                  WHERE it.person_id = p.person_id
                    AND it.tenant_id = v_tenant_id
                    AND (p_intent_topic IS NULL OR it.topic = p_intent_topic)
                    AND (p_intent_level IS NULL OR it.intent_level::TEXT = p_intent_level)
                    AND (p_min_intent_score IS NULL OR it.intent_score >= p_min_intent_score)
                    AND (it.expires_at IS NULL OR it.expires_at > NOW())
              )
          )
          -- Topic Interest filter (10P-B)
          AND (
              p_interest_topic IS NULL AND p_interest_level IS NULL
              OR EXISTS (
                  SELECT 1 FROM public.atlas_person_interest_state intst
                  WHERE intst.person_id = p.person_id
                    AND intst.tenant_id = v_tenant_id
                    AND (p_interest_topic IS NULL OR intst.topic = p_interest_topic)
                    AND (p_interest_level IS NULL OR intst.interest_level::TEXT = p_interest_level)
                    AND (intst.expires_at IS NULL OR intst.expires_at > NOW())
              )
          )
          -- Product Fit filter (10P-C)
          AND (
              p_product_fit_level IS NULL AND p_min_fit_score IS NULL AND p_product_id IS NULL AND p_offer_id IS NULL
              OR EXISTS (
                  SELECT 1 FROM public.atlas_person_product_fit_state pf
                  WHERE pf.person_id = p.person_id
                    AND pf.tenant_id = v_tenant_id
                    AND (p_product_id IS NULL OR pf.product_id = p_product_id)
                    AND (p_offer_id IS NULL OR pf.offer_id = p_offer_id)
                    AND (p_product_fit_level IS NULL OR pf.fit_level = p_product_fit_level)
                    AND (p_min_fit_score IS NULL OR pf.fit_score >= p_min_fit_score)
                    AND (pf.expires_at IS NULL OR pf.expires_at > NOW())
              )
          )
          -- Next Best Action filter (10D)
          AND (
              p_nba_status IS NULL AND p_nba_action IS NULL
              OR EXISTS (
                  SELECT 1 FROM public.atlas_next_best_action_state nba
                  WHERE nba.subject_id = p.person_id
                    AND nba.tenant_id = v_tenant_id
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
                  WHERE ev.person_id = p.person_id
                    AND ev.tenant_id = v_tenant_id
                    AND ev.confidence >= p_min_evidence_confidence
                    AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
              )
          )
    ),
    paged_people AS (
        SELECT 
            fp.person_id,
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
                            -- UNKNOWN != ZERO: fit_score is explicitly NULL when no 10P-C evaluation exists
                            jsonb_build_object(
                                'fit_level', 'UNKNOWN',
                                'fit_score', NULL,
                                'evidence_count', 0,
                                'reason_codes', '[]'::jsonb
                            )
                    END,
                    -- Missing NBA != NO_ACTION: nba is explicitly NULL if no 10D decision exists
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
                    'photo_displayable', FALSE -- Strict privacy: photo evidence does not imply external fetch authority
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
    LEFT JOIN public.atlas_person_coverage cov ON cov.person_id = pp.person_id AND cov.tenant_id = v_tenant_id
    -- Contact identifiers for safe display (never hash)
    LEFT JOIN LATERAL (
        SELECT jsonb_agg(
            jsonb_build_object(
                'identifier_type', id.identifier_type::TEXT,
                'display_value', COALESCE(id.display_value, id.safe_value),
                'verification_status', id.verification_status
            )
        ) AS data
        FROM public.atlas_person_identifiers id
        WHERE id.person_id = pp.person_id AND id.tenant_id = v_tenant_id
    ) idents ON TRUE
    -- READ_MODEL_CONSERVATIVE_CONFLICT: multiple active distinct values yield CONFLICT
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
              AND ev.tenant_id = v_tenant_id
              AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
            GROUP BY ev.attribute_key
        ) attr_agg
    ) attr_lateral ON TRUE
    -- Product Fit lateral
    LEFT JOIN LATERAL (
        SELECT 
            pf.fit_level,
            pf.fit_score,
            pf.evidence_count,
            pf.reason_codes
        FROM public.atlas_person_product_fit_state pf
        WHERE pf.person_id = pp.person_id
          AND pf.tenant_id = v_tenant_id
          AND (pf.expires_at IS NULL OR pf.expires_at > NOW())
        ORDER BY pf.fit_score DESC
        LIMIT 1
    ) fit_lateral ON TRUE
    -- Next Best Action lateral
    LEFT JOIN LATERAL (
        SELECT 
            nba.recommended_action::TEXT AS recommended_action,
            nba.recommended_channel,
            nba.decision_status::TEXT AS decision_status,
            nba.priority_score,
            nba.estimated_action_cost::TEXT AS estimated_action_cost,
            nba.reason_codes
        FROM public.atlas_next_best_action_state nba
        WHERE nba.subject_id = pp.person_id
          AND nba.tenant_id = v_tenant_id
          AND (nba.expires_at IS NULL OR nba.expires_at > NOW())
        ORDER BY nba.priority_score DESC NULLS LAST
        LIMIT 1
    ) nba_lateral ON TRUE
    -- Channel Eligibility lateral
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
    -- Intent lateral
    LEFT JOIN LATERAL (
        SELECT 
            it.topic,
            it.intent_level::TEXT AS intent_level,
            it.intent_score,
            it.last_signal_at
        FROM public.atlas_person_intent_state it
        WHERE it.person_id = pp.person_id
          AND it.tenant_id = v_tenant_id
          AND (it.expires_at IS NULL OR it.expires_at > NOW())
        ORDER BY it.intent_score DESC
        LIMIT 1
    ) intent_lateral ON TRUE
    -- Interest lateral
    LEFT JOIN LATERAL (
        SELECT 
            intst.topic,
            intst.interest_level::TEXT AS interest_level,
            intst.interest_score
        FROM public.atlas_person_interest_state intst
        WHERE intst.person_id = pp.person_id
          AND intst.tenant_id = v_tenant_id
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

-- 5. Access Control hardening
REVOKE ALL ON FUNCTION public.search_canonical_persons_v1 FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_canonical_persons_v1 FROM anon;
GRANT EXECUTE ON FUNCTION public.search_canonical_persons_v1 TO authenticated, service_role;
