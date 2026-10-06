-- 20260908060000_atlas_person_provenance_model.sql

-- Define the valid provenance origin types for an entity.
-- This ensures that synthetic and real data are clearly isolated.
CREATE TYPE person_origin_type AS ENUM (
  'REAL_EXTERNAL',
  'PUBLIC_API',
  'MANUAL',
  'IMPORT',
  'SEED',
  'DEMO',
  'BENCHMARK',
  'TEST',
  'DERIVED',
  'UNKNOWN'
);

-- Alter table atlas_people to include data provenance tracking
ALTER TABLE public.atlas_people
  ADD COLUMN origin_type person_origin_type NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN origin_source VARCHAR,
  ADD COLUMN origin_source_key VARCHAR,
  ADD COLUMN ingestion_pipeline VARCHAR,
  ADD COLUMN observed_at TIMESTAMPTZ;

-- Add an index on origin_type as it will be heavily filtered in queries
CREATE INDEX idx_atlas_people_origin_type ON public.atlas_people (origin_type);

-- Update the existing comments to document these new provenance fields
COMMENT ON COLUMN public.atlas_people.origin_type IS 'The deterministic classification of this records origin. Used to hard-isolate synthetic test data from real data.';
COMMENT ON COLUMN public.atlas_people.origin_source IS 'The upstream system, dataset, or fixture ID that produced this record.';
COMMENT ON COLUMN public.atlas_people.origin_source_key IS 'The unique key/ID in the upstream source system if applicable.';
COMMENT ON COLUMN public.atlas_people.ingestion_pipeline IS 'The specific script, API adapter, or pipeline run that ingested this record.';
COMMENT ON COLUMN public.atlas_people.observed_at IS 'The timestamp when this record was observed or generated in the origin source.';
