-- ==============================================================================
-- YOUAPP STREAMING GRAPH & USER MULTI-PLATFORM ENGINE (MIGRATION V1)
-- ==============================================================================

-- 1. Catálogo Universal de Títulos de Streaming
CREATE TABLE IF NOT EXISTS streaming_titles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tmdb_id BIGINT,
  imdb_id TEXT,
  watchmode_id BIGINT,

  content_type TEXT NOT NULL CHECK (content_type IN ('movie', 'series', 'season', 'episode', 'documentary', 'short', 'video', 'signal')),
  title TEXT NOT NULL,
  original_title TEXT,
  description TEXT,

  year INTEGER,
  duration_min INTEGER,
  poster_url TEXT,
  backdrop_url TEXT,

  genres JSONB DEFAULT '[]'::jsonb,
  director TEXT,
  cast_list JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_tmdb_content_type UNIQUE (tmdb_id, content_type)
);

-- 2. Disponibilidad de Streaming con Trazabilidad Completa (Argentina AR y Global)
CREATE TABLE IF NOT EXISTS streaming_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  streaming_title_id UUID NOT NULL REFERENCES streaming_titles(id) ON DELETE CASCADE,

  provider_code TEXT NOT NULL, -- 'netflix', 'prime_video', 'disney_plus', 'max', 'apple_tv_plus', etc.
  external_provider_id TEXT,

  country_code TEXT NOT NULL DEFAULT 'AR',
  access_type TEXT NOT NULL CHECK (access_type IN ('subscription', 'free', 'rent', 'buy')),

  web_url TEXT,
  deep_link TEXT,

  price NUMERIC(10, 2),
  currency TEXT DEFAULT 'USD',
  quality TEXT DEFAULT '4K',

  -- Trazabilidad de origen y frescura
  source TEXT NOT NULL DEFAULT 'tmdb_justwatch', -- 'tmdb_justwatch', 'watchmode', 'direct_editorial'
  source_record_id TEXT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_title_provider_country_access UNIQUE (streaming_title_id, provider_code, country_code, access_type)
);

CREATE INDEX IF NOT EXISTS idx_streaming_avail_title_country ON streaming_availability(streaming_title_id, country_code);
CREATE INDEX IF NOT EXISTS idx_streaming_avail_provider_country ON streaming_availability(provider_code, country_code);
CREATE INDEX IF NOT EXISTS idx_streaming_avail_verified ON streaming_availability(verified_at);

-- 3. Plataformas Contratadas por el Usuario ("Mis Plataformas")
CREATE TABLE IF NOT EXISTS user_streaming_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_code TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_user_provider UNIQUE (user_id, provider_code)
);

-- 4. Mi Lista Universal Multi-Contenido (Películas, Series, Episodios, Videos YouTube, Señales YouApp, En Vivo)
CREATE TABLE IF NOT EXISTS user_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  content_type TEXT NOT NULL CHECK (content_type IN ('movie', 'series', 'episode', 'video', 'signal', 'live')),
  content_key TEXT NOT NULL, -- ID único del contenido (e.g. 'movie:157336', 'video:aqz-KE-bpKQ', 'signal:sig-123')

  provider TEXT NOT NULL, -- 'prime_video', 'netflix', 'youtube', 'youapp'
  external_id TEXT,
  title TEXT NOT NULL,
  poster_url TEXT,
  metadata_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,

  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_user_content_key UNIQUE (user_id, content_key)
);

CREATE INDEX IF NOT EXISTS idx_user_library_user ON user_library(user_id, saved_at DESC);

-- 5. Actividad Reciente de Streaming ("Continuar viendo" / "Abriste recientemente")
CREATE TABLE IF NOT EXISTS user_streaming_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  content_id TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'movie',
  content_title TEXT NOT NULL,
  poster_url TEXT,
  provider_code TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'dropped')),

  last_opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  progress_sec INTEGER, -- Nullable para streaming externo sin tracking interno
  total_duration_sec INTEGER,
  episode_id TEXT,
  episode_text TEXT, -- 'T1 E5'

  CONSTRAINT unique_user_streaming_activity UNIQUE (user_id, content_id)
);

CREATE INDEX IF NOT EXISTS idx_user_streaming_activity_user ON user_streaming_activity(user_id, last_opened_at DESC);

-- RLS Policies
ALTER TABLE streaming_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaming_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_streaming_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_streaming_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública de streaming_titles" ON streaming_titles FOR SELECT USING (true);
CREATE POLICY "Lectura pública de streaming_availability" ON streaming_availability FOR SELECT USING (true);

CREATE POLICY "Usuarios gestionan sus plataformas" ON user_streaming_services FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Usuarios gestionan su librería" ON user_library FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Usuarios gestionan su actividad" ON user_streaming_activity FOR ALL USING (auth.uid() = user_id);
