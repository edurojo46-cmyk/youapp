import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const l of env.split('\n')) {
  if (l.startsWith('VITE_SUPABASE_URL=')) url = l.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  if (l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = l.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
}

async function run() {
  const v3Sql = fs.readFileSync('supabase/migrations/20260915_rpc_set_based_v3.sql', 'utf8');
  const v2PubSql = fs.readFileSync('supabase/migrations/20260915_publisher_single_rpc_v2.sql', 'utf8');
  
  console.log('Applying V3 RPC...');
  const res = await fetch(`${url}/rest/v1/`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ query: v3Sql })
  });
  
  if (!res.ok) {
     console.log('Cannot apply via REST natively. Need psql or pg node client.');
  } else {
     console.log('Applied V3 RPC');
  }
}
run();
