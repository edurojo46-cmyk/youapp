CREATE TABLE search_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id text,
  event_name text NOT NULL,
  session_id text,
  query_normalized text,
  provider text,
  
  -- Campos de diagnóstico
  candidate_count integer,
  eligible_count integer,
  result_count integer,
  position integer,
  
  external_used boolean DEFAULT false,
  external_latency_ms integer,
  latency_ms integer,
  
  success boolean,
  error_code text,
  cache_source text,
  
  created_at timestamptz DEFAULT now()
);

-- RLS configurado para permitir inserciones anónimas (MVP, luego moveremos a Edge Function)
ALTER TABLE search_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous inserts to search_events" ON search_events
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "Allow authenticated inserts to search_events" ON search_events
  FOR INSERT TO authenticated
  WITH CHECK (true);
