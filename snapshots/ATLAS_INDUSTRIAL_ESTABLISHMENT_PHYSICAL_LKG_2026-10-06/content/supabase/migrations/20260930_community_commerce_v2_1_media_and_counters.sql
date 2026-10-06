-- ==============================================================================
-- COMMUNITY COMMERCE V2.1: REAL MEDIA & COUNTER SEMANTICS SCHEMA
-- Environment Segregation & Provenance Tracking
-- ==============================================================================

-- 1. Counter Environment Segregation on Neighborhood & Category Follows
ALTER TABLE public.atlas_local_neighborhood_follows 
ADD COLUMN IF NOT EXISTS environment VARCHAR(32) NOT NULL DEFAULT 'TEST_NON_PRODUCTION';

ALTER TABLE public.atlas_local_category_follows 
ADD COLUMN IF NOT EXISTS environment VARCHAR(32) NOT NULL DEFAULT 'TEST_NON_PRODUCTION';

-- 2. Physical Storage & Provenance Tracking for Merchant Offer Photos
CREATE TABLE IF NOT EXISTS public.atlas_local_media (
  media_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID REFERENCES public.atlas_local_offers(offer_id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  uploaded_by_user_id TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  environment TEXT NOT NULL DEFAULT 'TEST_NON_PRODUCTION',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_atlas_local_media_offer ON public.atlas_local_media(offer_id);
CREATE INDEX IF NOT EXISTS idx_atlas_local_media_org ON public.atlas_local_media(organization_id);
CREATE INDEX IF NOT EXISTS idx_atlas_local_media_env ON public.atlas_local_media(environment);
