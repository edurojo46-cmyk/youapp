import { dbPool } from '../server/db.ts';

async function main() {
  const res = await dbPool.query("SELECT concept_id, canonical_name, osm_tags, synonyms, wikidata_ids FROM public.atlas_concept_registry WHERE concept_id LIKE 'CLAE_96%' ORDER BY concept_id ASC");
  for (const r of res.rows) {
    console.log(r.concept_id, r.canonical_name);
    console.log('  OSM:', r.osm_tags);
    console.log('  Syns:', r.synonyms);
    console.log('  Wiki:', r.wikidata_ids);
  }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
