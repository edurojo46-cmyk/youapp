import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';

const url = process.env.VITE_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SECRET_KEY || '';
const client = createClient(url, serviceKey);

async function main() {
  console.log('--- atlas_discovered_companies ---');
  const { data: companies, error: err1 } = await client.from('atlas_discovered_companies').select('*').limit(1);
  if (err1) console.error(err1);
  else console.log('Sample:', companies);
  
  console.log('\n--- information_schema.routines for orgs/companies ---');
  const { data: routines, error: err2 } = await client.rpc('exec_sql', {
    sql: `SELECT routine_name FROM information_schema.routines WHERE routine_name LIKE '%org%' OR routine_name LIKE '%compan%';`
  });
  if (err2) console.error(err2);
  else console.log('Routines:', routines);
}
main().catch(console.error);
