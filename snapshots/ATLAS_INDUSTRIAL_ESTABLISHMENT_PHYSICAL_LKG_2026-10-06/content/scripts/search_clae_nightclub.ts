import { dbPool } from '../server/db.ts';

async function main() {
  console.log('=== SEARCHING PUBLIC TAXONOMIES FOR NIGHTCLUB / DISCOTECA ===');
  const res = await dbPool.query(`
    SELECT concept_id, canonical_name, osm_tags, synonyms, clae_codes, wikidata_ids 
    FROM public.atlas_concept_registry 
    WHERE canonical_name ILIKE '%baile%' 
       OR canonical_name ILIKE '%espect[aá]culo%'
       OR canonical_name ILIKE '%esparcimiento%'
       OR canonical_name ILIKE '%discoteca%'
       OR canonical_name ILIKE '%bebida%'
       OR concept_id LIKE 'CLAE_563%'
       OR concept_id LIKE 'CLAE_932%'
    ORDER BY concept_id ASC;
  `);

  console.log(`Found ${res.rows.length} candidate concepts:`);
  for (const r of res.rows) {
    console.log(`[${r.concept_id}] "${r.canonical_name}"`);
    console.log(`  OSM: ${JSON.stringify(r.osm_tags)}`);
    console.log(`  Syns: ${JSON.stringify(r.synonyms)}`);
    console.log(`  CLAE: ${JSON.stringify(r.clae_codes)}`);
    console.log(`  Wiki: ${JSON.stringify(r.wikidata_ids)}`);
  }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
