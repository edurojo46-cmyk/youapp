import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('=== 1. AUDIT OF ATLAS_PRODUCTS ===');
  const { data: prods } = await supabase.from('atlas_products').select('*');
  console.log(`Found ${prods?.length} products. Sample:`);
  for (const p of (prods || []).slice(0, 15)) {
    console.log(`- [${p.product_id}] Tenant: ${p.tenant_id} | Name: "${p.name}" | Category: ${p.category} | Status: ${p.status}`);
  }

  console.log('\n=== 2. AUDIT OF PERSON ATTRIBUTE EVIDENCE (32 CONFLICT/TEMPORAL KEYS) ===');
  const { data: attrRows } = await supabase.from('atlas_person_attribute_evidence').select('*');
  const personAttrMap = new Map<string, Array<any>>();
  for (const r of attrRows || []) {
    const key = `${r.tenant_id}:${r.person_id}:${r.attribute_key}`;
    if (!personAttrMap.has(key)) personAttrMap.set(key, []);
    personAttrMap.get(key)!.push(r);
  }

  let conflictCount = 0;
  for (const [key, obsList] of personAttrMap.entries()) {
    if (obsList.length > 1) {
      const vals = Array.from(new Set(obsList.map(o => o.normalized_value)));
      if (vals.length > 1) {
        conflictCount++;
        console.log(`\nConflict/Temporal #${conflictCount} [Key: ${key}] Attribute: ${obsList[0].attribute_key}:`);
        for (const o of obsList) {
          console.log(`  - Value: "${o.normalized_value}" | Observed: ${o.observed_at} | ValidUntil: ${o.valid_until} | Source: ${o.source_ref} | Conf: ${o.confidence}`);
        }
      }
    }
  }

  console.log('\n=== 3. AUDIT OF CREATOR_ENTITIES SAMPLE ===');
  const { data: creators } = await supabase
    .from('creator_entities')
    .select('id, canonical_name, entity_type, category, country, language, verified, content_count')
    .gt('content_count', 0)
    .limit(10);
  console.log(`Creators with content_count > 0:`);
  for (const c of creators || []) {
    console.log(`- [${c.id}] "${c.canonical_name}" | type: ${c.entity_type} | cat: ${c.category} | country: ${c.country} | verified: ${c.verified} | content: ${c.content_count}`);
  }
}

main().catch(console.error);
