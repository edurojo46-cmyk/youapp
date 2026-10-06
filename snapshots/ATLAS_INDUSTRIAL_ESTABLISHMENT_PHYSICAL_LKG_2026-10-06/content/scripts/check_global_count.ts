import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';

const url = process.env.VITE_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SECRET_KEY || '';
const client = createClient(url, serviceKey);

async function main() {
  // Global count from atlas_people
  const { count: totalPeople, error: countErr } = await client
    .from('atlas_people')
    .select('*', { count: 'exact', head: true });
  console.log('DATABASE_GLOBAL_PERSON_COUNT:', totalPeople, 'err:', countErr?.message);

  // Count by tenant
  const { data: tenants, error: tenantErr } = await client
    .from('atlas_people')
    .select('tenant_id')
    .limit(10000);
  if (tenantErr) console.log('Tenant query error:', tenantErr.message);
  const byTenant: Record<string, number> = {};
  for (const row of (tenants || [])) {
    byTenant[row.tenant_id] = (byTenant[row.tenant_id] || 0) + 1;
  }
  console.log('PERSONS_BY_TENANT:', JSON.stringify(byTenant, null, 2));
}
main().catch(console.error);
