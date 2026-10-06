import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const MEILI_URL = 'http://127.0.0.1:7700';
const PUBLISHER_STATUS_FILE = 'cache_gate31d/publisher_status.json';

const CONFIGURATIONS = [
  { name: 'C1_w2_b2000', workers: 2, batchSize: 2000, startLine: 1710000, limit: 50000 },
  { name: 'C2_w3_b2000', workers: 3, batchSize: 2000, startLine: 1760000, limit: 50000 },
  { name: 'C3_w4_b2000', workers: 4, batchSize: 2000, startLine: 1810000, limit: 50000 },
  { name: 'C4_w3_b4000', workers: 3, batchSize: 4000, startLine: 1860000, limit: 50000 },
  { name: 'C5_w4_b4000', workers: 4, batchSize: 4000, startLine: 1910000, limit: 50000 },
  { name: 'C6_w6_b2000', workers: 6, batchSize: 2000, startLine: 1960000, limit: 50000 }
];

async function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    console.log(`\n>>> EXECUTING: ${cmd} ${args.join(' ')}`);
    const proc = spawn(cmd, args, { stdio: 'inherit', shell: true });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with code ${code}`));
    });
    proc.on('error', reject);
  });
}

import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function waitForPublisherDrain(pool, maxWaitSec = 120) {
  console.log('Waiting for Search Publisher to drain pending outbox...');
  const t0 = performance.now();
  const client = await pool.connect();
  try {
    while ((performance.now() - t0) / 1000 < maxWaitSec) {
      const pendingRes = await client.query(`
        SELECT 1 FROM public.atlas_search_outbox
        WHERE status IN ('PENDING', 'PROCESSING', 'RETRY')
        LIMIT 1
      `);
      if (pendingRes.rows.length === 0) {
        console.log('✅ Search outbox completely drained.');
        break;
      }
      if (fs.existsSync(PUBLISHER_STATUS_FILE)) {
        try {
          const stats = JSON.parse(fs.readFileSync(PUBLISHER_STATUS_FILE, 'utf8'));
          console.log(`[Publisher Status] Published: ${stats.totalDocsPublished} | Rate: ${stats.SEARCH_E2E_DOCS_SEC} docs/sec`);
        } catch (_) {}
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  } finally {
    client.release();
  }
}

async function main() {
  console.log('================================================================');
  console.log('⚡ ATLAS 50K CONCURRENCY MATRIX ORCHESTRATOR');
  console.log('STAGE: atlas_perf_1m30_*');
  console.log('================================================================\n');

  // Verify Meilisearch is alive
  try {
    const healthRes = await fetch(`${MEILI_URL}/health`);
    const health = await healthRes.json();
    if (health.status !== 'available') throw new Error(`Meilisearch health status: ${health.status}`);
    console.log('Meilisearch health verified: available');
  } catch (err) {
    console.error('FATAL: Meilisearch not reachable on port 7700:', err.message);
    process.exit(1);
  }

  const pool = new pg.Pool({ ...parseDbUrl(), max: 3 });
  const results = [];

  for (const cfg of CONFIGURATIONS) {
    console.log(`\n================================================================`);
    console.log(`▶ LAUNCHING MATRIX CONFIGURATION: ${cfg.name}`);
    console.log(`WORKERS: ${cfg.workers} | BATCH: ${cfg.batchSize} | START: ${cfg.startLine} | LIMIT: ${cfg.limit}`);
    console.log(`================================================================\n`);

    const benchArgs = [
      'scripts/run_perf_50k_benchmark.mjs',
      '--workers', String(cfg.workers),
      '--batch-size', String(cfg.batchSize),
      '--start-line', String(cfg.startLine),
      '--limit', String(cfg.limit),
      '--config-name', cfg.name
    ];

    const t0 = performance.now();
    await runCommand('node', benchArgs);
    const benchWallSec = (performance.now() - t0) / 1000;

    await waitForPublisherDrain(pool, 60);

    const reportPath = `reports/atlas/discovery/atlas_perf_1m30_bench_${cfg.name.toLowerCase()}.json`;
    if (fs.existsSync(reportPath)) {
      const rep = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      rep.BENCH_WALL_SEC = Number(benchWallSec.toFixed(2));
      results.push(rep);
    } else {
      console.error(`Warning: Report not found at ${reportPath}`);
    }
  }

  // Summary Matrix Report
  console.log('\n================================================================');
  console.log('⚡ ALL 6 MATRIX CONFIGURATIONS COMPLETED');
  console.log('================================================================\n');

  const matrixReport = {
    timestamp: new Date().toISOString(),
    stage: 'atlas_perf_1m30_matrix_50k',
    totalConfigurations: results.length,
    matrix: results.map(r => ({
      CONFIG_NAME: r.CONFIG_NAME,
      WORKERS: r.WORKERS,
      BATCH_SIZE: r.BATCH_SIZE,
      CAND_SEC: r.CAND_SEC,
      NEW_SEC: r.NEW_SEC,
      TOTAL_WALL_TIME_SEC: r.TOTAL_WALL_TIME_SEC,
      BATCH_P50_MS: r.PERCENTILES.TOTAL_BATCH.P50,
      BATCH_P95_MS: r.PERCENTILES.TOTAL_BATCH.P95,
      BATCH_P99_MS: r.PERCENTILES.TOTAL_BATCH.P99,
      COMMIT_P50_MS: r.PERCENTILES.COMMIT.P50,
      COMMIT_P95_MS: r.PERCENTILES.COMMIT.P95,
      SEARCH_E2E_DOCS_SEC: r.SEARCH_E2E_DOCS_SEC,
      BACKPRESSURE_PAUSE_SEC: r.BACKPRESSURE_PAUSE_SEC,
      BACKPRESSURE_PAUSE_PERCENT: r.BACKPRESSURE_PAUSE_PERCENT,
      OUTBOX_PENDING_DELTA: r.OUTBOX_PENDING_DELTA,
      DB_ERRORS: r.DB_ERRORS,
      CONFLICTS: r.CONFLICTS
    }))
  };

  // Find best configuration by NEW_SEC
  const sortedByNewSec = [...matrixReport.matrix].sort((a, b) => b.NEW_SEC - a.NEW_SEC);
  const bestConfig = sortedByNewSec[0];
  matrixReport.BEST_CONFIGURATION = bestConfig;

  const matrixArtifactPath = 'reports/atlas/discovery/atlas_perf_1m30_matrix_50k_v1.json';
  fs.writeFileSync(matrixArtifactPath, JSON.stringify(matrixReport, null, 2));
  console.log(`Saved Matrix Report: ${matrixArtifactPath}`);

  // Bottleneck analysis on the best configuration
  const bestDetailed = results.find(r => r.CONFIG_NAME === bestConfig.CONFIG_NAME);
  const stages = bestDetailed.STAGE_ACCUMULATED_MS;
  const totalStageMs = Object.values(stages).reduce((a, b) => a + b, 0);

  const rankedStages = Object.entries(stages).map(([stage, ms]) => ({
    stage,
    ms,
    percentage: Number(((ms / totalStageMs) * 100).toFixed(2))
  })).sort((a, b) => b.ms - a.ms);

  const bottleneckReport = {
    timestamp: new Date().toISOString(),
    stage: 'atlas_perf_1m30_bottleneck',
    evaluatedConfig: bestConfig.CONFIG_NAME,
    totalAccumulatedStageMs: totalStageMs,
    rankedStages,
    dominantBottleneck: rankedStages[0]
  };

  const bottleneckArtifactPath = 'reports/atlas/discovery/atlas_perf_1m30_bottleneck_v1.json';
  fs.writeFileSync(bottleneckArtifactPath, JSON.stringify(bottleneckReport, null, 2));
  console.log(`Saved Bottleneck Report: ${bottleneckArtifactPath}`);

  console.log('\n================================================================');
  console.log('🏆 MATRIX RESULTS SUMMARY');
  console.log('================================================================');
  console.table(matrixReport.matrix);

  console.log('\n================================================================');
  console.log('🔍 DOMINANT BOTTLENECK ANALYSIS (Best Config: ' + bestConfig.CONFIG_NAME + ')');
  console.log('================================================================');
  console.table(rankedStages);
  console.log(`DOMINANT BOTTLENECK: ${rankedStages[0].stage} (${rankedStages[0].percentage}%)`);
  await pool.end();
}

main().catch(err => {
  console.error('FATAL ORCHESTRATOR ERROR:', err);
  process.exit(1);
});
