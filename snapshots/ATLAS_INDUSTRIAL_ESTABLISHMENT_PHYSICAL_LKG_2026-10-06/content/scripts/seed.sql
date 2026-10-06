DELETE FROM telemetry_provider_conversion WHERE id != '00000000-0000-0000-0000-000000000000';

INSERT INTO telemetry_provider_conversion (
  provider, context_level, intent, sample_size, calls, successes, candidates, 
  eligible_candidates, top20_entries, top5_entries, avg_latency_ms, 
  top20_conversion, top5_conversion, learned_utility
) VALUES
  ('vimeo', 'intent', 'UNKNOWN', 347, 347, 256, 1000, 800, 224, 152, 550, 0.28, 0.19, 82),
  ('archive', 'intent', 'HISTORY', 528, 528, 450, 2000, 1500, 900, 600, 1200, 0.60, 0.40, 89),
  ('dailymotion', 'intent', 'NEWS', 215, 215, 100, 1200, 500, 100, 20, 800, 0.20, 0.04, 55),
  ('atlas', 'global', null, 1500, 1500, 1400, 5000, 4500, 3000, 1500, 100, 0.66, 0.33, 95);
