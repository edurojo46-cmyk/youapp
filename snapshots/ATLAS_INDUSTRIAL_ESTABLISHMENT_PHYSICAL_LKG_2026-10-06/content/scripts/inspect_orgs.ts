import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';

const url = process.env.VITE_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SECRET_KEY || '';
const client = createClient(url, serviceKey);

async function main() {
  console.log('--- atlas_canonical_entities (ORGANIZATION) ---');
  const { data: orgs, error: err1 } = await client.from('atlas_canonical_entities')
    .select('canonical_entity_id, canonical_name, entity_type, status, tenant_id')
    .eq('entity_type', 'ORGANIZATION')
    .limit(3);
  if (err1) console.error(err1);
  else console.log('Sample Orgs:', orgs);
  
  console.log('\n--- Count of ORGANIZATIONs ---');
  const { count } = await client.from('atlas_canonical_entities')
    .select('*', { count: 'exact', head: true })
    .eq('entity_type', 'ORGANIZATION');
  console.log('Total ORGs:', count);
}
main().catch(console.error);
