import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const tenantA = 'e518772b-e9cf-4048-a4a0-40d37c1588de';
  const { data: ent } = await supabase.from('atlas_canonical_entities').select('*').eq('tenant_id', tenantA);
  console.log('Entities in Tenant A:', ent?.map(e => ({ id: e.canonical_entity_id, name: e.canonical_name, norm: e.normalized_name, type: e.entity_type })));
}

main().catch(console.error);
