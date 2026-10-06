-- ============================================================
-- v3.4 Patch: Refinements sobre v3.3
-- 1. platform_integrations: Policy Layer fields
-- 2. creator_accounts: identity_confidence + method + verified_by
-- 3. youapp_index: intent_fit column
-- 4. content_values: Learn on Value signals
-- ============================================================

-- ── 1. Policy Layer en platform_integrations ──────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.platform_integrations
    ADD COLUMN IF NOT EXISTS auth_mode text DEFAULT 'none'
      CHECK (auth_mode IN ('none','apikey','oauth_app','oauth_user','crawler','restricted'));

  ALTER TABLE public.platform_integrations
    ADD COLUMN IF NOT EXISTS discovery_policy text DEFAULT 'allowed'
      CHECK (discovery_policy IN ('allowed','restricted','disallowed','require_auth'));

  ALTER TABLE public.platform_integrations
    ADD COLUMN IF NOT EXISTS metadata_policy text DEFAULT 'allowed'
      CHECK (metadata_policy IN ('allowed','limited','disallowed'));

  ALTER TABLE public.platform_integrations
    ADD COLUMN IF NOT EXISTS playback_policy text DEFAULT 'embed_allowed'
      CHECK (playback_policy IN ('embed_allowed','redirect_only','app_only','disallowed'));

  ALTER TABLE public.platform_integrations
    ADD COLUMN IF NOT EXISTS storage_policy text DEFAULT 'index_ok'
      CHECK (storage_policy IN ('index_ok','metadata_only','no_cache','disallowed'));

  ALTER TABLE public.platform_integrations
    ADD COLUMN IF NOT EXISTS last_policy_verified_at timestamptz;

  -- Scoring hints para el Capability Router
  ALTER TABLE public.platform_integrations
    ADD COLUMN IF NOT EXISTS expected_latency_ms int DEFAULT 1500;

  ALTER TABLE public.platform_integrations
    ADD COLUMN IF NOT EXISTS coverage_probability int DEFAULT 50
      CHECK (coverage_probability BETWEEN 0 AND 100);

  ALTER TABLE public.platform_integrations
    ADD COLUMN IF NOT EXISTS health_score int DEFAULT 100
      CHECK (health_score BETWEEN 0 AND 100);

EXCEPTION WHEN others THEN NULL; END $$;

-- Actualizar con valores iniciales de policy
UPDATE public.platform_integrations SET
  auth_mode = 'apikey', discovery_policy = 'allowed', metadata_policy = 'allowed',
  playback_policy = 'embed_allowed', storage_policy = 'index_ok',
  expected_latency_ms = 500, coverage_probability = 85, health_score = 95
WHERE id = 'youtube';

UPDATE public.platform_integrations SET
  auth_mode = 'apikey', discovery_policy = 'allowed', metadata_policy = 'allowed',
  playback_policy = 'embed_allowed', storage_policy = 'index_ok',
  expected_latency_ms = 800, coverage_probability = 60, health_score = 90
WHERE id = 'vimeo';

UPDATE public.platform_integrations SET
  auth_mode = 'none', discovery_policy = 'allowed', metadata_policy = 'allowed',
  playback_policy = 'embed_allowed', storage_policy = 'index_ok',
  expected_latency_ms = 1000, coverage_probability = 35, health_score = 85
WHERE id = 'dailymotion';

UPDATE public.platform_integrations SET
  auth_mode = 'none', discovery_policy = 'allowed', metadata_policy = 'allowed',
  playback_policy = 'embed_allowed', storage_policy = 'index_ok',
  expected_latency_ms = 1200, coverage_probability = 70, health_score = 95
WHERE id = 'archive';

UPDATE public.platform_integrations SET
  auth_mode = 'none', discovery_policy = 'allowed', metadata_policy = 'allowed',
  playback_policy = 'embed_allowed', storage_policy = 'index_ok',
  expected_latency_ms = 1500, coverage_probability = 40, health_score = 85
WHERE id = 'peertube';

UPDATE public.platform_integrations SET
  auth_mode = 'apikey', discovery_policy = 'allowed', metadata_policy = 'allowed',
  playback_policy = 'embed_allowed', storage_policy = 'metadata_only',
  expected_latency_ms = 900, coverage_probability = 80, health_score = 92
WHERE id = 'twitch';

UPDATE public.platform_integrations SET
  auth_mode = 'oauth_user', discovery_policy = 'require_auth', metadata_policy = 'limited',
  playback_policy = 'app_only', storage_policy = 'no_cache',
  expected_latency_ms = 2000, coverage_probability = 75, health_score = 80
WHERE id = 'tiktok';

UPDATE public.platform_integrations SET
  auth_mode = 'apikey', discovery_policy = 'restricted', metadata_policy = 'limited',
  playback_policy = 'embed_allowed', storage_policy = 'metadata_only',
  expected_latency_ms = 1800, coverage_probability = 55, health_score = 70
WHERE id = 'x';

UPDATE public.platform_integrations SET
  auth_mode = 'none', discovery_policy = 'allowed', metadata_policy = 'allowed',
  playback_policy = 'redirect_only', storage_policy = 'metadata_only',
  expected_latency_ms = 1500, coverage_probability = 50, health_score = 85
WHERE id = 'reddit';

UPDATE public.platform_integrations SET
  last_policy_verified_at = now()
WHERE id IN ('youtube','vimeo','dailymotion','archive','peertube','twitch','tiktok','x','reddit');

-- ── 2. Creator Graph: identity_confidence ────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.creator_accounts
    ADD COLUMN IF NOT EXISTS identity_confidence int DEFAULT 50
      CHECK (identity_confidence BETWEEN 0 AND 100);

  ALTER TABLE public.creator_accounts
    ADD COLUMN IF NOT EXISTS identity_method text DEFAULT 'inferred'
      CHECK (identity_method IN (
        'oauth',             -- Creador autorizó con OAuth (100% confianza)
        'official_crosslink', -- Link cruzado oficial entre plataformas (97%)
        'verified_by_user',  -- Confirmado por el usuario de YouApp (85%)
        'name_match',        -- Solo coincidencia de nombre (65%)
        'inferred'           -- Inferido algorítmicamente (40-60%)
      ));

  ALTER TABLE public.creator_accounts
    ADD COLUMN IF NOT EXISTS identity_verified_by text; -- 'system' | 'user:<id>' | 'admin'

EXCEPTION WHEN others THEN NULL; END $$;

-- Regla: cuentas con confidence < 70 no se fusionan automáticamente
CREATE INDEX IF NOT EXISTS idx_creator_accounts_confidence
  ON public.creator_accounts(identity_confidence);

-- ── 3. IntentFit en youapp_index ──────────────────────────────────────────────
-- content_format afecta IntentFit (compatibilidad con intención), no Quality Score
DO $$ BEGIN
  ALTER TABLE public.youapp_index
    ADD COLUMN IF NOT EXISTS intent_fit int DEFAULT 50
      CHECK (intent_fit BETWEEN 0 AND 100);
EXCEPTION WHEN others THEN NULL; END $$;

-- ── 4. content_values — Learn on Value ───────────────────────────────────────
-- Registra señales fuertes de valor real (no solo reproducción)

CREATE TABLE IF NOT EXISTS public.content_values (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  session_id      text,
  content_id      uuid REFERENCES public.youapp_index(id),

  -- Señales de valor (de menor a mayor fuerza)
  played          boolean NOT NULL DEFAULT false,  -- Se reprodujo
  played_pct      int,          -- % reproducido (0-100) — señal fuerte si >80%
  engaged         boolean NOT NULL DEFAULT false,  -- Interactuó (pausa, rebobinó, anotó)
  completed       boolean NOT NULL DEFAULT false,  -- Completó (>90%)
  saved           boolean NOT NULL DEFAULT false,  -- Guardó en Mis Videos
  created_moment  boolean NOT NULL DEFAULT false,  -- Creó un Momento
  valued          boolean NOT NULL DEFAULT false,  -- Marcó "Valió tu tiempo"

  -- Contexto
  query_normalized text,  -- Con qué búsqueda llegó a este video
  watch_duration_s int,
  watch_context   text CHECK (watch_context IN ('search','home','signal','director','you4')),

  -- Para Atlas: aprende qué contenido vale la pena recomendar
  value_score     int GENERATED ALWAYS AS (
    (CASE WHEN played AND played_pct > 80 THEN 20 ELSE 0 END) +
    (CASE WHEN engaged        THEN 15 ELSE 0 END) +
    (CASE WHEN completed      THEN 25 ELSE 0 END) +
    (CASE WHEN saved          THEN 20 ELSE 0 END) +
    (CASE WHEN created_moment THEN 10 ELSE 0 END) +
    (CASE WHEN valued         THEN 10 ELSE 0 END)
  ) STORED,

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_values_content_id
  ON public.content_values(content_id);

CREATE INDEX IF NOT EXISTS idx_content_values_value_score
  ON public.content_values(value_score DESC);

CREATE INDEX IF NOT EXISTS idx_content_values_valued
  ON public.content_values(valued) WHERE valued = true;

ALTER TABLE public.content_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon insert content_values"
  ON public.content_values FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Authenticated read own values"
  ON public.content_values FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full access content_values"
  ON public.content_values FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Vista: top contenido valorado (alimenta Learn on Value → Atlas)
CREATE OR REPLACE VIEW public.top_valued_content AS
SELECT
  cv.content_id,
  yi.title,
  yi.provider,
  yi.content_format,
  COUNT(*) as value_events,
  AVG(cv.value_score) as avg_value_score,
  SUM(CASE WHEN cv.valued THEN 1 ELSE 0 END) as explicit_valued,
  SUM(CASE WHEN cv.completed THEN 1 ELSE 0 END) as completions,
  AVG(cv.played_pct) as avg_play_pct
FROM public.content_values cv
JOIN public.youapp_index yi ON yi.id = cv.content_id
GROUP BY cv.content_id, yi.title, yi.provider, yi.content_format
ORDER BY avg_value_score DESC;
