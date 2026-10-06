-- ═══════════════════════════════════════════════════════════════════════════
-- 20260917000002_hyperthroughput_staging_and_commit.sql
-- ARQUITECTURA HYPERTHROUGHPUT: B + A + CONTROLLED OUTBOX
-- 1. UNLOGGED Staging Table (Zero WAL, Zero DNI Crudo)
-- 2. Bulk Staging Ingestion RPC (jsonb_to_recordset, blocks de 5k-25k)
-- 3. Set-Based Identity Reconciliation & Canonical Commit RPC
-- 4. Controlled Search Outbox Publisher RPC
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. UNLOGGED STAGING TABLE (Disposable, high write throughput, zero WAL bloat)
CREATE UNLOGGED TABLE IF NOT EXISTS public.benchmark_people_staging (
    staging_id bigserial PRIMARY KEY,
    run_id text NOT NULL,
    source_id text NOT NULL,
    source_person_id text NOT NULL,
    identifier_type text NOT NULL,
    identity_hmac text NOT NULL,
    atlas_person_id text NOT NULL,
    display_name text NOT NULL,
    role text,
    organization text,
    search_text_normalized text,
    created_at timestamptz DEFAULT clock_timestamp()
);

-- Index for fast deduplication and set-based joins
CREATE INDEX IF NOT EXISTS idx_benchmark_staging_run_lookup 
ON public.benchmark_people_staging (run_id, source_id, source_person_id);

CREATE INDEX IF NOT EXISTS idx_benchmark_staging_person_id 
ON public.benchmark_people_staging (run_id, atlas_person_id);

-- 2. BULK STAGING INGESTION RPC (Transporta bloques compactos hacia UNLOGGED staging)
CREATE OR REPLACE FUNCTION public.atlas_stage_people_bulk_v1(
    p_run_id text,
    p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_count int := 0;
BEGIN
    INSERT INTO public.benchmark_people_staging (
        run_id, source_id, source_person_id, identifier_type,
        identity_hmac, atlas_person_id, display_name, role,
        organization, search_text_normalized
    )
    SELECT
        p_run_id,
        x.source_id,
        x.source_person_id,
        x.identifier_type,
        x.identity_hmac,
        x.atlas_person_id,
        x.display_name,
        x.role,
        x.organization,
        x.search_text_normalized
    FROM jsonb_to_recordset(p_rows) AS x(
        source_id text,
        source_person_id text,
        identifier_type text,
        identity_hmac text,
        atlas_person_id text,
        display_name text,
        role text,
        organization text,
        search_text_normalized text
    );

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'ok', true,
        'staged_rows', v_count
    );
END;
$$;

-- 3. SET-BASED CANONICAL RECONCILIATION & COMMIT RPC
-- Ejecuta la reconciliación por conjuntos en PostgreSQL
-- Evita UPDATE innecesarios en identidades existentes (cero WAL, cero dead tuples)
CREATE OR REPLACE FUNCTION public.atlas_reconcile_and_commit_staging_v1(
    p_run_id text,
    p_batch_limit int DEFAULT 25000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_staged_total int := 0;
    v_inserted int := 0;
    v_existing_unchanged int := 0;
    v_unique_people int := 0;
    v_outbox_produced int := 0;
BEGIN
    -- Contar registros en el lote de staging
    SELECT COUNT(*), COUNT(DISTINCT atlas_person_id)
    INTO v_staged_total, v_unique_people
    FROM public.benchmark_people_staging
    WHERE run_id = p_run_id;

    IF v_staged_total = 0 THEN
        RETURN jsonb_build_object(
            'ok', true,
            'staged_total', 0,
            'inserted', 0,
            'existing_unchanged', 0,
            'unique_people', 0
        );
    END IF;

    -- 3A. Inserción canónica SET-BASED hacia atlas_person_identity_map
    -- ON CONFLICT DO NOTHING: Las identidades ya existentes NO generan updates ni WAL
    WITH incoming AS (
        SELECT DISTINCT ON (source_id, source_person_id)
            atlas_person_id,
            source_id,
            source_person_id,
            identifier_type,
            identity_hmac AS identifier_value,
            'evi_' || substr(source_person_id, 1, 16) AS evidence_id,
            1.0::float8 AS confidence,
            'HMAC_DNI_DETERMINISTIC'::text AS resolution_method,
            now() AS observed_at
        FROM public.benchmark_people_staging
        WHERE run_id = p_run_id
        ORDER BY source_id, source_person_id
    ),
    inserted_rows AS (
        INSERT INTO public.atlas_person_identity_map (
            atlas_person_id, source_id, source_person_id, identifier_type,
            identifier_value, evidence_id, confidence, resolution_method, observed_at
        )
        SELECT * FROM incoming
        ON CONFLICT (source_id, source_person_id) DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_inserted FROM inserted_rows;

    v_existing_unchanged := v_staged_total - v_inserted;

    -- 3B. Generar delta hacia Search Outbox para nuevas o actualizadas
    WITH unprojected AS (
        SELECT DISTINCT ON (s.atlas_person_id)
            s.atlas_person_id,
            s.source_id,
            s.source_person_id,
            s.display_name,
            s.role,
            s.organization,
            s.search_text_normalized
        FROM public.benchmark_people_staging s
        WHERE s.run_id = p_run_id
          AND NOT EXISTS (
              SELECT 1 FROM public.atlas_people_discovery_candidates c
              WHERE c.atlas_person_id = s.atlas_person_id
          )
        ORDER BY s.atlas_person_id
    ),
    outbox_ins AS (
        INSERT INTO public.atlas_search_outbox (
            atlas_person_id, source_id, source_record_id, status, payload, created_at
        )
        SELECT
            u.atlas_person_id,
            u.source_id,
            u.source_person_id,
            'PENDING',
            jsonb_build_object(
                'discovery_id', 'disc_' || lower(substr(u.source_id, 1, 4)) || '_' || substr(u.source_person_id, 1, 24),
                'atlas_person_id', u.atlas_person_id,
                'display_name', u.display_name,
                'profession', 'Directivo / Autoridad',
                'role', u.role,
                'organization', u.organization,
                'geography_id', 'arg_nacional',
                'location_relation_type', 'CORPORATE_AUTHORITY',
                'location_evidence', 'Registro Oficial',
                'search_text_normalized', u.search_text_normalized,
                'current_activity_state', 'ACTIVE',
                'evidence_strength', 'HIGH',
                'source_id', u.source_id,
                'source_record_id', u.source_person_id,
                'social_profiles', '[]'::jsonb,
                'first_seen_at', now(),
                'last_seen_at', now(),
                'source_last_checked_at', now()
            ),
            now()
        FROM unprojected u
        ON CONFLICT DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_outbox_produced FROM outbox_ins;

    -- Limpiar el lote procesado de staging para liberar espacio en memoria
    DELETE FROM public.benchmark_people_staging WHERE run_id = p_run_id;

    RETURN jsonb_build_object(
        'ok', true,
        'staged_total', v_staged_total,
        'inserted_new', v_inserted,
        'existing_unchanged', v_existing_unchanged,
        'unique_people_processed', v_unique_people,
        'outbox_delta_produced', v_outbox_produced
    );
END;
$$;

-- 4. CONTROLLED SEARCH OUTBOX PUBLISHER RPC
-- Drena bloques de outbox hacia atlas_people_discovery_candidates sin bloquear Search
CREATE OR REPLACE FUNCTION public.atlas_drain_search_outbox_controlled_v1(
    p_batch_size int DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_published int := 0;
BEGIN
    WITH candidate_outbox AS (
        SELECT id, payload
        FROM public.atlas_search_outbox
        WHERE status IN ('PENDING', 'RETRY')
        ORDER BY id
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    ),
    upserted_candidates AS (
        INSERT INTO public.atlas_people_discovery_candidates (
            discovery_id, atlas_person_id, display_name, profession, role, organization,
            geography_id, location_relation_type, location_evidence, search_text_normalized,
            current_activity_state, evidence_strength, source_id, source_record_id,
            social_profiles, first_seen_at, last_seen_at, source_last_checked_at
        )
        SELECT
            (payload->>'discovery_id')::text,
            (payload->>'atlas_person_id')::text,
            (payload->>'display_name')::text,
            (payload->>'profession')::text,
            (payload->>'role')::text,
            (payload->>'organization')::text,
            (payload->>'geography_id')::text,
            (payload->>'location_relation_type')::text,
            (payload->>'location_evidence')::text,
            (payload->>'search_text_normalized')::text,
            (payload->>'current_activity_state')::text,
            (payload->>'evidence_strength')::text,
            (payload->>'source_id')::text,
            (payload->>'source_record_id')::text,
            COALESCE(payload->'social_profiles', '[]'::jsonb),
            COALESCE((payload->>'first_seen_at')::timestamptz, now()),
            COALESCE((payload->>'last_seen_at')::timestamptz, now()),
            COALESCE((payload->>'source_last_checked_at')::timestamptz, now())
        FROM candidate_outbox
        ON CONFLICT (discovery_id) DO UPDATE SET
            last_seen_at = EXCLUDED.last_seen_at
        RETURNING 1
    ),
    updated_outbox AS (
        UPDATE public.atlas_search_outbox o
        SET status = 'PUBLISHED', processed_at = now()
        FROM candidate_outbox c
        WHERE o.id = c.id
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_published FROM updated_outbox;

    RETURN jsonb_build_object(
        'ok', true,
        'published_rows', v_published
    );
END;
$$;

-- Permisos
GRANT ALL ON public.benchmark_people_staging TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON FUNCTION public.atlas_stage_people_bulk_v1(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.atlas_reconcile_and_commit_staging_v1(text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.atlas_drain_search_outbox_controlled_v1(int) TO service_role;
