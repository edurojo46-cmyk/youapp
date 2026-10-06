-- ============================================================
-- ATLAS SEARCH OUTBOX — Durable Canonical → Search Decoupling
-- ============================================================
-- Garantía: CANONICAL_COMMITTED ⇒ OUTBOX_EXISTS (via RPC atómica)
-- Garantía: LOST_SEARCH_PUBLICATIONS = 0
-- Garantía: SEARCH_PUBLISH_IDEMPOTENT = TRUE (UNIQUE constraint)
-- ============================================================

-- Tabla principal del outbox durable
CREATE TABLE IF NOT EXISTS public.atlas_search_outbox (
  outbox_id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  atlas_person_id      text         NOT NULL,
  source_id            text         NOT NULL,
  source_record_id     text         NOT NULL,
  payload              jsonb        NOT NULL,
  payload_version      integer      NOT NULL DEFAULT 1,
  status               text         NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING','PROCESSING','RETRY','PUBLISHED','QUARANTINED')),
  attempt_count        integer      NOT NULL DEFAULT 0,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  next_retry_at        timestamptz  NOT NULL DEFAULT now(),
  processing_started_at timestamptz,
  processing_worker_id text,
  last_error           text,
  quarantined_at       timestamptz,
  published_at         timestamptz,

  -- Clave de idempotencia: una sola entrada por entidad canónica
  -- ON CONFLICT (source_id, source_record_id) para upsert idempotente
  CONSTRAINT atlas_search_outbox_canonical_key
    UNIQUE (source_id, source_record_id)
);

-- Índice principal para el publisher: rows disponibles para procesar
CREATE INDEX IF NOT EXISTS idx_search_outbox_status_retry
  ON public.atlas_search_outbox (status, next_retry_at)
  WHERE status IN ('PENDING','RETRY');

-- Índice para lease recovery: detectar PROCESSING stale
CREATE INDEX IF NOT EXISTS idx_search_outbox_processing
  ON public.atlas_search_outbox (processing_started_at)
  WHERE status = 'PROCESSING';

-- Índice para el reconciliador de QUARANTINED
CREATE INDEX IF NOT EXISTS idx_search_outbox_quarantined
  ON public.atlas_search_outbox (next_retry_at)
  WHERE status = 'QUARANTINED';

-- Índice para métricas de antigüedad
CREATE INDEX IF NOT EXISTS idx_search_outbox_created
  ON public.atlas_search_outbox (created_at)
  WHERE status IN ('PENDING','RETRY','QUARANTINED');

-- Índice por atlas_person_id para auditoría
CREATE INDEX IF NOT EXISTS idx_search_outbox_person
  ON public.atlas_search_outbox (atlas_person_id);

COMMENT ON TABLE public.atlas_search_outbox IS
  'Durable outbox for Search publication. Every canonical commit produces one row here. '
  'Publisher reads PENDING/RETRY rows, upserts to discovery_candidates, marks PUBLISHED. '
  'QUARANTINED rows are never deleted — reconciler retries them hourly. '
  'DROPPED status is PROHIBITED. LOST_SEARCH_PUBLICATIONS must always = 0.';

COMMENT ON COLUMN public.atlas_search_outbox.processing_started_at IS
  'Set when publisher claims the row (PROCESSING). Used for lease expiry detection.';

COMMENT ON COLUMN public.atlas_search_outbox.processing_worker_id IS
  'PID or worker identifier that claimed this row. For multi-publisher safety.';

COMMENT ON COLUMN public.atlas_search_outbox.quarantined_at IS
  'Timestamp when row entered QUARANTINED state (after 20 failed attempts). '
  'Reconciler retries these rows every hour indefinitely. Never deleted automatically.';
