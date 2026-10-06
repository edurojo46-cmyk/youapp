import { dbPool } from '../server/db.ts';

async function main() {
  const res = await dbPool.query(`
    SELECT concept_id, canonical_name, osm_tags, synonyms 
    FROM public.atlas_concept_registry 
    WHERE concept_id ILIKE '%night%' 
       OR concept_id ILIKE '%disco%'
       OR concept_id ILIKE '%dance%'
       OR canonical_name ILIKE '%night%'
       OR canonical_name ILIKE '%disco%'
       OR canonical_name ILIKE '%baile%'
       OR synonyms::text ILIKE '%discoteca%'
       OR synonyms::text ILIKE '%boliche%'
       OR synonyms::text ILIKE '%nightclub%';
  `);

  console.log(`Concepts matching nightclub / discoteca: ${res.rows.length}`);
  for (const r of res.rows) {
    console.log(`[${r.concept_id}] "${r.canonical_name}"`);
    console.log(`  OSM: ${JSON.stringify(r.osm_tags)}`);
    console.log(`  Syns: ${JSON.stringify(r.synonyms)}`);
  }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
