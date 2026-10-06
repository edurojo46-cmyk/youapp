import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';
const adminClient = createClient(supabaseUrl, supabaseKey);

async function provisionAdminUser() {
  const email = 'admin@youapp.com';
  const password = 'AdminPassword123!';
  const tenantId = 'e518772b-e9cf-4048-a4a0-40d37c1588de'; // Official Atlas tenant containing Rossi Capital, Carlos Gomez, Valeria Rossi

  // Check if user already exists
  const { data: usersData } = await adminClient.auth.admin.listUsers();
  const existing = usersData?.users?.find(u => u.email === email);

  if (existing) {
    console.log('Updating existing admin user:', existing.id);
    const { data: updated, error: updateErr } = await adminClient.auth.admin.updateUserById(existing.id, {
      password,
      app_metadata: { role: 'admin', tenant_id: tenantId }
    });
    if (updateErr) console.error('Update error:', updateErr);
    else console.log('Admin user updated with tenant_id:', tenantId);
  } else {
    console.log('Creating new admin user:', email);
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: 'admin', tenant_id: tenantId },
      user_metadata: { full_name: 'Atlas Administrator' }
    });
    if (createErr) console.error('Create error:', createErr);
    else console.log('Admin user created with tenant_id:', tenantId, created.user?.id);
  }
}

provisionAdminUser().catch(console.error);
