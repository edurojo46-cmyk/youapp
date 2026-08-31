CREATE TABLE public.seed_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    provider_channel_id VARCHAR(100) NOT NULL,
    name TEXT NOT NULL,
    handle VARCHAR(100),
    normalized_handle VARCHAR(100),
    canonical_url TEXT,
    country VARCHAR(10),
    language VARCHAR(10),
    tier VARCHAR(10),
    source_confidence INTEGER DEFAULT 100,
    is_official BOOLEAN DEFAULT false,
    uploads_playlist_id VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending', -- pending, resolved, verified, ambiguous, not_found, disabled
    last_verified_at TIMESTAMP WITH TIME ZONE,
    verification_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, provider_channel_id),
    UNIQUE(provider, normalized_handle)
);

CREATE TABLE public.seed_source_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seed_source_id UUID NOT NULL REFERENCES public.seed_sources(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(seed_source_id, category)
);

-- RLS Policies
ALTER TABLE public.seed_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seed_source_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON public.seed_sources FOR SELECT USING (true);
CREATE POLICY "Enable all access for service role" ON public.seed_sources USING (true) WITH CHECK (true);

CREATE POLICY "Enable read access for all users" ON public.seed_source_categories FOR SELECT USING (true);
CREATE POLICY "Enable all access for service role" ON public.seed_source_categories USING (true) WITH CHECK (true);
