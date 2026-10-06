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
  const sql = fs.readFileSync('supabase/migrations/20260916000000_search_metrics_v6a_schema.sql', 'utf8');
  const { data, error } = await sb.rpc('exec_sql', { query: sql });
  if (error) console.error('Error:', error);
  else console.log('Success:', data);
}
run();
