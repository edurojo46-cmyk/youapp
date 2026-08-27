CREATE TABLE search_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_name text NOT NULL,
  session_id text,
  query_normalized text,
  provider text,
  result_count integer,
  latency_ms integer,
  cache_source text,
  created_at timestamptz DEFAULT now()
);

-- RLS configurado para permitir inserciones anónimas
ALTER TABLE search_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous inserts to search_events" ON search_events
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "Allow authenticated inserts to search_events" ON search_events
  FOR INSERT TO authenticated
  WITH CHECK (true);
