import { WikidataAdapter } from '../src/lib/search/adapters/WikidataAdapter.js';

async function run() {
  const adapter = new WikidataAdapter();
  const res = await adapter.search({
    profession: 'comerciante',
    location_filter: 'caba',
    structured_location: { city: 'caba' }
  });
  console.log(`Wikidata returned ${res.length} candidates for comerciante en caba:`);
  for (const r of res.slice(0, 10)) {
    console.log(`- ${r.display_name} | Profession: ${r.profession} | URL: ${r.source_url}`);
  }
}

run();
