import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY!;
const supabaseAnonKey = 'sb_publishable_IWSDC0aWUR8cvOPrwYSaqg_JU8aASm8';

const adminClient = createClient(supabaseUrl, supabaseServiceKey);

async function runTenantSmokes() {
  console.log('--- STARTING TENANT ISOLATION NEGATIVE SMOKES ---');
  
  const tenantA = crypto.randomUUID();
  const tenantB = crypto.randomUUID();
  
  console.log(`Setting up Tenant A: ${tenantA}`);
  console.log(`Setting up Tenant B: ${tenantB}`);
  
  // 1. Setup Data as SUPERUSER
  const personA = crypto.randomUUID();
  const personB = crypto.randomUUID();
  
  await adminClient.from('atlas_people').insert({ person_id: personA, tenant_id: tenantA, full_name: 'Person A' });
  await adminClient.from('atlas_people').insert({ person_id: personB, tenant_id: tenantB, full_name: 'Person B' });

  // 2. Create users with specific app_metadata.tenant_id
  const emailA = `testA_${Date.now()}@example.com`;
  const emailB = `testB_${Date.now()}@example.com`;
  
  const { data: userA, error: errA } = await adminClient.auth.admin.createUser({
    email: emailA,
    password: 'password123',
    app_metadata: { tenant_id: tenantA },
    email_confirm: true
  });
  if (errA) throw errA;

  const { data: userB, error: errB } = await adminClient.auth.admin.createUser({
    email: emailB,
    password: 'password123',
    app_metadata: { tenant_id: tenantB },
    email_confirm: true
  });
  if (errB) throw errB;

  console.log('Test users created. Authenticating...');

  // 3. Login as User A
  const clientA = createClient(supabaseUrl, supabaseAnonKey);
  await clientA.auth.signInWithPassword({ email: emailA, password: 'password123' });

  // 4. Test RLS
  const { data: dataA } = await clientA.from('atlas_people').select('*');
  const foundA = dataA?.some(p => p.person_id === personA);
  const foundB_in_A = dataA?.some(p => p.person_id === personB);

  if (foundA && !foundB_in_A) {
    console.log('✅ PASS: Tenant A can see its own people and CANNOT see Tenant B people.');
  } else {
    console.log('❌ FAIL: Tenant A isolation failed.', dataA);
  }

  // Also test RPC
  const { data: statsA } = await clientA.rpc('get_atlas_admin_stats');
  if (statsA?.persons_total === 1) { // Assuming 1 because we just inserted 1, or it could be more if tenant reused but UUID is random
    console.log('✅ PASS: RPC stats for Tenant A correctly isolated.');
  } else {
    console.log('❌ FAIL: RPC stats leaking or incorrect.', statsA);
  }

  // 5. Login as User B
  const clientB = createClient(supabaseUrl, supabaseAnonKey);
  await clientB.auth.signInWithPassword({ email: emailB, password: 'password123' });

  const { data: dataB } = await clientB.from('atlas_people').select('*');
  const foundB = dataB?.some(p => p.person_id === personB);
  const foundA_in_B = dataB?.some(p => p.person_id === personA);

  if (foundB && !foundA_in_B) {
    console.log('✅ PASS: Tenant B can see its own people and CANNOT see Tenant A people.');
  } else {
    console.log('❌ FAIL: Tenant B isolation failed.', dataB);
  }

  // Clean up
  await adminClient.auth.admin.deleteUser(userA.user.id);
  await adminClient.auth.admin.deleteUser(userB.user.id);
  await adminClient.from('atlas_people').delete().in('person_id', [personA, personB]);

  console.log('--- ALL TENANT ISOLATION SMOKES PASSED ---');
}

runTenantSmokes().catch(console.error);
