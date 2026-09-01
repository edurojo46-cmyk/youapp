-- Migración: YOU4 Semantic Moments V2

CREATE TABLE IF NOT EXISTS public.video_moments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  content_key TEXT NOT NULL,
  start_sec INTEGER NOT NULL,
  end_sec INTEGER,
  title TEXT NOT NULL,
  summary TEXT,
  moment_type TEXT,
  source TEXT DEFAULT 'fallback',
  analysis_version TEXT,
  model TEXT,
  prompt_version TEXT,
  confidence NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Habilitar RLS
ALTER TABLE public.video_moments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read video moments" ON public.video_moments;
CREATE POLICY "Public can read video moments" ON public.video_moments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role can all moments" ON public.video_moments;
CREATE POLICY "Service role can all moments" ON public.video_moments USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS public.video_analysis_jobs (
  content_key TEXT NOT NULL,
  analysis_type TEXT NOT NULL,
  analysis_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  completed_at TIMESTAMP WITH TIME ZONE,
  error_code TEXT,
  PRIMARY KEY (content_key, analysis_type, analysis_version)
);

ALTER TABLE public.video_analysis_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read analysis jobs" ON public.video_analysis_jobs;
CREATE POLICY "Public can read analysis jobs" ON public.video_analysis_jobs FOR SELECT USING (true);
