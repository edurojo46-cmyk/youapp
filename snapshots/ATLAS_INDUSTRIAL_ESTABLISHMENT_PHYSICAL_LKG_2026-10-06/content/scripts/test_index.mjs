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
  console.log('Testing RPC directly from test script...');
  const t0 = Date.now();
  const { data, error } = await sb.rpc('repair_discovery_candidates_batch_v2', {
    p_last_key: 'disc_igj_1caf74c4e6e51bb56cbc2ffc',
    p_limit: 10
  });
  console.log(`Execution time: ${Date.now() - t0}ms`);
  if (error) console.error('Error:', error);
  else console.log('Result:', data);
}
run();
