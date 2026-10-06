import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const l of env.split('\n')) {
  if (l.startsWith('VITE_SUPABASE_URL=')) url = l.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  if (l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = l.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
}
const sb = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  console.log("Applying V3 SQL via exec_sql...");
  const v3Sql = fs.readFileSync('supabase/migrations/20260915_rpc_set_based_v3.sql', 'utf8');
  const res = await sb.rpc('exec_sql', { sql: v3Sql });
  console.log('V3 SQL execution result:', res);
  
  console.log("Applying V2 SQL via exec_sql...");
  const v2Sql = fs.readFileSync('supabase/migrations/20260915_publisher_single_rpc_v2.sql', 'utf8');
  const res2 = await sb.rpc('exec_sql', { sql: v2Sql });
  console.log('V2 SQL execution result:', res2);

  console.log("Reloading schema cache...");
  await sb.rpc('exec_sql', { sql: "NOTIFY pgrst, 'reload schema';" });
  
  // Test if it works now
  const { data, error } = await sb.rpc('commit_canonical_with_search_outbox', {
      p_identity_rows: [],
      p_outbox_rows: []
  });
  console.log('Test execution:', data, error);
}
main();
