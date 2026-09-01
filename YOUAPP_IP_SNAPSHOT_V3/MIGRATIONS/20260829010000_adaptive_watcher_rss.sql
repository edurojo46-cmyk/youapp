-- FASE 2: Adaptive Watcher (RSS Ingestion)
-- Añadir columnas para monitoreo RSS adaptativo en seed_sources

ALTER TABLE public.seed_sources ADD COLUMN IF NOT EXISTS rss_url text;
ALTER TABLE public.seed_sources ADD COLUMN IF NOT EXISTS last_checked_at timestamptz;
ALTER TABLE public.seed_sources ADD COLUMN IF NOT EXISTS last_publish_at timestamptz;
ALTER TABLE public.seed_sources ADD COLUMN IF NOT EXISTS avg_publish_interval_hours float DEFAULT 24;
ALTER TABLE public.seed_sources ADD COLUMN IF NOT EXISTS next_check_at timestamptz DEFAULT now();
ALTER TABLE public.seed_sources ADD COLUMN IF NOT EXISTS rss_fail_count int DEFAULT 0;

-- Autocompletar rss_url para fuentes existentes de YouTube
UPDATE public.seed_sources
SET rss_url = 'https://www.youtube.com/feeds/videos.xml?channel_id=' || provider_channel_id
WHERE provider = 'youtube' 
  AND provider_channel_id IS NOT NULL 
  AND (rss_url IS NULL OR rss_url = '');
