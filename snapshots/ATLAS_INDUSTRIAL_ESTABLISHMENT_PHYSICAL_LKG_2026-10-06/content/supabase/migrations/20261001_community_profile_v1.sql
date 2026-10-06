-- ATLAS COMMUNITY PROFILE V1 EXTENSION
-- Reuses public.atlas_user_profiles for community presence without duplicating identity.

ALTER TABLE public.atlas_user_profiles 
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS show_neighborhood boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_interests boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_business boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_slug text,
  ADD COLUMN IF NOT EXISTS neighborhood_id text DEFAULT 'caballito';

CREATE INDEX IF NOT EXISTS idx_atlas_user_profiles_slug ON public.atlas_user_profiles(public_slug);
