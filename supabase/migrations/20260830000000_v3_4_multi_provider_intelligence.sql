-- Stage 8.4: Multi-Provider Intelligence
-- Telemetry events, aggregates, and provider health.

-- 1. Telemetry Provider Events
CREATE TABLE telemetry_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL,
  provider text NOT NULL,

  intent text,
  topic_cluster text,
  language text,
  country text,
  freshness text,
  content_format text,

  -- Router Context
  selection_reason text,
  dynamic_score float,
  static_fit float,
  learned_utility float,
  health_score float,
  exploration boolean DEFAULT false,

  was_selected boolean DEFAULT false,
  was_called boolean DEFAULT false,

  status text,
  latency_ms int,

  raw_candidates int DEFAULT 0,
  normalized_candidates int DEFAULT 0,
  eligible_candidates int DEFAULT 0,

  top20_count int DEFAULT 0,
  top5_count int DEFAULT 0,

  radar_required boolean DEFAULT false,
  estimated_cost float DEFAULT 0,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_telemetry_provider_events_provider ON telemetry_provider_events(provider, created_at);

-- 2. Search Result Attribution (Engagement tracking)
CREATE TABLE search_result_attribution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL,
  content_id text NOT NULL,
  provider text NOT NULL,
  retrieval_source text,
  position int,

  clicked boolean DEFAULT false,
  watch_started boolean DEFAULT false,
  engaged boolean DEFAULT false,
  completed boolean DEFAULT false,
  saved boolean DEFAULT false,
  value_yes boolean DEFAULT false,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(request_id, content_id)
);

CREATE INDEX idx_search_attribution_provider ON search_result_attribution(provider);

-- 3. Provider Health Current
CREATE TABLE provider_health_current (
  provider text PRIMARY KEY,
  health_score float DEFAULT 100,
  status text DEFAULT 'healthy', -- healthy, degraded, unhealthy, circuit_open

  success_rate_15m float,
  error_rate_15m float,
  rate_limit_rate_15m float,

  latency_p50_15m float,
  latency_p95_15m float,

  consecutive_failures int DEFAULT 0,
  circuit_open boolean DEFAULT false,
  circuit_open_until timestamptz,

  updated_at timestamptz DEFAULT now()
);

-- 4. Telemetry Provider Conversion (Aggregates)
CREATE TABLE telemetry_provider_conversion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  provider text NOT NULL,
  context_level text NOT NULL, -- 'global', 'intent', 'intent_topic', 'intent_topic_language', 'intent_topic_language_format'
  
  intent text,
  topic_cluster text,
  language text,
  freshness text,
  content_format text,

  sample_size int DEFAULT 0,
  calls int DEFAULT 0,
  successes int DEFAULT 0,

  candidates int DEFAULT 0,
  eligible_candidates int DEFAULT 0,

  top20_entries int DEFAULT 0,
  top5_entries int DEFAULT 0,

  clicks int DEFAULT 0,
  engaged_views int DEFAULT 0,
  completions int DEFAULT 0,
  value_yes int DEFAULT 0,
  value_no int DEFAULT 0,

  avg_latency_ms float,
  p95_latency_ms float,

  error_rate float,
  rate_limit_rate float,

  top20_conversion float,
  top5_conversion float,
  engagement_rate float,
  value_rate float,

  learned_utility float,

  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(provider, context_level, intent, topic_cluster, language, freshness, content_format)
);

-- Extension pg_cron for scheduled aggregation
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 5. Aggregation Function
CREATE OR REPLACE FUNCTION aggregate_provider_metrics()
RETURNS void AS $$
BEGIN
  -- V1: Just aggregates globally per provider over the last 7 days.
  
  INSERT INTO telemetry_provider_conversion (
    provider, context_level, 
    intent, topic_cluster, language, freshness, content_format,
    sample_size, calls, successes,
    candidates, eligible_candidates, top20_entries, top5_entries,
    avg_latency_ms,
    top20_conversion, top5_conversion, learned_utility, updated_at
  )
  SELECT 
    t.provider, 'global' as context_level,
    NULL as intent, NULL as topic_cluster, NULL as language, NULL as freshness, NULL as content_format,
    COUNT(*) as sample_size,
    COUNT(*) as calls,
    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successes,
    SUM(raw_candidates) as candidates,
    SUM(eligible_candidates) as eligible_candidates,
    SUM(top20_count) as top20_entries,
    SUM(top5_count) as top5_entries,
    AVG(latency_ms) as avg_latency_ms,
    CASE WHEN SUM(eligible_candidates) > 0 THEN SUM(top20_count)::float / SUM(eligible_candidates) ELSE 0 END as top20_conversion,
    CASE WHEN SUM(eligible_candidates) > 0 THEN SUM(top5_count)::float / SUM(eligible_candidates) ELSE 0 END as top5_conversion,
    
    -- V1 Utility (Top20 + Top5 + Success + Latency approximations)
    (
      (0.25 * CASE WHEN SUM(eligible_candidates) > 0 THEN SUM(top20_count)::float / SUM(eligible_candidates) ELSE 0 END) +
      (0.15 * CASE WHEN SUM(eligible_candidates) > 0 THEN SUM(top5_count)::float / SUM(eligible_candidates) ELSE 0 END) +
      (0.10 * CASE WHEN COUNT(*) > 0 THEN SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END)::float / COUNT(*) ELSE 0 END)
    ) * 100 as learned_utility,
    now()
  FROM telemetry_provider_events t
  WHERE t.created_at >= now() - interval '7 days'
  GROUP BY t.provider
  ON CONFLICT (provider, context_level, intent, topic_cluster, language, freshness, content_format) 
  DO UPDATE SET
    sample_size = EXCLUDED.sample_size,
    calls = EXCLUDED.calls,
    successes = EXCLUDED.successes,
    candidates = EXCLUDED.candidates,
    eligible_candidates = EXCLUDED.eligible_candidates,
    top20_entries = EXCLUDED.top20_entries,
    top5_entries = EXCLUDED.top5_entries,
    avg_latency_ms = EXCLUDED.avg_latency_ms,
    top20_conversion = EXCLUDED.top20_conversion,
    top5_conversion = EXCLUDED.top5_conversion,
    learned_utility = EXCLUDED.learned_utility,
    updated_at = EXCLUDED.updated_at;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  PERFORM cron.schedule('aggregate-metrics-5m', '*/5 * * * *', 'SELECT aggregate_provider_metrics();');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available or schedule failed: %', SQLERRM;
END;
$$;

-- 6. Row Level Security (RLS) Policies
ALTER TABLE telemetry_provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_result_attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_health_current ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_provider_conversion ENABLE ROW LEVEL SECURITY;

-- Allow anon to insert events (Frontend telemetry ingestion)
CREATE POLICY "Allow anon insert telemetry_provider_events" ON telemetry_provider_events FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon insert search_result_attribution" ON search_result_attribution FOR INSERT TO anon WITH CHECK (true);

-- Allow anon to read aggregates and health (Frontend dashboard and routing)
CREATE POLICY "Allow anon select provider_health_current" ON provider_health_current FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon select telemetry_provider_conversion" ON telemetry_provider_conversion FOR SELECT TO anon USING (true);
