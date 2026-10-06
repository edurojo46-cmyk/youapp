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
  console.time('fetch_sp_only');
  const { data, error } = await sb
    .from('atlas_people_discovery_candidates')
    .select('discovery_id, social_profiles')
    .gt('discovery_id', 'disc_biep_0055647a1720b56b68c4')
    .order('discovery_id', { ascending: true })
    .limit(10);
  console.timeEnd('fetch_sp_only');
  
  if (error) console.error(error);
  else console.log(`Fetched ${data.length} rows`);
}
run();
