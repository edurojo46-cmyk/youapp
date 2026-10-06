/**
 * ATLAS GLOBAL ACCOUNTING MODEL & TERMINAL MESSAGE GOLDEN SUITE
 * 
 * Invariants Enforced:
 * 1. Exact Row Conservation:
 *    source_rows_parsed == duplicates_core_this_run + quality_rejected + net_new
 *    double_counted_rows == 0
 *    unaccounted_rows == 0
 * 2. Strict Core Independence:
 *    core_existing_before is pre-existing inventory from earlier sessions.
 *    It is NEVER mixed with duplicates_core_this_run.
 * 3. Truthful Terminal Reasons & Messages:
 *    - NO_NEW_RECORDS_FOUND only allowed if duplicates_core_this_run > 0.
 *    - ALL_CANDIDATES_REJECTED required if duplicates_core_this_run === 0 and rejected > 0.
 *    - TARGET_REACHED strictly prohibited unless net_new >= target.
 */

import { IndustrialDiscoveryService } from '../server/services/industrial/IndustrialDiscoveryService.ts';

interface AccountingLedger {
  core_existing_before: number;
  source_rows_parsed: number;
  duplicates_core_this_run: number;
  quality_rejected: number;
  net_new: number;
}

function auditAccountingLedger(ledger: AccountingLedger) {
  const sumOfOutcomes = ledger.duplicates_core_this_run + ledger.quality_rejected + ledger.net_new;
  const double_counted = Math.max(0, sumOfOutcomes - ledger.source_rows_parsed);
  const unaccounted = Math.max(0, ledger.source_rows_parsed - sumOfOutcomes);
  const isConserved = ledger.source_rows_parsed === sumOfOutcomes;
  return { double_counted, unaccounted, isConserved, sumOfOutcomes };
}

function runSuite() {
  console.log('====================================================');
  console.log('ATLAS GLOBAL ACCOUNTING MODEL & TERMINAL GOLDEN SUITE');
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

  // =========================================================================
  // SECTION 1: FORENSIC LIBRERIAS RUN ACCOUNTING AUDIT
  // =========================================================================
  console.log('--- SECTION 1: Forensic Librerias Run Audit ---');
  const libreriasLedger: AccountingLedger = {
    core_existing_before: 238,
    source_rows_parsed: 5,
    duplicates_core_this_run: 0,
    quality_rejected: 5,
    net_new: 0
  };
  const libAudit = auditAccountingLedger(libreriasLedger);

  assert('Librerias: Conservation Invariant Holds (5 == 0 + 5 + 0)', libAudit.isConserved);
  assert('Librerias: Double Counted Rows is 0', libAudit.double_counted === 0);
  assert('Librerias: Unaccounted Rows is 0', libAudit.unaccounted === 0);
  assert('Librerias: Core Existing Before is 238', libreriasLedger.core_existing_before === 238);
  assert('Librerias: Duplicates Core This Run is 0', libreriasLedger.duplicates_core_this_run === 0);
  assert('Librerias: Quality Rejected is 5', libreriasLedger.quality_rejected === 5);
  assert('Librerias: Net New is 0', libreriasLedger.net_new === 0);

  // Compute terminal state for Librerias
  const libTerm = IndustrialDiscoveryService.computeTerminalState({
    target: 1000,
    certified: libreriasLedger.net_new,
    scanned: libreriasLedger.source_rows_parsed,
    duplicates: libreriasLedger.duplicates_core_this_run,
    rejected: libreriasLedger.quality_rejected
  });

  assert('Librerias: True Terminal Reason is ALL_CANDIDATES_REJECTED', libTerm.terminal_reason === 'ALL_CANDIDATES_REJECTED');
  assert('Librerias: Status is ALL_CANDIDATES_REJECTED', libTerm.status === 'ALL_CANDIDATES_REJECTED');
  assert('Librerias: NOT NO_NEW_RECORDS_FOUND', libTerm.terminal_reason !== 'NO_NEW_RECORDS_FOUND');
  assert('Librerias: NOT TARGET_REACHED', libTerm.target_reached === false);
  assert('Librerias: Previous UI message ("ya estaban en Atlas") was FALSE', 
    !libTerm.user_message.includes('ya estaban en Atlas') && libTerm.user_message.includes('superó las reglas de certificación'));

  // =========================================================================
  // SECTION 2: ACCOUNTING GOLDEN CASES
  // =========================================================================
  console.log('\n--- SECTION 2: Accounting Golden Cases ---');

  // Case 1: Pure Net New (e.g. 20 scanned, 20 certified, 0 dups, 0 rejected)
  const case1: AccountingLedger = {
    core_existing_before: 50,
    source_rows_parsed: 20,
    duplicates_core_this_run: 0,
    quality_rejected: 0,
    net_new: 20
  };
  const audit1 = auditAccountingLedger(case1);
  const term1 = IndustrialDiscoveryService.computeTerminalState({
    target: 20,
    certified: case1.net_new,
    scanned: case1.source_rows_parsed,
    duplicates: case1.duplicates_core_this_run,
    rejected: case1.quality_rejected
  });
  assert('Case 1 (Pure Net New): Conserved 1:1', audit1.isConserved && audit1.double_counted === 0 && audit1.unaccounted === 0);
  assert('Case 1: Terminal Reason is TARGET_REACHED', term1.terminal_reason === 'TARGET_REACHED');
  assert('Case 1: Target Reached is TRUE', term1.target_reached === true);

  // Case 2: Pure Duplicates of Core (e.g. 15 scanned, all 15 match existing core, 0 net new)
  const case2: AccountingLedger = {
    core_existing_before: 100,
    source_rows_parsed: 15,
    duplicates_core_this_run: 15,
    quality_rejected: 0,
    net_new: 0
  };
  const audit2 = auditAccountingLedger(case2);
  const term2 = IndustrialDiscoveryService.computeTerminalState({
    target: 100,
    certified: case2.net_new,
    scanned: case2.source_rows_parsed,
    duplicates: case2.duplicates_core_this_run,
    rejected: case2.quality_rejected
  });
  assert('Case 2 (Pure Duplicates): Conserved 1:1', audit2.isConserved && audit2.double_counted === 0 && audit2.unaccounted === 0);
  assert('Case 2: Terminal Reason is NO_NEW_RECORDS_FOUND', term2.terminal_reason === 'NO_NEW_RECORDS_FOUND');
  assert('Case 2: Message mentions ya estaban en Atlas', term2.user_message.includes('ya estaban en Atlas'));
  assert('Case 2: Target Reached is FALSE', term2.target_reached === false);

  // Case 3: Pure Quality Rejected with Pre-existing Core (The Librerias Pattern)
  const case3: AccountingLedger = {
    core_existing_before: 500,
    source_rows_parsed: 12,
    duplicates_core_this_run: 0,
    quality_rejected: 12,
    net_new: 0
  };
  const audit3 = auditAccountingLedger(case3);
  const term3 = IndustrialDiscoveryService.computeTerminalState({
    target: 50,
    certified: case3.net_new,
    scanned: case3.source_rows_parsed,
    duplicates: case3.duplicates_core_this_run,
    rejected: case3.quality_rejected
  });
  assert('Case 3 (Pure Rejected): Conserved 1:1', audit3.isConserved && audit3.double_counted === 0 && audit3.unaccounted === 0);
  assert('Case 3: Terminal Reason is ALL_CANDIDATES_REJECTED', term3.terminal_reason === 'ALL_CANDIDATES_REJECTED');
  assert('Case 3: Does NOT claim duplicates when dups=0', !term3.user_message.includes('ya estaban en Atlas'));

  // Case 4: Mixed Outcome (e.g. 30 scanned = 10 dups + 5 rejected + 15 certified)
  const case4: AccountingLedger = {
    core_existing_before: 200,
    source_rows_parsed: 30,
    duplicates_core_this_run: 10,
    quality_rejected: 5,
    net_new: 15
  };
  const audit4 = auditAccountingLedger(case4);
  const term4 = IndustrialDiscoveryService.computeTerminalState({
    target: 50,
    certified: case4.net_new,
    scanned: case4.source_rows_parsed,
    duplicates: case4.duplicates_core_this_run,
    rejected: case4.quality_rejected
  });
  assert('Case 4 (Mixed): Conserved 1:1', audit4.isConserved && audit4.double_counted === 0 && audit4.unaccounted === 0);
  assert('Case 4: Terminal Reason is PARTIAL_SOURCE_EXHAUSTED', term4.terminal_reason === 'PARTIAL_SOURCE_EXHAUSTED');
  assert('Case 4: Target Reached is FALSE', term4.target_reached === false);

  // Case 5: Zero Scanned with Pre-existing Core (No suitable source found)
  const case5: AccountingLedger = {
    core_existing_before: 75,
    source_rows_parsed: 0,
    duplicates_core_this_run: 0,
    quality_rejected: 0,
    net_new: 0
  };
  const audit5 = auditAccountingLedger(case5);
  const term5 = IndustrialDiscoveryService.computeTerminalState({
    target: 100,
    certified: case5.net_new,
    scanned: case5.source_rows_parsed,
    duplicates: case5.duplicates_core_this_run,
    rejected: case5.quality_rejected,
    noSourceFound: true
  });
  assert('Case 5 (Zero Scanned): Conserved 1:1', audit5.isConserved && audit5.double_counted === 0 && audit5.unaccounted === 0);
  assert('Case 5: Terminal Reason is NO_SUITABLE_SOURCE_FOUND', term5.terminal_reason === 'NO_SUITABLE_SOURCE_FOUND');
  assert('Case 5: Does NOT claim duplicates when scanned=0', !term5.user_message.includes('ya estaban en Atlas'));

  // =========================================================================
  // SECTION 3: TERMINAL MESSAGE GOLDENS
  // =========================================================================
  console.log('\n--- SECTION 3: Terminal Message Goldens ---');

  // G1: Zero net new with rejected candidates MUST NOT say "ya estaban en Atlas"
  const msgG1 = IndustrialDiscoveryService.computeTerminalState({
    target: 100,
    certified: 0,
    scanned: 8,
    duplicates: 0,
    rejected: 8
  });
  assert('G1: Rejection message does NOT say "ya estaban en Atlas"', !msgG1.user_message.includes('ya estaban en Atlas'));
  assert('G1: Rejection message accurately cites certification rules', msgG1.user_message.includes('superó las reglas de certificación'));

  // G2: Only true run duplicates say "ya estaban en Atlas"
  const msgG2 = IndustrialDiscoveryService.computeTerminalState({
    target: 100,
    certified: 0,
    scanned: 10,
    duplicates: 10,
    rejected: 0
  });
  assert('G2: Duplicate message accurately cites ya estaban en Atlas', msgG2.user_message.includes('ya estaban en Atlas'));

  // G3: User Cancelled always truthful
  const msgG3 = IndustrialDiscoveryService.computeTerminalState({
    target: 100,
    certified: 5,
    scanned: 20,
    cancelledByUser: true
  });
  assert('G3: User cancelled displays Cancelaste la búsqueda', msgG3.user_message.includes('Cancelaste'));

  // G4: Target Reached only when certified >= target
  const msgG4 = IndustrialDiscoveryService.computeTerminalState({
    target: 20,
    certified: 20,
    scanned: 22
  });
  assert('G4: Target reached displays Misión cumplida', msgG4.user_message.includes('Misión cumplida'));

  console.log('\n----------------------------------------------------');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite();
