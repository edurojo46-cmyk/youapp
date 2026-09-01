-- ============================================================
-- FASE 5: TV Signal Persistence & Optimistic UI
-- 1. custom_signals
-- 2. signal_schedule_items
-- 3. signal_generation_logs
-- 4. signal_events
-- 5. update_signal_schedule_order RPC
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. custom_signals
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.custom_signals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_signal_id    uuid UNIQUE NOT NULL,
  user_id             uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name                text NOT NULL,
  prompt              text NOT NULL,
  duration_target_min int,
  actual_duration_sec int,
  main_topic          text,
  visibility          text DEFAULT 'private',
  generation_version  text,
  ranking_version     text,
  router_version      text,
  status              text DEFAULT 'ready',
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  last_played_at      timestamptz
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS custom_signals_user_id ON public.custom_signals(user_id);
CREATE INDEX IF NOT EXISTS custom_signals_client_signal_id ON public.custom_signals(client_signal_id);

-- Trigger de updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_custom_signals_updated_at'
  ) THEN
    CREATE TRIGGER update_custom_signals_updated_at
      BEFORE UPDATE ON public.custom_signals
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────
-- 2. signal_schedule_items
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.signal_schedule_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id           uuid NOT NULL REFERENCES public.custom_signals(id) ON DELETE CASCADE,
  block_id            text NOT NULL,
  position            int NOT NULL,
  start_offset_sec    int NOT NULL,
  duration_sec        int NOT NULL,
  
  content_provider    text NOT NULL,
  provider_content_id text NOT NULL,
  content_key         text NOT NULL,
  
  title               text NOT NULL,
  thumbnail_url       text,
  
  topic               text,
  role                text,
  
  generation_reason   jsonb,
  
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  
  -- Para asegurar que block_id es único dentro de una señal
  CONSTRAINT uq_signal_block UNIQUE (signal_id, block_id)
);

CREATE INDEX IF NOT EXISTS signal_schedule_items_signal_id ON public.signal_schedule_items(signal_id);
CREATE INDEX IF NOT EXISTS signal_schedule_items_position ON public.signal_schedule_items(signal_id, position);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_signal_schedule_items_updated_at'
  ) THEN
    CREATE TRIGGER update_signal_schedule_items_updated_at
      BEFORE UPDATE ON public.signal_schedule_items
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────
-- 3. signal_generation_logs
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.signal_generation_logs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id            uuid UNIQUE NOT NULL REFERENCES public.custom_signals(id) ON DELETE CASCADE,
  
  original_prompt      text,
  understanding        jsonb,
  subqueries           jsonb,
  entities             jsonb,
  
  semantic_coverage    numeric,
  independent_coverage numeric,
  radar_used           int,
  radar_query          text,
  
  qualified_count      int,
  schedule_count       int,
  
  generation_version   text,
  ranking_version      text,
  router_version       text,
  
  created_at           timestamptz DEFAULT now()
);


-- ────────────────────────────────────────────────────────────
-- 4. signal_events
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.signal_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id   uuid NOT NULL REFERENCES public.custom_signals(id) ON DELETE CASCADE,
  block_id    text,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  event_type  text NOT NULL,
  event_data  jsonb,
  
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signal_events_signal_id ON public.signal_events(signal_id);


-- ────────────────────────────────────────────────────────────
-- 5. RPC: update_signal_schedule_order
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_signal_schedule_order(
  p_signal_id uuid,
  p_ordered_block_ids text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_offset int := 0;
  v_block_id text;
  v_duration int;
  v_pos int := 0;
  v_user_id uuid;
BEGIN
  -- 1. Validar que el usuario sea el dueño de la señal (RLS enforce a mano por ser SECURITY DEFINER)
  SELECT user_id INTO v_user_id FROM public.custom_signals WHERE id = p_signal_id;
  IF v_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- 2. Recorrer el array ordenado, actualizar posiciones y recalcular offsets
  FOREACH v_block_id IN ARRAY p_ordered_block_ids
  LOOP
    -- Obtener la duración de este bloque para recalcular el offset del siguiente
    SELECT duration_sec INTO v_duration 
    FROM public.signal_schedule_items 
    WHERE signal_id = p_signal_id AND block_id = v_block_id;
    
    IF FOUND THEN
      UPDATE public.signal_schedule_items
      SET position = v_pos,
          start_offset_sec = v_current_offset,
          updated_at = now()
      WHERE signal_id = p_signal_id AND block_id = v_block_id;
      
      -- Asegurarnos de avanzar al menos 1 segundo en caso de error de duración
      v_current_offset := v_current_offset + GREATEST(1, COALESCE(v_duration, 1));
      v_pos := v_pos + 1;
    END IF;
  END LOOP;
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 6. Row Level Security (RLS)
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.custom_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signal_schedule_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signal_generation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signal_events ENABLE ROW LEVEL SECURITY;

-- custom_signals
CREATE POLICY "Users can read own private signals"
  ON public.custom_signals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can read public signals"
  ON public.custom_signals FOR SELECT
  USING (visibility = 'public');

CREATE POLICY "Users can insert own signals"
  ON public.custom_signals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own signals"
  ON public.custom_signals FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own signals"
  ON public.custom_signals FOR DELETE
  USING (auth.uid() = user_id);

-- signal_schedule_items (Heredan lectura de custom_signals)
CREATE POLICY "Users can read schedule items of readable signals"
  ON public.signal_schedule_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.custom_signals s WHERE s.id = signal_id));

CREATE POLICY "Users can insert schedule items to own signals"
  ON public.signal_schedule_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.custom_signals s WHERE s.id = signal_id AND s.user_id = auth.uid()));

CREATE POLICY "Users can update schedule items of own signals"
  ON public.signal_schedule_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.custom_signals s WHERE s.id = signal_id AND s.user_id = auth.uid()));

CREATE POLICY "Users can delete schedule items of own signals"
  ON public.signal_schedule_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.custom_signals s WHERE s.id = signal_id AND s.user_id = auth.uid()));

-- signal_generation_logs
CREATE POLICY "Users can read logs of readable signals"
  ON public.signal_generation_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.custom_signals s WHERE s.id = signal_id));

CREATE POLICY "Users can insert logs to own signals"
  ON public.signal_generation_logs FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.custom_signals s WHERE s.id = signal_id AND s.user_id = auth.uid()));

CREATE POLICY "Users can update logs of own signals"
  ON public.signal_generation_logs FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.custom_signals s WHERE s.id = signal_id AND s.user_id = auth.uid()));

CREATE POLICY "Users can delete logs of own signals"
  ON public.signal_generation_logs FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.custom_signals s WHERE s.id = signal_id AND s.user_id = auth.uid()));

-- signal_events
CREATE POLICY "Users can read events of readable signals"
  ON public.signal_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.custom_signals s WHERE s.id = signal_id));

CREATE POLICY "Users can insert events"
  ON public.signal_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);
