import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('====================================================');
  console.log('DEEP AUDIT: SEMANTIC SIGNALS & CANDIDATE KNOWLEDGE');
  console.log('====================================================\n');

  // 1. Audit atlas_person_attribute_evidence
  console.log('--- 1. atlas_person_attribute_evidence breakdown ---');
  const { data: attrRows } = await supabase
    .from('atlas_person_attribute_evidence')
    .select('*');

  const attrCounts: Record<string, number> = {};
  const personAttrMap = new Map<string, Array<any>>();
  const tenantsInAttr = new Set<string>();

  for (const r of attrRows || []) {
    attrCounts[r.attribute_key] = (attrCounts[r.attribute_key] || 0) + 1;
    if (r.tenant_id) tenantsInAttr.add(r.tenant_id);
    const key = `${r.tenant_id}:${r.person_id}:${r.attribute_key}`;
    if (!personAttrMap.has(key)) {
      personAttrMap.set(key, []);
    }
    personAttrMap.get(key)!.push(r);
  }

  console.log('Attribute key breakdown:', attrCounts);
  console.log('Distinct tenants in attribute evidence:', tenantsInAttr.size);
  console.log('Total attribute rows:', attrRows?.length || 0);

  // Check for temporal evolution & contradiction candidates in attribute evidence
  let multiObservationCount = 0;
  let temporalEvolutionCandidates: any[] = [];
  let contradictionCandidates: any[] = [];

  for (const [key, obsList] of personAttrMap.entries()) {
    if (obsList.length > 1) {
      multiObservationCount++;
      const uniqueVals = Array.from(new Set(obsList.map(o => o.normalized_value)));
      if (uniqueVals.length > 1) {
        // We have different values observed for the same person and attribute!
        const sortedObs = [...obsList].sort((a, b) => new Date(a.observed_at).getTime() - new Date(b.observed_at).getTime());
        const timestamps = sortedObs.map(o => o.observed_at);
        const distinctTimestamps = new Set(timestamps);

        if (distinctTimestamps.size > 1) {
          // Different timestamps -> Temporal evolution candidate
          temporalEvolutionCandidates.push({
            key,
            attr: obsList[0].attribute_key,
            tenant: obsList[0].tenant_id,
            person: obsList[0].person_id,
            observations: sortedObs.map(o => ({
              val: o.normalized_value,
              observed_at: o.observed_at,
              valid_until: o.valid_until,
              source_ref: o.source_ref,
              confidence: o.confidence
            }))
          });
        } else {
          // Same timestamp or overlapping interval -> Contradiction candidate
          contradictionCandidates.push({
            key,
            attr: obsList[0].attribute_key,
            tenant: obsList[0].tenant_id,
            person: obsList[0].person_id,
            observations: obsList.map(o => ({
              val: o.normalized_value,
              observed_at: o.observed_at,
              source_ref: o.source_ref
            }))
          });
        }
      }
    }
  }

  console.log(`\nTemporal & Conflict Signals in Person Attribute Evidence:`);
  console.log(`  Keys with >1 observation: ${multiObservationCount}`);
  console.log(`  Temporal evolution candidates (different time, different value): ${temporalEvolutionCandidates.length}`);
  console.log(`  Contradiction candidates (conflicting sources / values): ${contradictionCandidates.length}`);

  if (temporalEvolutionCandidates.length > 0) {
    console.log('\nSample Temporal Evolution Candidate 1:');
    console.log(JSON.stringify(temporalEvolutionCandidates[0], null, 2));
  }
  if (temporalEvolutionCandidates.length > 1) {
    console.log('\nSample Temporal Evolution Candidate 2:');
    console.log(JSON.stringify(temporalEvolutionCandidates[1], null, 2));
  }
  if (contradictionCandidates.length > 0) {
    console.log('\nSample Contradiction Candidate 1:');
    console.log(JSON.stringify(contradictionCandidates[0], null, 2));
  }

  // 2. Audit creator_entities
  console.log('\n--- 2. creator_entities deep audit ---');
  const { data: creatorSample } = await supabase
    .from('creator_entities')
    .select('id, canonical_name, entity_type, category, country, language, verified, content_count')
    .limit(30);

  const { data: creatorTypeStats } = await supabase
    .from('creator_entities')
    .select('entity_type, verified');
  
  const typeCounts: Record<string, number> = {};
  for (const c of creatorTypeStats || []) {
    const k = `${c.entity_type}:verified=${c.verified}`;
    typeCounts[k] = (typeCounts[k] || 0) + 1;
  }
  console.log('Creator entities type & verification breakdown:', typeCounts);

  // 3. Audit atlas_products & offers for MULTI_OFFERING_PORTFOLIO
  console.log('\n--- 3. atlas_products & offers audit ---');
  const { data: products } = await supabase.from('atlas_products').select('*');
  const { data: offers } = await supabase.from('atlas_product_offers').select('*');

  console.log(`Total products: ${products?.length || 0}`);
  console.log(`Total offers: ${offers?.length || 0}`);
  
  // Group products by tenant
  const tenantProductMap: Record<string, any[]> = {};
  for (const p of products || []) {
    tenantProductMap[p.tenant_id] = tenantProductMap[p.tenant_id] || [];
    tenantProductMap[p.tenant_id].push(p);
  }
  console.log('Tenants with products:', Object.entries(tenantProductMap).map(([t, prods]) => `${t}: ${prods.length} products`));

  // 4. Audit inference rules definitions in codebase
  console.log('\n--- 4. Checking SemanticRuleInferenceEngine ---');
}

main().catch(console.error);
