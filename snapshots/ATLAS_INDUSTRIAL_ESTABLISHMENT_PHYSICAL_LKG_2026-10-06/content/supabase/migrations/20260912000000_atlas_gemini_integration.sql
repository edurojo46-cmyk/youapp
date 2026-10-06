-- ATLAS GEMINI AI INTEGRATION V1: Cache and Budget Tables

-- 1. Query Interpretation Cache
CREATE TABLE public.atlas_ai_query_cache (
    query_hash TEXT PRIMARY KEY,
    normalized_query TEXT NOT NULL,
    result_json JSONB NOT NULL,
    model TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- 2. Grounded Discovery Cache
CREATE TABLE public.atlas_ai_discovery_cache (
    discovery_hash TEXT PRIMARY KEY,
    normalized_query TEXT NOT NULL,
    result_json JSONB NOT NULL,
    model TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- 3. Daily Usage & Budget Guard
CREATE TABLE public.atlas_ai_usage_daily (
    usage_date DATE NOT NULL,
    model TEXT NOT NULL,
    purpose TEXT NOT NULL, -- 'QUERY' or 'DISCOVERY'
    requests INTEGER DEFAULT 0 NOT NULL,
    grounded_search_calls INTEGER DEFAULT 0 NOT NULL,
    input_tokens INTEGER DEFAULT 0 NOT NULL,
    output_tokens INTEGER DEFAULT 0 NOT NULL,
    estimated_cost NUMERIC(10, 4) DEFAULT 0.0000 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    PRIMARY KEY (usage_date, model, purpose)
);

-- Index for cleanup
CREATE INDEX idx_atlas_ai_query_cache_expires ON public.atlas_ai_query_cache(expires_at);
CREATE INDEX idx_atlas_ai_discovery_cache_expires ON public.atlas_ai_discovery_cache(expires_at);

-- RLS
ALTER TABLE public.atlas_ai_query_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_ai_discovery_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_ai_usage_daily ENABLE ROW LEVEL SECURITY;

-- Only authenticated users (Edge Functions via service role bypass this)
-- But we can add basic policies for admin inspection
CREATE POLICY "Admins can view query cache" ON public.atlas_ai_query_cache FOR SELECT TO authenticated USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');
CREATE POLICY "Admins can view discovery cache" ON public.atlas_ai_discovery_cache FOR SELECT TO authenticated USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');
CREATE POLICY "Admins can view usage" ON public.atlas_ai_usage_daily FOR SELECT TO authenticated USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');


-- Atomic RPC to increment usage and check budget
CREATE OR REPLACE FUNCTION public.reserve_and_increment_gemini_usage(
    p_model TEXT,
    p_purpose TEXT,
    p_is_grounded_search BOOLEAN,
    p_max_daily_requests INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER -- Needs to run as superuser or with privileges to bypass RLS for incrementing
AS $$
DECLARE
    v_today DATE := CURRENT_DATE;
    v_current_requests INTEGER;
BEGIN
    -- Upsert the daily record
    INSERT INTO public.atlas_ai_usage_daily (usage_date, model, purpose, requests, grounded_search_calls)
    VALUES (v_today, p_model, p_purpose, 0, 0)
    ON CONFLICT (usage_date, model, purpose) DO NOTHING;

    -- Lock the row for update
    SELECT requests INTO v_current_requests
    FROM public.atlas_ai_usage_daily
    WHERE usage_date = v_today AND model = p_model AND purpose = p_purpose
    FOR UPDATE;

    -- Check budget
    IF v_current_requests >= p_max_daily_requests THEN
        RETURN FALSE; -- Budget exhausted
    END IF;

    -- Increment
    UPDATE public.atlas_ai_usage_daily
    SET 
        requests = requests + 1,
        grounded_search_calls = grounded_search_calls + CASE WHEN p_is_grounded_search THEN 1 ELSE 0 END,
        updated_at = timezone('utc'::text, now())
    WHERE usage_date = v_today AND model = p_model AND purpose = p_purpose;

    RETURN TRUE;
END;
$$;
