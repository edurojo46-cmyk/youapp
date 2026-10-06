import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const l of env.split('\n')) {
  if (l.startsWith('VITE_SUPABASE_URL=')) url = l.split('=')[1].trim().replace(/['"]/g, '');
  if (l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = l.split('=')[1].trim().replace(/['"]/g, '');
}
const sb = createClient(url, key, { auth: { persistSession: false } });

async function check() {
  const { data, error } = await sb.rpc('process_search_outbox_batch', { p_limit: 0, p_worker_id: 'test' });
  if (error) console.error(error);
  console.log("RPC Output:", JSON.stringify(data));
  if (data && 'total_quarantined' in data) {
    console.log("PUBLISHER_RPC_VERSION = V3_POISON_SAFE");
  } else {
    console.log("PUBLISHER_RPC_VERSION = UNKNOWN (Missing total_quarantined field)");
  }
}
check();
