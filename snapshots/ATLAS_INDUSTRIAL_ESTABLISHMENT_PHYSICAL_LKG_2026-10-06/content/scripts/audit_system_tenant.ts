import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';

const url = process.env.VITE_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SECRET_KEY || '';
const client = createClient(url, serviceKey);

async function main() {
  console.log('--- System Tenant Persons ---');
  const { data: sysPersons } = await client.from('atlas_people').select('full_name').eq('tenant_id', '00000000-0000-0000-0000-000000000000').limit(20);
  console.log('Sample System Tenant Persons:', sysPersons?.map(p => p.full_name));

  console.log('\n--- atlas_entity_source_observations ---');
  const { data: cols, error: err1 } = await client.rpc('exec_sql', { sql: 'SELECT count(*) FROM atlas_entity_source_observations' });
  if (err1) {
    console.error('Error querying atlas_entity_source_observations:', err1.message);
  } else {
    console.log('Rows:', cols);
  }
}
main().catch(console.error);
