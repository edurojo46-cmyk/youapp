import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: people, count } = await supabase.from('atlas_people').select('person_id, full_name, tenant_id, status', { count: 'exact' }).limit(10);
  console.log('Total atlas_people count in DB:', count);
  console.log('Sample atlas_people:', people);

  const { data: cg } = await supabase.from('atlas_people').select('person_id, full_name, tenant_id, status').ilike('full_name', '%Carlos Gomez%');
  console.log('Carlos Gomez in atlas_people:', cg);

  const { data: vr } = await supabase.from('atlas_people').select('person_id, full_name, tenant_id, status').ilike('full_name', '%Valeria Rossi%');
  console.log('Valeria Rossi in atlas_people:', vr);

  const { data: canonPeople } = await supabase.from('atlas_canonical_entities').select('canonical_entity_id, canonical_name, entity_type, tenant_id, status').eq('entity_type', 'PERSON').limit(10);
  console.log('Sample atlas_canonical_entities (PERSON):', canonPeople);

  const { data: users } = await supabase.auth.admin.listUsers();
  console.log('Auth users in Supabase:', users?.users?.map(u => ({ id: u.id, email: u.email, app_metadata: u.app_metadata })));
}

check().catch(console.error);
