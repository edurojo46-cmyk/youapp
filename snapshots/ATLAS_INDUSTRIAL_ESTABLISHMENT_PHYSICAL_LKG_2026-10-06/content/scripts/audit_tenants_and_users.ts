import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';
const adminClient = createClient(supabaseUrl, supabaseKey);

async function listUsersWithPeople() {
  const { data: usersData } = await adminClient.auth.admin.listUsers();
  const users = usersData?.users || [];
  
  console.log(`Found ${users.length} auth users.`);
  
  for (const u of users.slice(0, 15)) {
    const tenantId = u.app_metadata?.tenant_id || u.id;
    const { count: peopleCount } = await adminClient.from('atlas_people').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
    const { count: canonicalCount } = await adminClient.from('atlas_canonical_entities').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
    console.log(`User: ${u.email} | ID: ${u.id} | tenant_id: ${tenantId} | atlas_people: ${peopleCount} | atlas_canonical: ${canonicalCount}`);
  }

  // Also check distinct tenants in atlas_people
  const { data: distinctTenants } = await adminClient.rpc('get_atlas_admin_stats').maybeSingle();
  console.log('\nAdmin stats from DB:', distinctTenants);

  // Check how many tenants exist in atlas_people
  const { data: tenantCounts } = await adminClient.from('atlas_people').select('tenant_id').limit(1000);
  const tenantMap: Record<string, number> = {};
  tenantCounts?.forEach(r => {
    tenantMap[r.tenant_id] = (tenantMap[r.tenant_id] || 0) + 1;
  });
  console.log('\nTop tenants in atlas_people:', Object.entries(tenantMap).slice(0, 10));
}

listUsersWithPeople().catch(console.error);
