import { QueryIntentParser } from '../src/lib/search/UniversalQueryModel';
import { WikidataAdapter } from '../src/lib/search/adapters/WikidataAdapter';

async function testMedico100() {
  const intent = QueryIntentParser.parse('médico en Argentina');
  const adapter = new WikidataAdapter();
  const res = await adapter.searchPaginated(intent, {
    provider_id: 'WIKIDATA_SPARQL',
    page_size: 100,
    offset: 0,
    provider_exhausted: false,
    discovered_so_far: 0
  });

  console.log('Medico records returned:', res.records.length);
  for (const r of res.records.slice(0, 5)) {
    console.log(`- ${r.display_name}: "${r.role_claim}"`);
  }
}

testMedico100();
