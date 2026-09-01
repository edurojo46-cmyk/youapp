-- Migration: 20260830000002_v3_4_shadow_rollout.sql
-- Stage 8.5C: Shadow Rollout Infrastructure

-- 1. Create shadow_routing_logs table for dual-path comparison
CREATE TABLE IF NOT EXISTS shadow_routing_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL,
  
  query_context jsonb, -- { intent, topic, format, freshness, language }
  
  static_providers text[], -- Just the IDs (e.g. ['archive', 'peertube'])
  dynamic_providers text[],
  
  static_decision jsonb, -- Detailed array of scored providers for Static path
  dynamic_decision jsonb, -- Detailed array of scored providers for Dynamic path
  
  disagreed boolean NOT NULL DEFAULT false,
  predicted_utility_lift float DEFAULT 0.0,
  
  -- Metadata for traceability
  router_version text DEFAULT 'v1',
  ranking_version text DEFAULT 'v1',
  utility_updated_at timestamptz,
  exploration_triggered boolean DEFAULT false,
  fallback_triggered boolean DEFAULT false,
  
  latency_ms int,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shadow_routing_disagreed ON shadow_routing_logs(disagreed) WHERE disagreed = true;
CREATE INDEX IF NOT EXISTS idx_shadow_routing_created_at ON shadow_routing_logs(created_at);

-- 2. Add advisory lock protection to aggregate_provider_metrics()
CREATE OR REPLACE FUNCTION aggregate_provider_metrics()
RETURNS void AS $$
BEGIN
  -- Prevent concurrent execution using an advisory transaction lock (id: 8500)
  IF NOT pg_try_advisory_xact_lock(8500) THEN
    RAISE NOTICE 'Aggregation already in progress. Skipping.';
    RETURN;
  END IF;

  -- Clear current aggregate table
  TRUNCATE TABLE telemetry_provider_conversion;

  -- Insert newly aggregated metrics combining technical events and audience behavior
  INSERT INTO telemetry_provider_conversion (
    provider,
    intent,
    topic_cluster,
    language,
    content_format,
    sample_size,
    success_rate,
    eligible_yield_rate,
    avg_latency_ms,
    engagement_rate,
    completion_rate,
    value_rate,
    engagement_sample_size,
    completion_sample_size,
    value_sample_size,
    learned_utility,
    confidence_level
  )
  WITH event_stats AS (
    SELECT 
      provider,
      intent,
      topic_cluster,
      language,
      content_format,
      COUNT(*) as sample_size,
      AVG(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_rate,
      AVG(CASE WHEN eligible_candidates > 0 THEN 1 ELSE 0 END) as eligible_yield_rate,
      AVG(latency_ms) as avg_latency_ms
    FROM telemetry_provider_events
    GROUP BY provider, intent, topic_cluster, language, content_format
  ),
  attribution_stats AS (
    SELECT 
      a.provider,
      e.intent,
      e.topic_cluster,
      e.language,
      e.content_format,
      COUNT(a.engaged_at) as engagements,
      COUNT(a.completed_at) as completions,
      COUNT(CASE WHEN a.value_response = 'yes' THEN 1 END) as value_yes,
      COUNT(CASE WHEN a.value_response = 'no' THEN 1 END) as value_no,
      COUNT(a.shown_at) as total_impressions,
      COUNT(a.watch_started_at) as total_watches
    FROM search_result_attribution a
    JOIN telemetry_provider_events e ON a.request_id = e.request_id AND a.provider = e.provider
    GROUP BY a.provider, e.intent, e.topic_cluster, e.language, e.content_format
  )
  SELECT 
    e.provider,
    e.intent,
    e.topic_cluster,
    e.language,
    e.content_format,
    e.sample_size,
    e.success_rate,
    e.eligible_yield_rate,
    e.avg_latency_ms,
    
    -- Organic human metrics
    CASE WHEN a.total_watches > 0 THEN a.engagements::NUMERIC / a.total_watches ELSE 0 END as engagement_rate,
    CASE WHEN a.total_watches > 0 THEN a.completions::NUMERIC / a.total_watches ELSE 0 END as completion_rate,
    CASE WHEN (a.value_yes + a.value_no) > 0 THEN a.value_yes::NUMERIC / (a.value_yes + a.value_no) ELSE 0 END as value_rate,
    
    COALESCE(a.total_watches, 0) as engagement_sample_size,
    COALESCE(a.total_watches, 0) as completion_sample_size,
    COALESCE((a.value_yes + a.value_no), 0) as value_sample_size,
    
    -- Learned Utility Formula (with weight re-normalization)
    (
      (e.success_rate * 30) +
      (CASE WHEN a.total_watches > 0 THEN (a.engagements::NUMERIC / a.total_watches) * 30 ELSE 0 END) +
      (CASE WHEN (a.value_yes + a.value_no) > 0 THEN (a.value_yes::NUMERIC / (a.value_yes + a.value_no)) * 40 ELSE 0 END)
    ) * (
      -- Re-normalization multiplier if value is missing
      CASE 
        WHEN COALESCE((a.value_yes + a.value_no), 0) = 0 AND COALESCE(a.total_watches, 0) = 0 THEN 3.33 
        WHEN COALESCE((a.value_yes + a.value_no), 0) = 0 THEN 1.66 
        ELSE 1.0
      END
    ) as learned_utility,
    
    -- Confidence Level based on shrinkage logic (Strictly matched to 8.5C definitions)
    CASE 
      WHEN e.sample_size < 20 THEN 'none'
      WHEN e.sample_size < 100 THEN 'low'
      WHEN e.sample_size < 500 THEN 'medium'
      ELSE 'high'
    END as confidence_level
    
  FROM event_stats e
  LEFT JOIN attribution_stats a ON 
    e.provider = a.provider AND 
    e.intent = a.intent AND 
    COALESCE(e.topic_cluster, '') = COALESCE(a.topic_cluster, '') AND
    COALESCE(e.language, '') = COALESCE(a.language, '') AND
    COALESCE(e.content_format, '') = COALESCE(a.content_format, '');
END;
$$ LANGUAGE plpgsql;


-- 3. Configure pg_cron for 5-minute aggregation
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  -- Safely schedule the cron job, removing it first if it already exists to be idempotent
  PERFORM cron.unschedule('aggregate_provider_metrics_cron');
  PERFORM cron.schedule('aggregate_provider_metrics_cron', '*/5 * * * *', 'SELECT aggregate_provider_metrics()');
EXCEPTION WHEN OTHERS THEN
  -- Fallback if pg_cron extension lacks permissions in this DB user context
  RAISE NOTICE 'pg_cron setup failed. Manual or Supabase dashboard configuration may be required.';
END $$;
