import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';

const url = process.env.VITE_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SECRET_KEY || '';
// serviceClient bypasses RLS
const serviceClient = createClient(url, serviceKey);

// authClient for RPC testing as admin user
const authClient = createClient(url, process.env.VITE_SUPABASE_ANON_KEY || serviceKey);

async function checkCount(name: string, params: any) {
  const { data, error } = await authClient.rpc('search_admin_all_persons_v1', {
    p_page: 1,
    p_page_size: 1,
    ...params
  });
  if (error) {
    console.error(`Error checking ${name}:`, error.message);
    return null;
  }
  console.log(`${name.padEnd(60)}: ${data.total_count}`);
  return data.total_count;
}

async function main() {
  const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
    email: 'admin@youapp.com',
    password: 'AdminPassword123!'
  });
  
  if (authError) {
    console.error('Auth error:', authError.message);
    return;
  }

  console.log('--- 1. WATERFALL COUNTS (Admin RPC) ---');
  await checkCount('A. TODOS', {});
  await checkCount('B. Profession = Abogado', { p_profession: 'Abogado' });
  await checkCount('C. Profession = Abogado, Age 45-50', { p_profession: 'Abogado', p_age_from: 45, p_age_to: 50 });
  await checkCount('D. Profession = Abogado, Age 45-50, Email', { p_profession: 'Abogado', p_age_from: 45, p_age_to: 50, p_coverage_email: true });
  await checkCount('E. Profession = Abogado, Age 45-50, Email, Photo', { p_profession: 'Abogado', p_age_from: 45, p_age_to: 50, p_coverage_email: true, p_has_photo: true });
  await checkCount('F. NO FILTERS EXCEPT Photo = true', { p_has_photo: true });
  await checkCount('G. Profession = Engineer', { p_profession: 'Engineer' });

  console.log('\n--- 2. PROFESSION SEMANTICS (Global DB) ---');
  const professions = ['Abogado', 'Abogada', 'ABOGADO', 'abogado', 'Lawyer', 'Derecho', 'Abogacía', 'Engineer'];
  for (const prof of professions) {
    const { count } = await serviceClient.from('atlas_person_attribute_evidence')
      .select('*', { count: 'exact', head: true })
      .eq('attribute_key', 'profession')
      .ilike('normalized_value', `%${prof}%`);
    console.log(`Profession ILIKE '%${prof}%': ${count}`);
  }

  console.log('\n--- 3. AGE SEMANTICS (Global DB) ---');
  const { count: ageCount } = await serviceClient.from('atlas_person_attribute_evidence')
    .select('*', { count: 'exact', head: true })
    .eq('attribute_key', 'DOB');
  console.log(`Total DOB records: ${ageCount}`);

  // Let's see how many people have DOB between 45 and 50 years ago
  // Note: we can't easily filter by age computation directly in supabase.from, 
  // but we can check the RPC for just age.
  await checkCount('H. ONLY Age 45-50', { p_age_from: 45, p_age_to: 50 });

  console.log('\n--- 4. EMAIL SEMANTICS (Global DB) ---');
  const { count: emailCount } = await serviceClient.from('atlas_person_coverage')
    .select('*', { count: 'exact', head: true })
    .eq('email_known', true);
  console.log(`Total email_known = true: ${emailCount}`);

  console.log('\n--- 5. PHOTO SEMANTICS (Global DB) ---');
  const photoKeys = ['photo_url', 'avatar_url', 'profile_photo'];
  for (const pKey of photoKeys) {
    const { count } = await serviceClient.from('atlas_person_attribute_evidence')
      .select('*', { count: 'exact', head: true })
      .eq('attribute_key', pKey)
      .not('normalized_value', 'is', null);
    console.log(`Photo key '${pKey}': ${count}`);
  }
}

main().catch(console.error);
