-- 20260911231001_atlas_social_platforms_v1.sql
-- Create atlas_social_platforms table

CREATE TABLE IF NOT EXISTS public.atlas_social_platforms (
    id TEXT PRIMARY KEY, -- e.g., 'FACEBOOK', 'INSTAGRAM'
    name TEXT NOT NULL,
    base_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert initial rows
INSERT INTO public.atlas_social_platforms (id, name, base_url) VALUES
    ('FACEBOOK', 'Facebook', 'https://www.facebook.com/'),
    ('INSTAGRAM', 'Instagram', 'https://www.instagram.com/'),
    ('LINKEDIN', 'LinkedIn', 'https://www.linkedin.com/in/'),
    ('X', 'X (Twitter)', 'https://x.com/'),
    ('TIKTOK', 'TikTok', 'https://www.tiktok.com/@'),
    ('YOUTUBE', 'YouTube', 'https://www.youtube.com/'),
    ('GITHUB', 'GitHub', 'https://github.com/'),
    ('ORCID', 'ORCID', 'https://orcid.org/'),
    ('THREADS', 'Threads', 'https://www.threads.net/'),
    ('BLUESKY', 'Bluesky', 'https://bsky.app/profile/'),
    ('MASTODON', 'Mastodon', NULL),
    ('PERSONAL_WEB', 'Personal Website', NULL)
ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE public.atlas_social_platforms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read platforms" ON public.atlas_social_platforms;
CREATE POLICY "Allow authenticated read platforms" ON public.atlas_social_platforms FOR SELECT TO authenticated USING (true);
