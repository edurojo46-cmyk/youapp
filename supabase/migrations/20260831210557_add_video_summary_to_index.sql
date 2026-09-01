-- Add video_summary to youapp_index
ALTER TABLE public.youapp_index ADD COLUMN IF NOT EXISTS video_summary TEXT;
