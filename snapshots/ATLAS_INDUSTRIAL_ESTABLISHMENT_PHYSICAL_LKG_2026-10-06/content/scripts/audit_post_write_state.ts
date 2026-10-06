import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('===========================================================');
  console.log('POST-WRITE ACTIVE KNOWLEDGE & EVIDENCE INTEGRITY AUDIT');
  console.log('===========================================================\n');

  // 1. Entities
  const { count: activeEntities } = await supabase
    .from('atlas_canonical_entities')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'ACTIVE');

  // 2. Facts and Claims
  const { data: allFacts } = await supabase.from('atlas_semantic_facts').select('*');
  const activeFactsList = (allFacts || []).filter(f => f.status === 'ACTIVE');
  const activeClaimsList = activeFactsList.filter(f => f.knowledge_type === 'CLAIM');
  const activeTrueFactsList = activeFactsList.filter(f => f.knowledge_type === 'FACT' || f.knowledge_type === 'USER_CONFIRMED_FACT');

  // 3. Relationships
  const { data: allRels } = await supabase.from('atlas_semantic_relationships').select('*');
  const activeRelsList = (allRels || []).filter(r => r.is_active === true);

  // 4. Inferences
  const { data: allInfs } = await supabase.from('atlas_semantic_inferences').select('*');
  const activeInfsList = (allInfs || []).filter(i => i.status === 'ACTIVE');

  // 5. Contradictions
  const { data: allContras } = await supabase.from('atlas_semantic_contradictions').select('*');
  const openContrasList = (allContras || []).filter(c => c.status === 'OPEN');

  console.log(`ACTIVE_ENTITIES = ${activeEntities}`);
  console.log(`ACTIVE_CLAIMS = ${activeClaimsList.length}`);
  console.log(`ACTIVE_FACTS = ${activeTrueFactsList.length}`);
  console.log(`ACTIVE_RELATIONSHIPS = ${activeRelsList.length}`);
  console.log(`ACTIVE_INFERENCES = ${activeInfsList.length}`);
  console.log(`ACTIVE_CONTRADICTIONS = ${openContrasList.length}\n`);

  // Predicate breakdown
  const predicateCounts: Record<string, number> = {
    HAS_ROLE: 0,
    WORKS_AT: 0,
    LOCATED_IN: 0,
    OFFERS: 0,
    OPENED_LOCATION: 0,
    EXPANDED_TO: 0,
    HIRING_FOR_ROLE: 0,
    OPEN_POSITIONS_COUNT: 0,
    EMPLOYEE_COUNT: 0,
    OTHER: 0
  };

  for (const f of activeFactsList) {
    if (f.predicate_code in predicateCounts) {
      predicateCounts[f.predicate_code]++;
    } else {
      predicateCounts.OTHER++;
    }
  }

  for (const r of activeRelsList) {
    if (r.predicate_code in predicateCounts) {
      predicateCounts[r.predicate_code]++;
    } else {
      predicateCounts.OTHER++;
    }
  }

  console.log('ACTIVE_KNOWLEDGE_PREDICATES:');
  for (const [pred, count] of Object.entries(predicateCounts)) {
    console.log(`  ${pred} = ${count}`);
  }

  // Active Inferences Breakdown
  console.log('\nACTIVE_INFERENCES_BREAKDOWN:');
  const infTypeCounts: Record<string, number> = {
    POSSIBLE_EXPANSION: 0,
    ACTIVE_HIRING_SIGNAL: 0,
    MULTI_OFFERING_PORTFOLIO: 0
  };
  for (const inf of activeInfsList) {
    infTypeCounts[inf.inference_type] = (infTypeCounts[inf.inference_type] || 0) + 1;
  }
  console.log(`  POSSIBLE_EXPANSION_ACTIVE = ${infTypeCounts.POSSIBLE_EXPANSION}`);
  console.log(`  ACTIVE_HIRING_SIGNAL_ACTIVE = ${infTypeCounts.ACTIVE_HIRING_SIGNAL}`);
  console.log(`  MULTI_OFFERING_ACTIVE = ${infTypeCounts.MULTI_OFFERING_PORTFOLIO}`);

  // Evidence Integrity Audit
  console.log('\n===========================================================');
  console.log('EVIDENCE INTEGRITY AUDIT');
  console.log('===========================================================');

  // Check 1: Active Assertions without Evidence
  let assertionsWithoutEv = 0;
  for (const f of activeFactsList) {
    const { data: evLinks } = await supabase
      .from('atlas_semantic_fact_evidence')
      .select('fact_id')
      .eq('fact_id', f.fact_id);
    if (!evLinks || evLinks.length === 0) {
      assertionsWithoutEv++;
      console.log(`ORPHAN FACT: ${f.fact_id} (${f.predicate_code}) has no evidence!`);
    }
  }

  // Check 2: Active Relationships without Evidence
  let relsWithoutEv = 0;
  for (const r of activeRelsList) {
    const { data: evLinks } = await supabase
      .from('atlas_semantic_relationship_evidence')
      .select('relationship_id')
      .eq('relationship_id', r.relationship_id);
    if (!evLinks || evLinks.length === 0) {
      relsWithoutEv++;
      console.log(`ORPHAN RELATIONSHIP: ${r.relationship_id} (${r.predicate_code}) has no evidence!`);
    }
  }

  // Check 3: Active Inferences without Lineage
  let infsWithoutLineage = 0;
  for (const inf of activeInfsList) {
    const { data: linLinks } = await supabase
      .from('atlas_semantic_inference_evidence')
      .select('inference_id')
      .eq('inference_id', inf.inference_id);
    if (!linLinks || linLinks.length === 0) {
      infsWithoutLineage++;
      console.log(`ORPHAN INFERENCE: ${inf.inference_id} (${inf.inference_type}) has no lineage!`);
    }
  }

  // Check 4: Orphan Evidence (evidence linking to non-existent facts/relationships)
  const { data: factEvs } = await supabase.from('atlas_semantic_fact_evidence').select('*');
  const factIdSet = new Set((allFacts || []).map(f => f.fact_id));
  let orphanFactEv = (factEvs || []).filter(e => !factIdSet.has(e.fact_id)).length;

  const { data: relEvs } = await supabase.from('atlas_semantic_relationship_evidence').select('*');
  const relIdSet = new Set((allRels || []).map(r => r.relationship_id));
  let orphanRelEv = (relEvs || []).filter(e => !relIdSet.has(e.relationship_id)).length;

  console.log(`ACTIVE_ASSERTIONS_WITHOUT_EVIDENCE = ${assertionsWithoutEv}`);
  console.log(`ACTIVE_RELATIONSHIPS_WITHOUT_EVIDENCE = ${relsWithoutEv}`);
  console.log(`ACTIVE_INFERENCES_WITHOUT_LINEAGE = ${infsWithoutLineage}`);
  console.log(`ORPHAN_EVIDENCE = ${orphanFactEv + orphanRelEv}`);
}

main().catch(console.error);
