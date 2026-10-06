import { dbPool } from '../server/db.ts';

async function main() {
  const res = await dbPool.query("SELECT concept_id, canonical_name, osm_tags, synonyms, clae_codes, wikidata_ids FROM public.atlas_concept_registry WHERE NOT concept_id LIKE 'CLAE_%' ORDER BY concept_id ASC");
  console.log(`Auditing ${res.rows.length} non-CLAE ontology concepts...`);

  for (const c of res.rows) {
    const osm = Array.isArray(c.osm_tags) ? c.osm_tags : [];
    const syns = Array.isArray(c.synonyms) ? c.synonyms : [];
    const clae = Array.isArray(c.clae_codes) ? c.clae_codes : [];

    // Let's log any empty OSM or suspicious tags
    if (osm.length === 0) {
      console.log(`[NO_OSM] ${c.concept_id} ("${c.canonical_name}")`);
    } else {
      console.log(`[OK] ${c.concept_id} ("${c.canonical_name}") -> OSM: ${JSON.stringify(osm)} | CLAE: ${JSON.stringify(clae)}`);
    }
  }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
