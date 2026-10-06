import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/["']/g, '');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = line.split('=')[1].trim().replace(/["']/g, '');
}

const supabase = createClient(url, key);

async function run() {
  const candidateTables = [
    'atlas_people',
    'atlas_search_outbox',
    'atlas_people_search_outbox',
    'search_outbox',
    'atlas_identities',
    'atlas_person_identity_map',
    'atlas_people_live_metrics',
    'atlas_people_live_events',
    'atlas_winner_leases',
    'atlas_canonical_assets',
    'atlas_sources'
  ];

  for (const t of candidateTables) {
    const { data, error } = await supabase.from(t).select('*').limit(1);
    if (!error) {
      console.log(`Table '${t}' EXISTS! Sample columns:`, Object.keys(data[0] || {}));
    } else {
      console.log(`Table '${t}' NOT FOUND:`, error.message);
    }
  }
}

run();
