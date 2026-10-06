import dotenv from 'dotenv';
dotenv.config();
import { FederatedPersonSearch } from '../src/lib/search/FederatedPersonSearch.js';
import { QueryIntentParser } from '../src/lib/search/UniversalQueryModel.js';

async function testControl() {
  const federatedSearch = new FederatedPersonSearch();
  
  console.log('Running federated search for "Mauricio Macri" (should be in Wikidata)...');
  const intent = QueryIntentParser.parse('Mauricio Macri');
  
  const res = await federatedSearch.search({
    name: 'Mauricio Macri',
    profession: 'Político',
    query_intent: intent
  }, 'ALL_SOURCES', true);
  
  console.log('=== CONTROL QUERY RESULTS ===');
  console.log(`QUERY = Mauricio Macri`);
  console.log(`ATLAS_MATCHES = ${res.stats.atlas_results}`);
  console.log(`EXTERNAL_TOTAL = ${res.stats.external_results}`);
  console.log(`FEDERATED_UNIQUE = ${res.stats.unified_unique}`);
  
  const wikidata = res.confirmed_matches.filter(m => m.external_sources?.includes('WIKIDATA') || m.origin_status === 'EXTERNAL_LIVE' || (m as any).source === 'WIKIDATA');
  console.log(`WIKIDATA_MATCHES = ${wikidata.length}`);
  
  if (res.confirmed_matches.length > 0) {
      console.log('Sample result:', JSON.stringify(res.confirmed_matches[0], null, 2));
  }
  
  if (res.stats.external_results > 0) {
    console.log('FEDERATED_EXTERNAL_CALLS = PASS');
  } else {
    console.log('FEDERATED_EXTERNAL_CALLS = FAIL');
  }
}

testControl().catch(console.error);
