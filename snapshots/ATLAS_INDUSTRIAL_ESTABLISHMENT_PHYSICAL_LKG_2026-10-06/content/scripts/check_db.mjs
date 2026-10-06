import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const l of env.split('\n')) {
  if (l.startsWith('VITE_SUPABASE_URL=')) url = l.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  if (l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = l.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
}
const supabase = createClient(url, key, { auth: { persistSession: false } });
async function check() {
  const { data } = await supabase.from('atlas_people_live_metrics').select('people_added_today, throughput_jobs_per_minute, unique_people');
  console.log(data);
  const { count } = await supabase.from('atlas_search_outbox').select('*', { count: 'exact', head: true });
  console.log('Outbox:', count);
}
check();
