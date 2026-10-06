import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const serviceClient = createClient(supabaseUrl, supabaseKey);
const anonClient = createClient(supabaseUrl, anonKey);

async function testRPC() {
  console.log('===========================================================');
  console.log('1. SERVICE ROLE RPC TEST (search_canonical_persons_v1)');
  console.log('===========================================================');
  
  // Test with service role without setting tenant context in JWT
  try {
    const res1 = await serviceClient.rpc('search_canonical_persons_v1', {
      p_search_query: 'Carlos Gomez',
      p_status: 'ACTIVE',
      p_page: 1,
      p_page_size: 25
    });
    console.log('Service role search "Carlos Gomez":', res1.error ? `Error: ${res1.error.message}` : res1.data);
  } catch (err: any) {
    console.log('Service role exception:', err.message);
  }

  console.log('\n===========================================================');
  console.log('2. ANON / CLIENT-SIDE RPC TEST');
  console.log('===========================================================');
  try {
    const res2 = await anonClient.rpc('search_canonical_persons_v1', {
      p_search_query: 'Carlos Gomez',
      p_status: 'ACTIVE',
      p_page: 1,
      p_page_size: 25
    });
    console.log('Anon search "Carlos Gomez":', res2.error ? `Error: ${res2.error.message}` : res2.data);
  } catch (err: any) {
    console.log('Anon exception:', err.message);
  }

  console.log('\n===========================================================');
  console.log('3. DIRECT DB QUERY: atlas_people vs atlas_canonical_entities');
  console.log('===========================================================');
  const { data: apRows } = await serviceClient.from('atlas_people').select('person_id, full_name, tenant_id, status').ilike('full_name', '%Carlos Gomez%');
  console.log('atlas_people matches for "Carlos Gomez":', apRows);

  const { data: ceRows } = await serviceClient.from('atlas_canonical_entities').select('canonical_entity_id, canonical_name, entity_type, tenant_id, status').ilike('canonical_name', '%Carlos Gomez%');
  console.log('atlas_canonical_entities matches for "Carlos Gomez":', ceRows);
}

testRPC().catch(console.error);
