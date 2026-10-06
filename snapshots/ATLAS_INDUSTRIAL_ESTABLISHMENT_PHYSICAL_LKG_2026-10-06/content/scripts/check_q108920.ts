import { dbPool } from '../server/db.ts';

async function main() {
  const res = await dbPool.query("SELECT concept_id, canonical_name, wikidata_ids FROM public.atlas_concept_registry WHERE wikidata_ids @> '[\"Q108920\"]'::jsonb");
  console.log(`Concepts with Wikidata Q108920 (Hairdresser):`);
  for (const r of res.rows) {
    console.log(`  [${r.concept_id}] "${r.canonical_name}"`);
  }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
