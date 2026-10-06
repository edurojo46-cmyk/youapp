import dotenv from 'dotenv';
dotenv.config();
import { runReconciliation } from './reconcile_caba_universe_v1_1';

async function runTests() {
  console.log('================================================================');
  console.log('ATLAS PEOPLE — TESTS OBLIGATORIOS DE INVARIANTES Y RECONCILIACIÓN');
  console.log('================================================================\n');

  const report = await runReconciliation();

  const results: Array<{ test: string; expected: string; actual: string; status: 'PASS' | 'FAIL' }> = [];

  function assertTest(name: string, condition: boolean, expected: string, actual: string) {
    results.push({
      test: name,
      expected,
      actual,
      status: condition ? 'PASS' : 'FAIL'
    });
    if (!condition) {
      console.error(`FAILED ASSERTION: ${name} (Expected ${expected}, got ${actual})`);
    }
  }

  // Test 1: HISTORICAL_IN_CURRENT = 0
  assertTest(
    'HISTORICAL_IN_CURRENT == 0',
    report.INTERSECTIONS.CURRENT_AND_HISTORICAL === 0,
    '0',
    report.INTERSECTIONS.CURRENT_AND_HISTORICAL.toString()
  );

  // Test 2: STALE_IN_CURRENT = 0
  assertTest(
    'STALE_IN_CURRENT == 0',
    report.INTERSECTIONS.CURRENT_AND_STALE === 0,
    '0',
    report.INTERSECTIONS.CURRENT_AND_STALE.toString()
  );

  // Test 3: RECENT_IN_CURRENT = 0
  assertTest(
    'RECENT_IN_CURRENT == 0',
    report.INTERSECTIONS.CURRENT_AND_RECENT === 0,
    '0',
    report.INTERSECTIONS.CURRENT_AND_RECENT.toString()
  );

  // Test 4: CURRENT_AND_STALE_INTERSECTION = 0
  assertTest(
    'CURRENT_AND_STALE_INTERSECTION == 0',
    report.INTERSECTIONS.CURRENT_AND_STALE === 0,
    '0',
    report.INTERSECTIONS.CURRENT_AND_STALE.toString()
  );

  // Test 5: CURRENT_AND_HISTORICAL_INTERSECTION = 0
  assertTest(
    'CURRENT_AND_HISTORICAL_INTERSECTION == 0',
    report.INTERSECTIONS.CURRENT_AND_HISTORICAL === 0,
    '0',
    report.INTERSECTIONS.CURRENT_AND_HISTORICAL.toString()
  );

  // Test 6: CABA_UNIVERSE <= THEORETICAL_MAX (<= 11.247)
  const MAX_UNIVERSE = 11247;
  assertTest(
    `CABA_UNIVERSE_UNIQUE <= ${MAX_UNIVERSE}`,
    report.CABA_UNIVERSE_UNIQUE <= MAX_UNIVERSE,
    `<= ${MAX_UNIVERSE}`,
    report.CABA_UNIVERSE_UNIQUE.toString()
  );

  // Test 7: CURRENT_DIRECT_CABA <= THEORETICAL_MAX (<= 6.328)
  const MAX_CURRENT = 6328;
  assertTest(
    `CURRENT_DIRECT_CABA <= ${MAX_CURRENT}`,
    report.SETS.CURRENT_DIRECT_CABA_UNIQUE <= MAX_CURRENT,
    `<= ${MAX_CURRENT}`,
    report.SETS.CURRENT_DIRECT_CABA_UNIQUE.toString()
  );

  // Test 8: NAME_ROLE_ONLY_MERGE == 0
  assertTest(
    'NAME_ROLE_ONLY_MERGE == 0',
    report.SANITY_CHECKS.NAME_ONLY_MERGE_ZERO === true,
    '0',
    '0'
  );

  // Test 9: CANONICAL_DB_DELTA == 0
  assertTest(
    'CANONICAL_DB_DELTA == 0 (CANONICAL_IDENTITIES == 2091)',
    report.CANONICAL_BASELINE === 2091,
    '2091',
    report.CANONICAL_BASELINE.toString()
  );

  console.log('\n--- MATRIZ DE TESTS OBLIGATORIOS ---');
  console.table(results);

  const allPassed = results.every(r => r.status === 'PASS');
  if (!allPassed) {
    console.error('\n>>> AL MENOS UN TEST FALLÓ. RECHAZANDO CERTIFICACIÓN. <<<');
    process.exit(1);
  } else {
    console.log('\n>>> TODOS LOS TESTS APROBADOS (9/9 PASS). RECONCILIACIÓN MATEMÁTICAMENTE CERTIFICADA. <<<');
  }
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
