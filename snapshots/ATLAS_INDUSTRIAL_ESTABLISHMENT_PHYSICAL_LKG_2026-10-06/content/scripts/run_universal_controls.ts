import dotenv from 'dotenv';
dotenv.config();
import { FederatedPersonSearch } from '../src/lib/search/FederatedPersonSearch.js';
import { QueryIntentParser } from '../src/lib/search/UniversalQueryModel.js';

async function runControls() {
  const federatedSearch = new FederatedPersonSearch();
  const queries = [
    "médico en CABA",
    "plomero en CABA",
    "abogado en Córdoba",
    "docente en Rosario",
    "programador en Buenos Aires"
  ];
  
  for (const q of queries) {
      console.log(`\n=== RUNNING: ${q} ===`);
      const intent = QueryIntentParser.parse(q);
      console.log(`QueryIntent =`, intent);
      
      const filters = {
          name: intent.person_name,
          profession: intent.profession,
          query_intent: intent
      };
      
      const res = await federatedSearch.search(filters, 'ALL_SOURCES', true);
      
      console.log(`ATLAS_RESULTS = ${res.stats.atlas_results}`);
      console.log(`EXTERNAL_RAW_RESULTS = ${res.stats.external_results}`);
      console.log(`REJECTED_BY_RELEVANCE = ${res.stats.rejected_by_relevance}`);
      console.log(`FEDERATED_UNIQUE_RESULTS = ${res.stats.unified_unique}`);
      
      if (res.confirmed_matches.length > 0) {
          console.log(`Sample Valid External Result:`, res.confirmed_matches.find(m => m.origin_status === 'EXTERNAL_LIVE' || m.origin_status === 'EXTERNAL')?.display_name || 'None');
      }
  }
}

runControls().catch(console.error);
