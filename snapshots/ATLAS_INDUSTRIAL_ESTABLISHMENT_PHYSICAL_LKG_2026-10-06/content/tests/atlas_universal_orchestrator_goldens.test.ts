/**
 * ATLAS UNIVERSAL MISSION ORCHESTRATOR GOLDEN INVARIANTS TEST
 * tests/atlas_universal_orchestrator_goldens.test.ts
 */

import { 
  MissionOrchestrator, 
  AtlasCandidateLedger, 
  type MissionTerminationProof,
  type SourcePath 
} from '../server/services/industrial/MissionOrchestrator.ts';

// Mock DB pool for tests
const mockDb = {
  query: async (text: string, params?: any[]) => {
    return { rows: [], rowCount: 1 };
  }
} as any;

async function runGoldenTests() {
  console.log('========================================================');
  console.log('RUNNING ATLAS UNIVERSAL MISSION ORCHESTRATOR GOLDENS');
  console.log('========================================================\n');

  let passed = 0;
  let total = 0;

  const orchestrator = MissionOrchestrator.getInstance(mockDb);

  // ----------------------------------------------------
  // TEST 1: PROBE_FAIL_CONTINUES_GOLDEN
  // ----------------------------------------------------
  total++;
  try {
    const missionId = 'GOLDEN_PROBE_FAIL_' + Date.now();
    orchestrator.initializeMission(missionId, 20);
    
    // Add two sources to frontier
    orchestrator.pushFrontierPath(missionId, {
      path_id: 'PATH_OSM',
      source_id: 'SRC_OSM',
      resource: 'osm_public',
      connector: 'overpass',
      access_mode: 'HTTP',
      role: 'PRIMARY',
      priority: 10
    });
    orchestrator.pushFrontierPath(missionId, {
      path_id: 'PATH_RADAR_AGEC',
      source_id: 'SRC_AGEC',
      resource: 'agec_directory',
      connector: 'radar_scraper',
      access_mode: 'HTTP',
      role: 'SECONDARY',
      priority: 5
    });

    await orchestrator.transitionPhase(missionId, 'CORE_LOOKUP');
    await orchestrator.transitionPhase(missionId, 'SOURCE_PLANNING');
    await orchestrator.transitionPhase(missionId, 'PROBING');

    // Simulate 5 probe rows on first source failing probe
    orchestrator.recordProbeRows(missionId, 5);
    orchestrator.markPathState(missionId, 'PATH_OSM', 'PROBE_FAILED', {
      failure_reason: 'Low certifiable fit'
    });

    const tel = orchestrator.getTelemetry(missionId);
    const hasNext = orchestrator.hasViableFrontierPath(missionId);
    const nextPath = orchestrator.popNextViablePath(missionId);

    // Verify mission has NOT terminated, remaining gap is still 20, and next path is viable
    if (
      tel.mission_phase === 'PROBING' &&
      tel.remaining_gap === 20 &&
      tel.probe_rows === 5 &&
      tel.acquisition_rows === 0 &&
      hasNext &&
      nextPath?.path_id === 'PATH_RADAR_AGEC'
    ) {
      console.log('✅ TEST 1 PASSED: PROBE_FAIL_CONTINUES_GOLDEN');
      passed++;
    } else {
      console.error('❌ TEST 1 FAILED: PROBE_FAIL_CONTINUES_GOLDEN', { tel, hasNext, nextPath });
    }
  } catch (err) {
    console.error('❌ TEST 1 EXCEPTION:', err);
  }

  // ----------------------------------------------------
  // TEST 2: SOURCE_FAILURE_CONTINUES_GOLDEN
  // ----------------------------------------------------
  total++;
  try {
    const missionId = 'GOLDEN_SOURCE_FAIL_' + Date.now();
    orchestrator.initializeMission(missionId, 20);

    orchestrator.pushFrontierPath(missionId, {
      path_id: 'PATH_PRIMARY',
      source_id: 'SRC_A',
      resource: 'res_a',
      connector: 'conn_a',
      access_mode: 'HTTP',
      role: 'PRIMARY',
      priority: 10
    });
    orchestrator.pushFrontierPath(missionId, {
      path_id: 'PATH_FALLBACK',
      source_id: 'SRC_B',
      resource: 'res_b',
      connector: 'conn_b',
      access_mode: 'HTTP',
      role: 'FALLBACK',
      priority: 5
    });

    await orchestrator.transitionPhase(missionId, 'CORE_LOOKUP');
    await orchestrator.transitionPhase(missionId, 'SOURCE_PLANNING');
    await orchestrator.transitionPhase(missionId, 'PROBING');
    await orchestrator.transitionPhase(missionId, 'ACQUIRING');

    // Source A encounters network timeout / technical failure
    orchestrator.markPathState(missionId, 'PATH_PRIMARY', 'TEMPORARILY_FAILED', {
      failure_reason: 'ETIMEDOUT 504'
    });

    const tel = orchestrator.getTelemetry(missionId);
    const hasNext = orchestrator.hasViableFrontierPath(missionId);
    const nextPath = orchestrator.popNextViablePath(missionId);

    if (
      tel.mission_phase === 'ACQUIRING' &&
      hasNext &&
      nextPath?.path_id === 'PATH_FALLBACK'
    ) {
      console.log('✅ TEST 2 PASSED: SOURCE_FAILURE_CONTINUES_GOLDEN');
      passed++;
    } else {
      console.error('❌ TEST 2 FAILED: SOURCE_FAILURE_CONTINUES_GOLDEN', { tel, hasNext, nextPath });
    }
  } catch (err) {
    console.error('❌ TEST 2 EXCEPTION:', err);
  }

  // ----------------------------------------------------
  // TEST 3: MISSING_EVIDENCE_ENRICHMENT_GOLDEN
  // ----------------------------------------------------
  total++;
  try {
    const ledger = new AtlasCandidateLedger();

    // Candidate 1: Missing website / email evidence (soft failure)
    const c1 = ledger.addOrMergeCandidate({
      company_name: 'Libreria Rivadavia',
      address: 'Av. Rivadavia 1234',
      city: 'CABA',
      osm_id: '101'
    }, 'SRC_OSM');

    ledger.recordSoftEvaluation(c1.identity_key, ['ENRICHMENT', 'EMAIL'], 'MISSING_EMAIL_CONTACT');

    // Candidate 2: Hard failure (wrong entity type)
    const c2 = ledger.addOrMergeCandidate({
      company_name: 'Carniceria Don Pepe',
      address: 'Av. Corrientes 5678',
      city: 'CABA',
      osm_id: '102'
    }, 'SRC_OSM');

    ledger.recordHardRejection(c2.identity_key, 'WRONG_ENTITY_TYPE: NOT_A_BOOKSTORE');

    const summary = ledger.getSummary();
    const evaluatedC1 = ledger.getCandidate(c1.identity_key);
    const evaluatedC2 = ledger.getCandidate(c2.identity_key);

    if (
      evaluatedC1?.status === 'ENRICHMENT_PENDING' &&
      evaluatedC2?.status === 'FINAL_REJECTED' &&
      summary.pending === 1 &&
      summary.rejected === 1
    ) {
      console.log('✅ TEST 3 PASSED: MISSING_EVIDENCE_ENRICHMENT_GOLDEN');
      passed++;
    } else {
      console.error('❌ TEST 3 FAILED: MISSING_EVIDENCE_ENRICHMENT_GOLDEN', { summary, evaluatedC1, evaluatedC2 });
    }
  } catch (err) {
    console.error('❌ TEST 3 EXCEPTION:', err);
  }

  // ----------------------------------------------------
  // TEST 4: POSITIVE_GAP_INVARIANT_GOLDEN
  // ----------------------------------------------------
  total++;
  try {
    const missionId = 'GOLDEN_POS_GAP_' + Date.now();
    orchestrator.initializeMission(missionId, 20);

    orchestrator.pushFrontierPath(missionId, {
      path_id: 'PATH_AVAILABLE',
      source_id: 'SRC_REMAINING',
      resource: 'res',
      connector: 'conn',
      access_mode: 'HTTP',
      role: 'BACKUP',
      priority: 5
    });

    let invariantBlocked = false;
    try {
      // Attempt to terminate while gap is 20 and viable path exists
      const illegalProof: MissionTerminationProof = {
        remaining_gap: 20,
        sources_known: 1,
        sources_attempted: 0,
        sources_exhausted: 0,
        sources_failed: 0,
        sources_rejected: 0,
        source_frontier_remaining: 1,
        discovery_expansion_attempted: false,
        AI_used: false,
        web_discovery_used: false,
        budget_remaining: 100,
        terminal_condition: 'SOURCE_FRONTIER_EXHAUSTED_WITH_PROOF'
      };

      await orchestrator.terminateMission(missionId, illegalProof);
    } catch (invErr: any) {
      if (invErr.message.includes('MISSION_STATE_INVARIANT_FAILURE')) {
        invariantBlocked = true;
      }
    }

    if (invariantBlocked) {
      console.log('✅ TEST 4 PASSED: POSITIVE_GAP_INVARIANT_GOLDEN');
      passed++;
    } else {
      console.error('❌ TEST 4 FAILED: Invariant did not block premature termination with positive gap!');
    }
  } catch (err) {
    console.error('❌ TEST 4 EXCEPTION:', err);
  }

  // ----------------------------------------------------
  // TEST 5: TERMINATION_PROOF_GOLDEN
  // ----------------------------------------------------
  total++;
  try {
    const missionId = 'GOLDEN_PROOF_' + Date.now();
    orchestrator.initializeMission(missionId, 20);

    orchestrator.pushFrontierPath(missionId, {
      path_id: 'PATH_1',
      source_id: 'SRC_1',
      resource: 'res_1',
      connector: 'conn_1',
      access_mode: 'HTTP',
      role: 'PRIMARY',
      priority: 10
    });

    // Mark path exhausted
    orchestrator.markPathState(missionId, 'PATH_1', 'EXHAUSTED');

    // Valid proof when frontier is exhausted
    const validProof: MissionTerminationProof = {
      remaining_gap: 20,
      sources_known: 1,
      sources_attempted: 1,
      sources_exhausted: 1,
      sources_failed: 0,
      sources_rejected: 0,
      source_frontier_remaining: 0,
      discovery_expansion_attempted: true,
      AI_used: false,
      web_discovery_used: true,
      budget_remaining: 0,
      terminal_condition: 'SOURCE_FRONTIER_EXHAUSTED_WITH_PROOF',
      proof_notes: 'All public sources exhausted with 0 viable remaining'
    };

    const termResult = await orchestrator.terminateMission(missionId, validProof);

    if (
      termResult.status === 'SOURCE_FRONTIER_EXHAUSTED_WITH_PROOF' &&
      termResult.terminal_reason === 'SOURCE_FRONTIER_EXHAUSTED_WITH_PROOF' &&
      termResult.target_reached === false
    ) {
      console.log('✅ TEST 5 PASSED: TERMINATION_PROOF_GOLDEN');
      passed++;
    } else {
      console.error('❌ TEST 5 FAILED: TERMINATION_PROOF_GOLDEN', termResult);
    }
  } catch (err) {
    console.error('❌ TEST 5 EXCEPTION:', err);
  }

  console.log('\n========================================================');
  console.log(`RESULTS: ${passed}/${total} GOLDEN INVARIANT TESTS PASSED`);
  console.log('========================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runGoldenTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
