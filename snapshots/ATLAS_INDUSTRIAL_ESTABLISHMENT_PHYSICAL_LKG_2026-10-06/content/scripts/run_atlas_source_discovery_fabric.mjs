/**
 * ATLAS — INDUSTRIAL SOURCE DISCOVERY FABRIC RUNNER V4
 * Candidate Precision & Probe Signal Gate (Wall-Clock 60s)
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { SourceDiscoveryFabricOrchestrator } from '../src/lib/atlasDiscoveryFabric/SourceDiscoveryFabricOrchestrator.ts';

async function main() {
  console.log('============================================================');
  console.log('ATLAS INDUSTRIAL DISCOVERY — CANDIDATE PRECISION & SIGNAL GATE');
  console.log('============================================================');

  const config = parseDbUrl();
  const pool = new pg.Pool({ ...config, max: 20 });

  try {
    const orchestrator = new SourceDiscoveryFabricOrchestrator(pool, {
      maxPerHostConcurrency: 2,
      probeTimeoutMs: 1500
    });

    const initStats = await orchestrator.initialize();
    console.log(`[Gate] Initialized with ${initStats.knownSources} sources in SSOT, ${initStats.knownEmails} known emails.`);

    console.log('\n[Gate] Launching exact Wall-Clock 60-second Discovery Fabric window...');
    const startTime = Date.now();

    const ticker = setInterval(() => {
      const elapsedSec = Math.round((Date.now() - startTime) / 1000);
      console.log(`[T+${elapsedSec}s] Discovery fabric actively streaming...`);
    }, 10000);

    const result = await orchestrator.runFabricWindow({
      durationSeconds: 60,
      candidateTarget: 100000,
      probeConcurrency: 250,
      canaryConcurrency: 75,
      maxPerHostConcurrency: 2
    });

    clearInterval(ticker);

    const m = result.metrics;
    console.log('\n============================================================');
    console.log('ATLAS INDUSTRIAL CANARY DEPTH EXPANSION BENCHMARK RESULTS');
    console.log('============================================================');
    console.log(`PROBES_PER_SECOND:                     ${m.probesPerSecond}`);
    console.log(`PROBES_COMPLETED_WITHIN_60S:           ${m.probesCompletedWithin60s}`);
    console.log(`ACTUAL_WALL_CLOCK_SECONDS:             ${m.actualWallClockSeconds}s`);
    console.log(`BENCHMARK_TIMING_VALID:                ${m.benchmarkTimingValid}`);
    console.log('------------------------------------------------------------');
    console.log(`DNS_SUCCESS_RATE:                      ${m.dnsSuccessRate}%`);
    console.log(`HTTP_ACCESSIBLE_RATE:                  ${m.httpAccessibleRate}%`);
    console.log(`CONTENT_SAMPLE_RATE:                   ${m.contentSampleRate}%`);
    console.log('------------------------------------------------------------');
    console.log(`PROMISING_CANDIDATES:                  ${m.promisingCandidates}`);
    console.log(`DEPTH_CANARIES_STARTED:                ${m.depthCanariesStarted}`);
    console.log(`DEPTH_CANARIES_COMPLETED:              ${m.depthCanariesCompleted}`);
    console.log(`AVG_PAGES_PER_CANARY:                  ${m.avgPagesPerCanary}`);
    console.log(`P95_CANARY_LATENCY:                    ${m.p95CanaryLatencyMs}ms`);
    console.log('------------------------------------------------------------');
    console.log(`PRODUCTIVE_SOURCES:                    ${m.productiveSources}`);
    console.log(`HIGH_YIELD_WINNERS:                    ${m.highYieldWinners}`);
    console.log(`DEPTH_CANARY_RECALL:                   ${m.depthCanaryRecall}%`);
    console.log('------------------------------------------------------------');
    console.log(`TRUE_NET_NEW_SAMPLE:                   ${m.trueNetNewSampleFound}`);
    console.log(`PHYSICALLY_SUPPORTED_SUPPLY:           ${m.calibratedReachableSupply}`);
    console.log('------------------------------------------------------------');
    console.log(`PRODUCTIVE_ECOSYSTEMS_PER_MINUTE:      ${m.productiveEcosystemsPerMinute}`);
    console.log(`SUPPORTED_SUPPLY_PER_MINUTE:           ${m.supportedSupplyPerMinute}`);
    console.log('------------------------------------------------------------');
    console.log(`PRIMARY_BOTTLENECK:                    ${m.primaryBottleneck}`);
    console.log(`READY_TO_SCALE_PROBING_RATE:           ${m.readyFor100kGate}`);
    console.log(`FINAL_STATUS:                          ${m.finalStatus}`);
    console.log('============================================================');

    // Save JSON report
    const reportDir = path.resolve('reports/atlas/discovery');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    const reportPath = path.join(reportDir, 'DISCOVERY_FABRIC_GATE_REPORT.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      durationSeconds: m.durationSeconds,
      actualWallClockSeconds: m.actualWallClockSeconds,
      benchmarkTimingValid: m.benchmarkTimingValid,
      metrics: m,
      winnersSample: result.winners.slice(0, 30),
      productiveSample: result.productive.slice(0, 30)
    }, null, 2), 'utf-8');

    console.log(`Report successfully written to ${reportPath}`);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('[FATAL] Discovery fabric error:', err);
  process.exit(1);
});
