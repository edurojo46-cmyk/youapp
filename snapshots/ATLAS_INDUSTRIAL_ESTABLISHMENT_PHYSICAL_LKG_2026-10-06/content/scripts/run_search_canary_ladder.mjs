import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 4 });

const TEST_QUERIES = [
  'GONZALEZ', 'RODRIGUEZ', 'GARCIA', 'FERNANDEZ', 'LOPEZ', 'MARTINEZ', 'PEREZ', 'GOMEZ',
  'HOSPITAL', 'MINISTERIO', 'UNIVERSIDAD', 'FACULTAD', 'SECRETARIA', 'INSTITUTO', 'GOBIERNO',
  'DIRECTOR', 'PRESIDENTE', 'GERENTE', 'COORDINADOR', 'SUBDIRECTOR', 'JEFE',
  'ABOGADO', 'MEDICO', 'INGENIERO', 'CONTADOR', 'DOCENTE', 'INVESTIGADOR',
  'MARIA', 'JOSE', 'JUAN', 'ANA', 'CARLOS', 'ALEJANDRO', 'LAURA', 'LUCIA',
  'SALUD', 'EDUCACION', 'JUSTICIA', 'SEGURIDAD', 'DESARROLLO', 'ECONOMIA'
];

async function getDbIoStats() {
  const res = await pool.query(`
    SELECT 
      sum(heap_blks_read) as heap_read,
      sum(heap_blks_hit) as heap_hit,
      sum(idx_blks_read) as idx_read,
      sum(idx_blks_hit) as idx_hit
    FROM pg_statio_user_tables
    WHERE relname = 'atlas_people_discovery_candidates';
  `);
  return {
    heapRead: Number(res.rows[0].heap_read || 0),
    heapHit: Number(res.rows[0].heap_hit || 0),
    idxRead: Number(res.rows[0].idx_read || 0),
    idxHit: Number(res.rows[0].idx_hit || 0)
  };
}

async function runCanaryStep(targetPct, queriesToRun = 20) {
  console.log(`\n======================================================`);
  console.log(`RUNNING CANARY STEP: ${targetPct}% V3 TRAFFIC`);
  console.log(`======================================================`);

  const initialIo = await getDbIoStats();
  const latenciesV2 = [];
  const latenciesV3 = [];
  let errors = 0;
  let v3Count = 0;
  let v2Count = 0;

  for (let i = 0; i < queriesToRun; i++) {
    const q = TEST_QUERIES[i % TEST_QUERIES.length];
    const isV3 = (Math.random() * 100) < targetPct;
    const rpcName = isV3 ? 'atlas_search_people_unified_v3' : 'atlas_search_people_unified_v2';
    
    if (isV3) v3Count++; else v2Count++;

    const t0 = Date.now();
    try {
      const res = await pool.query(`
        SELECT count(*) FROM ${rpcName}(p_query := $1, p_limit := 20);
      `, [q]);
      const dt = Date.now() - t0;
      if (isV3) latenciesV3.push(dt); else latenciesV2.push(dt);
    } catch (err) {
      console.error(`[CANARY ERROR] RPC ${rpcName} failed on "${q}":`, err.message);
      errors++;
    }
  }

  const finalIo = await getDbIoStats();
  const heapReadDelta = finalIo.heapRead - initialIo.heapRead;
  const idxReadDelta = finalIo.idxRead - initialIo.idxRead;

  latenciesV3.sort((a, b) => a - b);
  latenciesV2.sort((a, b) => a - b);

  const p50V3 = latenciesV3.length ? latenciesV3[Math.floor(latenciesV3.length * 0.5)] : 0;
  const p95V3 = latenciesV3.length ? latenciesV3[Math.floor(latenciesV3.length * 0.95)] : 0;
  const p50V2 = latenciesV2.length ? latenciesV2[Math.floor(latenciesV2.length * 0.5)] : 0;
  const p95V2 = latenciesV2.length ? latenciesV2[Math.floor(latenciesV2.length * 0.95)] : 0;

  const stepResult = {
    target_pct: targetPct,
    total_queries: queriesToRun,
    v3_requests: v3Count,
    v2_requests: v2Count,
    errors,
    v3_p50_ms: p50V3,
    v3_p95_ms: p95V3,
    v2_p50_ms: p50V2,
    v2_p95_ms: p95V2,
    heap_reads_delta: heapReadDelta,
    idx_reads_delta: idxReadDelta,
    pass: errors === 0
  };

  console.log(`Step Result: V3 share: ${v3Count}/${queriesToRun} (${((v3Count/queriesToRun)*100).toFixed(1)}%), Errors: ${errors}`);
  console.log(`V3 Latencies: P50=${p50V3}ms, P95=${p95V3}ms | V2 Latencies: P50=${p50V2}ms, P95=${p95V2}ms`);
  console.log(`IO delta: Heap reads=${heapReadDelta}, Index reads=${idxReadDelta}`);

  return stepResult;
}

async function run() {
  console.log('=== SECTION 6: CANARY LADDER EXECUTION (5% -> 10% -> 25% -> 50% -> 100%) ===\n');

  const ladder = [5, 10, 25, 50, 100];
  const steps = [];

  for (const pct of ladder) {
    const res = await runCanaryStep(pct, 20);
    steps.push(res);
    if (!res.pass) {
      console.error(`[CRITICAL] Canary failed at ${pct}%. Halting ladder!`);
      break;
    }
  }

  const allPassed = steps.every(s => s.pass) && steps.length === ladder.length;

  const report = {
    timestamp: new Date().toISOString(),
    v3_canary_pass: allPassed,
    v3_production_share: allPassed ? 100 : 0,
    steps
  };

  fs.writeFileSync('reports/atlas/realtime/search_canary_report.json', JSON.stringify(report, null, 2));
  console.log('\nCanary ladder complete. Report saved to reports/atlas/realtime/search_canary_report.json');

  await pool.end();
}

run().catch(console.error);
