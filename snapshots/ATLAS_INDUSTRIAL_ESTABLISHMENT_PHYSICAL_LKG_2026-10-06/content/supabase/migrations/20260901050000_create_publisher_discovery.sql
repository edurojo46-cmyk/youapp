-- Migration: 20260901050000_create_publisher_discovery.sql
-- Description: Creates the publisher_video_provenance table and enables publisher discovery indexes

CREATE TABLE IF NOT EXISTS public.publisher_video_provenance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,                         -- 'youtube', 'vimeo', 'dailymotion', 'publisher'
    provider_content_id TEXT NOT NULL,              -- Canonical Video ID (e.g. YouTube Video ID)
    publisher_code TEXT NOT NULL,                   -- e.g. 'tv_publica', 'encuentro', 'agn', 'clarin', 'infobae'
    publisher_name TEXT NOT NULL,                   -- Human-readable name
    publisher_domain TEXT,                          -- e.g. 'tvpublica.com.ar'
    article_url TEXT NOT NULL,                      -- Canonical URL of the article/page where discovered
    article_title TEXT,                             -- Title of the article
    discovery_method TEXT NOT NULL,                 -- 'publisher_embed', 'publisher_feed', 'publisher_sitemap'
    extraction_method TEXT NOT NULL,                -- 'iframe', 'video_object', 'video_sitemap', 'rss', 'open_graph', 'twitter_player'
    discovered_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::JSONB,
    CONSTRAINT unique_publisher_video_provenance UNIQUE (provider, provider_content_id, publisher_code, article_url)
);

-- Index for fast lookup by canonical content
CREATE INDEX IF NOT EXISTS idx_pub_prov_content ON public.publisher_video_provenance(provider, provider_content_id);
CREATE INDEX IF NOT EXISTS idx_pub_prov_publisher ON public.publisher_video_provenance(publisher_code);

-- RLS
ALTER TABLE public.publisher_video_provenance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on publisher_video_provenance"
ON public.publisher_video_provenance
FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow anon insert on publisher_video_provenance"
ON public.publisher_video_provenance
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Ensure youapp_index has unique constraint on (provider, provider_content_id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'unique_youapp_index_provider_content'
    ) THEN
        BEGIN
            ALTER TABLE public.youapp_index 
            ADD CONSTRAINT unique_youapp_index_provider_content UNIQUE (provider, provider_content_id);
        EXCEPTION
            WHEN OTHERS THEN
                -- If duplicate rows exist, ignore constraint failure on legacy table
                NULL;
        END;
    END IF;
END $$;
