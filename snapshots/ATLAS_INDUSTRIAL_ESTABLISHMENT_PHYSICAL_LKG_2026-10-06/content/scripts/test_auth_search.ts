import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const adminClient = createClient(supabaseUrl, supabaseKey);

async function testAuthUserSearch() {
  console.log('===========================================================');
  console.log('1. TEST AUTHENTICATED USER INVOCATION');
  console.log('===========================================================');
  
  // Create a temporary authenticated user
  const email = `test-admin-search-${Date.now()}@example.com`;
  const password = 'Password123!';
  const tenantId = 'e518772b-e9cf-4048-a4a0-40d37c1588de'; // Real tenant with Rossi Capital & Carlos Gomez

  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { tenant_id: tenantId }
  });

  if (createErr || !created.user) {
    console.error('Failed to create user:', createErr);
    return;
  }

  console.log('Created test user with tenant_id:', tenantId, created.user.id);

  // Sign in as this user using client
  const userClient = createClient(supabaseUrl, anonKey);
  const { data: sessionData, error: signInErr } = await userClient.auth.signInWithPassword({
    email,
    password
  });

  if (signInErr) {
    console.error('Sign in failed:', signInErr);
    return;
  }

  console.log('Signed in successfully as authenticated user.');

  // Call search_canonical_persons_v1 as authenticated user with tenant in app_metadata
  const { data: searchData, error: searchErr } = await userClient.rpc('search_canonical_persons_v1', {
    p_search_query: 'Carlos Gomez',
    p_status: 'ACTIVE',
    p_page: 1,
    p_page_size: 25
  });

  console.log('Search "Carlos Gomez" with tenant in app_metadata:', searchErr ? `Error: ${searchErr.message}` : searchData);

  // Call without search query (all persons in tenant)
  const { data: allData, error: allErr } = await userClient.rpc('search_canonical_persons_v1', {
    p_status: 'ACTIVE',
    p_page: 1,
    p_page_size: 25
  });
  console.log('All active persons in tenant:', allErr ? `Error: ${allErr.message}` : `Total: ${allData?.total_count}, Items: ${allData?.items?.length}`);
  if (allData?.items) {
    allData.items.forEach((item: any) => console.log('  -', item.person_id, item.full_name));
  }

  // Also test with a user WITHOUT app_metadata.tenant_id (like default anonymous/signups)
  const emailNoTenant = `test-no-tenant-${Date.now()}@example.com`;
  const { data: createdNoTenant } = await adminClient.auth.admin.createUser({
    email: emailNoTenant,
    password,
    email_confirm: true
  });
  const clientNoTenant = createClient(supabaseUrl, anonKey);
  await clientNoTenant.auth.signInWithPassword({ email: emailNoTenant, password });
  const { data: dataNoTenant, error: errNoTenant } = await clientNoTenant.rpc('search_canonical_persons_v1', {
    p_status: 'ACTIVE',
    p_page: 1,
    p_page_size: 25
  });
  console.log('\nUser WITHOUT app_metadata.tenant_id:');
  console.log('  get_auth_tenant_id() fallback to auth.uid():', errNoTenant ? `Error: ${errNoTenant.message}` : `Total count: ${dataNoTenant?.total_count}`);

  // Cleanup test users
  await adminClient.auth.admin.deleteUser(created.user.id);
  if (createdNoTenant?.user) await adminClient.auth.admin.deleteUser(createdNoTenant.user.id);
}

testAuthUserSearch().catch(console.error);
