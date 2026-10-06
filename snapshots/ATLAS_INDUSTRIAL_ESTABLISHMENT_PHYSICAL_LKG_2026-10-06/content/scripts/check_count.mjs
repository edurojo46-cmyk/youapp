import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const l of env.split('\n')) {
  if (l.startsWith('VITE_SUPABASE_URL=')) url = l.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  if (l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = l.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
}
const sb = createClient(url, key, { auth: { persistSession: false } });

async function run() {
  console.log('Checking how many rows have been updated...');
  const { count, error } = await sb
    .from('atlas_people_discovery_candidates')
    .select('discovery_id', { count: 'exact', head: true })
    .not('atlas_person_id', 'is', null);
    
  if (error) console.error(error);
  else console.log(`ROWS WITH atlas_person_id: ${count}`);
}
run();
