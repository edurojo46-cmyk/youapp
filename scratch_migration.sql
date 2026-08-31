-- 1. Agregar columna tags a youapp_index si no existe
ALTER TABLE youapp_index ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- 2. Crear la tabla search_events
CREATE TABLE IF NOT EXISTS search_events (
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

-- Habilitar RLS en search_events
ALTER TABLE search_events ENABLE ROW LEVEL SECURITY;

-- Políticas para search_events (Permitir inserciones a todos)
DROP POLICY IF EXISTS "Allow anonymous inserts to search_events" ON search_events;
CREATE POLICY "Allow anonymous inserts to search_events" ON search_events
  FOR INSERT TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated inserts to search_events" ON search_events;
CREATE POLICY "Allow authenticated inserts to search_events" ON search_events
  FOR INSERT TO authenticated
  WITH CHECK (true);
