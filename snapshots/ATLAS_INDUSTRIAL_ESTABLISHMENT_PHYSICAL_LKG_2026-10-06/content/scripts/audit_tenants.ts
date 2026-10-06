import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';
const adminClient = createClient(supabaseUrl, supabaseKey);

async function checkTenants() {
  const { data: tenants } = await adminClient.from('atlas_tenants').select('*');
  console.log('atlas_tenants count:', tenants?.length);
  console.log('atlas_tenants:', tenants);

  const { data: peopleInE5 } = await adminClient.from('atlas_people').select('person_id, full_name, tenant_id, status').eq('tenant_id', 'e518772b-e9cf-4048-a4a0-40d37c1588de');
  console.log('\nPeople in Tenant e518772b-e9cf-4048-a4a0-40d37c1588de:', peopleInE5);

  const { data: peopleIn00 } = await adminClient.from('atlas_people').select('person_id, full_name, tenant_id, status').eq('tenant_id', '00000000-0000-0000-0000-000000000000').limit(10);
  console.log('\nPeople in Tenant 00000000-0000-0000-0000-000000000000 (sample):', peopleIn00);

  const { data: peopleInDbb } = await adminClient.from('atlas_people').select('person_id, full_name, tenant_id, status').eq('tenant_id', 'dbb0cf8b-5e58-4600-bd0e-d6d4f194a70c');
  console.log('\nPeople in Tenant dbb0cf8b-5e58-4600-bd0e-d6d4f194a70c:', peopleInDbb);
}

checkTenants().catch(console.error);
