-- Migration to create youtube_quota_daily table and atomic reservation RPC

CREATE TABLE IF NOT EXISTS public.youtube_quota_daily (
    date date NOT NULL DEFAULT CURRENT_DATE,
    bucket text NOT NULL,
    used integer NOT NULL DEFAULT 0,
    daily_limit integer NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    PRIMARY KEY (date, bucket)
);

-- Enable RLS (only service_role should access this via RPC, but let's be safe)
ALTER TABLE public.youtube_quota_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage youtube quota"
  ON public.youtube_quota_daily
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RPC for atomic reservation
CREATE OR REPLACE FUNCTION public.reserve_youtube_search(p_bucket text, p_default_limit integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_used integer;
  v_limit integer;
BEGIN
  -- Insert or get current quota for the bucket today
  INSERT INTO public.youtube_quota_daily (date, bucket, used, daily_limit)
  VALUES (CURRENT_DATE, p_bucket, 0, p_default_limit)
  ON CONFLICT (date, bucket) DO NOTHING;

  -- Lock the row for update to ensure atomicity
  SELECT used, daily_limit INTO v_used, v_limit
  FROM public.youtube_quota_daily
  WHERE date = CURRENT_DATE AND bucket = p_bucket
  FOR UPDATE;

  IF v_used < v_limit THEN
    UPDATE public.youtube_quota_daily
    SET used = used + 1,
        updated_at = now()
    WHERE date = CURRENT_DATE AND bucket = p_bucket;
    
    RETURN true;
  ELSE
    RETURN false;
  END IF;
END;
$$;
