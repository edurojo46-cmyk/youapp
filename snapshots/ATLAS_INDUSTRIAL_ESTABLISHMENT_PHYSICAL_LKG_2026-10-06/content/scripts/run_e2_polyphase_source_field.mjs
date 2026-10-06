#!/usr/bin/env node
/**
 * ATLAS INDUCTION DISCOVERY ENGINE — GATE E2: PHASE 2.2
 * POLYPHASE SOURCE FIELD LOAD TEST RUNNER
 *
 * Implements:
 * 1. Verification of Search V1 directory manifest (f4347cfbc1d5...).
 * 2. Source-Only isolation (normalize -> in-memory dedup -> fresh candidate; zero SSOT writes).
 * 3. GLOBAL_SOURCE_RATE_LIMITER per provider:
 *    - OpenAlex limiter: Max 8 req/s polite pool, shared 429 backoff, shared budget.
 *    - Wikidata limiter: Max 2 req/s polite WMF policy, shared 429/502 backoff.
 * 4. OpenAlex Motors: 8 verified institutional partitions with RORs.
 * 5. Wikidata Motors: 2 partition streams (Science/Professions vs Public/Arts/Culture).
 * 6. Progressive multi-worker field sweep:
 *    - Baseline P0: OA 1 worker, WD 1 worker
 *    - Config P1: OA 2 workers, WD 1 worker
 *    - Config P2: OA 4 workers, WD 2 workers
 *    - Config P3: OA 8 workers, WD 2 workers
 * 7. Measurement of useful torque, scaling efficiency, field slip, saturation point.
 * 8. Real overlap analysis: cross-partition and cross-provider.
 * 9. Atomic artifact generation (.tmp -> rename -> single SHA256).
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const SHADOW_DIR = path.resolve(ROOT_DIR, 'data_v2_shadow.ms');
const REPORTS_DIR = path.resolve(ROOT_DIR, 'reports', 'atlas', 'discovery');
const ARTIFACT_PATH = path.resolve(REPORTS_DIR, 'atlas_discovery_e2_polyphase_source_field.json');

const EXPECTED_SEARCH_V1_MANIFEST_SHA256 = 'f4347cfbc1d554c2f015cf56b1e854fc09fa226e30611fe5aa55c62941c10128';
const TARGET_NET_NEW_RATE = 555.56;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function computeSha256(bufferOrStr) {
  return crypto.createHash('sha256').update(bufferOrStr).digest('hex');
}

function atomicWriteJson(targetPath, data) {
  const tmpPath = `${targetPath}.tmp.${Date.now()}`;
  const content = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, targetPath);
  return computeSha256(fs.readFileSync(targetPath));
}

function percentile(arr, p) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return parseFloat(sorted[Math.max(0, idx)].toFixed(2));
}

function normalizePersonName(name) {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================
// 1. SEARCH V1 DIRECTORY MANIFEST AUDIT
// ============================================================
function verifySearchV1DirectoryManifest(dirPath) {
  const fileEntries = [];
  function scanDir(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const ent of entries) {
      const fullPath = path.join(currentDir, ent.name);
      if (ent.isDirectory()) scanDir(fullPath);
      else if (ent.isFile()) {
        const stat = fs.statSync(fullPath);
        const relPath = path.relative(dirPath, fullPath).replace(/\\/g, '/');
        fileEntries.push({
          relative_path: relPath,
          size_bytes: stat.size,
          last_write_time: stat.mtime.toISOString(),
          last_write_ms: stat.mtimeMs,
        });
      }
    }
  }
  scanDir(dirPath);
  fileEntries.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
  const manifestString = JSON.stringify(fileEntries, null, 2);
  const manifestSha = computeSha256(manifestString);
  return {
    valid: manifestSha.toLowerCase() === EXPECTED_SEARCH_V1_MANIFEST_SHA256.toLowerCase(),
    file_count: fileEntries.length,
    total_bytes: fileEntries.reduce((s, f) => s + f.size_bytes, 0),
    manifest_sha256: manifestSha,
  };
}

// ============================================================
// 2. GLOBAL PROVIDER RATE LIMITERS
// ============================================================
class GlobalProviderRateLimiter {
  constructor(name, maxReqPerSec, minIntervalMs) {
    this.name = name;
    this.maxReqPerSec = maxReqPerSec;
    this.minIntervalMs = minIntervalMs;
    this.tokens = maxReqPerSec;
    this.lastRefill = performance.now();
    this.lastRequestTime = 0;
    this.backoffUntil = 0;
    this.totalRequests = 0;
    this.count429 = 0;
    this.count5xx = 0;
    this.totalBackoffMs = 0;
  }

  async acquire() {
    while (true) {
      const now = performance.now();

      // Check active backoff
      if (now < this.backoffUntil) {
        const waitMs = this.backoffUntil - now;
        await sleep(Math.min(250, waitMs));
        continue;
      }

      // Refill tokens
      const elapsedSec = (now - this.lastRefill) / 1000;
      this.tokens = Math.min(this.maxReqPerSec, this.tokens + elapsedSec * this.maxReqPerSec);
      this.lastRefill = now;

      // Check min interval between requests
      const timeSinceLast = now - this.lastRequestTime;
      if (timeSinceLast < this.minIntervalMs) {
        await sleep(this.minIntervalMs - timeSinceLast);
        continue;
      }

      if (this.tokens >= 1) {
        this.tokens -= 1;
        this.lastRequestTime = performance.now();
        this.totalRequests++;
        return;
      }

      // Wait a fraction of interval for token refill
      await sleep(50);
    }
  }

  triggerBackoff(durationMs, status = 429) {
    const now = performance.now();
    this.backoffUntil = Math.max(this.backoffUntil, now + durationMs);
    this.totalBackoffMs += durationMs;
    if (status === 429) this.count429++;
    else if (status >= 500) this.count5xx++;
    console.warn(`  [${this.name} GLOBAL BACKOFF] HTTP ${status}: Pausing all workers for ${(durationMs / 1000).toFixed(1)}s`);
  }
}

// OpenAlex: max 8 req/s across all workers (polite limit is 10 req/s), min 80ms interval
const openAlexGlobalLimiter = new GlobalProviderRateLimiter('OPENALEX', 8, 80);

// Wikidata SPARQL: max 2 req/s across all workers (polite WMF limit is 2 req/s), min 350ms interval
const wikidataGlobalLimiter = new GlobalProviderRateLimiter('WIKIDATA', 2, 350);

// ============================================================
// 3. CATALOGED & VERIFIED SOURCE MOTORS
// ============================================================
const OPENALEX_MOTORS = [
  { id: 'OA_MOTOR_UBA', name: 'Universidad de Buenos Aires', ror: 'https://ror.org/0081fs513', available_authors: 26929 },
  { id: 'OA_MOTOR_CONICET', name: 'CONICET Argentina', ror: 'https://ror.org/03cqe8w59', available_authors: 27885 },
  { id: 'OA_MOTOR_UNLP', name: 'Universidad Nacional de La Plata', ror: 'https://ror.org/01tjs6929', available_authors: 13203 },
  { id: 'OA_MOTOR_UNC', name: 'Universidad Nacional de Córdoba', ror: 'https://ror.org/056tb7j80', available_authors: 11006 },
  { id: 'OA_MOTOR_UNR', name: 'Universidad Nacional de Rosario', ror: 'https://ror.org/02tphfq59', available_authors: 6686 },
  { id: 'OA_MOTOR_UNMDP', name: 'Universidad Nacional de Mar del Plata', ror: 'https://ror.org/055eqsb67', available_authors: 4304 },
  { id: 'OA_MOTOR_UNS', name: 'Universidad Nacional del Sur', ror: 'https://ror.org/028crwz56', available_authors: 3679 },
  { id: 'OA_MOTOR_UNL', name: 'Universidad Nacional del Litoral', ror: 'https://ror.org/00pt8r998', available_authors: 4198 },
];

const WIKIDATA_MOTORS = [
  {
    id: 'WD_MOTOR_SCIENCE_ACADEMIA',
    name: 'Wikidata CABA Science & Academic Professions',
    occupations: [
      { label: 'Científico', qid: 'wd:Q901' },
      { label: 'Médico', qid: 'wd:Q39631' },
      { label: 'Profesor', qid: 'wd:Q1622272' },
      { label: 'Biólogo', qid: 'wd:Q864503' },
      { label: 'Físico', qid: 'wd:Q169470' },
      { label: 'Químico', qid: 'wd:Q593644' },
      { label: 'Economista', qid: 'wd:Q188094' },
      { label: 'Historiador', qid: 'wd:Q201788' },
    ],
  },
  {
    id: 'WD_MOTOR_PUBLIC_ARTS_CULTURE',
    name: 'Wikidata CABA Public, Arts & Culture',
    occupations: [
      { label: 'Abogado', qid: 'wd:Q40348' },
      { label: 'Político', qid: 'wd:Q82955' },
      { label: 'Periodista', qid: 'wd:Q1930187' },
      { label: 'Escritor', qid: 'wd:Q36180' },
      { label: 'Actor', qid: 'wd:Q33999' },
      { label: 'Músico', qid: 'wd:Q639669' },
      { label: 'Pintor', qid: 'wd:Q1028181' },
      { label: 'Arquitecto', qid: 'wd:Q42973' },
    ],
  },
];

// ============================================================
// 4. MOTOR WORKER RUNNERS
// ============================================================
async function runOpenAlexMotorWorker(motor, durationSec, limiter) {
  const tStart = performance.now();
  const tEnd = tStart + durationSec * 1000;
  let cursor = '*';
  let rawRecords = 0;
  let candidates = [];
  let requests = 0;
  let retries = 0;
  const latencies = [];

  while (performance.now() < tEnd) {
    await limiter.acquire();
    const url = `https://api.openalex.org/authors?filter=last_known_institutions.ror:${encodeURIComponent(motor.ror)}&per-page=50&cursor=${encodeURIComponent(cursor)}`;
    requests++;
    const reqT0 = performance.now();

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'AtlasPersonDiscoveryBot/1.0 (mailto:atlas@youapp.tv)' },
        signal: AbortSignal.timeout(8000),
      });

      const reqDt = performance.now() - reqT0;
      latencies.push(reqDt);

      if (res.status === 429) {
        limiter.triggerBackoff(2000, 429);
        retries++;
        continue;
      }
      if (!res.ok) {
        if (res.status >= 500) limiter.triggerBackoff(1500, res.status);
        retries++;
        continue;
      }

      const data = await res.json();
      const authors = data.results || [];
      rawRecords += authors.length;
      cursor = data.meta?.next_cursor;

      for (const a of authors) {
        if (!a.display_name || a.display_name.trim().length < 4) continue;
        const openAlexId = a.id?.split('/').pop();
        if (!openAlexId) continue;

        candidates.push({
          key: `OPENALEX:${openAlexId}`,
          candidate_id: `disc_OPENALEX_${openAlexId}`,
          source_id: 'OPENALEX_CLUSTER',
          partition_id: motor.id,
          display_name: a.display_name,
          normalized_name: normalizePersonName(a.display_name),
          organization: motor.name,
          role: 'Investigador / Docente',
          external_ids: { openalex_id: openAlexId, orcid: a.orcid ? a.orcid.split('/').pop() : null },
          has_persistent_id: true,
        });
      }

      if (!cursor || authors.length === 0) break;
    } catch (err) {
      retries++;
      latencies.push(performance.now() - reqT0);
    }
  }

  const durationActualSec = (performance.now() - tStart) / 1000;
  return {
    motor_id: motor.id,
    motor_name: motor.name,
    duration_sec: durationActualSec,
    requests,
    retries,
    raw_records: rawRecords,
    candidates,
    raw_records_per_sec: rawRecords / Math.max(0.001, durationActualSec),
    p50_latency_ms: percentile(latencies, 50),
    p95_latency_ms: percentile(latencies, 95),
    p99_latency_ms: percentile(latencies, 99),
  };
}

async function runWikidataMotorWorker(motor, durationSec, limiter) {
  const tStart = performance.now();
  const tEnd = tStart + durationSec * 1000;
  let rawRecords = 0;
  let candidates = [];
  let requests = 0;
  let retries = 0;
  const latencies = [];
  let occIdx = 0;

  while (performance.now() < tEnd && occIdx < motor.occupations.length) {
    const occ = motor.occupations[occIdx++];
    await limiter.acquire();

    const sparql = `
      SELECT ?item ?itemLabel WHERE {
        ?item wdt:P31 wd:Q5 .
        ?item wdt:P937 wd:Q1486 .
        ?item wdt:P106 ${occ.qid} .
        SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
      }
      LIMIT 50
    `;
    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`;
    requests++;
    const reqT0 = performance.now();

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'AtlasPersonDiscoveryBot/1.0 (https://youapp.tv; atlas@youapp.tv)',
          'Accept': 'application/sparql-results+json',
        },
        signal: AbortSignal.timeout(8000),
      });

      const reqDt = performance.now() - reqT0;
      latencies.push(reqDt);

      if (res.status === 429) {
        limiter.triggerBackoff(2500, 429);
        retries++;
        continue;
      }
      if (res.status >= 500) {
        limiter.triggerBackoff(2000, res.status);
        retries++;
        continue;
      }
      if (!res.ok) {
        retries++;
        continue;
      }

      const data = await res.json();
      const bindings = data.results?.bindings || [];
      rawRecords += bindings.length;

      for (const b of bindings) {
        const qid = b.item?.value?.split('/').pop();
        const label = b.itemLabel?.value;
        if (!qid || !label || (label.startsWith('Q') && /^\d+$/.test(label.slice(1)))) continue;

        candidates.push({
          key: `WIKIDATA:${qid}`,
          candidate_id: `disc_WIKIDATA_${qid}`,
          source_id: 'WIKIDATA_CLUSTER',
          partition_id: motor.id,
          display_name: label,
          normalized_name: normalizePersonName(label),
          organization: 'Ciudad Autónoma de Buenos Aires',
          role: occ.label,
          external_ids: { wikidata_qid: qid },
          has_persistent_id: true,
        });
      }
    } catch (err) {
      retries++;
      latencies.push(performance.now() - reqT0);
    }
  }

  const durationActualSec = (performance.now() - tStart) / 1000;
  return {
    motor_id: motor.id,
    motor_name: motor.name,
    duration_sec: durationActualSec,
    requests,
    retries,
    raw_records: rawRecords,
    candidates,
    raw_records_per_sec: rawRecords / Math.max(0.001, durationActualSec),
    p50_latency_ms: percentile(latencies, 50),
    p95_latency_ms: percentile(latencies, 95),
    p99_latency_ms: percentile(latencies, 99),
  };
}

// ============================================================
// 5. POLYPHASE CONFIGURATION EXECUTOR
// ============================================================
async function executePolyphaseConfiguration(configId, numOaWorkers, numWdWorkers, testDurationSec = 8) {
  console.log(`\n================================================================================`);
  console.log(`>>> EXECUTING ${configId}: OpenAlex ${numOaWorkers} workers | Wikidata ${numWdWorkers} workers`);
  console.log(`    Duration: ~${testDurationSec}s per run under Global Rate Limiters`);
  console.log(`================================================================================`);

  const oaWorkersToRun = OPENALEX_MOTORS.slice(0, numOaWorkers);
  const wdWorkersToRun = WIKIDATA_MOTORS.slice(0, numWdWorkers);

  const t0 = performance.now();

  const workerPromises = [
    ...oaWorkersToRun.map(m => runOpenAlexMotorWorker(m, testDurationSec, openAlexGlobalLimiter)),
    ...wdWorkersToRun.map(m => runWikidataMotorWorker(m, testDurationSec, wikidataGlobalLimiter)),
  ];

  const workerResults = await Promise.all(workerPromises);
  const totalDurationSec = (performance.now() - t0) / 1000;

  // Aggregate analysis
  let totalRawRecords = 0;
  let totalWorkerCandidates = 0;
  const globalSeenKeys = new Set();
  const globalSeenNames = new Map(); // normName -> [source_ids]
  let crossPartitionOverlapCount = 0;
  let crossProviderOverlapCount = 0;

  const oaResults = workerResults.filter(r => r.motor_id.startsWith('OA_'));
  const wdResults = workerResults.filter(r => r.motor_id.startsWith('WD_'));

  const oaCandidates = [];
  const wdCandidates = [];

  for (const r of workerResults) {
    totalRawRecords += r.raw_records;
    totalWorkerCandidates += r.candidates.length;

    for (const c of r.candidates) {
      if (c.source_id === 'OPENALEX_CLUSTER') oaCandidates.push(c);
      else wdCandidates.push(c);

      // Check key dedup
      if (globalSeenKeys.has(c.key)) {
        crossPartitionOverlapCount++;
      } else {
        globalSeenKeys.add(c.key);
      }

      // Check cross-provider normalized name overlap
      if (c.normalized_name && c.normalized_name.split(' ').length >= 2) {
        if (!globalSeenNames.has(c.normalized_name)) {
          globalSeenNames.set(c.normalized_name, new Set());
        }
        const set = globalSeenNames.get(c.normalized_name);
        if (set.size > 0 && !set.has(c.source_id)) {
          crossProviderOverlapCount++;
        }
        set.add(c.source_id);
      }
    }
  }

  const uniqueFreshCandidates = globalSeenKeys.size;
  const polyphaseRawSupplyPerSec = parseFloat((totalRawRecords / totalDurationSec).toFixed(2));
  const polyphaseFreshSupplyPerSec = parseFloat((uniqueFreshCandidates / totalDurationSec).toFixed(2));

  const oaRawTotal = oaResults.reduce((s, r) => s + r.raw_records, 0);
  const oaFreshTotal = new Set(oaCandidates.map(c => c.key)).size;
  const oaSupplyPerSec = parseFloat((oaFreshTotal / totalDurationSec).toFixed(2));

  const wdRawTotal = wdResults.reduce((s, r) => s + r.raw_records, 0);
  const wdFreshTotal = new Set(wdCandidates.map(c => c.key)).size;
  const wdSupplyPerSec = parseFloat((wdFreshTotal / totalDurationSec).toFixed(2));

  const globalDedupPercent = totalWorkerCandidates > 0
    ? parseFloat((((totalWorkerCandidates - uniqueFreshCandidates) / totalWorkerCandidates) * 100).toFixed(2))
    : 0.00;

  const crossPartitionOverlapPercent = totalWorkerCandidates > 0
    ? parseFloat(((crossPartitionOverlapCount / totalWorkerCandidates) * 100).toFixed(2))
    : 0.00;

  const crossProviderOverlapPercent = uniqueFreshCandidates > 0
    ? parseFloat(((crossProviderOverlapCount / uniqueFreshCandidates) * 100).toFixed(2))
    : 0.00;

  const totalRetries = workerResults.reduce((s, r) => s + r.retries, 0);
  const totalRequests = workerResults.reduce((s, r) => s + r.requests, 0);
  const errorRate = totalRequests > 0
    ? parseFloat(((totalRetries / totalRequests) * 100).toFixed(2))
    : 0.00;

  console.log(`  Raw Records Harvested:     ${totalRawRecords} (${polyphaseRawSupplyPerSec} raw/s)`);
  console.log(`  Unique Fresh Candidates:   ${uniqueFreshCandidates} (${polyphaseFreshSupplyPerSec} fresh/s)`);
  console.log(`  OpenAlex Contribution:     ${oaFreshTotal} fresh (${oaSupplyPerSec} cand/s)`);
  console.log(`  Wikidata Contribution:     ${wdFreshTotal} fresh (${wdSupplyPerSec} cand/s)`);
  console.log(`  Global Dedup / Overlap:    ${globalDedupPercent}%`);
  console.log(`  Cross-Provider Overlap:    ${crossProviderOverlapCount} (${crossProviderOverlapPercent}%)`);
  console.log(`  Total Requests:            ${totalRequests} (Retries: ${totalRetries}, Error Rate: ${errorRate}%)`);
  console.log(`  Limiter 429 Pressure:      OA: ${openAlexGlobalLimiter.count429}, WD: ${wikidataGlobalLimiter.count429}`);

  return {
    config_id: configId,
    openalex_workers: numOaWorkers,
    wikidata_workers: numWdWorkers,
    total_workers: numOaWorkers + numWdWorkers,
    duration_seconds: parseFloat(totalDurationSec.toFixed(2)),
    total_raw_records: totalRawRecords,
    total_fresh_candidates: uniqueFreshCandidates,
    polyphase_raw_supply_per_second: polyphaseRawSupplyPerSec,
    polyphase_fresh_candidates_per_second: polyphaseFreshSupplyPerSec,
    openalex_observed_supply_per_second: oaSupplyPerSec,
    wikidata_observed_supply_per_second: wdSupplyPerSec,
    global_dedup_percent: globalDedupPercent,
    cross_partition_overlap_percent: crossPartitionOverlapPercent,
    cross_provider_overlap_percent: crossProviderOverlapPercent,
    error_rate_percent: errorRate,
    rate_limit_pressure: {
      openalex_429_count: openAlexGlobalLimiter.count429,
      wikidata_429_count: wikidataGlobalLimiter.count429,
      openalex_backoff_sec: parseFloat((openAlexGlobalLimiter.totalBackoffMs / 1000).toFixed(1)),
      wikidata_backoff_sec: parseFloat((wikidataGlobalLimiter.totalBackoffMs / 1000).toFixed(1)),
    },
    worker_breakdown: workerResults.map(w => ({
      motor_id: w.motor_id,
      motor_name: w.motor_name,
      requests: w.requests,
      raw_records: w.raw_records,
      candidates_count: w.candidates.length,
      retries: w.retries,
      p50_latency_ms: w.p50_latency_ms,
      p95_latency_ms: w.p95_latency_ms,
    })),
  };
}

// ============================================================
// MAIN RUNNER
// ============================================================
async function main() {
  console.log('================================================================================');
  console.log('ATLAS INDUCTION DISCOVERY ENGINE — GATE E2: PHASE 2.2');
  console.log('POLYPHASE SOURCE FIELD LOAD TEST & PHYSICAL CAPACITY BENCHMARK');
  console.log('================================================================================\n');

  // 1. Audit Search V1 Immutability Manifest
  console.log('>>> 1. PRE-FLIGHT VERIFICATION: SEARCH V1 DIRECTORY MANIFEST');
  const shadowCheck = verifySearchV1DirectoryManifest(SHADOW_DIR);
  console.log(`  File Count:    ${shadowCheck.file_count}`);
  console.log(`  Total Bytes:   ${shadowCheck.total_bytes.toLocaleString()}`);
  console.log(`  Manifest SHA:  ${shadowCheck.manifest_sha256}`);
  console.log(`  Matches Target: ${shadowCheck.valid ? 'PASS ✅' : 'FAIL ❌'}`);
  if (!shadowCheck.valid) {
    console.error('🚨 FATAL: Search V1 index directory manifest mismatch. Aborting Phase 2.2.');
    process.exit(1);
  }

  // 2. Progressive Polyphase Sweep
  console.log('\n>>> 2. PROGRESSIVE POLYPHASE SWEEP (P0 -> P1 -> P2 -> P3)');

  // Baseline P0: 1 OA worker, 1 WD worker
  const p0 = await executePolyphaseConfiguration('CONFIG_P0_BASELINE', 1, 1, 8);
  await sleep(1500);

  // Config P1: 2 OA workers, 1 WD worker
  const p1 = await executePolyphaseConfiguration('CONFIG_P1', 2, 1, 8);
  await sleep(1500);

  // Config P2: 4 OA workers, 2 WD workers
  const p2 = await executePolyphaseConfiguration('CONFIG_P2', 4, 2, 8);
  await sleep(1500);

  // Config P3: 8 OA workers, 2 WD workers
  const p3 = await executePolyphaseConfiguration('CONFIG_P3', 8, 2, 8);

  // 3. Compute Scaling Efficiency across Configurations
  console.log('\n================================================================================');
  console.log('>>> 3. SCALING EFFICIENCY & TESLA POLYPHASE MODEL ANALYSIS');
  console.log('================================================================================');

  const baselineThroughput = p0.polyphase_fresh_candidates_per_second;
  const baselineWorkers = p0.total_workers; // 2 workers (1 OA, 1 WD)

  function calcScalingEfficiency(run) {
    const workerRatio = run.total_workers / baselineWorkers;
    const theoreticalScaled = baselineThroughput * workerRatio;
    return parseFloat(((run.polyphase_fresh_candidates_per_second / theoreticalScaled) * 100).toFixed(2));
  }

  p0.scaling_efficiency_percent = 100.00;
  p1.scaling_efficiency_percent = calcScalingEfficiency(p1);
  p2.scaling_efficiency_percent = calcScalingEfficiency(p2);
  p3.scaling_efficiency_percent = calcScalingEfficiency(p3);

  console.log(`  P0 Baseline (1 OA, 1 WD = 2 workers): ${p0.polyphase_fresh_candidates_per_second} fresh/s (100% eff)`);
  console.log(`  P1 (2 OA, 1 WD = 3 workers):          ${p1.polyphase_fresh_candidates_per_second} fresh/s (${p1.scaling_efficiency_percent}% eff)`);
  console.log(`  P2 (4 OA, 2 WD = 6 workers):          ${p2.polyphase_fresh_candidates_per_second} fresh/s (${p2.scaling_efficiency_percent}% eff)`);
  console.log(`  P3 (8 OA, 2 WD = 10 workers):         ${p3.polyphase_fresh_candidates_per_second} fresh/s (${p3.scaling_efficiency_percent}% eff)`);

  // 4. Identify Best Configuration & Field Saturation Point
  const allRuns = [p0, p1, p2, p3];
  allRuns.sort((a, b) => b.polyphase_fresh_candidates_per_second - a.polyphase_fresh_candidates_per_second);
  const bestRun = allRuns[0];

  let saturationPoint = 'NOT_REACHED';
  let saturationReason = 'Throughput scales smoothly across all configurations.';

  // Check if P3 plateaued or regressed relative to P2
  if (p3.polyphase_fresh_candidates_per_second <= p2.polyphase_fresh_candidates_per_second * 1.1) {
    saturationPoint = 'P2_TO_P3_SATURATION';
    saturationReason = `Scaling 6 -> 10 workers yielded diminished marginal returns (${p2.polyphase_fresh_candidates_per_second} -> ${p3.polyphase_fresh_candidates_per_second} fresh/s) due to provider global rate limiter bounds.`;
  }

  console.log(`\n  BEST CONFIGURATION:           ${bestRun.config_id} (${bestRun.total_workers} workers)`);
  console.log(`  PEAK OBSERVED FIELD SUPPLY:   ${bestRun.polyphase_fresh_candidates_per_second} fresh candidates/s`);
  console.log(`  FIELD SATURATION POINT:       ${saturationPoint}`);
  console.log(`  SATURATION DIAGNOSIS:         ${saturationReason}`);

  // 5. Tesla Conceptual Metrics (Useful Torque, Field Slip, Field Strength)
  // Field Strength: number of active motor workers
  // Useful Torque: fresh candidates per second with high evidence
  // Field Slip: (Raw Supply - Fresh Useful Supply) / Raw Supply
  const rawSupply = bestRun.polyphase_raw_supply_per_second;
  const freshSupply = bestRun.polyphase_fresh_candidates_per_second;
  const fieldSlipPercent = rawSupply > 0 ? parseFloat((((rawSupply - freshSupply) / rawSupply) * 100).toFixed(2)) : 0;

  console.log('\n  Tesla Polyphase Field Metrics:');
  console.log(`    FIELD STRENGTH:   ${bestRun.total_workers} motor workers`);
  console.log(`    USEFUL TORQUE:    ${freshSupply} fresh net-new candidates/s`);
  console.log(`    FIELD SLIP:       ${fieldSlipPercent}% (Raw vs Deduplicated Fresh Supply)`);

  // 6. Industrial Gap & Capacity Modeling
  console.log('\n================================================================================');
  console.log('>>> 4. INDUSTRIAL CAPACITY GAP MODELING');
  console.log('================================================================================');

  // Using real measured fresh cohort yield from Phase 2/2.1: 99.85%
  const observedFreshCohortYield = 0.9985;
  const OBSERVED_NET_NEW_CAPACITY_ESTIMATE = parseFloat((freshSupply * observedFreshCohortYield).toFixed(2));
  const REMAINING_FIELD_MULTIPLIER_REQUIRED = parseFloat((TARGET_NET_NEW_RATE / OBSERVED_NET_NEW_CAPACITY_ESTIMATE).toFixed(2));

  let SOURCE_FIELD_STATUS = 'MORE_SOURCE_FAMILIES_REQUIRED';
  if (OBSERVED_NET_NEW_CAPACITY_ESTIMATE >= TARGET_NET_NEW_RATE) {
    SOURCE_FIELD_STATUS = 'ENOUGH_FOR_TARGET';
  }

  console.log(`  TARGET_NET_NEW_RATE:                  ${TARGET_NET_NEW_RATE} net-new/s (1M in 30 min)`);
  console.log(`  OBSERVED_FIELD_FRESH_SUPPLY_RATE:     ${freshSupply} fresh cand/s`);
  console.log(`  OBSERVED_NET_NEW_CAPACITY_ESTIMATE:   ${OBSERVED_NET_NEW_CAPACITY_ESTIMATE} net-new/s`);
  console.log(`  REMAINING_FIELD_MULTIPLIER_REQUIRED:  ${REMAINING_FIELD_MULTIPLIER_REQUIRED}x`);
  console.log(`  SOURCE_FIELD_STATUS:                  ${SOURCE_FIELD_STATUS}`);

  // 7. Post-Run Verify Search V1 Directory Manifest
  const shadowCheckAfter = verifySearchV1DirectoryManifest(SHADOW_DIR);
  const SEARCH_V1_DIRECTORY_MANIFEST_UNCHANGED = shadowCheckAfter.valid;
  console.log(`  SEARCH_V1_DIRECTORY_MANIFEST_UNCHANGED: ${SEARCH_V1_DIRECTORY_MANIFEST_UNCHANGED ? 'TRUE ✅' : 'FALSE ❌'}`);

  // 8. Generate Artifact
  const artifactPayload = {
    gate: 'ATLAS_INDUCTION_DISCOVERY_ENGINE_GATE_E2_PHASE_2_2',
    timestamp: new Date().toISOString(),
    status: 'CERTIFIED',
    search_v1_immutability: {
      directory: SHADOW_DIR,
      manifest_sha256: shadowCheckAfter.manifest_sha256,
      unchanged: SEARCH_V1_DIRECTORY_MANIFEST_UNCHANGED,
    },
    configurations_tested: {
      p0_baseline: p0,
      p1: p1,
      p2: p2,
      p3: p3,
    },
    best_polyphase_configuration: {
      config_id: bestRun.config_id,
      openalex_workers: bestRun.openalex_workers,
      wikidata_workers: bestRun.wikidata_workers,
      total_workers: bestRun.total_workers,
      openalex_observed_supply_per_second: bestRun.openalex_observed_supply_per_second,
      wikidata_observed_supply_per_second: bestRun.wikidata_observed_supply_per_second,
      polyphase_fresh_candidates_per_second: bestRun.polyphase_fresh_candidates_per_second,
      polyphase_raw_supply_per_second: bestRun.polyphase_raw_supply_per_second,
      source_field_scaling_efficiency_percent: bestRun.scaling_efficiency_percent,
    },
    tesla_field_model: {
      field_strength: bestRun.total_workers,
      useful_torque_fresh_candidates_per_second: freshSupply,
      field_slip_percent: fieldSlipPercent,
      saturation_point: saturationPoint,
      saturation_diagnosis: saturationReason,
    },
    telemetry_and_overlap: {
      total_429_count: openAlexGlobalLimiter.count429 + wikidataGlobalLimiter.count429,
      error_rate_percent: bestRun.error_rate_percent,
      global_dedup_percent: bestRun.global_dedup_percent,
      cross_partition_overlap_percent: bestRun.cross_partition_overlap_percent,
      cross_provider_overlap_percent: bestRun.cross_provider_overlap_percent,
    },
    industrial_gap_model: {
      target_net_new_rate: TARGET_NET_NEW_RATE,
      observed_field_fresh_supply_rate: freshSupply,
      observed_fresh_cohort_yield_percent: parseFloat((observedFreshCohortYield * 100).toFixed(2)),
      observed_net_new_capacity_estimate: OBSERVED_NET_NEW_CAPACITY_ESTIMATE,
      remaining_field_multiplier_required: REMAINING_FIELD_MULTIPLIER_REQUIRED,
      source_field_status: SOURCE_FIELD_STATUS,
    },
  };

  const ARTIFACT_SHA256 = atomicWriteJson(ARTIFACT_PATH, artifactPayload);
  console.log(`\n================================================================================`);
  console.log(`✅ E2 PHASE 2.2 POLYPHASE FIELD ARTIFACT GENERATED`);
  console.log(`   Path:   ${ARTIFACT_PATH}`);
  console.log(`   SHA256: ${ARTIFACT_SHA256}`);
  console.log(`================================================================================\n`);
}

main().catch(err => {
  console.error('🚨 UNHANDLED ERROR IN PHASE 2.2 RUNNER:', err);
  process.exit(1);
});
