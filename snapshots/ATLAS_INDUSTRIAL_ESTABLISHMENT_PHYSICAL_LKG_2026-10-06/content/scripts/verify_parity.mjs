import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const l of env.split('\n')) {
  if (l.startsWith('VITE_SUPABASE_URL=')) url = l.split('=')[1].trim().replace(/['"]/g, '');
  if (l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = l.split('=')[1].trim().replace(/['"]/g, '');
}
const sb = createClient(url, key, { auth: { persistSession: false } });

async function run() {
  const { data, error } = await sb.from('atlas_people_discovery_candidates')
    .select('discovery_id, source_id, source_record_id')
    .neq('source_id', 'IGJ_AUTORIDADES_GENERO_2026')
    .limit(10);
  if(error) throw error;
  console.log(JSON.stringify(data, null, 2));
}
run();
