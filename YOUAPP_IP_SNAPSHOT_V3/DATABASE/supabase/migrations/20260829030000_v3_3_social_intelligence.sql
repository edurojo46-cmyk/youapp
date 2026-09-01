-- ============================================================
-- v3.3 Migration: platform_integrations + creator_entities + creator_accounts
-- + content_format en youapp_index + social_momentum en atlas_video_features
-- ============================================================

-- ── 1. platform_integrations — Reemplaza/Extiende video_providers ─────────────
-- Describe capacidades por plataforma, no solo si tiene video.

CREATE TABLE IF NOT EXISTS public.platform_integrations (
  id           text PRIMARY KEY,
  name         text NOT NULL,

  -- Capacidades
  video_search  boolean NOT NULL DEFAULT false,
  creator_sync  boolean NOT NULL DEFAULT false,
  trends        boolean NOT NULL DEFAULT false,
  community     boolean NOT NULL DEFAULT false,
  distribution  boolean NOT NULL DEFAULT false,
  live          boolean NOT NULL DEFAULT false,

  -- Modo de acceso
  access_mode   text CHECK (access_mode IN (
    'public',        -- API pública sin auth
    'oauth',         -- Requiere OAuth del usuario
    'apikey',        -- API key de YouApp
    'crawler',       -- Crawling autorizado
    'restricted',    -- Acceso limitado / waitlist
    'none'           -- No disponible vía API
  )),

  -- Routing
  priority      int  NOT NULL DEFAULT 50,  -- 1=máxima prioridad, 100=mínima
  cost_tier     int  NOT NULL DEFAULT 0,   -- 0=gratis, 1=low, 2=medium, 3=high
  quota_weight  int  NOT NULL DEFAULT 0,   -- unidades de cuota por llamada (0=no aplica)

  is_active     boolean NOT NULL DEFAULT true,

  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Seed inicial de plataformas conocidas
INSERT INTO public.platform_integrations
  (id, name, video_search, creator_sync, trends, community, distribution, live, access_mode, priority, cost_tier, quota_weight, notes)
VALUES
  -- Video Mesh
  ('youtube',      'YouTube',       true,  true,  false, false, false, true,  'apikey',     10, 3, 100, 'search.list = 100 quota/call — last resort'),
  ('vimeo',        'Vimeo',         true,  true,  false, false, false, true,  'apikey',     20, 0, 0,   'Official API, 0 YouTube quota'),
  ('dailymotion',  'Dailymotion',   true,  true,  false, false, false, false, 'public',     25, 0, 0,   'Known profiles only in V1'),
  ('twitch',       'Twitch',        false, true,  false, false, false, true,  'apikey',     30, 0, 0,   'Live streams + VODs via Helix API'),
  ('peertube',     'PeerTube',      true,  false, false, false, false, true,  'public',     35, 0, 0,   'Federated open video, SepiaSearch'),
  ('archive',      'Internet Archive', true, false, false, false, false, false, 'public',   15, 0, 0,   'Massive free archive, high authority'),
  ('kick',         'Kick',          false, true,  false, false, false, true,  'restricted', 60, 0, 0,   'Emerging live platform'),
  ('rumble',       'Rumble',        true,  false, false, false, false, true,  'restricted', 65, 0, 0,   'Alternative video platform'),
  ('tiktok',       'TikTok',        true,  true,  true,  false, false, false, 'oauth',      40, 1, 0,   'Short-form video + trends. Phase 11'),
  ('instagram',    'Instagram',     true,  true,  false, false, false, true,  'oauth',      45, 1, 0,   'Reels + Creator. Phase 14'),
  ('facebook',     'Facebook',      true,  true,  false, true,  false, true,  'oauth',      50, 1, 0,   'Video + Groups. Phase 14'),

  -- Social Mesh — Trends/Community/Distribution (NormalizedSocialItem)
  ('x',            'X (Twitter)',   false, true,  true,  false, false, false, 'apikey',     55, 2, 0,   'Breaking Signal + Creator. Phase 15'),
  ('reddit',       'Reddit',        false, false, true,  true,  false, false, 'public',     56, 0, 0,   'Community Signal. Phase 15'),
  ('threads',      'Threads',       false, false, true,  false, false, false, 'restricted', 70, 0, 0,   'Trend source. Phase 16'),
  ('bluesky',      'Bluesky',       false, false, true,  false, false, false, 'public',     71, 0, 0,   'Open trend source + URL discovery. Phase 16'),
  ('mastodon',     'Mastodon',      false, false, true,  false, false, false, 'public',     72, 0, 0,   'Federated trend source. Phase 16'),
  ('telegram',     'Telegram',      false, false, false, true,  true,  false, 'oauth',      80, 0, 0,   'Community + Distribution. Phase 17'),
  ('discord',      'Discord',       false, false, false, true,  true,  false, 'oauth',      81, 0, 0,   'Community + Events. Phase 17'),
  ('whatsapp',     'WhatsApp',      false, false, false, false, true,  false, 'oauth',      85, 0, 0,   'Distribution only. Phase 18'),
  ('linkedin',     'LinkedIn',      false, true,  false, false, false, false, 'oauth',      90, 1, 0,   'Professional Graph. Phase 19'),
  ('publisher',    'Publisher Crawl', false, false, false, false, false, false, 'crawler',  5,  0, 0,   'Publisher/Discover embed extraction'),
  ('discover',     'Web Discover',  false, false, false, false, false, false, 'crawler',   4,  0, 0,   'Academic/cultural site crawl')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  video_search = EXCLUDED.video_search,
  creator_sync = EXCLUDED.creator_sync,
  trends = EXCLUDED.trends,
  community = EXCLUDED.community,
  distribution = EXCLUDED.distribution,
  live = EXCLUDED.live,
  access_mode = EXCLUDED.access_mode,
  priority = EXCLUDED.priority,
  cost_tier = EXCLUDED.cost_tier,
  notes = EXCLUDED.notes,
  updated_at = now();

-- ── 2. Creator Graph ──────────────────────────────────────────────────────────
-- YouApp conoce personas y creadores, no cuentas.

CREATE TABLE IF NOT EXISTS public.creator_entities (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  canonical_name text NOT NULL,
  description    text,

  country        text,
  language       text,
  category       text,   -- 'journalist' | 'educator' | 'entertainer' | 'institution' | 'media'

  verified       boolean NOT NULL DEFAULT false,
  entity_type    text NOT NULL DEFAULT 'person' CHECK (entity_type IN (
    'person', 'media', 'institution', 'brand'
  )),

  -- Señales de autoridad
  content_count  int DEFAULT 0,
  atlas_coverage int DEFAULT 0,  -- % de contenido en Atlas

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.creator_accounts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  creator_entity_id  uuid REFERENCES public.creator_entities(id) ON DELETE CASCADE,

  provider           text NOT NULL REFERENCES public.platform_integrations(id),

  provider_creator_id text,
  handle             text,
  canonical_url      text,
  display_name       text,

  -- Estado de la conexión
  connected          boolean NOT NULL DEFAULT false,
  authorized         boolean NOT NULL DEFAULT false,  -- OAuth autorizado por el creador

  -- Métricas del proveedor (best-effort, no determinan YouScore)
  follower_count     bigint,
  video_count        int,
  last_synced_at     timestamptz,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  UNIQUE (provider, provider_creator_id)
);

-- Índices Creator Graph
CREATE INDEX IF NOT EXISTS idx_creator_accounts_entity
  ON public.creator_accounts(creator_entity_id);

CREATE INDEX IF NOT EXISTS idx_creator_accounts_provider
  ON public.creator_accounts(provider);

CREATE INDEX IF NOT EXISTS idx_creator_entities_category
  ON public.creator_entities(category);

-- ── 3. content_format en youapp_index ────────────────────────────────────────
-- short | midform | longform | live | clip — afecta UX (tabs), no ranking

DO $$ BEGIN
  ALTER TABLE public.youapp_index ADD COLUMN IF NOT EXISTS
    content_format text DEFAULT 'longform' CHECK (content_format IN (
      'short',     -- < 3 min (TikTok, Shorts, Reels)
      'midform',   -- 3-20 min
      'longform',  -- > 20 min (documentales, tutoriales completos)
      'live',      -- stream en vivo
      'clip'       -- fragmento de un contenido mayor
    ));

  ALTER TABLE public.youapp_index ADD COLUMN IF NOT EXISTS
    creator_entity_id uuid REFERENCES public.creator_entities(id);
EXCEPTION WHEN others THEN NULL; END $$;

-- Auto-calcular content_format basado en duration_seconds
UPDATE public.youapp_index SET content_format =
  CASE
    WHEN content_state = 'live'                 THEN 'live'
    WHEN duration_seconds IS NULL               THEN 'longform'
    WHEN duration_seconds < 180                 THEN 'short'
    WHEN duration_seconds < 1200                THEN 'midform'
    ELSE 'longform'
  END
WHERE content_format IS NULL OR content_format = 'longform';

-- ── 4. Social Momentum en atlas_video_features ────────────────────────────────
-- Velocidad de crecimiento, no volumen acumulado

DO $$ BEGIN
  ALTER TABLE public.atlas_video_features ADD COLUMN IF NOT EXISTS
    social_momentum int DEFAULT 0 CHECK (social_momentum BETWEEN 0 AND 100);

  ALTER TABLE public.atlas_video_features ADD COLUMN IF NOT EXISTS
    momentum_updated_at timestamptz;

  ALTER TABLE public.atlas_video_features ADD COLUMN IF NOT EXISTS
    community_interest int DEFAULT 0 CHECK (community_interest BETWEEN 0 AND 100);

  ALTER TABLE public.atlas_video_features ADD COLUMN IF NOT EXISTS
    breaking_score int DEFAULT 0 CHECK (breaking_score BETWEEN 0 AND 100);
EXCEPTION WHEN others THEN NULL; END $$;

-- ── 5. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.platform_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read platform_integrations"
  ON public.platform_integrations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Service role full access platform_integrations"
  ON public.platform_integrations FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.creator_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read creator_entities"
  ON public.creator_entities FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Service role full access creator_entities"
  ON public.creator_entities FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.creator_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read creator_accounts"
  ON public.creator_accounts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Service role full access creator_accounts"
  ON public.creator_accounts FOR ALL TO service_role USING (true) WITH CHECK (true);
