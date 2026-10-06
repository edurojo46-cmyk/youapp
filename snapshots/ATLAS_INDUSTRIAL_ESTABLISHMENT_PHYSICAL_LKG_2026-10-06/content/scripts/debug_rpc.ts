import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY!;
const supabaseAnonKey = 'sb_publishable_IWSDC0aWUR8cvOPrwYSaqg_JU8aASm8';

async function testRpc() {
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);
  const emailA = `testA_${Date.now()}@example.com`;
  const { data: userA } = await adminClient.auth.admin.createUser({
    email: emailA,
    password: 'password123',
    email_confirm: true
  });
  
  const clientA = createClient(supabaseUrl, supabaseAnonKey);
  await clientA.auth.signInWithPassword({ email: emailA, password: 'password123' });
  
  const { data, error } = await clientA.rpc('get_atlas_admin_stats');
  console.log("DATA:", data);
  console.log("ERROR:", error);
  
  await adminClient.auth.admin.deleteUser(userA!.user.id);
}
testRpc();
