-- ============================================================
-- FASE 3: Atlas V1
-- 1. Actualizar youapp_index al schema universal NormalizedVideo
-- 2. Crear atlas_video_features
-- 3. Crear publisher_sources
-- 4. Crear query_memory
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. youapp_index — columnas universales (retrocompatible)
-- ────────────────────────────────────────────────────────────

-- Columnas del schema universal NormalizedVideo
ALTER TABLE public.youapp_index
  ADD COLUMN IF NOT EXISTS provider              text DEFAULT 'youtube',
  ADD COLUMN IF NOT EXISTS provider_content_id   text,
  ADD COLUMN IF NOT EXISTS creator_id            text,
  ADD COLUMN IF NOT EXISTS creator_name          text,
  ADD COLUMN IF NOT EXISTS canonical_url         text,
  ADD COLUMN IF NOT EXISTS embed_url             text,
  ADD COLUMN IF NOT EXISTS thumbnail_url         text,
  ADD COLUMN IF NOT EXISTS published_at          timestamptz,
  ADD COLUMN IF NOT EXISTS published_at_precision text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS duration_seconds      int,
  ADD COLUMN IF NOT EXISTS views                 int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS likes                 int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS language              text,
  ADD COLUMN IF NOT EXISTS content_state         text DEFAULT 'vod',
  ADD COLUMN IF NOT EXISTS embeddable            boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS metadata_completeness int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metadata_readiness    int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metadata_provenance   text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS source_verified       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS source               text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS updated_at            timestamptz DEFAULT now();

-- Índice para búsquedas por proveedor
CREATE UNIQUE INDEX IF NOT EXISTS youapp_index_provider_content_id
  ON public.youapp_index (provider, provider_content_id)
  WHERE provider_content_id IS NOT NULL;

-- Índice para queries frecuentes
CREATE INDEX IF NOT EXISTS youapp_index_language ON public.youapp_index(language);
CREATE INDEX IF NOT EXISTS youapp_index_published_at ON public.youapp_index(published_at DESC);
CREATE INDEX IF NOT EXISTS youapp_index_content_state ON public.youapp_index(content_state);
CREATE INDEX IF NOT EXISTS youapp_index_source ON public.youapp_index(source);

-- Trigger updated_at (si no existe)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_youapp_index_updated_at'
  ) THEN
    CREATE TRIGGER update_youapp_index_updated_at
      BEFORE UPDATE ON public.youapp_index
      FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 2. atlas_video_features — Qué entiende YouApp sobre cada video
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.atlas_video_features (
  content_id              uuid PRIMARY KEY REFERENCES public.youapp_index(id) ON DELETE CASCADE,

  -- Clasificación semántica (Brain Level 1, escalada a Gemini si confidence < 80%)
  primary_topic           text,
  subtopics               text[],     -- V1: text[]. Futuro: atlas_topics + video_topics
  entities                text[],     -- V1: text[]. Futuro: atlas_entities + video_entities

  format                  text,       -- 'documentary'|'interview'|'tutorial'|'news'|'lecture'|'entertainment'
  difficulty              text,       -- 'general'|'intermediate'|'expert'
  perspective             text,       -- 'neutral'|'opinion'|'investigative'|'educational'

  -- Señales de calidad (Gemini da señales, YouApp calcula el score)
  quality_score           int,        -- 0-100, calculado por YouApp
  quality_confidence      int,        -- qué tan seguro está el sistema del score (0-100)

  source_confidence       int,        -- confianza en la fuente (0-100)
  context_authority       int,        -- heredado de publisher_source o seed_source (0-100)
  spam_risk               int DEFAULT 0, -- 0-100 (penaliza el score)

  -- Raw signals de Gemini (para auditoría y recalibración)
  semantic_depth          int,        -- señal de Gemini (0-100)
  spam_probability        int,        -- señal de Gemini (0-100)
  metadata_quality_signal int,        -- señal calculada localmente (0-100)

  transcript_available    boolean DEFAULT false,

  -- Versioning para re-enriquecer sin perder historial
  enrichment_level        text DEFAULT 'level1',  -- 'level1'|'level2'
  enrichment_version      int DEFAULT 1,
  enriched_at             timestamptz DEFAULT now()
);

-- Índices para queries del pipeline de ranking
CREATE INDEX IF NOT EXISTS atlas_features_topic ON public.atlas_video_features(primary_topic);
CREATE INDEX IF NOT EXISTS atlas_features_format ON public.atlas_video_features(format);
CREATE INDEX IF NOT EXISTS atlas_features_quality ON public.atlas_video_features(quality_score DESC);
CREATE INDEX IF NOT EXISTS atlas_features_enriched_at ON public.atlas_video_features(enriched_at DESC);

-- RLS: Solo service_role escribe; todos leen
ALTER TABLE public.atlas_video_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access to atlas_video_features"
  ON public.atlas_video_features FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated reads atlas_video_features"
  ON public.atlas_video_features FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Allow anon reads atlas_video_features"
  ON public.atlas_video_features FOR SELECT
  TO anon USING (true);

-- ────────────────────────────────────────────────────────────
-- 3. publisher_sources — Portales de noticias y medios
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.publisher_sources (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  domain               text NOT NULL UNIQUE,
  country              text,
  language             text,
  category             text,          -- 'news'|'science'|'culture'|'sports'|'university'|'museum'
  tier                 text DEFAULT 'B',

  homepage_url         text,
  video_section_url    text,
  sitemap_url          text,

  discovery_method     text,          -- 'sitemap'|'rss'|'crawl'
  context_authority    int DEFAULT 50, -- 0-100, heredado por videos descubiertos aquí

  robots_allowed       boolean DEFAULT true,
  playback_policy      text DEFAULT 'unknown', -- 'embed_allowed'|'external_only'|'unknown'
  license_status       text DEFAULT 'unknown',

  last_crawled_at      timestamptz,
  next_crawl_at        timestamptz DEFAULT now(),
  crawl_interval_hours int DEFAULT 24,

  status               text DEFAULT 'pending', -- 'active'|'paused'|'blocked'|'pending'

  created_at           timestamptz DEFAULT now()
);

ALTER TABLE public.publisher_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access to publisher_sources"
  ON public.publisher_sources FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated reads publisher_sources"
  ON public.publisher_sources FOR SELECT
  TO authenticated USING (true);

-- ────────────────────────────────────────────────────────────
-- 4. query_memory — Búsquedas semánticamente equivalentes
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.query_memory (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_query     text NOT NULL,

  -- El significado de la consulta (esto es lo duradero)
  primary_intent      text,           -- 'general'|'news'|'tutorial'|'documentary'|'entertainment'
  topic               text,
  entities            text[],
  language            text,

  -- Aliases: diferentes frases que mapean al mismo significado
  aliases             text[],

  -- Cache temporal (TTL basado en freshness_score)
  -- Las relaciones duraderas las maneja Atlas/ranking, no esta tabla
  cached_content_ids  uuid[],
  cache_expires_at    timestamptz,

  atlas_coverage      int DEFAULT 0,  -- % de cobertura actual en Atlas
  freshness_score     int DEFAULT 50, -- 0=estático histórico, 100=muy volátil
  search_count        int DEFAULT 1,  -- cuántas veces se buscó esta query
  last_searched_at    timestamptz DEFAULT now(),

  created_at          timestamptz DEFAULT now(),

  UNIQUE(canonical_query)
);

CREATE INDEX IF NOT EXISTS query_memory_topic ON public.query_memory(topic);
CREATE INDEX IF NOT EXISTS query_memory_language ON public.query_memory(language);
CREATE INDEX IF NOT EXISTS query_memory_last_searched ON public.query_memory(last_searched_at DESC);

ALTER TABLE public.query_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access to query_memory"
  ON public.query_memory FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated reads query_memory"
  ON public.query_memory FOR SELECT
  TO authenticated USING (true);
