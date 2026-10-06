import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('=== AUDIT OF CANONICAL ENTITIES AND TENANTS ===');
  const { data: entities } = await supabase.from('atlas_canonical_entities').select('*');
  console.log(`Total canonical entities in atlas_canonical_entities: ${entities?.length}`);
  
  const typeCounts: Record<string, number> = {};
  for (const e of entities || []) {
    typeCounts[e.entity_type] = (typeCounts[e.entity_type] || 0) + 1;
  }
  console.log('Entity Types:', typeCounts);

  // Group by tenant
  const tenantMap: Record<string, number> = {};
  for (const e of entities || []) {
    tenantMap[e.tenant_id] = (tenantMap[e.tenant_id] || 0) + 1;
  }
  console.log('Entities per tenant (top 10):', Object.entries(tenantMap).slice(0, 10));

  // Check how many people from atlas_person_attribute_evidence are mapped to canonical entities
  const { data: obs } = await supabase.from('atlas_entity_source_observations').select('*');
  console.log(`Total observations: ${obs?.length}`);
  const obsSourceCounts: Record<string, number> = {};
  for (const o of obs || []) {
    obsSourceCounts[o.source_name] = (obsSourceCounts[o.source_name] || 0) + 1;
  }
  console.log('Observations by source:', obsSourceCounts);
}

main().catch(console.error);
