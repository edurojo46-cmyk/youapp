-- ====================================================================
-- ATLAS V1.5 COMPACT HOT RESOLVER & MINIMAL TRANSACTIONAL OUTBOX
-- Disposable Production-Fidelity Shadow Architecture
-- ====================================================================

-- 1. Hot Source Key Map (Narrow: ~64 bytes per row)
CREATE TABLE IF NOT EXISTS public.atlas_hot_source_key_map (
  source_id text NOT NULL,
  source_person_id text NOT NULL,
  atlas_person_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_hot_source_key PRIMARY KEY (source_id, source_person_id)
);

CREATE INDEX IF NOT EXISTS idx_hot_source_key_person_id 
  ON public.atlas_hot_source_key_map (atlas_person_id);

-- 2. Hot National Identity Map (Narrow: ~48 bytes per row)
CREATE TABLE IF NOT EXISTS public.atlas_hot_national_identity_map (
  national_identity_hmac text PRIMARY KEY,
  atlas_person_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hot_nat_id_person_id 
  ON public.atlas_hot_national_identity_map (atlas_person_id);

-- 3. Cold Asynchronous Evidence Store (Decoupled from hot synchronous commit)
CREATE TABLE IF NOT EXISTS public.atlas_identity_evidence_store (
  evidence_id text PRIMARY KEY,
  atlas_person_id text NOT NULL,
  source_id text NOT NULL,
  source_person_id text NOT NULL,
  raw_payload jsonb,
  ingested_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_store_person_id 
  ON public.atlas_identity_evidence_store (atlas_person_id);

-- 4. Minimal Transactional Durable Outbox (Only essential event reconstruction keys)
CREATE TABLE IF NOT EXISTS public.atlas_search_outbox_minimal (
  id bigserial PRIMARY KEY,
  atlas_person_id text NOT NULL,
  source_id text NOT NULL,
  source_person_id text NOT NULL,
  source_record_id text NOT NULL,
  event_type text NOT NULL DEFAULT 'UPSERT',
  status text NOT NULL DEFAULT 'PENDING', -- PENDING, PROCESSING, PUBLISHED, FAILED
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbox_min_pending 
  ON public.atlas_search_outbox_minimal (status, id) 
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_outbox_min_person_id 
  ON public.atlas_search_outbox_minimal (atlas_person_id);
