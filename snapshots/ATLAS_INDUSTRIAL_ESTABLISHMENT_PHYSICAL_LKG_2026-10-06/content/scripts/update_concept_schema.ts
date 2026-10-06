import { dbPool } from '../server/db.ts';

async function updateSchema() {
  try {
    await dbPool.query(`
      ALTER TABLE public.atlas_concept_registry
      ADD COLUMN IF NOT EXISTS osm_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS clae_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS wikidata_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS other_external_taxonomy_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS source_hints JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

      CREATE INDEX IF NOT EXISTS idx_concept_clae ON public.atlas_concept_registry USING gin (clae_codes);
      CREATE INDEX IF NOT EXISTS idx_concept_osm ON public.atlas_concept_registry USING gin (osm_tags);
      CREATE INDEX IF NOT EXISTS idx_concept_wikidata ON public.atlas_concept_registry USING gin (wikidata_ids);
    `);
    console.log('Concept Registry Schema upgraded with normalized taxonomy fields successfully!');
  } catch (err: any) {
    console.error('Schema update failed:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

updateSchema();
