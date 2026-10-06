import { dbPool } from '../server/db.ts';

async function main() {
  const res = await dbPool.query('SELECT concept_id, canonical_name, osm_tags, synonyms, clae_codes, wikidata_ids FROM public.atlas_concept_registry ORDER BY concept_id ASC');
  const rows = res.rows;

  console.log(`Auditing all ${rows.length} concepts for copy-paste leaks...`);

  const leakGroups: any[] = [];

  // Group by exact synonyms (joined string)
  const synMap = new Map<string, any[]>();
  for (const r of rows) {
    const syns = Array.isArray(r.synonyms) ? r.synonyms.map((s: string) => s.trim().toLowerCase()).sort() : [];
    // remove the self-named canonical synonym if present
    const cleanSyns = syns.filter((s: string) => !s.includes(r.canonical_name.toLowerCase().slice(0, 10))).join('|');
    if (cleanSyns.length > 5) {
      if (!synMap.has(cleanSyns)) synMap.set(cleanSyns, []);
      synMap.get(cleanSyns)!.push(r);
    }
  }

  for (const [key, group] of synMap.entries()) {
    if (group.length > 1) {
      // Check if canonical names are meaningfully different
      const names = group.map(g => g.canonical_name);
      console.log(`\nFound identical synonym cluster (${group.length} concepts):`);
      for (const g of group) {
        console.log(`  [${g.concept_id}] "${g.canonical_name}" | OSM: ${JSON.stringify(g.osm_tags)}`);
      }
      leakGroups.push({ key, group });
    }
  }

  console.log(`\nTotal clusters with identical non-trivial synonyms: ${leakGroups.length}`);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
