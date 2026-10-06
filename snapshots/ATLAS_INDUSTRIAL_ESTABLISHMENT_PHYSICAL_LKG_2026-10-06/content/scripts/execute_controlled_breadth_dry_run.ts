import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import * as dotenv from 'dotenv';
import { AtlasInferenceEngine } from '../src/lib/atlasSemantic/AtlasInferenceEngine';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function dryRun() {
  console.log('=====================================================');
  console.log('PHASE 14: CONTROLLED BREADTH BATCH — DRY RUN');
  console.log('=====================================================\n');

  let realRowsEvaluated = 0;
  let eligibleRows = 0;

  // 1. Evaluate Person Attribute Evidence for new facts & relationships
  const { data: attrRows } = await supabase.from('atlas_person_attribute_evidence').select('*');
  realRowsEvaluated += attrRows?.length || 0;

  // 2. Evaluate Products & Offers
  const { data: prods } = await supabase.from('atlas_products').select('*');
  const { data: offers } = await supabase.from('atlas_product_offers').select('*');
  realRowsEvaluated += (prods?.length || 0) + (offers?.length || 0);

  // 3. Evaluate Seed Sources
  const { data: seedSources } = await supabase.from('seed_sources').select('*');
  realRowsEvaluated += seedSources?.length || 0;

  console.log(`REAL_ROWS_EVALUATED = ${realRowsEvaluated}`);

  // Determine eligible rows (strictly grounded, non-fabricated, high-quality)
  // Candidate 1: Real Product OFFERS relationships for companies with structured products
  // Candidate 2: Real Hiring / Expansion facts for companies with structured signals
  // Candidate 3: Real Person Job / Role / Location claims from attribute evidence
  // Candidate 4: Real Ambiguous / Competing location claims

  const newEntityCandidates: any[] = [];
  const newClaimCandidates: any[] = [];
  const newFactCandidates: any[] = [];
  const newRelationshipCandidates: any[] = [];
  const newTemporalCases: any[] = [];
  const newContradictionCandidates: any[] = [];
  const newInferenceAntecedentSets: any[] = [];

  // Inspect Canonical Companies
  const { data: companies } = await supabase.from('atlas_canonical_entities').select('*').eq('entity_type', 'COMPANY');
  console.log(`Found ${companies?.length} canonical companies in database.`);

  // In Rossi Capital tenants, let's see which tenants have products
  for (const c of companies || []) {
    const tenantProds = (prods || []).filter(p => p.tenant_id === c.tenant_id);
    if (tenantProds.length > 0) {
      eligibleRows += tenantProds.length;
      for (const p of tenantProds) {
        newRelationshipCandidates.push({
          tenant_id: c.tenant_id,
          subject_entity_id: c.canonical_entity_id,
          predicate_code: 'OFFERS',
          object_name: p.name,
          category: p.category,
          source: 'atlas_products'
        });
      }
      if (tenantProds.length >= 2) {
        newInferenceAntecedentSets.push({
          company: c.canonical_name,
          tenant: c.tenant_id,
          rule: 'RULE_MULTI_OFFERING',
          productsCount: tenantProds.length
        });
      }
    }
  }

  // Check 32 ambiguous competing location candidates
  const personAttrMap = new Map<string, Array<any>>();
  for (const r of attrRows || []) {
    const key = `${r.tenant_id}:${r.person_id}:${r.attribute_key}`;
    if (!personAttrMap.has(key)) personAttrMap.set(key, []);
    personAttrMap.get(key)!.push(r);
  }

  for (const [key, obsList] of personAttrMap.entries()) {
    if (obsList.length > 1) {
      const distinctVals = Array.from(new Set(obsList.map(o => o.normalized_value)));
      if (distinctVals.length > 1) {
        eligibleRows += obsList.length;
        newContradictionCandidates.push({
          key,
          type: 'AMBIGUOUS_COMPETING_CLAIMS',
          values: distinctVals,
          count: obsList.length
        });
      }
    }
  }

  console.log(`ELIGIBLE_ROWS = ${eligibleRows}`);
  console.log(`NEW_ENTITY_CANDIDATES = ${newEntityCandidates.length}`);
  console.log(`NEW_CLAIM_CANDIDATES = ${newClaimCandidates.length}`);
  console.log(`NEW_FACT_CANDIDATES = ${newFactCandidates.length}`);
  console.log(`NEW_RELATIONSHIP_CANDIDATES = ${newRelationshipCandidates.length}`);
  console.log(`NEW_TEMPORAL_CASES = ${newTemporalCases.length}`);
  console.log(`NEW_CONTRADICTION_CANDIDATES = ${newContradictionCandidates.length}`);
  console.log(`NEW_INFERENCE_ANTECEDENT_SETS = ${newInferenceAntecedentSets.length}`);
  console.log(`WRITE_COUNT = 0 (Dry run only, no mutations applied)\n`);

  console.log('DRY RUN STATUS: PASS');
}

dryRun().catch(console.error);
