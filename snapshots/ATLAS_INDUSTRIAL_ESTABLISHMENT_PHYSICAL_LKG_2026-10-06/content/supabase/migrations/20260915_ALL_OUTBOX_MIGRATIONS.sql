-- ═══════════════════════════════════════════════════════════════════════════
-- APLICAR EN SUPABASE DASHBOARD > SQL EDITOR
-- URL: https://supabase.com/dashboard/project/jtnurafmngaxdwlzpvxv/sql/new
-- Copiar y ejecutar TODO este archivo de una sola vez.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. TABLA DURABLE OUTBOX ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.atlas_search_outbox (
  outbox_id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  atlas_person_id       text         NOT NULL,
  source_id             text         NOT NULL,
  source_record_id      text         NOT NULL,
  payload               jsonb        NOT NULL,
  payload_version       integer      NOT NULL DEFAULT 1,
  status                text         NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','PROCESSING','RETRY','PUBLISHED','QUARANTINED')),
  attempt_count         integer      NOT NULL DEFAULT 0,
  created_at            timestamptz  NOT NULL DEFAULT now(),
  next_retry_at         timestamptz  NOT NULL DEFAULT now(),
  processing_started_at timestamptz,
  processing_worker_id  text,
  last_error            text,
  quarantined_at        timestamptz,
  published_at          timestamptz,
  CONSTRAINT atlas_search_outbox_canonical_key UNIQUE (source_id, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_search_outbox_status_retry
  ON public.atlas_search_outbox (status, next_retry_at)
  WHERE status IN ('PENDING','RETRY');

CREATE INDEX IF NOT EXISTS idx_search_outbox_processing
  ON public.atlas_search_outbox (processing_started_at)
  WHERE status = 'PROCESSING';

CREATE INDEX IF NOT EXISTS idx_search_outbox_quarantined
  ON public.atlas_search_outbox (next_retry_at)
  WHERE status = 'QUARANTINED';

CREATE INDEX IF NOT EXISTS idx_search_outbox_created
  ON public.atlas_search_outbox (created_at)
  WHERE status IN ('PENDING','RETRY','QUARANTINED');

-- ── 2. RPC ATÓMICA: commit_canonical_with_search_outbox ───────────────────
CREATE OR REPLACE FUNCTION public.commit_canonical_with_search_outbox(
  p_identity_rows jsonb,
  p_outbox_rows   jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_identity_row    jsonb;
  v_outbox_row      jsonb;
  v_identity_count  integer := 0;
  v_outbox_count    integer := 0;
BEGIN
  FOR v_identity_row IN SELECT * FROM jsonb_array_elements(p_identity_rows)
  LOOP
    INSERT INTO public.atlas_person_identity_map (
      atlas_person_id, source_id, source_person_id, identifier_type,
      identifier_value, evidence_id, confidence, resolution_method, observed_at
    ) VALUES (
      v_identity_row->>'atlas_person_id',
      v_identity_row->>'source_id',
      v_identity_row->>'source_person_id',
      v_identity_row->>'identifier_type',
      v_identity_row->>'identifier_value',
      v_identity_row->>'evidence_id',
      (v_identity_row->>'confidence')::float,
      v_identity_row->>'resolution_method',
      COALESCE((v_identity_row->>'observed_at')::timestamptz, now())
    )
    ON CONFLICT (source_id, source_person_id) DO UPDATE SET
      identifier_value  = EXCLUDED.identifier_value,
      confidence        = EXCLUDED.confidence,
      resolution_method = EXCLUDED.resolution_method,
      observed_at       = EXCLUDED.observed_at;
    v_identity_count := v_identity_count + 1;
  END LOOP;

  FOR v_outbox_row IN SELECT * FROM jsonb_array_elements(p_outbox_rows)
  LOOP
    INSERT INTO public.atlas_search_outbox (
      atlas_person_id, source_id, source_record_id, payload, payload_version,
      status, attempt_count, next_retry_at
    ) VALUES (
      v_outbox_row->>'atlas_person_id',
      v_outbox_row->>'source_id',
      v_outbox_row->>'source_record_id',
      v_outbox_row->'payload',
      COALESCE((v_outbox_row->>'payload_version')::integer, 1),
      'PENDING', 0, now()
    )
    ON CONFLICT (source_id, source_record_id) DO UPDATE SET
      payload         = CASE
                          WHEN EXCLUDED.payload_version > atlas_search_outbox.payload_version
                          THEN EXCLUDED.payload ELSE atlas_search_outbox.payload END,
      payload_version = GREATEST(EXCLUDED.payload_version, atlas_search_outbox.payload_version),
      status          = CASE
                          WHEN EXCLUDED.payload_version > atlas_search_outbox.payload_version
                               AND atlas_search_outbox.status = 'PUBLISHED'
                          THEN 'PENDING' ELSE atlas_search_outbox.status END,
      next_retry_at   = CASE
                          WHEN EXCLUDED.payload_version > atlas_search_outbox.payload_version
                               AND atlas_search_outbox.status = 'PUBLISHED'
                          THEN now() ELSE atlas_search_outbox.next_retry_at END;
    v_outbox_count := v_outbox_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true,
    'identity_upserted', v_identity_count, 'outbox_enqueued', v_outbox_count);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.commit_canonical_with_search_outbox(jsonb, jsonb) TO service_role;

-- ── 3. RPC CLAIM (FOR UPDATE SKIP LOCKED) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_search_outbox_batch(
  p_batch_size    integer DEFAULT 50,
  p_worker_id     text    DEFAULT 'unknown',
  p_lease_seconds integer DEFAULT 120
)
RETURNS SETOF public.atlas_search_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT outbox_id
    FROM public.atlas_search_outbox
    WHERE status IN ('PENDING', 'RETRY') AND next_retry_at <= v_now
    ORDER BY next_retry_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.atlas_search_outbox o
    SET status = 'PROCESSING',
        processing_started_at = v_now,
        processing_worker_id  = p_worker_id
    FROM claimed WHERE o.outbox_id = claimed.outbox_id
    RETURNING o.*
  )
  SELECT * FROM updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_search_outbox_batch(integer, text, integer) TO service_role;

-- ── 4. RPC RELEASE STALE ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.release_stale_processing_rows(
  p_lease_seconds integer DEFAULT 120
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.atlas_search_outbox
  SET status = 'RETRY', next_retry_at = now(),
      last_error = 'LEASE_EXPIRED at ' || now()::text
  WHERE status = 'PROCESSING'
    AND processing_started_at < now() - (p_lease_seconds || ' seconds')::interval;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_stale_processing_rows(integer) TO service_role;

-- ── VERIFICACIÓN ──────────────────────────────────────────────────────────
-- Ejecutar después para confirmar:
SELECT public.commit_canonical_with_search_outbox('[]'::jsonb, '[]'::jsonb);
-- Esperado: {"ok": true, "identity_upserted": 0, "outbox_enqueued": 0}

SELECT public.claim_search_outbox_batch(1, 'test', 30);
-- Esperado: 0 rows (outbox vacío)

SELECT public.release_stale_processing_rows(120);
-- Esperado: 0 (ninguna row stale)

SELECT count(*) FROM public.atlas_search_outbox;
-- Esperado: 0 (tabla vacía, recién creada)
