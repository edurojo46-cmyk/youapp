import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const tenantA = 'e518772b-e9cf-4048-a4a0-40d37c1588de';
  const tenantGlobal = '00000000-0000-0000-0000-000000000000';

  console.log('=== CANONICAL ENTITY CENSUS ===');
  const { data: rossis } = await supabase
    .from('atlas_canonical_entities')
    .select('canonical_entity_id, canonical_name, normalized_name, entity_type, status, tenant_id')
    .eq('tenant_id', tenantA)
    .ilike('canonical_name', '%Rossi Capital%');
  console.log('Rossi Capital Entities in Tenant A:', rossis);

  const { data: carlos } = await supabase
    .from('atlas_canonical_entities')
    .select('canonical_entity_id, canonical_name, normalized_name, entity_type, status, tenant_id')
    .eq('tenant_id', tenantA)
    .ilike('canonical_name', '%Carlos Gomez%');
  console.log('Carlos Gomez Entities in Tenant A:', carlos);

  const { data: valeria } = await supabase
    .from('atlas_canonical_entities')
    .select('canonical_entity_id, canonical_name, normalized_name, entity_type, status, tenant_id')
    .eq('tenant_id', tenantA)
    .ilike('canonical_name', '%Valeria Rossi%');
  console.log('Valeria Rossi Entities in Tenant A:', valeria);

  const { data: river } = await supabase
    .from('atlas_canonical_entities')
    .select('canonical_entity_id, canonical_name, normalized_name, entity_type, status, tenant_id')
    .ilike('canonical_name', '%River Plate%');
  console.log('River Plate Entities:', river);

  const { data: lanacion } = await supabase
    .from('atlas_canonical_entities')
    .select('canonical_entity_id, canonical_name, normalized_name, entity_type, status, tenant_id')
    .ilike('canonical_name', '%LA NACION%');
  console.log('LA NACION Entities:', lanacion);
}

main().catch(console.error);
