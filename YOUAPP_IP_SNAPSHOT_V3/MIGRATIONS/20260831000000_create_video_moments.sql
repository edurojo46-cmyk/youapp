-- Migration: Create video_moments table for YOU4 Moments Engine V1
-- Description: Stores AI-generated moments for videos to be used in the YOU4 player UI.
-- RLS: Frontend only has SELECT access. The backend (Moments Worker) will do the INSERTs.

CREATE TABLE public.video_moments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_key TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_content_id TEXT NOT NULL,
    
    start_sec INTEGER NOT NULL,
    end_sec INTEGER,
    
    title TEXT NOT NULL,
    summary TEXT,
    moment_type TEXT NOT NULL,
    
    confidence FLOAT NOT NULL,
    source TEXT NOT NULL,
    analysis_version TEXT NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

    -- Constraint to prevent duplicates
    CONSTRAINT uq_content_analysis_start UNIQUE (content_key, analysis_version, start_sec)
);

-- Enable RLS
ALTER TABLE public.video_moments ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone (authenticated or not, or just authenticated depending on app config, 
-- but usually frontend anon/authenticated can read) can SELECT.
CREATE POLICY "Allow public read access on video_moments"
    ON public.video_moments
    FOR SELECT
    USING (true);

-- No INSERT/UPDATE/DELETE policies are defined for authenticated users, 
-- meaning the frontend cannot mutate this table. Only service roles can.

-- Add indexes for fast querying by the frontend
CREATE INDEX idx_video_moments_content_key ON public.video_moments(content_key);

-- Trigger to auto-update updated_at
CREATE TRIGGER set_timestamp_video_moments
BEFORE UPDATE ON public.video_moments
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();
