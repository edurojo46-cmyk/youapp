/**
 * ATLAS TERMINAL STATE REGRESSION TESTS
 * Section 9 Verification:
 * A) target = 20, certified = 20 -> TARGET_REACHED
 * B) target = 20, certified = 18, sources exhausted -> PARTIAL_SOURCE_EXHAUSTED
 * C) target = 1000, certified = 0, no suitable source -> NO_SUITABLE_SOURCE_FOUND
 * D) target = 1000, certified = 0, ontology unresolved -> NEEDS_ONTOLOGY_RESOLUTION
 * E) user cancels -> CANCELLED
 * 
 * Constitutional Invariant: In no case B/C/D/E may it yield TARGET_REACHED or show "Misión cumplida".
 */

import { IndustrialDiscoveryService } from '../server/services/industrial/IndustrialDiscoveryService.ts';

const isTerminalStatus = IndustrialDiscoveryService.isTerminalStatus;

function runTests() {
  console.log('====================================================');
  console.log('RUNNING CONSTITUTIONAL TERMINAL STATE REGRESSION TESTS');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean, details?: string) {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name} - ${details || 'Assertion failed'}`);
      failed++;
    }
  }

  // --- Test A: target = 20, certified = 20 -> TARGET_REACHED ---
  const stateA = IndustrialDiscoveryService.computeTerminalState({
    target: 20,
    certified: 20,
    scanned: 25
  });
  assert('Test A Status is TARGET_REACHED', stateA.status === 'TARGET_REACHED', `Got ${stateA.status}`);
  assert('Test A Terminal Reason is TARGET_REACHED', stateA.terminal_reason === 'TARGET_REACHED');
  assert('Test A Target Reached is TRUE', stateA.target_reached === true);
  assert('Test A Is Terminal', isTerminalStatus(stateA.status, stateA.terminal_reason));

  // --- Test B: target = 20, certified = 18, sources exhausted -> PARTIAL_SOURCE_EXHAUSTED ---
  const stateB = IndustrialDiscoveryService.computeTerminalState({
    target: 20,
    certified: 18,
    scanned: 50
  });
  assert('Test B Status is PARTIAL_SOURCE_EXHAUSTED', stateB.status === 'PARTIAL_SOURCE_EXHAUSTED', `Got ${stateB.status}`);
  assert('Test B Terminal Reason is PARTIAL_SOURCE_EXHAUSTED', stateB.terminal_reason === 'PARTIAL_SOURCE_EXHAUSTED');
  assert('Test B Target Reached is FALSE', stateB.target_reached === false);
  assert('Test B NOT TARGET_REACHED (No False Success)', stateB.status !== 'TARGET_REACHED' && stateB.terminal_reason !== 'TARGET_REACHED');
  assert('Test B Is Terminal', isTerminalStatus(stateB.status, stateB.terminal_reason));

  // --- Test C: target = 1000, certified = 0, no suitable source -> NO_SUITABLE_SOURCE_FOUND ---
  const stateC = IndustrialDiscoveryService.computeTerminalState({
    target: 1000,
    certified: 0,
    scanned: 0,
    noSourceFound: true
  });
  assert('Test C Status is NO_SUITABLE_SOURCE_FOUND', stateC.status === 'NO_SUITABLE_SOURCE_FOUND', `Got ${stateC.status}`);
  assert('Test C Terminal Reason is NO_SUITABLE_SOURCE_FOUND', stateC.terminal_reason === 'NO_SUITABLE_SOURCE_FOUND');
  assert('Test C Target Reached is FALSE', stateC.target_reached === false);
  assert('Test C NOT TARGET_REACHED (Zero Work Bug Prevented)', stateC.status !== 'TARGET_REACHED' && stateC.terminal_reason !== 'TARGET_REACHED');
  assert('Test C Is Terminal', isTerminalStatus(stateC.status, stateC.terminal_reason));

  // --- Test D: target = 1000, certified = 0, ontology unresolved -> NEEDS_ONTOLOGY_RESOLUTION ---
  const stateD = IndustrialDiscoveryService.computeTerminalState({
    target: 1000,
    certified: 0,
    scanned: 0,
    ontologyUnresolved: true
  });
  assert('Test D Status is NEEDS_ONTOLOGY_RESOLUTION', stateD.status === 'NEEDS_ONTOLOGY_RESOLUTION', `Got ${stateD.status}`);
  assert('Test D Terminal Reason is NEEDS_ONTOLOGY_RESOLUTION', stateD.terminal_reason === 'NEEDS_ONTOLOGY_RESOLUTION');
  assert('Test D Target Reached is FALSE', stateD.target_reached === false);
  assert('Test D NOT TARGET_REACHED', stateD.status !== 'TARGET_REACHED' && stateD.terminal_reason !== 'TARGET_REACHED');
  assert('Test D Is Terminal', isTerminalStatus(stateD.status, stateD.terminal_reason));

  // --- Test E: user cancels -> CANCELLED ---
  const stateE = IndustrialDiscoveryService.computeTerminalState({
    target: 1000,
    certified: 5,
    scanned: 10,
    isCancelled: true
  });
  assert('Test E Status is CANCELLED', stateE.status === 'CANCELLED', `Got ${stateE.status}`);
  assert('Test E Terminal Reason is CANCELLED', stateE.terminal_reason === 'CANCELLED');
  assert('Test E Target Reached is FALSE', stateE.target_reached === false);
  assert('Test E NOT TARGET_REACHED', stateE.status !== 'TARGET_REACHED' && stateE.terminal_reason !== 'TARGET_REACHED');
  assert('Test E Is Terminal', isTerminalStatus(stateE.status, stateE.terminal_reason));

  console.log('\n----------------------------------------------------');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
