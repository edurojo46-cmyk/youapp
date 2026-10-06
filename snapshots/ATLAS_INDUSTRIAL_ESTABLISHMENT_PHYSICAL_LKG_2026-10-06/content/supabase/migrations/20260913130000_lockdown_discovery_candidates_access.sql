-- Migration: Lock down public.atlas_people_discovery_candidates access
-- Directive Section 2:
-- ANON_SELECT = DENY
-- NORMAL_CLIENT_WRITE = DENY
-- NORMAL_CLIENT_DIRECT_SELECT = DENY
-- SERVER_SERVICE_ACCESS = ALLOW

-- Ensure RLS is active
ALTER TABLE public.atlas_people_discovery_candidates ENABLE ROW LEVEL SECURITY;

-- Drop public read policy
DROP POLICY IF EXISTS "Allow public read for discovery search" ON public.atlas_people_discovery_candidates;
DROP POLICY IF EXISTS "Allow service role write access" ON public.atlas_people_discovery_candidates;
DROP POLICY IF EXISTS "Allow service role full access" ON public.atlas_people_discovery_candidates;

-- Service role full access policy
CREATE POLICY "Allow service role full access" 
  ON public.atlas_people_discovery_candidates 
  FOR ALL 
  TO service_role 
  USING (true) 
  WITH CHECK (true);

-- Revoke direct permissions from anon and authenticated client roles
REVOKE ALL ON public.atlas_people_discovery_candidates FROM anon;
REVOKE ALL ON public.atlas_people_discovery_candidates FROM authenticated;

-- Explicitly grant access only to service_role and postgres
GRANT ALL ON public.atlas_people_discovery_candidates TO service_role;
GRANT ALL ON public.atlas_people_discovery_candidates TO postgres;
