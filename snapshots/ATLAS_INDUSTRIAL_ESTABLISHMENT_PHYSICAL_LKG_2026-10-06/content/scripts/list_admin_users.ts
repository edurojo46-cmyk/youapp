import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';
const adminClient = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data } = await adminClient.auth.admin.listUsers({ perPage: 100 });
  const users = data?.users || [];
  console.log('Total users:', users.length);
  const admins = users.filter(u => u.email?.includes('admin') || u.app_metadata?.role === 'admin' || u.app_metadata?.tenant_id);
  console.log('Admin / tenant-configured users:', admins.map(u => ({ email: u.email, id: u.id, metadata: u.app_metadata })));
}

main().catch(console.error);
