import { dbPool } from '../server/db.ts';

async function main() {
  const ids = ['TALLER_DE_TORNERIA', 'METALLURGICAL_INDUSTRY', 'CLEANING_SERVICES', 'PERSONAL_CARE_SERVICE', 'PHARMACY', 'HARDWARE_STORE', 'BAKERY', 'BUTCHER_SHOP', 'ICE_CREAM_PARLOR', 'CLAE_9601', 'CLAE_9602', 'CLAE_9603', 'CLAE_9609', 'CLAE_2599', 'CLAE_2592'];
  const res = await dbPool.query('SELECT concept_id, canonical_name, osm_tags, synonyms, clae_codes, wikidata_ids FROM public.atlas_concept_registry WHERE concept_id = ANY($1)', [ids]);
  for (const r of res.rows) {
    console.log(`[${r.concept_id}] "${r.canonical_name}"`);
    console.log(`  OSM: ${JSON.stringify(r.osm_tags)}`);
    console.log(`  Syns: ${JSON.stringify(r.synonyms)}`);
    console.log(`  CLAE: ${JSON.stringify(r.clae_codes)}`);
    console.log(`  Wiki: ${JSON.stringify(r.wikidata_ids)}`);
  }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
