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
  console.time('fetch');
  const { data, error } = await sb
    .from('atlas_person_identity_map')
    .select('source_id, source_person_id')
    .eq('source_id', 'TEST')
    .eq('source_person_id', 'TEST')
    .limit(1);
  console.timeEnd('fetch');
  
  if (error) console.error(error);
  else console.log(`Fetched ${data.length} rows`);
}
run();
