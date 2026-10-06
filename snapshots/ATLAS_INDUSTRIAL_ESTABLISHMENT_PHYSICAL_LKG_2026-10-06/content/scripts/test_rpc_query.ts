import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';

const url = process.env.VITE_SUPABASE_URL || '';
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

async function test() {
  const client = createClient(url, anonKey);
  const { data: authData, error: authErr } = await client.auth.signInWithPassword({
    email: 'admin@youapp.com',
    password: 'AdminPassword123!'
  });
  console.log('Admin login error:', authErr);
  console.log('Admin user app_metadata:', authData.user?.app_metadata);

  const { data: searchAll, error: searchErr } = await client.rpc('search_canonical_persons_v1', {
    p_search_query: null,
    p_page: 1,
    p_page_size: 10
  });
  console.log('Search all persons (Admin tenant):', searchErr || { count: searchAll?.total_count, items: searchAll?.items?.map((i: any) => ({ name: i.full_name, id: i.person_id })) });

  const { data: searchCarlos } = await client.rpc('search_canonical_persons_v1', {
    p_search_query: 'Carlos Gomez',
    p_page: 1,
    p_page_size: 10
  });
  console.log('Search Carlos Gomez:', searchCarlos?.items?.map((i: any) => ({ name: i.full_name, id: i.person_id })));

  const { data: searchValeria } = await client.rpc('search_canonical_persons_v1', {
    p_search_query: 'Valeria Rossi',
    p_page: 1,
    p_page_size: 10
  });
  console.log('Search Valeria Rossi:', searchValeria?.items?.map((i: any) => ({ name: i.full_name, id: i.person_id })));

  const { data: searchNonExistent } = await client.rpc('search_canonical_persons_v1', {
    p_search_query: 'Persona Que No Existe XYZ',
    p_page: 1,
    p_page_size: 10
  });
  console.log('Search Non Existent:', searchNonExistent?.items);
}

test().catch(console.error);
