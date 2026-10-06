-- 20260914170000_atlas_industrial_queue_jobs.sql
-- Atlas Industrial Queue Orchestrator V1: Persistent Job Ledger
-- Supports 6 logical queues: DISCOVERY_QUEUE, PREFLIGHT_QUEUE, INGESTION_QUEUE, IDENTITY_RESOLUTION_QUEUE, INDEX_REFRESH_QUEUE, AUDIT_QUEUE
-- Zero memory reliance, DB-first, atomic leasing, strict idempotency, checkpoint resume.

CREATE TABLE IF NOT EXISTS public.atlas_industrial_queue_jobs (
    job_id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    queue_name TEXT NOT NULL CHECK (queue_name IN (
        'DISCOVERY_QUEUE',
        'PREFLIGHT_QUEUE',
        'INGESTION_QUEUE',
        'IDENTITY_RESOLUTION_QUEUE',
        'INDEX_REFRESH_QUEUE',
        'AUDIT_QUEUE'
    )),
    job_type TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 50,
    status TEXT NOT NULL CHECK (status IN (
        'PENDING',
        'RUNNING',
        'CHECKPOINTED',
        'COMPLETED',
        'FAILED_RETRYABLE',
        'FAILED_FINAL',
        'BLOCKED'
    )),
    worker_id TEXT,
    lease_expires_at TIMESTAMPTZ,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    checkpoint JSONB NOT NULL DEFAULT '{}'::jsonb,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_industrial_queue_status 
    ON public.atlas_industrial_queue_jobs (queue_name, status, priority DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_industrial_queue_worker 
    ON public.atlas_industrial_queue_jobs (worker_id, lease_expires_at);

CREATE INDEX IF NOT EXISTS idx_industrial_queue_source 
    ON public.atlas_industrial_queue_jobs (source_id);

ALTER TABLE public.atlas_industrial_queue_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on atlas_industrial_queue_jobs"
    ON public.atlas_industrial_queue_jobs
    FOR ALL USING (auth.role() = 'service_role');
