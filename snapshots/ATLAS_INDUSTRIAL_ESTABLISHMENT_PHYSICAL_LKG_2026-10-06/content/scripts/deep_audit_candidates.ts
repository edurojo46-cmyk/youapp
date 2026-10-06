import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('=====================================================');
  console.log('GATE AUDIT 1: RESIDENCE_CITY PAIRS & CANDIDATES');
  console.log('=====================================================\n');

  const { data: attrRows } = await supabase.from('atlas_person_attribute_evidence').select('*');
  const personAttrMap = new Map<string, Array<any>>();
  for (const r of attrRows || []) {
    const key = `${r.tenant_id}:${r.person_id}:${r.attribute_key}`;
    if (!personAttrMap.has(key)) personAttrMap.set(key, []);
    personAttrMap.get(key)!.push(r);
  }

  let pairsEvaluated = 0;
  let temporalEvolution = 0;
  let overlappingContradictions = 0;
  let ambiguousCompeting = 0;
  let invalidPairs = 0;

  const candidateReports: any[] = [];

  for (const [key, obsList] of personAttrMap.entries()) {
    if (obsList.length > 1) {
      const distinctVals = Array.from(new Set(obsList.map(o => o.normalized_value)));
      if (distinctVals.length > 1) {
        pairsEvaluated++;
        const [tenantId, personId, attrKey] = key.split(':');
        
        // Check if person exists in atlas_people and has canonical entity
        const { data: personRec } = await supabase.from('atlas_people').select('*').eq('person_id', personId).maybeSingle();
        const { data: obsRec } = await supabase.from('atlas_entity_source_observations').select('*').eq('tenant_id', tenantId).eq('raw_name', personRec?.full_name || '').limit(1);

        const timestamps = obsList.map(o => o.observed_at);
        const distinctTimestamps = new Set(timestamps);
        const hasValidUntil = obsList.some(o => o.valid_until !== null);

        let classification = '';
        if (distinctTimestamps.size > 1 && hasValidUntil) {
          // Check for temporal disjointness
          const sorted = [...obsList].sort((a, b) => new Date(a.observed_at).getTime() - new Date(b.observed_at).getTime());
          const first = sorted[0];
          const second = sorted[1];
          if (first.valid_until && new Date(second.observed_at) >= new Date(first.valid_until)) {
            temporalEvolution++;
            classification = 'TEMPORAL_EVOLUTION';
          } else {
            overlappingContradictions++;
            classification = 'OVERLAPPING_CONTRADICTIONS';
          }
        } else if (distinctTimestamps.size === 1 && !hasValidUntil) {
          // Exactly same timestamp, no end date, competing values from same ingestion event
          ambiguousCompeting++;
          classification = 'AMBIGUOUS_COMPETING_CLAIMS';
        } else {
          ambiguousCompeting++;
          classification = 'AMBIGUOUS_COMPETING_CLAIMS';
        }

        candidateReports.push({
          key,
          tenantId,
          personId,
          personName: personRec?.full_name || 'UNKNOWN',
          canonicalEntityId: obsRec?.[0]?.canonical_entity_id || null,
          attrKey,
          values: distinctVals,
          timestamps: Array.from(distinctTimestamps),
          sources: obsList.map(o => o.source_ref),
          classification
        });
      }
    }
  }

  console.log(`RESIDENCE_CITY_PAIRS_EVALUATED = ${pairsEvaluated}`);
  console.log(`TEMPORAL_EVOLUTION = ${temporalEvolution}`);
  console.log(`OVERLAPPING_CONTRADICTIONS = ${overlappingContradictions}`);
  console.log(`AMBIGUOUS_COMPETING_CLAIMS = ${ambiguousCompeting}`);
  console.log(`INVALID_PAIRS = ${invalidPairs}\n`);

  console.log('Sample Candidate Analysis (First 5):');
  for (const c of candidateReports.slice(0, 5)) {
    console.log(`- Person: "${c.personName}" (PersonID: ${c.personId}) Tenant: ${c.tenantId}`);
    console.log(`  Values: [${c.values.join(', ')}] | Timestamps: [${c.timestamps.join(', ')}]`);
    console.log(`  Classification: ${c.classification} | Canonical Entity: ${c.canonicalEntityId}`);
  }

  console.log('\n=====================================================');
  console.log('GATE AUDIT 2: ATLAS_PRODUCTS & PRODUCT_OFFERS SEMANTICS');
  console.log('=====================================================\n');

  const { data: offers } = await supabase.from('atlas_product_offers').select('*').limit(10);
  console.log('Sample atlas_product_offers:');
  for (const o of offers || []) {
    console.log(`- Offer [${o.offer_id}] Product: ${o.product_id} | Tenant: ${o.tenant_id} | Price: ${o.price} ${o.currency} | Status: ${o.availability_status} | Version: ${o.offer_version}`);
  }

  // Check what companies exist in atlas_canonical_entities
  const { data: companies } = await supabase.from('atlas_canonical_entities').select('*').eq('entity_type', 'COMPANY');
  console.log(`\nCanonical Companies count: ${companies?.length}`);
  for (const comp of companies || []) {
    console.log(`- [${comp.canonical_entity_id}] "${comp.canonical_name}" (Tenant: ${comp.tenant_id})`);
  }
}

main().catch(console.error);
