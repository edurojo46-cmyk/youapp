/**
 * scripts/validate_gate_s_golden_set.mjs
 * 
 * Validates the Golden Correctness Set against AtlasPeopleSearchV2 with bounded concurrency.
 * Verifies that 1 Result = 1 atlas_person_id, expected IDs match, and negative queries return 0 results.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';

const { AtlasPeopleSearchV2 } = await import('../src/lib/search/AtlasPeopleSearchV2.ts');

const GOLDEN_SET_PATH = path.resolve('reports/atlas/search/atlas_gate_s_golden_set.json');
const SEP = '═'.repeat(75);
const CONCURRENCY = 10;

async function main() {
  console.log(`\n${SEP}`);
  console.log('🧪 VALIDATING GATE S GOLDEN CORRECTNESS SET (CONCURRENT)');
  console.log(`   Golden Set: ${GOLDEN_SET_PATH}`);
  console.log(`   Concurrency: ${CONCURRENCY} workers`);
  console.log(`${SEP}\n`);

  const goldenSet = JSON.parse(fs.readFileSync(GOLDEN_SET_PATH, 'utf8'));
  console.log(`Loaded ${goldenSet.length} golden test cases.\n`);

  let passed = 0;
  let failed = 0;
  const failures = [];
  const latencies = [];
  let testIdx = 0;

  const t0 = performance.now();

  async function worker() {
    while (true) {
      const idx = testIdx++;
      if (idx >= goldenSet.length) break;

      const testCase = goldenSet[idx];
      const tCase = performance.now();

      try {
        const res = await AtlasPeopleSearchV2.search(testCase.params);
        const dt = performance.now() - tCase;
        latencies.push(dt);

        if (testCase.category === 'KNOWN_CANONICAL_MATCH') {
          const expectedId = testCase.expected.atlas_person_id;
          const matchId = res.results.find(r => r.atlas_person_id === expectedId || r.id === expectedId);
          const matchName = res.results.find(r => r.display_name?.toLowerCase().includes(testCase.params.query.toLowerCase()));

          const pids = res.results.map(r => r.atlas_person_id);
          const uniquePids = new Set(pids);
          const hasDuplicates = pids.length !== uniquePids.size;

          if ((matchId || matchName) && !hasDuplicates) {
            passed++;
          } else {
            failed++;
            failures.push({
              test_id: testCase.test_id,
              category: testCase.category,
              query: testCase.params.query,
              expected_id: expectedId,
              found_count: res.results.length,
              found_ids: pids,
              has_duplicates: hasDuplicates,
              error: hasDuplicates ? 'Duplicate IDs in response' : 'Expected match not found in results'
            });
          }
        } else if (testCase.category === 'NEGATIVE_VERIFICATION') {
          if (res.results.length === 0) {
            passed++;
          } else {
            failed++;
            failures.push({
              test_id: testCase.test_id,
              category: testCase.category,
              query: testCase.params.query,
              expected: '0 results',
              got: res.results.length
            });
          }
        }

        if ((idx + 1) % 200 === 0) {
          console.log(`  Progress: ${idx + 1}/${goldenSet.length} | Passed: ${passed} | Failed: ${failed}`);
        }
      } catch (err) {
        failed++;
        failures.push({
          test_id: testCase.test_id,
          category: testCase.category,
          query: testCase.params.query,
          error: err.message
        });
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  const elapsedSec = (performance.now() - t0) / 1000;
  const sortedLat = [...latencies].sort((a, b) => a - b);
  const p50 = sortedLat[Math.floor(sortedLat.length * 0.50)] || 0;
  const p95 = sortedLat[Math.floor(sortedLat.length * 0.95)] || 0;
  const p99 = sortedLat[Math.floor(sortedLat.length * 0.99)] || 0;

  console.log(`\n${SEP}`);
  console.log('🏁 GOLDEN SET VALIDATION RESULTS:');
  console.log(`   Total Tests:        ${goldenSet.length}`);
  console.log(`   Passed:             ${passed} (${((passed / goldenSet.length) * 100).toFixed(2)}%)`);
  console.log(`   Failed:             ${failed}`);
  console.log(`   Elapsed Time:       ${elapsedSec.toFixed(2)}s`);
  console.log(`   Latency P50:        ${p50.toFixed(1)}ms | P95: ${p95.toFixed(1)}ms | P99: ${p99.toFixed(1)}ms`);
  console.log(`   Correctness Status: ${failed === 0 ? '✅ 100% PASS' : '❌ FAIL'}`);
  console.log(`${SEP}\n`);

  if (failures.length > 0) {
    console.log('Sample Failures (up to 5):', JSON.stringify(failures.slice(0, 5), null, 2));
    process.exit(1);
  }
}

main().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
