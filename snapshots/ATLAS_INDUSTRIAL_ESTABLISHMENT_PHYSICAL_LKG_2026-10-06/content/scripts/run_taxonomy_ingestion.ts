import { AtlasTaxonomyIngestionService } from '../server/services/industrial/AtlasTaxonomyIngestionService.ts';
import { dbPool } from '../server/db.ts';

async function main() {
  console.log('Starting Public Taxonomy Ingestion Pipeline...');
  const service = AtlasTaxonomyIngestionService.getInstance();
  const res = await service.ingestPublicTaxonomies();
  console.log('Ingestion Results:', res);

  // Verification queries
  const totalRes = await dbPool.query('SELECT count(*) FROM public.atlas_concept_registry;');
  const activeRes = await dbPool.query("SELECT count(*) FROM public.atlas_concept_registry WHERE validation_state IN ('VALIDATED', 'LEARNED');");
  const osmRes = await dbPool.query("SELECT count(*) FROM public.atlas_concept_registry WHERE jsonb_array_length(osm_tags) > 0;");
  const claeRes = await dbPool.query("SELECT count(*) FROM public.atlas_concept_registry WHERE jsonb_array_length(clae_codes) > 0;");
  const wikiRes = await dbPool.query("SELECT count(*) FROM public.atlas_concept_registry WHERE jsonb_array_length(wikidata_ids) > 0;");

  console.log('Post-Ingestion Metrics:');
  console.log(`TOTAL_CONCEPTS = ${totalRes.rows[0].count}`);
  console.log(`ACTIVE_CONCEPTS = ${activeRes.rows[0].count}`);
  console.log(`CONCEPTS_WITH_OSM_MAPPING = ${osmRes.rows[0].count}`);
  console.log(`CONCEPTS_WITH_CLAE_MAPPING = ${claeRes.rows[0].count}`);
  console.log(`CONCEPTS_WITH_WIKIDATA_MAPPING = ${wikiRes.rows[0].count}`);

  process.exit(0);
}

main().catch(err => {
  console.error('Taxonomy ingestion error:', err);
  process.exit(1);
});
