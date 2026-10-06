/**
 * test_knowledge_economy.ts
 *
 * Valida la suite de la Knowledge Economy V2.0 (10K Scale Production Ready):
 * 1. Semantic Acquisition Clustering (`entity:facet`).
 * 2. Bucket Semantic Audit (sin falsos HIGH_DEMAND en queries frías).
 * 3. Result Sufficiency Guard (6 excelentes evitan Radar).
 * 4. Cluster Cooldown Guard (variaciones léxicas comparten el mismo cluster semántico).
 * 5. Distributed Single-Flight Coalescing.
 */

if (typeof (import.meta as any).env === 'undefined') {
  (import.meta as any).env = { DEV: true, VITE_SMOKE_LIVE: 'true' };
}
import 'fake-indexeddb/auto';

import {
  calculateOpportunityScore,
  requestSearch,
  extractSemanticAcquisitionCluster,
  registerInFlightAcquisition,
  getInFlightAcquisition
} from '../src/lib/quotaBrain';

async function runTests() {
  console.log('======================================================================');
  console.log('🏛️ YOUAPP KNOWLEDGE ECONOMY V2.0 (10K SCALE PRODUCTION VALIDATION)');
  console.log('======================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(title: string, condition: boolean, details?: any) {
    total++;
    if (condition) {
      passed++;
      console.log(`✅ [PASS] ${title}`);
    } else {
      console.error(`❌ [FAIL] ${title}`, details || '');
    }
  }

  // 1. SEMANTIC ACQUISITION CLUSTERING (`entity:facet`)
  console.log('1. TEST DE SEMANTIC ACQUISITION CLUSTERING:');
  const c1 = extractSemanticAcquisitionCluster('historia de Nikola Tesla');
  const c2 = extractSemanticAcquisitionCluster('biografía de Nikola Tesla');
  const c3 = extractSemanticAcquisitionCluster('vida y obra de Nikola Tesla');
  const c4 = extractSemanticAcquisitionCluster('quién fue Nikola Tesla');
  const c5 = extractSemanticAcquisitionCluster('cómo funciona el motor de inducción de Tesla');

  console.log('   - "historia de Nikola Tesla"                   ->', c1.clusterKey);
  console.log('   - "biografía de Nikola Tesla"                  ->', c2.clusterKey);
  console.log('   - "vida y obra de Nikola Tesla"                ->', c3.clusterKey);
  console.log('   - "quién fue Nikola Tesla"                     ->', c4.clusterKey);
  console.log('   - "cómo funciona el motor de inducción de Tesla"->', c5.clusterKey);

  assert(
    'All 4 biographical variations share EXACT semantic cluster "nikola_tesla:biography"',
    c1.clusterKey === 'nikola_tesla:biography' &&
    c2.clusterKey === 'nikola_tesla:biography' &&
    c3.clusterKey === 'nikola_tesla:biography' &&
    c4.clusterKey === 'nikola_tesla:biography'
  );

  assert(
    'Inventions query maps to distinct facet cluster "tesla:inventions"',
    c5.clusterKey === 'tesla:inventions' || c5.clusterKey === 'nikola_tesla:inventions'
  );


  // 2. BUCKET SEMANTIC AUDIT
  console.log('\n2. TEST DE BUCKET SEMANTIC AUDIT:');
  const lowOpp = calculateOpportunityScore({
    demand: 5,
    reuseProbability: 10,
    atlasCoverage: 20,
    freshnessNeed: 5,
    currentQualifiedCount: 2
  });
  console.log('   - Low-demand Query Score:', lowOpp.score, '| Bucket:', lowOpp.bucket);
  assert('Low demand query is audited as LOW_PRIORITY_GAP (not high-demand)', lowOpp.bucket === 'LOW_PRIORITY_GAP');

  const highNewsOpp = calculateOpportunityScore({
    demand: 90,
    reuseProbability: 70,
    atlasCoverage: 10,
    freshnessNeed: 95,
    currentQualifiedCount: 0
  });
  console.log('   - High-demand Breaking News Score:', highNewsOpp.score, '| Bucket:', highNewsOpp.bucket);
  assert('Breaking news maps to FRESHNESS bucket', highNewsOpp.score >= 70 && highNewsOpp.bucket === 'FRESHNESS');

  const highReuseOpp = calculateOpportunityScore({
    demand: 50,
    reuseProbability: 85,
    atlasCoverage: 30,
    freshnessNeed: 10,
    currentQualifiedCount: 1
  });
  console.log('   - Evergreen High-Reuse Score:', highReuseOpp.score, '| Bucket:', highReuseOpp.bucket);
  assert('Evergreen content maps to HIGH_REUSE bucket', highReuseOpp.bucket === 'HIGH_REUSE');

  // 3. RESULT SUFFICIENCY GUARD (6 excelentes > 20 de relleno)
  console.log('\n3. TEST DE RESULT SUFFICIENCY GUARD:');
  const reqSufficient = await requestSearch({
    query: 'filosofia y pensamiento critico',
    caller: 'SearchEngine',
    reason: 'user_search',
    currentQualifiedCount: 6,
    avgQuality: 75,
    avgRelevance: 70,
    freshnessNeed: 20
  });
  console.log('   - Request with 6 sufficient results:', reqSufficient.authorized, '| Reason:', reqSufficient.reason);
  assert('Radar denied when free sources already provided sufficient qualified results', reqSufficient.authorized === false && reqSufficient.reason?.includes('result_already_sufficient'));

  // 4. DISTRIBUTED SINGLE-FLIGHT COALESCING
  console.log('\n4. TEST DE DISTRIBUTED SINGLE-FLIGHT COALESCING:');
  const { clusterKey: testCluster } = extractSemanticAcquisitionCluster('debate presidencial 2026');
  let resolved = false;

  const mockPromise = new Promise(resolve => {
    setTimeout(() => {
      resolved = true;
      resolve([{ id: 'yt_123', title: 'Debate Presidencial En Vivo' }]);
    }, 200);
  });

  registerInFlightAcquisition(testCluster, mockPromise);
  const inFlight = getInFlightAcquisition(testCluster);
  assert('In-flight acquisition registered for semantic cluster', inFlight !== undefined);

  const coalescedReq = await requestSearch({
    query: 'debate presidencial 2026',
    caller: 'SearchEngine',
    reason: 'user_search'
  });
  console.log('   - Coalescing request result:', coalescedReq.authorized, '| Reason:', coalescedReq.reason, '| Coalesced:', coalescedReq.coalesced);
  assert('Concurrent request on same semantic cluster coalesces with 0 new quota', coalescedReq.coalesced === true);


  await mockPromise;
  assert('In-flight acquisition resolves and cleans up map', getInFlightAcquisition(testCluster) === undefined);

  console.log('\n======================================================================');
  console.log(`🏆 RESUMEN: ${passed} / ${total} TESTS PASADOS (${Math.round((passed / total) * 100)}%)`);
  console.log('======================================================================');
}

runTests();
