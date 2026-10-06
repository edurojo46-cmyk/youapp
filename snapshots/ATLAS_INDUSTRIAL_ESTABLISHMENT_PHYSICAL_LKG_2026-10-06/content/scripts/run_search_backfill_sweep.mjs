/**
 * scripts/run_search_backfill_sweep.mjs
 * 
 * EMPIRICAL SWEEP: SEARCH BACKFILL V4
 * Tests batch sizes [250, 500, 1000, 2000, 5000] for 30s each
 * with in-memory batch deduplication.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import crypto from 'crypto';
import { performance } from 'perf_hooks';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env', 'utf8');
let url = '', serviceKey = '', hmacSecret = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL='))          url        = line.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY='))   serviceKey = line.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  if (line.startsWith('ATLAS_IGJ_IDENTITY_HMAC_KEY=')) hmacSecret = line.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
  db:   { schema: 'public' }
});

const { AtlasPeopleSearchV2 } = await import('../src/lib/search/AtlasPeopleSearchV2.ts');

const SOURCE_PATH = path.resolve('scratch/physical_sources/igj_autoridades_genero_202603.csv');
const REPORT_PATH = path.resolve('reports/atlas/people/atlas_search_backfill_sweep_report.json');
const SEP         = '═'.repeat(70);

function computeHmacId(doc) {
  return crypto.createHmac('sha256', hmacSecret || 'ATLAS_ARGENTINA_CORE_PEP_CANONICAL_2026')
    .update(String(doc).trim())
    .digest('hex');
}

function computeSourceHash(numCorrelativo, doc, nombre) {
  return crypto.createHash('sha256')
    .update(`${numCorrelativo}:${doc}:${nombre.trim().toUpperCase()}`)
    .digest('hex');
}

function formatName(raw) {
  return raw.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}

function percentile(arr, pct) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return Number((sorted[Math.floor(sorted.length * pct)] || sorted[sorted.length - 1]).toFixed(1));
}

// ── Search Probe Worker ───────────────────────────────────────────────────────
function makeSearchWorker() {
  const latencies = [];
  let timeouts = 0;
  let active = true;
  const terms = ['SOCIEDAD', 'GOMEZ', 'SALUD', 'FERNANDEZ', 'PRESIDENTE', 'DIRECTOR', 'GERENTE'];
  let idx = 0;
  let coldStart = 0;

  async function run() {
    while (active) {
      const term = terms[idx++ % terms.length];
      const t0 = performance.now();
      try {
        const res = await AtlasPeopleSearchV2.search({ query: term, limit: 5 });
        const dt  = performance.now() - t0;
        if (latencies.length === 0) coldStart = Number(dt.toFixed(1));
        latencies.push(dt);
        if (res?.error) timeouts++;
      } catch {
        timeouts++;
      }
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  const promise = run();
  return {
    stop: () => { active = false; return promise; },
    stats: () => ({
      probes: latencies.length,
      coldStart,
      timeouts,
      p50: percentile(latencies, 0.50),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
      max: latencies.length ? Number(Math.max(...latencies).toFixed(1)) : 0
    })
  };
}

// ── Single Batch Size Sweep ─────────────────────────────────────────────────
async function testBatchSize(batchSize, startOffsetLines) {
  const TEST_SECONDS = 30;
  const TEST_MS      = TEST_SECONDS * 1000;
  console.log(`\n${SEP}`);
  console.log(`🧪 TESTING BATCH SIZE = ${batchSize} for ${TEST_SECONDS}s`);
  console.log(`${SEP}`);

  const searchWorker = makeSearchWorker();
  const startTime    = performance.now();

  const processedPeople = new Set();
  let totalInserted     = 0;
  let batchCount        = 0;
  let errors            = 0;
  const batchDurations  = [];

  let batchMap    = new Map();
  let lineOffset  = 0;

  const igjRl = readline.createInterface({
    input: fs.createReadStream(SOURCE_PATH, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  for await (const line of igjRl) {
    if ((performance.now() - startTime) >= TEST_MS) break;

    lineOffset++;
    if (lineOffset < startOffsetLines) continue;

    const match = line.match(/^"([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)"/);
    if (!match) continue;

    const [, numCorrelativo, nombre, , docNum, , tipoSoc] = match;
    const cleanDoc = docNum.replace(/\D/g, '');
    if (!cleanDoc || cleanDoc.length < 6 || cleanDoc.length > 9 || !nombre || nombre.trim().length < 3) continue;

    const displayName   = formatName(nombre);
    const orgName       = `Sociedad Correlativo ${numCorrelativo} (${tipoSoc.trim() || 'SOCIEDAD COMERCIAL'})`;
    const roleName      = `AUTORIDAD SOCIETARIA (${tipoSoc.trim() || 'DIRECTORIO'})`;
    const searchNorm    = `${displayName} ${roleName} ${orgName}`.toLowerCase().replace(/\s+/g, ' ').trim();
    const docHmac       = computeHmacId(cleanDoc);
    const atlasPersonId = `atlas_arg_per_${docHmac.slice(0, 16)}`;
    const sourceHash    = computeSourceHash(numCorrelativo, cleanDoc, nombre);
    const discoveryId   = `disc_igj_${sourceHash.slice(0, 24)}`;

    processedPeople.add(atlasPersonId);

    batchMap.set(sourceHash, {
      discovery_id:           discoveryId,
      atlas_person_id:        atlasPersonId,
      display_name:           displayName,
      profession:             'Directivo / Autoridad',
      role:                   roleName,
      organization:           orgName,
      geography_id:           'arg_nacional',
      location_relation_type: 'CORPORATE_AUTHORITY',
      location_evidence:      'Registro Oficial',
      location_source_url:    'https://datos.jus.gob.ar/dataset/igj-autoridades-genero',
      person_source_url:      'https://datos.jus.gob.ar/dataset/igj-autoridades-genero',
      search_text_normalized: searchNorm,
      current_activity_state: 'ACTIVE',
      evidence_strength:      'HIGH',
      source_id:              'IGJ_AUTORIDADES_GENERO_2026',
      source_record_id:       sourceHash,
      social_profiles:        [],
      first_seen_at:          new Date().toISOString(),
      last_seen_at:           new Date().toISOString(),
      source_last_checked_at: new Date().toISOString()
    });

    if (batchMap.size >= batchSize) {
      const currentBatch = Array.from(batchMap.values());
      batchMap.clear();
      const t0B = performance.now();

      const { error } = await supabase
        .from('atlas_people_discovery_candidates')
        .upsert(currentBatch, { onConflict: 'source_id,source_record_id', ignoreDuplicates: false });

      const dtB = performance.now() - t0B;
      batchDurations.push(dtB);

      if (error) {
        errors++;
        console.error(`  [Batch Error]: ${error.message}`);
      } else {
        totalInserted += currentBatch.length;
        batchCount++;
      }
    }
  }

  // Flush remaining
  if (batchMap.size > 0 && (performance.now() - startTime) < TEST_MS) {
    const currentBatch = Array.from(batchMap.values());
    const t0B = performance.now();
    const { error } = await supabase
      .from('atlas_people_discovery_candidates')
      .upsert(currentBatch, { onConflict: 'source_id,source_record_id', ignoreDuplicates: false });
    const dtB = performance.now() - t0B;
    batchDurations.push(dtB);
    if (!error) totalInserted += currentBatch.length;
  }

  await searchWorker.stop();

  const elapsedSec  = (performance.now() - startTime) / 1000;
  const uniqueRate  = Number((processedPeople.size / elapsedSec).toFixed(1));
  const rowRate     = Number((totalInserted / elapsedSec).toFixed(1));
  const sStats      = searchWorker.stats();
  const avgBatchMs  = batchDurations.length ? Number((batchDurations.reduce((a, b) => a + b, 0) / batchDurations.length).toFixed(1)) : 0;

  const result = {
    batch_size: batchSize,
    duration_seconds: Number(elapsedSec.toFixed(1)),
    unique_people_processed: processedPeople.size,
    total_rows_inserted: totalInserted,
    unique_people_per_second: uniqueRate,
    rows_per_second: rowRate,
    batches_completed: batchCount,
    avg_batch_ms: avgBatchMs,
    search_p50_ms: sStats.p50,
    search_p95_ms: sStats.p95,
    search_p99_ms: sStats.p99,
    search_max_ms: sStats.max,
    search_timeouts: sStats.timeouts,
    errors,
    sla_pass: sStats.p99 < 1000 && sStats.timeouts === 0 && errors === 0
  };

  console.log(`\n📊 RESULT FOR BATCH SIZE ${batchSize}:`);
  console.log(`   Unique People/s:   ${uniqueRate.toLocaleString()} people/s (${processedPeople.size} in ${result.duration_seconds}s)`);
  console.log(`   Rows/s:            ${rowRate.toLocaleString()} rows/s (${totalInserted} rows)`);
  console.log(`   Avg Batch Duration:${avgBatchMs}ms (${batchCount} batches)`);
  console.log(`   Search Latency:    P50: ${sStats.p50}ms | P95: ${sStats.p95}ms | P99: ${sStats.p99}ms | Max: ${sStats.max}ms`);
  console.log(`   Search Timeouts:   ${sStats.timeouts}`);
  console.log(`   Errors:            ${errors}`);
  console.log(`   SLA Status:        ${result.sla_pass ? '✅ PASS' : '❌ FAIL'}`);

  return { result, nextOffset: lineOffset };
}

// ── Main Sweep Coordinator ──────────────────────────────────────────────────
async function main() {
  console.log(`\n${SEP}`);
  console.log(`🔬 ATLAS SEARCH BACKFILL V4 — EMPIRICAL BATCH SWEEP`);
  console.log(`   Testing batch sizes [250, 500, 1000, 2000, 5000] for 30s each`);
  console.log(`   Goal: Maximize insertion rate while Search P99 < 1000ms & 0 timeouts`);
  console.log(`${SEP}`);

  const batchSizes = [250, 500, 1000, 2000, 5000];
  const results = [];
  let offset = 0;

  for (const bSize of batchSizes) {
    const { result, nextOffset } = await testBatchSize(bSize, offset);
    results.push(result);
    offset = nextOffset;

    console.log('\n⏳ Cooldown 5s before next batch test...');
    await new Promise(r => setTimeout(r, 5000));
  }

  // Find optimal batch
  const passingBatches = results.filter(r => r.sla_pass);
  const optimal = passingBatches.length > 0
    ? passingBatches.reduce((best, curr) => curr.rows_per_second > best.rows_per_second ? curr : best, passingBatches[0])
    : results.reduce((best, curr) => curr.rows_per_second > best.rows_per_second ? curr : best, results[0]);

  const report = {
    test: 'ATLAS_SEARCH_BACKFILL_SWEEP',
    timestamp: new Date().toISOString(),
    optimal_batch_size: optimal.batch_size,
    optimal_rows_per_second: optimal.rows_per_second,
    results
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

  console.log(`\n${SEP}`);
  console.log(`🏁 BATCH SWEEP SUMMARY & RECOMMENDATION:`);
  for (const r of results) {
    console.log(`   Batch ${r.batch_size.toString().padStart(5)}: ${r.rows_per_second.toLocaleString().padStart(8)} rows/s (${r.unique_people_per_second.toLocaleString().padStart(8)} unique/s) | Batch: ${r.avg_batch_ms.toFixed(0).padStart(5)}ms | Search P99: ${r.search_p99_ms.toFixed(1).padStart(7)}ms | SLA: ${r.sla_pass ? 'PASS' : 'FAIL'}`);
  }
  console.log(`\n🏆 OPTIMAL BATCH SIZE: ${optimal.batch_size} (${optimal.rows_per_second.toLocaleString()} rows/s, Search P99: ${optimal.search_p99_ms}ms)`);
  console.log(`   Report Saved: ${REPORT_PATH}`);
  console.log(SEP);
}

main().catch(err => {
  console.error('Fatal error in backfill sweep:', err);
  process.exit(1);
});
