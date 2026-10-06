-- 20260921083000_atlas_signals_engine_v0.sql
-- ATLAS SIGNALS ENGINE V0 SCHEMA
-- Downstream, asynchronous, evidence-linked, idempotent signal store.

CREATE TABLE IF NOT EXISTS public.atlas_signals (
    signal_id text PRIMARY KEY,
    subject_type text NOT NULL CHECK (subject_type IN ('PERSON', 'ORGANIZATION', 'TOPIC', 'DEMAND')),
    subject_id text NOT NULL,
    signal_type text NOT NULL,
    signal_class text NOT NULL CHECK (signal_class IN ('OBSERVED', 'DERIVED', 'AGGREGATED')),
    detected_at timestamptz NOT NULL DEFAULT NOW(),
    effective_at timestamptz NOT NULL,
    evidence_before_id text,
    evidence_after_id text,
    source_count int NOT NULL DEFAULT 1,
    confidence_metadata jsonb NOT NULL,
    signal_payload jsonb NOT NULL,
    dedupe_key text NOT NULL UNIQUE,
    signal_version int NOT NULL DEFAULT 1,
    status text NOT NULL CHECK (status IN ('ACTIVE', 'SUPERSEDED', 'RETRACTED')),
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- High-performance query indexes
CREATE INDEX IF NOT EXISTS idx_signals_subject ON public.atlas_signals (subject_type, subject_id, status);
CREATE INDEX IF NOT EXISTS idx_signals_type ON public.atlas_signals (signal_type, effective_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_effective_at ON public.atlas_signals (effective_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_dedupe ON public.atlas_signals (dedupe_key);

-- RLS
ALTER TABLE public.atlas_signals ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'atlas_signals' AND policyname = 'Service role can manage atlas_signals'
  ) THEN
    CREATE POLICY "Service role can manage atlas_signals" 
      ON public.atlas_signals FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;
