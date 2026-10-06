-- 20260914160000_atlas_person_identity_map.sql
-- Global Person Identity SSOT Map for Atlas Argentina
-- Resolves canonical, discovery, BIEP, CONICET, OpenAlex, Wikidata into a single atlas_person_id.

CREATE TABLE IF NOT EXISTS public.atlas_person_identity_map (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atlas_person_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    source_person_id TEXT NOT NULL,
    identifier_type TEXT NOT NULL,
    identifier_value TEXT,
    evidence_id TEXT,
    confidence NUMERIC NOT NULL DEFAULT 1.0,
    resolution_method TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_person_identity_source UNIQUE (source_id, source_person_id)
);

CREATE INDEX IF NOT EXISTS idx_identity_map_atlas_person_id 
    ON public.atlas_person_identity_map (atlas_person_id);

CREATE INDEX IF NOT EXISTS idx_identity_map_source_lookup 
    ON public.atlas_person_identity_map (source_id, source_person_id);

CREATE INDEX IF NOT EXISTS idx_identity_map_identifier 
    ON public.atlas_person_identity_map (identifier_type, identifier_value);

ALTER TABLE public.atlas_person_identity_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage atlas_person_identity_map" 
    ON public.atlas_person_identity_map
    FOR ALL USING (auth.role() = 'service_role');
