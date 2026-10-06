import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env', 'utf8');
let url = '', key = '', hmacSecret = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/["']/g, '');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = line.split('=')[1].trim().replace(/["']/g, '');
  if (line.startsWith('ATLAS_IGJ_IDENTITY_HMAC_KEY=')) hmacSecret = line.split('=')[1].trim().replace(/["']/g, '');
}

if (!hmacSecret) throw new Error('ATLAS_IGJ_IDENTITY_HMAC_KEY is required');
const supabase = createClient(url, key, { auth: { persistSession: false } });

// Search engine import
const { AtlasPeopleSearchV2 } = await import('../src/lib/search/AtlasPeopleSearchV2.ts');

function formatName(raw) {
  if (!raw) return 'AUTORIDAD SOCIETARIA';
  return raw.trim().replace(/\s+/g, ' ');
}

async function runPreflight(options = {}) {
  const DURATION_SECONDS = options.durationSec || 60;
  const STAGE_BLOCK_SIZE = options.stageBlockSize || 5000;
  const runId = `preflight_${Date.now()}`;

  console.log('========================================================================');
  console.log('🧪 ATLAS PEOPLE — PRE-FLIGHT CAPACITY BENCHMARK (60-90s STRESS TEST)');
  console.log(`TARGET:   SUSTAINED >= 1,300 UNIQUE PEOPLE/SEC | SEARCH P99 < 1000ms | TIMEOUTS = 0`);
  console.log(`BLOCK:    ${STAGE_BLOCK_SIZE.toLocaleString()} rows per bulk RPC | DURATION: ${DURATION_SECONDS}s`);
  console.log('========================================================================\n');

  // Search probes worker
  let searchActive = true;
  const searchLatencies = [];
  let timeouts = 0;
  let coldStartLatency = 0;

  async function searchWorker() {
    const terms = ['GOMEZ', 'SOCIEDAD', 'DIRECTOR', 'BUENOS AIRES', 'SALUD', 'FERNANDEZ', 'PRESIDENTE'];
    let idx = 0;
    while (searchActive) {
      const term = terms[idx % terms.length];
      idx++;
      const t0 = performance.now();
      try {
        const res = await AtlasPeopleSearchV2.search({ query: term, limit: 10 });
        const dt = performance.now() - t0;
        if (coldStartLatency === 0) coldStartLatency = Number(dt.toFixed(1));
        searchLatencies.push(dt);
        if (res && res.error) timeouts++;
      } catch (e) {
        timeouts++;
      }
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  const searchPromise = searchWorker();

  // Stream reading from physical IGJ source
  const sourcePath = 'scratch/physical_sources/igj_autoridades_genero_202603.csv';
  const rl = readline.createInterface({
    input: fs.createReadStream(sourcePath, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  const startTime = performance.now();
  const endTime = startTime + (DURATION_SECONDS * 1000);

  const uniquePeopleInPreflight = new Set();
  let totalDiscovered = 0;
  let totalStaged = 0;
  let totalReconciled = 0;
  let stageBuffer = [];

  for await (const line of rl) {
    if (performance.now() >= endTime) break;
    totalDiscovered++;

    const match = line.match(/^"([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)"/);
    if (!match) continue;

    const [_, numCorrelativo, nombre, tipoDoc, docNum, genero, tipoSoc] = match;
    const cleanDoc = docNum.replace(/\D/g, '');
    if (!cleanDoc || cleanDoc.length < 6 || cleanDoc.length > 9 || !nombre || nombre.trim().length < 3) continue;

    const displayName = formatName(nombre);
    const orgName = `Sociedad Correlativo ${numCorrelativo} (${tipoSoc.trim() || 'SOCIEDAD COMERCIAL'})`;
    const roleName = `AUTORIDAD SOCIETARIA (${tipoSoc.trim() || 'DIRECTORIO'})`;
    const searchNormalized = `${displayName} ${roleName} ${orgName}`.toLowerCase().replace(/\s+/g, ' ').trim();

    const docHmac = crypto.createHmac('sha256', hmacSecret).update(`ARG:DNI:${cleanDoc}`).digest('hex');
    const atlasPersonId = `atlas_arg_per_${docHmac.slice(0, 16)}`;
    const sourceRecordHash = crypto.createHash('sha256').update(`IGJ:${numCorrelativo}:${cleanDoc}:${nombre.trim().toUpperCase()}`).digest('hex');

    uniquePeopleInPreflight.add(atlasPersonId);

    stageBuffer.push({
      source_id: 'IGJ_AUTORIDADES_GENERO_2026',
      source_person_id: sourceRecordHash,
      identifier_type: 'NATIONAL_IDENTITY_HMAC',
      identity_hmac: docHmac,
      atlas_person_id: atlasPersonId,
      display_name: displayName,
      role: roleName,
      organization: orgName,
      search_text_normalized: searchNormalized
    });

    if (stageBuffer.length >= STAGE_BLOCK_SIZE) {
      const blockToStage = stageBuffer;
      stageBuffer = [];

      // Deduplicate inside block
      const mapBlock = new Map();
      for (const item of blockToStage) {
        mapBlock.set(`${item.source_id}:${item.source_person_id}`, item);
      }
      const cleanBlock = Array.from(mapBlock.values());

      const tS0 = performance.now();
      const { data: sRes, error: sErr } = await supabase.rpc('atlas_stage_people_bulk_v1', {
        p_run_id: runId,
        p_rows: cleanBlock
      });
      const dtS = performance.now() - tS0;

      if (sErr) {
        console.error('Stage Error:', sErr.message);
      } else {
        totalStaged += cleanBlock.length;
      }

      // Reconcile and commit set-based
      const tR0 = performance.now();
      const { data: rRes, error: rErr } = await supabase.rpc('atlas_reconcile_and_commit_staging_v1', {
        p_run_id: runId
      });
      const dtR = performance.now() - tR0;

      if (rErr) {
        console.error('Reconciliation Error:', rErr.message);
      } else if (rRes) {
        totalReconciled += rRes.staged_total;
      }

      const elapsedCur = (performance.now() - startTime) / 1000;
      const curRate = Math.round(uniquePeopleInPreflight.size / elapsedCur);
      console.log(`[Preflight] +${cleanBlock.length} rows | Total Unique: ${uniquePeopleInPreflight.size.toLocaleString()} | Rate: ${curRate.toLocaleString()} people/s | Stage: ${dtS.toFixed(0)}ms | Reconcile: ${dtR.toFixed(0)}ms`);
    }
  }

  // Flush remaining buffer
  if (stageBuffer.length > 0) {
    const mapBlock = new Map();
    for (const item of stageBuffer) {
      mapBlock.set(`${item.source_id}:${item.source_person_id}`, item);
    }
    const cleanBlock = Array.from(mapBlock.values());

    await supabase.rpc('atlas_stage_people_bulk_v1', { p_run_id: runId, p_rows: cleanBlock });
    await supabase.rpc('atlas_reconcile_and_commit_staging_v1', { p_run_id: runId });
    totalStaged += cleanBlock.length;
  }

  // Stop search probes
  searchActive = false;
  await searchPromise;

  const totalElapsedSec = (performance.now() - startTime) / 1000;
  const uniqueCount = uniquePeopleInPreflight.size;
  const peoplePerSecond = Number((uniqueCount / totalElapsedSec).toFixed(1));

  // Compute search latency metrics
  searchLatencies.sort((a, b) => a - b);
  const p50 = Number((searchLatencies[Math.floor(searchLatencies.length * 0.5)] || 0).toFixed(1));
  const p95 = Number((searchLatencies[Math.floor(searchLatencies.length * 0.95)] || 0).toFixed(1));
  const p99 = Number((searchLatencies[Math.floor(searchLatencies.length * 0.99)] || 0).toFixed(1));

  const passCapacity = peoplePerSecond >= 1300;
  const passSearch = p99 < 1000 && timeouts === 0;
  const preflightPass = passCapacity && passSearch;

  console.log('\n========================================================================');
  console.log(`🏁 PRE-FLIGHT RESULT: ${preflightPass ? 'PASS' : 'FAIL'}`);
  console.log(`  -> Duration:               ${totalElapsedSec.toFixed(1)}s`);
  console.log(`  -> Unique People:          ${uniqueCount.toLocaleString()}`);
  console.log(`  -> Sustained Throughput:   ${peoplePerSecond.toLocaleString()} people/s [Required: >= 1,300] -> ${passCapacity ? 'PASS' : 'FAIL'}`);
  console.log(`  -> Search P99:             ${p99} ms [Required: < 1000ms] -> ${p99 < 1000 ? 'PASS' : 'FAIL'}`);
  console.log(`  -> Search Timeouts:        ${timeouts} [Required: 0] -> ${timeouts === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`  -> Cold-Start Search:      ${coldStartLatency} ms`);
  console.log('========================================================================\n');

  return {
    preflightPass,
    peoplePerSecond,
    p99,
    timeouts,
    uniqueCount
  };
}

runPreflight({ durationSec: 60, stageBlockSize: 5000 }).catch(console.error);
