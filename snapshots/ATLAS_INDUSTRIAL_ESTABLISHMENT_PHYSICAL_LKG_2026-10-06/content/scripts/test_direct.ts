import { createClient } from '@supabase/supabase-js';
import { FederatedPersonSearch } from '../src/lib/search/FederatedPersonSearch.js';
import dotenv from 'dotenv';

dotenv.config();

const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!);
const fed = new FederatedPersonSearch(undefined, sb);

async function run() {
  const res = await fed.search({
    name: undefined,
    profession: 'PROGRAMADOR',
    location_filter: 'BUENOS AIRES',
    query_intent: {
      person_name: undefined,
      profession: 'PROGRAMADOR',
      geography: 'BUENOS AIRES',
      intent_confidence: 'HIGH'
    }
  }, 'ALL_SOURCES', true);

  console.log('GitHub called?', res.stats);
  console.log('Confirmed External Matches:', res.confirmed_matches.filter(m => m.external_sources && m.external_sources.includes('GITHUB')).length);
  console.log('Out of Range:', res.out_of_range.length);
  console.log('Potential Matches:', res.potential_matches.length);
  if (res.confirmed_matches.length > 0) {
    const ext = res.confirmed_matches.find(m => m.external_sources && m.external_sources.includes('GITHUB'));
    if (ext) {
       console.log('Example Match:', ext.display_name, ext.profession, ext.external_data?.[0]?.source_url);
    }
  }
}

run().catch(console.error);
