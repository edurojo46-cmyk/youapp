-- 20260911231003_atlas_ingestion_runs_v1.sql

CREATE TABLE IF NOT EXISTS public.atlas_ingestion_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED', 'FAILED_STALE', 'CANCELLED')),
    
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    
    heartbeat_at TIMESTAMPTZ,
    lease_expires_at TIMESTAMPTZ,
    
    source_version TEXT,
    source_content_hash TEXT,
    
    rows_seen INTEGER DEFAULT 0,
    rows_inserted INTEGER DEFAULT 0,
    rows_skipped INTEGER DEFAULT 0,
    rows_changed INTEGER DEFAULT 0,
    
    error_code TEXT,
    error_message TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Concurrency Guard: Prevent two active runs for the same source
CREATE UNIQUE INDEX idx_atlas_ingestion_runs_concurrency 
ON public.atlas_ingestion_runs(source_id) 
WHERE status = 'RUNNING';

-- RLS
ALTER TABLE public.atlas_ingestion_runs ENABLE ROW LEVEL SECURITY;

-- Deny all anonymous access
CREATE POLICY "Deny anon insert ingestion runs" ON public.atlas_ingestion_runs FOR INSERT TO anon WITH CHECK (false);
CREATE POLICY "Deny anon update ingestion runs" ON public.atlas_ingestion_runs FOR UPDATE TO anon WITH CHECK (false);
