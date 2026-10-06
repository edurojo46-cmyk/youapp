import { dbPool } from '../server/db.ts';

async function main() {
  const res = await dbPool.query('SELECT concept_id, canonical_name, wikidata_ids FROM public.atlas_concept_registry WHERE wikidata_ids IS NOT NULL AND jsonb_array_length(wikidata_ids) > 0');
  const rows = res.rows;
  console.log(`Auditing ${rows.length} concepts with wikidata IDs...`);

  const wikiMap = new Map<string, Array<{ id: string; name: string }>>();
  for (const r of rows) {
    const list = Array.isArray(r.wikidata_ids) ? r.wikidata_ids : [];
    for (const w of list) {
      if (!wikiMap.has(w)) wikiMap.set(w, []);
      wikiMap.get(w)!.push({ id: r.concept_id, name: r.canonical_name });
    }
  }

  for (const [wikiId, items] of wikiMap.entries()) {
    if (items.length > 1) {
      // Check if they are rollups (e.g. CLAE_1234 and CLAE_GRP_123)
      const nonRollup = items.filter(it => !it.id.includes('GRP') && !it.id.includes('DIV') && !it.id.includes('SEC'));
      if (nonRollup.length > 1) {
        console.log(`\nWikidata [${wikiId}] shared across ${nonRollup.length} distinct 4-digit/standalone concepts:`);
        for (const it of nonRollup) {
          console.log(`  - [${it.id}] "${it.name}"`);
        }
      }
    }
  }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
