import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { FederatedPersonSearch } from '../src/lib/search/FederatedPersonSearch';

const sbAdmin = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const s = new FederatedPersonSearch(undefined, sbAdmin);
  const r = await s.search({name: 'programador en Buenos Aires'}, 'ALL_SOURCES', true);
  console.log('Stats:', r.stats);
}
run();
