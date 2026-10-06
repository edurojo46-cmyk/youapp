-- 20260914150000_atlas_people_resolution_tables.sql
-- Resolution runs and transactional item checkpoints for Atlas People Scale Phase (11K -> 25K)

CREATE TABLE IF NOT EXISTS public.atlas_people_resolution_runs (
    run_id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    start_universe INTEGER NOT NULL,
    raw_processed INTEGER DEFAULT 0,
    works_resolved INTEGER DEFAULT 0,
    identities_resolved INTEGER DEFAULT 0,
    net_new_current INTEGER DEFAULT 0,
    net_new_recent INTEGER DEFAULT 0,
    net_new_associated INTEGER DEFAULT 0,
    non_caba_resolved INTEGER DEFAULT 0,
    unresolved INTEGER DEFAULT 0,
    overlap INTEGER DEFAULT 0,
    invalid INTEGER DEFAULT 0,
    api_requests_openalex INTEGER DEFAULT 0,
    api_requests_crossref INTEGER DEFAULT 0,
    free_budget_used NUMERIC(10, 4) DEFAULT 0,
    external_data_charge_usd NUMERIC(10, 4) DEFAULT 0 CHECK (external_data_charge_usd = 0),
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'STOPPED_429', 'FAILED')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.atlas_people_resolution_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id TEXT NOT NULL,
    discovery_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    resolver_version TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN (
        'PENDING',
        'IN_PROGRESS',
        'RESOLVED_CABA',
        'RESOLVED_NON_CABA',
        'UNRESOLVED',
        'RATE_LIMITED',
        'FAILED_RETRYABLE',
        'FAILED_FINAL'
    )),
    attempt_count INTEGER DEFAULT 0,
    resolved_person_external_id TEXT,
    identity_confidence TEXT,
    territorial_state TEXT,
    last_error TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT uq_discovery_resolver_version UNIQUE (discovery_id, resolver_version)
);

CREATE INDEX IF NOT EXISTS idx_resolution_items_run ON public.atlas_people_resolution_items(run_id);
CREATE INDEX IF NOT EXISTS idx_resolution_items_status ON public.atlas_people_resolution_items(status);
