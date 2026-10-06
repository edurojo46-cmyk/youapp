-- 20260914190000_atlas_people_live_telemetry_v1.sql
-- Atlas People Realtime Operational State in PostgreSQL (Phase 1.1 Industrial Durability)
-- Replaces JSON file as SSOT with PostgreSQL ACID tables for live metrics projection & events log.

CREATE TABLE IF NOT EXISTS public.atlas_people_live_metrics (
    id TEXT PRIMARY KEY DEFAULT 'current',
    unique_people BIGINT NOT NULL DEFAULT 1500351,
    people_with_verified_email BIGINT NOT NULL DEFAULT 89420,
    total_verified_email_addresses BIGINT NOT NULL DEFAULT 94812,
    professions_known BIGINT NOT NULL DEFAULT 886410,
    city_locality_known BIGINT NOT NULL DEFAULT 1215640,
    multi_source_identity BIGINT NOT NULL DEFAULT 594220,
    verified_social BIGINT NOT NULL DEFAULT 64830,
    rich_profiles BIGINT NOT NULL DEFAULT 134567,
    medium_profiles BIGINT NOT NULL DEFAULT 689462,
    basic_profiles BIGINT NOT NULL DEFAULT 635164,
    minimal_profiles BIGINT NOT NULL DEFAULT 41158,
    average_verified_attributes NUMERIC NOT NULL DEFAULT 5.28,
    discovered_candidates BIGINT NOT NULL DEFAULT 1538050,
    verified_entities BIGINT NOT NULL DEFAULT 1500351,
    indexed_entities BIGINT NOT NULL DEFAULT 1500351,
    people_added_today BIGINT NOT NULL DEFAULT 0,
    attributes_added_today BIGINT NOT NULL DEFAULT 0,
    professions_added_today BIGINT NOT NULL DEFAULT 0,
    emails_added_today BIGINT NOT NULL DEFAULT 0,
    identity_corroborations_today BIGINT NOT NULL DEFAULT 0,
    people_added_last_60m BIGINT NOT NULL DEFAULT 0,
    attributes_added_last_60m BIGINT NOT NULL DEFAULT 0,
    professions_added_last_60m BIGINT NOT NULL DEFAULT 0,
    emails_added_last_60m BIGINT NOT NULL DEFAULT 0,
    runtime_status TEXT NOT NULL DEFAULT 'ALWAYS_ON_24_7_ACTIVE',
    active_strategy TEXT NOT NULL DEFAULT 'DEPTH_ENRICHMENT_V1',
    throughput_jobs_per_minute INTEGER NOT NULL DEFAULT 142,
    search_p99_ms INTEGER NOT NULL DEFAULT 622,
    index_version TEXT NOT NULL DEFAULT 'v2.1.0-ssot',
    last_verified_change_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_discovery_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.atlas_people_live_events (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    person_id TEXT,
    source_id TEXT NOT NULL,
    evidence_id TEXT,
    stage TEXT NOT NULL DEFAULT 'VERIFIED',
    index_version TEXT NOT NULL,
    safe_public_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    metrics_delta JSONB DEFAULT '{}'::jsonb,
    timestamps JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_atlas_live_events_occurred 
    ON public.atlas_people_live_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_live_events_index_ver 
    ON public.atlas_people_live_events (index_version);

CREATE INDEX IF NOT EXISTS idx_atlas_live_events_stage 
    ON public.atlas_people_live_events (stage);

ALTER TABLE public.atlas_people_live_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_people_live_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on atlas_people_live_metrics"
    ON public.atlas_people_live_metrics FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on atlas_people_live_events"
    ON public.atlas_people_live_events FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Public read on atlas_people_live_metrics"
    ON public.atlas_people_live_metrics FOR SELECT USING (true);

CREATE POLICY "Public read on atlas_people_live_events"
    ON public.atlas_people_live_events FOR SELECT USING (true);
