-- Stage 8.5B-3.3: Organic Empirical Learning
-- Update search_result_attribution with timestamps and new value_response
ALTER TABLE search_result_attribution
  ADD COLUMN IF NOT EXISTS shown_at timestamptz,
  ADD COLUMN IF NOT EXISTS clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS watch_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS engaged_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS saved_at timestamptz,
  ADD COLUMN IF NOT EXISTS value_responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS value_response text CHECK (value_response IN ('yes', 'no', null)),
  ADD COLUMN IF NOT EXISTS watch_time_ms bigint,
  ADD COLUMN IF NOT EXISTS max_progress_pct float;

-- 2. Update the aggregate_provider_metrics function
CREATE OR REPLACE FUNCTION aggregate_provider_metrics()
RETURNS void AS $$
BEGIN
  -- We use a CTE to aggregate attribution metrics per provider and telemetry events
  WITH attr_agg AS (
    SELECT
      provider,
      COUNT(shown_at) as impressions,
      COUNT(clicked_at) as clicks,
      SUM(CASE WHEN engaged_at IS NOT NULL THEN 1 ELSE 0 END) as engaged_views,
      SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) as completions,
      SUM(CASE WHEN value_response = 'yes' THEN 1 ELSE 0 END) as value_yes,
      SUM(CASE WHEN value_response = 'no' THEN 1 ELSE 0 END) as value_no
    FROM search_result_attribution
    WHERE created_at >= now() - interval '7 days'
    GROUP BY provider
  ),
  event_agg AS (
    SELECT 
      provider,
      COUNT(*) as sample_size,
      COUNT(*) as calls,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successes,
      SUM(raw_candidates) as candidates,
      SUM(eligible_candidates) as eligible_candidates,
      SUM(top20_count) as top20_entries,
      SUM(top5_count) as top5_entries,
      AVG(latency_ms) as avg_latency_ms,
      CASE WHEN SUM(eligible_candidates) > 0 THEN SUM(top20_count)::float / SUM(eligible_candidates) ELSE 0 END as top20_conversion,
      CASE WHEN SUM(eligible_candidates) > 0 THEN SUM(top5_count)::float / SUM(eligible_candidates) ELSE 0 END as top5_conversion
    FROM telemetry_provider_events
    WHERE created_at >= now() - interval '7 days'
    GROUP BY provider
  ),
  combined_agg AS (
    SELECT
      e.provider,
      e.sample_size,
      e.calls,
      e.successes,
      e.candidates,
      e.eligible_candidates,
      e.top20_entries,
      e.top5_entries,
      e.avg_latency_ms,
      e.top20_conversion,
      e.top5_conversion,
      
      COALESCE(a.clicks, 0) as clicks,
      COALESCE(a.engaged_views, 0) as engaged_views,
      COALESCE(a.completions, 0) as completions,
      COALESCE(a.value_yes, 0) as value_yes,
      COALESCE(a.value_no, 0) as value_no,
      
      -- engagement_rate
      CASE WHEN COALESCE(a.clicks, 0) > 0 THEN COALESCE(a.engaged_views, 0)::float / a.clicks ELSE 0 END as engagement_rate,
      
      -- value_rate (YES / (YES + NO))
      CASE WHEN (COALESCE(a.value_yes, 0) + COALESCE(a.value_no, 0)) > 0 
           THEN COALESCE(a.value_yes, 0)::float / (COALESCE(a.value_yes, 0) + COALESCE(a.value_no, 0)) 
           ELSE 0 END as value_rate,
      
      -- weights
      0.10 as w_top20,
      0.15 as w_top5,
      0.10 as w_success,
      (CASE WHEN COALESCE(a.clicks, 0) > 0 THEN 0.30 ELSE 0 END) as w_engagement,
      (CASE WHEN COALESCE(a.clicks, 0) > 0 THEN 0.15 ELSE 0 END) as w_completion,
      (CASE WHEN (COALESCE(a.value_yes, 0) + COALESCE(a.value_no, 0)) > 0 THEN 0.20 ELSE 0 END) as w_value
    FROM event_agg e
    LEFT JOIN attr_agg a ON e.provider = a.provider
  )
  INSERT INTO telemetry_provider_conversion (
    provider, context_level, 
    intent, topic_cluster, language, freshness, content_format,
    sample_size, calls, successes,
    candidates, eligible_candidates, top20_entries, top5_entries,
    avg_latency_ms,
    top20_conversion, top5_conversion, 
    clicks, engaged_views, completions, value_yes, value_no,
    engagement_rate, value_rate,
    learned_utility, updated_at
  )
  SELECT 
    c.provider, 'global' as context_level,
    NULL as intent, NULL as topic_cluster, NULL as language, NULL as freshness, NULL as content_format,
    c.sample_size, c.calls, c.successes, c.candidates, c.eligible_candidates, c.top20_entries, c.top5_entries, c.avg_latency_ms,
    c.top20_conversion, c.top5_conversion, c.clicks, c.engaged_views, c.completions, c.value_yes, c.value_no,
    c.engagement_rate, c.value_rate,
    
    -- Renormalized Utility
    CASE WHEN (c.w_top20 + c.w_top5 + c.w_success + c.w_engagement + c.w_completion + c.w_value) > 0 THEN
      (
        (
          (c.w_top20 * c.top20_conversion) +
          (c.w_top5 * c.top5_conversion) +
          (c.w_success * CASE WHEN c.calls > 0 THEN c.successes::float / c.calls ELSE 0 END) +
          (c.w_engagement * c.engagement_rate) +
          (c.w_completion * CASE WHEN c.clicks > 0 THEN c.completions::float / c.clicks ELSE 0 END) +
          (c.w_value * c.value_rate)
        ) 
        / 
        (c.w_top20 + c.w_top5 + c.w_success + c.w_engagement + c.w_completion + c.w_value)
      ) * 100
    ELSE 0 END as learned_utility,
    
    now()
  FROM combined_agg c
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
    clicks = EXCLUDED.clicks,
    engaged_views = EXCLUDED.engaged_views,
    completions = EXCLUDED.completions,
    value_yes = EXCLUDED.value_yes,
    value_no = EXCLUDED.value_no,
    engagement_rate = EXCLUDED.engagement_rate,
    value_rate = EXCLUDED.value_rate,
    learned_utility = EXCLUDED.learned_utility,
    updated_at = EXCLUDED.updated_at;
END;
$$ LANGUAGE plpgsql;
