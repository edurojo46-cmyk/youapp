import fs from 'node:fs';
import path from 'node:path';
import { runInductionEngineSession } from './run_atlas_induction_engine_v1.mjs';

function calcStats(values) {
  const n = values.length;
  if (n === 0) return { min: 0, max: 0, median: 0, mean: 0, cv: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[n - 1];
  const median = n % 2 === 1 ? sorted[Math.floor(n / 2)] : Number(((sorted[n / 2 - 1] + sorted[n / 2]) / 2).toFixed(2));
  const mean = Number((values.reduce((sum, v) => sum + v, 0) / n).toFixed(2));
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? Number(((stdDev / mean) * 100).toFixed(2)) : 0;
  return { min, max, median, mean, cv };
}

async function main() {
  console.log('\n================================================================');
  console.log('🏁 ATLAS INDUCTION ENGINE V1.3: 3x50K FRESH COHORT BENCHMARK');
  console.log('Single Server RPC (1-RTT) Path | Workers: 2 | Initial Batch: 2000');
  console.log('================================================================\n');

  const runs = [
    { name: 'V1.3_RUN_1_50K', startLine: 3300000, targetLimit: 50000 },
    { name: 'V1.3_RUN_2_50K', startLine: 3350000, targetLimit: 50000 },
    { name: 'V1.3_RUN_3_50K', startLine: 3400000, targetLimit: 50000 }
  ];

  const results = [];

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    console.log(`\n▶️ Starting Run ${i + 1}/3: ${run.name} (StartLine: ${run.startLine})...\n`);
    const reportPath = `reports/atlas/discovery/atlas_v1_3_run_${i + 1}.json`;
    const res = await runInductionEngineSession({
      sessionName: run.name,
      startLine: run.startLine,
      targetLimit: run.targetLimit,
      flagsOverrides: {
        ATLAS_INDUCTION_ENGINE: true,
        ATLAS_ADAPTIVE_BATCH: true,
        ATLAS_BATCH_PREFETCH: true,
        ATLAS_SATURATION_CONTROL: true,
        ATLAS_SERVER_BATCH_RPC: true,
        ATLAS_SINGLE_RESOLVE_RPC: true
      },
      reportPath
    });
    results.push(res);
  }

  const newRates = results.map(r => r.NEW_SEC);
  const stats = calcStats(newRates);

  const summary = {
    RUN_1_NEW_SEC: results[0].NEW_SEC,
    RUN_2_NEW_SEC: results[1].NEW_SEC,
    RUN_3_NEW_SEC: results[2].NEW_SEC,
    RUN_1_WALL_SEC: results[0].TOTAL_WALL_SEC,
    RUN_2_WALL_SEC: results[1].TOTAL_WALL_SEC,
    RUN_3_WALL_SEC: results[2].TOTAL_WALL_SEC,
    MEDIAN_NEW_SEC: stats.median,
    MIN: stats.min,
    MAX: stats.max,
    MEAN: stats.mean,
    CV: `${stats.cv}%`,
    GATE_560_TARGET: 560,
    INDUCTION_560_GATE: stats.median >= 560 ? 'PASS' : 'FAIL',
    RUN_1_RPC_SUM_WORKER_SEC: results[0].RPC_SUM_WORKER_SEC,
    RUN_1_RPC_CRITICAL_PATH_SEC: results[0].RPC_CRITICAL_PATH_SEC,
    RUN_1_RPC_ACTIVE_WALL_PERCENT: results[0].RPC_ACTIVE_WALL_PERCENT,
    RUN_1_RPC_P50_MS: results[0].RPC_P50_MS,
    RUN_1_RPC_P95_MS: results[0].RPC_P95_MS,
    RUN_1_RPC_P99_MS: results[0].RPC_P99_MS,
    RUNS: results
  };

  console.log('\n================================================================');
  console.log('🏆 3x50K BENCHMARK SUMMARY (V1.3 ONE-RTT PATH)');
  console.log('================================================================');
  console.log(`RUN_1_NEW_SEC         : ${summary.RUN_1_NEW_SEC} (Wall: ${summary.RUN_1_WALL_SEC} s)`);
  console.log(`RUN_2_NEW_SEC         : ${summary.RUN_2_NEW_SEC} (Wall: ${summary.RUN_2_WALL_SEC} s)`);
  console.log(`RUN_3_NEW_SEC         : ${summary.RUN_3_NEW_SEC} (Wall: ${summary.RUN_3_WALL_SEC} s)`);
  console.log(`MEDIAN_NEW_SEC        : ${summary.MEDIAN_NEW_SEC}`);
  console.log(`MIN                   : ${summary.MIN}`);
  console.log(`MAX                   : ${summary.MAX}`);
  console.log(`CV                    : ${summary.CV}`);
  console.log(`INDUCTION_560_GATE    : ${summary.INDUCTION_560_GATE}`);
  console.log('================================================================\n');

  fs.writeFileSync(
    'reports/atlas/discovery/atlas_v1_3_triplet_benchmark_summary.json',
    JSON.stringify(summary, null, 2)
  );

  return summary;
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
