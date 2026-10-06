/**
 * scripts/run_search_backfill_v4_final_sprint.mjs
 * 
 * FINAL MICRO-SPRINT: Crossing from 999,700 to >= 1,000,000 (300 remaining gap)
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

const SOURCE_PATH     = path.resolve('scratch/physical_sources/igj_autoridades_genero_202603.csv');
const BATCH_SIZE      = 250;
const START_LINE      = 74764;
const TARGET_NET_NEW  = 600; // Will add ~600 distinct IDs, easily crossing the 300 gap to > 1,000,000
const SEP             = '═'.repeat(70);

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

// ── Search Probe Worker with 50-Probe Memory Window ───────────────────────────
function makeSearchWorker() {
  const probeHistory = [];
  let active = true;
  const terms = ['GOMEZ', 'SALUD', 'FERNANDEZ', 'PRESIDENTE', 'GERENTE', 'LOPEZ', 'ARGENTINA', 'CONSTRUCCION'];
  let idx = 0;
  let lastTimeoutTimestamp = 0;

  async function run() {
    while (active) {
      const term = terms[idx++ % terms.length];
      const t0 = performance.now();
      try {
        const res = await AtlasPeopleSearchV2.search({ query: term, limit: 5 });
        const dt  = performance.now() - t0;
        const isTimeout = res?.error ? true : false;
        if (isTimeout) lastTimeoutTimestamp = Date.now();
        probeHistory.push({ latency: dt, timeout: isTimeout, ts: Date.now() });
      } catch {
        lastTimeoutTimestamp = Date.now();
        probeHistory.push({ latency: 10000, timeout: true, ts: Date.now() });
      }
      if (probeHistory.length > 50) probeHistory.shift();
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  const promise = run();
  return {
    stop: () => { active = false; return promise; },
    getThrottleDelay: () => {
      if (probeHistory.length === 0) return 0;
      const recent50 = probeHistory.slice(-50);
      const timeoutsIn50 = recent50.filter(p => p.timeout).length;
      const inCooldown = (Date.now() - lastTimeoutTimestamp) < 60000;

      if (timeoutsIn50 > 0 || inCooldown) return 1000;

      const latencies = recent50.map(p => p.latency);
      const p99 = percentile(latencies, 0.99);

      if (p99 > 900) return 500;
      if (p99 >= 600) return 200;
      return 0;
    },
    stats: () => {
      const latencies = probeHistory.map(p => p.latency);
      const timeouts  = probeHistory.filter(p => p.timeout).length;
      return {
        probes: probeHistory.length,
        timeouts,
        p50: percentile(latencies, 0.50),
        p95: percentile(latencies, 0.95),
        p99: percentile(latencies, 0.99),
        max: latencies.length ? Number(Math.max(...latencies).toFixed(1)) : 0
      };
    }
  };
}

async function upsertWithRetry(batch, maxRetries = 4) {
  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    const t0 = performance.now();
    const { error } = await supabase
      .from('atlas_people_discovery_candidates')
      .upsert(batch, { onConflict: 'source_id,source_record_id', ignoreDuplicates: false });
    
    const dt = performance.now() - t0;
    if (!error) return { ok: true, durationMs: dt, attempt };

    console.warn(`  ⚠️ Upsert attempt ${attempt} failed: ${error.message}. Retrying in ${attempt * 500}ms...`);
    await new Promise(r => setTimeout(r, attempt * 500));
  }
  return { ok: false, durationMs: 0, attempt };
}

async function main() {
  console.log(`\n${SEP}`);
  console.log(`🏁 ATLAS FINAL MICRO-SPRINT: CROSSING 999,700 TO >= 1,000,000`);
  console.log(`   Starting at line: ${START_LINE.toLocaleString()} | Target Net-New IDs: ${TARGET_NET_NEW}`);
  console.log(`${SEP}\n`);

  const searchWorker = makeSearchWorker();
  const startTime    = performance.now();
  let lineOffset     = 0;
  let batchMap       = new Map();
  let totalInserted  = 0;
  let batchCount     = 0;
  let errors         = 0;
  const distinctIdsThisRun = new Set();

  const fileStream = fs.createReadStream(SOURCE_PATH, { encoding: 'utf8', highWaterMark: 64 * 1024 });
  const igjRl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of igjRl) {
    lineOffset++;
    if (lineOffset < START_LINE) continue;

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

    distinctIdsThisRun.add(atlasPersonId);

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

    if (batchMap.size >= BATCH_SIZE) {
      const currentBatch = Array.from(batchMap.values());
      batchMap.clear();

      const throttleDelay = searchWorker.getThrottleDelay();
      if (throttleDelay > 0) {
        await new Promise(r => setTimeout(r, throttleDelay));
      }

      const res = await upsertWithRetry(currentBatch);
      if (res.ok) {
        totalInserted += currentBatch.length;
        batchCount++;
      } else {
        errors++;
      }

      const sStats = searchWorker.stats();
      console.log(
        `[Batch ${batchCount}] Line: ${lineOffset.toLocaleString()} | ` +
        `Rows: ${totalInserted.toLocaleString()} | ` +
        `Distinct IDs in Run: ${distinctIdsThisRun.size.toLocaleString()} / ${TARGET_NET_NEW} | ` +
        `Search P99: ${sStats.p99}ms | Timeouts: ${sStats.timeouts} | Delay: ${throttleDelay}ms`
      );

      if (distinctIdsThisRun.size >= TARGET_NET_NEW) {
        console.log(`\n🎯 TARGET REACHED: ${distinctIdsThisRun.size.toLocaleString()} distinct canonical people published in this micro-sprint. Stopping.`);
        break;
      }
    }
  }

  // Flush remaining if any
  if (batchMap.size > 0 && distinctIdsThisRun.size < TARGET_NET_NEW) {
    const currentBatch = Array.from(batchMap.values());
    const res = await upsertWithRetry(currentBatch);
    if (res.ok) totalInserted += currentBatch.length;
  }

  await searchWorker.stop();
  const totalElapsedSec = (performance.now() - startTime) / 1000;
  const finalStats      = searchWorker.stats();

  console.log(`\n${SEP}`);
  console.log(`🏁 FINAL MICRO-SPRINT COMPLETED IN ${totalElapsedSec.toFixed(1)}s`);
  console.log(`   Rows Inserted: ${totalInserted.toLocaleString()} | Distinct IDs: ${distinctIdsThisRun.size.toLocaleString()}`);
  console.log(`   Search Latency: P50: ${finalStats.p50}ms | P95: ${finalStats.p95}ms | P99: ${finalStats.p99}ms`);
  console.log(`   Search Timeouts: ${finalStats.timeouts}`);
  console.log(`   Errors: ${errors}`);
  console.log(`${SEP}\n`);
}

main().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
