-- FASE 0: Telemetry Guard
-- Tablas para rastrear CADA intento de llamar a search.list
-- y el resumen diario de cuota utilizada.

-- ── Eventos individuales de búsqueda externa ────────────────────────────────
CREATE TABLE IF NOT EXISTS quota_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id        uuid DEFAULT gen_random_uuid(),

  -- Contexto de la solicitud
  query             text,
  caller            text NOT NULL,          -- 'SeedManager' | 'SearchEngine' | 'RssWatcher' | 'Admin'
  reason            text,                   -- 'user_search' | 'channel_resolve' | 'auto_discover'

  -- Decisión de QuotaBrain
  authorized        boolean DEFAULT false,
  authorized_by     text,                   -- 'quota_brain' | 'manual' | 'bypassed'
  denial_reason     text,                   -- si authorized = false: por qué

  -- Contexto de decisión
  atlas_coverage    int,                    -- % de cobertura en Atlas antes de ir a Radar (0-100)
  opportunity_score int,                    -- score calculado por QuotaBrain (0-100)
  budget_remaining  int,                    -- cuántas queries quedaban cuando se tomó la decisión

  -- Resultado (si fue autorizada)
  results_received  int,
  latency_ms        int,

  created_at        timestamptz DEFAULT now()
);

-- Índices para las consultas del Control Center
CREATE INDEX quota_events_created_at_idx ON quota_events(created_at DESC);
CREATE INDEX quota_events_caller_idx ON quota_events(caller);
CREATE INDEX quota_events_authorized_idx ON quota_events(authorized);
-- Using 'AT TIME ZONE' makes the cast immutable so it can be indexed
CREATE INDEX quota_events_date_idx ON quota_events((created_at AT TIME ZONE 'UTC'));

-- ── Resumen diario ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quota_daily (
  date                date PRIMARY KEY DEFAULT current_date,
  searches_used       int DEFAULT 0,         -- queries autorizadas y ejecutadas
  searches_denied     int DEFAULT 0,         -- queries que QuotaBrain rechazó
  searches_avoided    int DEFAULT 0,         -- veces que Atlas respondió sin Radar
  internal_budget     int DEFAULT 80,        -- presupuesto YouApp (< Google limit de 100)
  google_limit        int DEFAULT 100,       -- límite real de Google
  updated_at          timestamptz DEFAULT now()
);

-- Insertar fila para hoy si no existe (trigger automático)
INSERT INTO quota_daily (date) VALUES (current_date)
ON CONFLICT (date) DO NOTHING;

-- Función para incrementar contadores diarios
CREATE OR REPLACE FUNCTION quota_increment(
  p_column text,
  p_date date DEFAULT current_date
) RETURNS void AS $$
BEGIN
  INSERT INTO quota_daily (date)
  VALUES (p_date)
  ON CONFLICT (date) DO NOTHING;

  EXECUTE format(
    'UPDATE quota_daily SET %I = %I + 1, updated_at = now() WHERE date = $1',
    p_column, p_column
  ) USING p_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE quota_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE quota_daily ENABLE ROW LEVEL SECURITY;

-- Inserción desde Edge Functions (service_role) o usuarios autenticados
CREATE POLICY "Allow authenticated inserts to quota_events" ON quota_events
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow service role full access to quota_events" ON quota_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Lectura para el Control Center (usuarios autenticados)
CREATE POLICY "Allow authenticated reads quota_events" ON quota_events
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow service role full access to quota_daily" ON quota_daily
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated reads quota_daily" ON quota_daily
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated updates quota_daily" ON quota_daily
  FOR UPDATE TO authenticated USING (true);
