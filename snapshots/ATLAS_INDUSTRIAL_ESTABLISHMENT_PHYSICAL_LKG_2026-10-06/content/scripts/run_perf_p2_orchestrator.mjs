import fs from 'node:fs';
import { fork } from 'node:child_process';
import { runP2Benchmark } from './run_perf_p2_benchmark.mjs';

async function main() {
  console.log('=============================================================');
  console.log('STEP 7: P2 50K MICRO-MATRIX ORCHESTRATION');
  console.log('=============================================================\n');

  // Start Process B (Async Search Publisher) in background
  console.log('Launching Process B (Async Pipelined Search Publisher)...');
  const pubProc = fork('./scripts/run_perf_search_publisher_pipelined.mjs', [
    '--claim-batch', '2000',
    '--max-inflight', '4',
    '--stats-file', 'cache_gate31d/publisher_status.json'
  ], { stdio: 'inherit' });

  // Give publisher 1 second to connect
  await new Promise(r => setTimeout(r, 1000));

  const matrixConfigs = [
    {
      configName: 'P2_B_new_reader_current_pg',
      workers: 2,
      batchSize: 2000,
      startLine: 2028000,
      limit: 50000,
      useNewReader: true,
      sortOrder: 'none'
    },
    {
      configName: 'P2_C_new_reader_best_pg',
      workers: 2,
      batchSize: 2000,
      startLine: 2080000,
      limit: 50000,
      useNewReader: true,
      sortOrder: 'source_person_id'
    }
  ];

  const results = [];

  for (const cfg of matrixConfigs) {
    console.log(`\n>>> STARTING CONFIGURATION: ${cfg.configName} <<<`);
    const res = await runP2Benchmark(cfg);
    results.push(res);
    console.log(`>>> COMPLETED ${cfg.configName}: CAND_SEC=${res.CAND_SEC}, NEW_SEC=${res.NEW_SEC}, BP_WALL%=${res.BACKPRESSURE_METRICS.BACKPRESSURE_WALL_PERCENT}% <<<\n`);
    // Brief cooldown between runs
    await new Promise(r => setTimeout(r, 2000));
  }

  // Check if P2-C improved over P2-B; if yes and fast, evaluate w=3 as P2-D
  const bestInitial = [...results].sort((a, b) => b.NEW_SEC - a.NEW_SEC)[0];
  if (bestInitial.NEW_SEC >= 450) {
    console.log('\n>>> Testing P2-D (Optimized path with workers=3, batch=2000) <<<');
    const p2d = await runP2Benchmark({
      configName: 'P2_D_optimized_w3_b2000',
      workers: 3,
      batchSize: 2000,
      startLine: 2200000,
      limit: 50000,
      useNewReader: true,
      sortOrder: 'source_person_id'
    });
    results.push(p2d);
  }

  // Allow publisher to drain remaining outbox documents
  console.log('\nWaiting for Search Publisher to drain remaining outbox queue...');
  let drainWaitSec = 0;
  while (drainWaitSec < 60) {
    try {
      if (fs.existsSync('cache_gate31d/publisher_status.json')) {
        const pStatus = JSON.parse(fs.readFileSync('cache_gate31d/publisher_status.json', 'utf8'));
        if (pStatus.inFlightCount === 0) {
          console.log(`Publisher drained. Total published: ${pStatus.totalDocsPublished}`);
          break;
        }
      }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 1000));
    drainWaitSec++;
  }

  // Stop publisher cleanly
  pubProc.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1500));

  // Determine overall best configuration
  const sorted = [...results].sort((a, b) => b.NEW_SEC - a.NEW_SEC);
  const bestConfig = sorted[0];

  // Read latest publisher stats
  let finalPubStats = {};
  try {
    if (fs.existsSync('cache_gate31d/publisher_status.json')) {
      finalPubStats = JSON.parse(fs.readFileSync('cache_gate31d/publisher_status.json', 'utf8'));
    }
  } catch (_) {}

  const finalReport = {
    timestamp: new Date().toISOString(),
    stage: 'atlas_perf_1m30_p2_matrix',
    totalConfigurationsTested: results.length,
    matrixResults: results,
    BEST_CONFIGURATION: bestConfig,
    FINAL_PUBLISHER_STATS: finalPubStats,
    GATES: {
      P2_560_GATE: bestConfig.NEW_SEC >= 560 ? 'PASS' : 'FAIL',
      P2_620_TARGET: bestConfig.NEW_SEC >= 620 ? 'PASS' : 'FAIL',
      P2_SEARCH_700_GATE: (finalPubStats.SEARCH_E2E_DOCS_SEC || 0) >= 700 ? 'PASS' : 'FAIL',
      RECOMMEND_300K: (bestConfig.NEW_SEC >= 560 && (finalPubStats.SEARCH_E2E_DOCS_SEC || 0) >= 700)
    }
  };

  fs.mkdirSync('reports/atlas/discovery', { recursive: true });
  fs.writeFileSync(
    'reports/atlas/discovery/atlas_perf_1m30_p2_matrix_v1.json',
    JSON.stringify(finalReport, null, 2)
  );

  console.log('\n=============================================================');
  console.log('🏆 P2 MICRO-MATRIX COMPLETED:');
  console.log(`BEST CONFIG: ${bestConfig.CONFIG_NAME}`);
  console.log(`BEST CAND_SEC: ${bestConfig.CAND_SEC} | BEST NEW_SEC: ${bestConfig.NEW_SEC}`);
  console.log(`BP WALL %: ${bestConfig.BACKPRESSURE_METRICS.BACKPRESSURE_WALL_PERCENT}%`);
  console.log(`SEARCH_E2E_DOCS_SEC: ${finalPubStats.SEARCH_E2E_DOCS_SEC || 0}`);
  console.log(`P2_560_GATE: ${finalReport.GATES.P2_560_GATE}`);
  console.log(`RECOMMEND_300K: ${finalReport.GATES.RECOMMEND_300K}`);
  console.log('=============================================================\n');
}

main().catch(err => {
  console.error('Fatal P2 Orchestrator Error:', err);
  process.exit(1);
});
