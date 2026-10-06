-- ==============================================================================
-- Migration: 20260922180000_create_atlas_ai_usage_events.sql
-- Goal: Create compact, secure AI Usage Ledger table for Atlas Cost Control Plane.
-- BACKEND ONLY, RLS ENABLED, REVOKE ALL from anon and authenticated.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_ai_usage_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  cycle_id TEXT,
  operation_type TEXT NOT NULL,
  source_universe_id TEXT,
  motor_id TEXT,
  provider TEXT NOT NULL DEFAULT 'Google GenAI',
  model TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
  billing_mode TEXT NOT NULL DEFAULT 'ANTIGRAVITY_BASE_QUOTA', -- ANTIGRAVITY_BASE_QUOTA, GEMINI_API_PAID, GEMINI_API_FREE_TIER, etc.
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  thinking_tokens INTEGER DEFAULT 0,
  cached_tokens INTEGER DEFAULT 0,
  grounding_search_requests INTEGER DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  success BOOLEAN DEFAULT TRUE,
  estimated_incremental_cost_usd NUMERIC(10, 6) DEFAULT 0.000000,
  pricing_version TEXT DEFAULT '2026-09-GOOGLE-OFFICIAL-V1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Index for efficient temporal and cycle aggregation
CREATE INDEX IF NOT EXISTS idx_atlas_ai_usage_events_ts ON public.atlas_ai_usage_events (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_atlas_ai_usage_events_cycle ON public.atlas_ai_usage_events (cycle_id);

-- Enforce strict RLS
ALTER TABLE public.atlas_ai_usage_events ENABLE ROW LEVEL SECURITY;

-- Revoke all permissions from untrusted roles
REVOKE ALL ON TABLE public.atlas_ai_usage_events FROM anon;
REVOKE ALL ON TABLE public.atlas_ai_usage_events FROM authenticated;

-- Grant access strictly to backend service_role and postgres
GRANT ALL ON TABLE public.atlas_ai_usage_events TO service_role;
GRANT ALL ON TABLE public.atlas_ai_usage_events TO postgres;

-- Policy for service_role
DROP POLICY IF EXISTS "service_role_full_access" ON public.atlas_ai_usage_events;
CREATE POLICY "service_role_full_access" 
  ON public.atlas_ai_usage_events 
  FOR ALL 
  TO service_role 
  USING (true) WITH CHECK (true);
