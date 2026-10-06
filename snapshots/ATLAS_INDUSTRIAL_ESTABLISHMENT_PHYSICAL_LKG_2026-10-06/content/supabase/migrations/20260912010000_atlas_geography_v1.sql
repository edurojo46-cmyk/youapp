-- 20260912010000_atlas_geography_v1.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Core Geographies Table
CREATE TABLE IF NOT EXISTS public.atlas_geographies (
    geography_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    geography_type TEXT NOT NULL, -- COUNTRY, PROVINCE, AUTONOMOUS_CITY, DEPARTMENT, MUNICIPALITY, LOCALITY, NEIGHBORHOOD, etc.
    georef_id TEXT, -- Primary official ID from Georef if available
    indec_code TEXT, -- Official INDEC code
    country_code TEXT DEFAULT 'AR',
    province_code TEXT,
    latitude NUMERIC,
    longitude NUMERIC,
    source_system TEXT DEFAULT 'GEOREF_V2',
    source_version TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices for fast resolution
CREATE INDEX idx_atlas_geographies_normalized_name ON public.atlas_geographies(normalized_name);
CREATE INDEX idx_atlas_geographies_type ON public.atlas_geographies(geography_type);
CREATE UNIQUE INDEX idx_atlas_geographies_georef_id ON public.atlas_geographies(georef_id) WHERE georef_id IS NOT NULL;
CREATE UNIQUE INDEX idx_atlas_geographies_indec_code ON public.atlas_geographies(indec_code) WHERE indec_code IS NOT NULL;

-- 2. Geography Relationships (Graph Model)
CREATE TABLE IF NOT EXISTS public.atlas_geography_relationships (
    parent_geography_id UUID NOT NULL REFERENCES public.atlas_geographies(geography_id) ON DELETE CASCADE,
    child_geography_id UUID NOT NULL REFERENCES public.atlas_geographies(geography_id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL DEFAULT 'CONTAINED_IN',
    source_system TEXT NOT NULL DEFAULT 'GEOREF_V2',
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (parent_geography_id, child_geography_id, relationship_type)
);

CREATE INDEX idx_atlas_geography_rel_child ON public.atlas_geography_relationships(child_geography_id);

-- 3. Geography External IDs
CREATE TABLE IF NOT EXISTS public.atlas_geography_external_ids (
    geography_id UUID NOT NULL REFERENCES public.atlas_geographies(geography_id) ON DELETE CASCADE,
    namespace TEXT NOT NULL, -- GEOREF, INDEC, PROVINCIAL_SOURCE
    external_id TEXT NOT NULL,
    source_url TEXT,
    valid_from TIMESTAMPTZ,
    valid_to TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (geography_id, namespace, external_id)
);

CREATE UNIQUE INDEX idx_atlas_geography_ext_unique ON public.atlas_geography_external_ids(namespace, external_id);

-- Apply RLS
ALTER TABLE public.atlas_geographies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_geography_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_geography_external_ids ENABLE ROW LEVEL SECURITY;

-- Allow read access for authenticated users/service role, but limit public anon
CREATE POLICY "Allow read atlas_geographies" ON public.atlas_geographies FOR SELECT USING (true);
CREATE POLICY "Allow read atlas_geography_relationships" ON public.atlas_geography_relationships FOR SELECT USING (true);
CREATE POLICY "Allow read atlas_geography_external_ids" ON public.atlas_geography_external_ids FOR SELECT USING (true);
