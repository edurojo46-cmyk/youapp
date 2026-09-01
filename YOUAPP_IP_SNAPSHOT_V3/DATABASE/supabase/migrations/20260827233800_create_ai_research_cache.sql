-- Cache for AI Research queries
CREATE TABLE public.ai_research_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_normalized TEXT NOT NULL,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookup of exact normalized prompts
CREATE INDEX idx_ai_research_cache_prompt ON public.ai_research_cache(prompt_normalized);

-- Enable RLS
ALTER TABLE public.ai_research_cache ENABLE ROW LEVEL SECURITY;

-- Allow read access for Edge Functions and authenticated users
CREATE POLICY "Enable read access for all users" ON public.ai_research_cache FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.ai_research_cache FOR INSERT WITH CHECK (true);
