import { executeSearch } from '../src/lib/search/searchEngine';
import { exactWorkSearchGate } from '../src/lib/search/exactWorkSearchGate';
import { supabase } from '../src/lib/supabase';

let totalQueries = 0;
let persistErrors = 0;
let leakageErrors = 0;

async function testQuery(rawQuery: string) {
  totalQueries++;
  const detection = exactWorkSearchGate.detectExactWork(rawQuery);
  const response = await executeSearch(rawQuery, { forceExternal: false, bypassAtlas: false });
  const trace = response.trace;
  
  console.log(`\n=========================================`);
  console.log(`🔍 QUERY: "${rawQuery}"`);
  console.log(`=========================================`);
  
  const baseIntent = trace.resolvedIntent?.baseIntent || detection.baseIntent;
  const entity = detection.canonicalEntity || null;
  const confidence = detection.entityConfidence || 0;
  
  // 1. Build Mandatory Gates for Verification
  const resolvedSearchIntent = exactWorkSearchGate.fromResolvedIntent(detection);
  const gates = exactWorkSearchGate.buildMandatoryGates(detection, resolvedSearchIntent);

  console.log(`[Resolved Intent]`);
  console.log(`Type:              ${gates.sourceIntentType}`);
  console.log(`Entity:            ${entity}`);
  console.log(`EntityConfidence:  ${confidence.toFixed(2)}`);
  
  console.log(`\n[Mandatory Gates]`);
  if (gates.entity?.required) {
    console.log(`EntityIdentity:    REQUIRED >= ${gates.entity.minIdentityFidelity}`);
  }
  if (gates.object?.required) {
    console.log(`Object:            REQUIRED >= ${gates.object.minFidelity} (${gates.object.canonicalValue})`);
  }
  gates.constraints.forEach(c => {
    console.log(`${c.type}:             REQUIRED >= ${c.minFidelity} (${c.value})`);
  });

  // ExplicitEntityMustPersist Check
  let persistError = false;
  if (entity && confidence >= 0.85 && !gates.entity?.required) {
    persistError = true;
    persistErrors++;
    console.log(`❌ ERROR: Explicit entity "${entity}" detected with confidence ${confidence}, but not marked as required.`);
  }

  // MandatoryGateLeakage Check
  let leakageError = false;
  const results = response.videos || [];
  results.forEach(c => {
    const evalResult = exactWorkSearchGate.evaluateMandatoryGates(c, gates);
    if (!evalResult.passed) {
      leakageError = true;
      leakageErrors++;
      console.log(`❌ LEAKAGE ERROR: Result "${c.title}" bypassed mandatory gates. Reason: ${evalResult.reason}`);
    }
  });

  console.log(`\n[Candidate Funnel]`);
  console.log(`AtlasRaw:          ${trace.acquisitionStats.atlas}`);
  console.log(`FullyQualified:    ${trace.funnel.qualified}`);

  const requiredCoverage = exactWorkSearchGate.getRequiredCoverage(gates);
  const isGap = trace.funnel.qualified < requiredCoverage;

  console.log(`\n[Coverage]`);
  console.log(`Required:          ${requiredCoverage}`);
  console.log(`Qualified:         ${trace.funnel.qualified}`);
  console.log(`GAP:               ${isGap ? 'TRUE' : 'FALSE'}`);

  console.log(`\n[Path]`);
  console.log(`FAST:              ${trace.path === 'fast' ? 'YES' : 'NO'}`);
}

async function main() {
  const queries = [
    'los pericos pupilas lejanas',
    'elon musk historia',
    'papa francisco entrevista',
    'gustavo cerati en obras',
    'leon gieco solo le pido a dios',
    'osvaldo pugliese la yumba en el colon'
  ];

  for (const q of queries) {
    await testQuery(q);
  }

  console.log(`\n=========================================`);
  console.log(`📈 AUDIT SUMMARY`);
  console.log(`=========================================`);
  console.log(`Total Queries tested:      ${totalQueries}`);
  
  const persistSuccess = totalQueries - persistErrors;
  console.log(`ExplicitEntityMustPersist: ${Math.round((persistSuccess/totalQueries)*100)}% (${persistErrors} errors)`);
  
  console.log(`MandatoryGateLeakage:      ${leakageErrors} total leaked results`);

  if (persistErrors === 0 && leakageErrors === 0) {
    console.log(`\n✅ ALL INVARIANTS PASSED.`);
  } else {
    console.log(`\n❌ INVARIANT FAILURES DETECTED.`);
  }
}

main().catch(console.error);
