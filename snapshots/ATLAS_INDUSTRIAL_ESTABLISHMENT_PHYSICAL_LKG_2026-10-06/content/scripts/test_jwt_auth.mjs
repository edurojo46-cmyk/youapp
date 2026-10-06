import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbAdmin = createClient(supabaseUrl, supabaseServiceKey);

console.log('Testing Supabase Admin Auth...');

// Create or get test users
const emailA = 'user_a_commercial_test@youapp.test';
const emailB = 'user_b_commercial_test@youapp.test';
const password = 'TestPassword123!';

async function getOrCreateUser(email) {
  const { data: usersData } = await sbAdmin.auth.admin.listUsers();
  let user = usersData?.users?.find(u => u.email === email);
  if (!user) {
    const { data, error } = await sbAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (error) throw error;
    user = data.user;
  }
  // Sign in to get real JWT session
  const clientSb = createClient(supabaseUrl, process.env.VITE_SUPABASE_ANON_KEY);
  const { data: sessionData, error: signInErr } = await clientSb.auth.signInWithPassword({
    email,
    password
  });
  if (signInErr) throw signInErr;
  return { user, session: sessionData.session };
}

const userA = await getOrCreateUser(emailA);
const userB = await getOrCreateUser(emailB);

console.log('User A ID:', userA.user.id, 'Token length:', userA.session.access_token.length);
console.log('User B ID:', userB.user.id, 'Token length:', userB.session.access_token.length);

// Verify with sbAdmin.auth.getUser
const checkA = await sbAdmin.auth.getUser(userA.session.access_token);
console.log('Verified User A auth.uid():', checkA.data?.user?.id === userA.user.id);

const checkB = await sbAdmin.auth.getUser(userB.session.access_token);
console.log('Verified User B auth.uid():', checkB.data?.user?.id === userB.user.id);
