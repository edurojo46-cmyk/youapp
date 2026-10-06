import 'dotenv/config';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/["']/g, '');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = line.split('=')[1].trim().replace(/["']/g, '');
}
if (!key) {
  for (const line of envContent.split('\n')) {
    if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim().replace(/["']/g, '');
  }
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function runSql(sql) {
  let res = await supabase.rpc('exec_sql', { sql });
  if (res.error) {
    res = await supabase.rpc('execute_sql_readonly', { sql_query: sql });
  }
  return res;
}

async function main() {
  console.log('Testing SQL execution on PostgreSQL...');
  
  // 1. Query tables
  const q1 = await runSql(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  console.log('Public tables result:', q1.error ? q1.error.message : q1.data);

  // 2. Count distinct in atlas_person_identity_map
  const q2 = await runSql(`
    SELECT 
      COUNT(*) as total_rows,
      COUNT(DISTINCT atlas_person_id) as distinct_people
    FROM atlas_person_identity_map;
  `);
  console.log('atlas_person_identity_map direct SQL counts:', q2.error ? q2.error.message : q2.data);
}

main().catch(console.error);
