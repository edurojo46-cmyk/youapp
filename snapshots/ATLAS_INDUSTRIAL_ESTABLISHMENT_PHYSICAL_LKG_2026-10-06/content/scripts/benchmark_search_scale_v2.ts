import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { AtlasPeopleSearchV2 } from '../src/lib/search/AtlasPeopleSearchV2';

export interface SearchBenchmarkResults {
  BENCHMARK_STATUS: 'PASS' | 'FAIL';
  TIMESTAMP: string;
  UNITS: 'MILLISECONDS (ms)';
  HISTORICAL_UNOPTIMIZED_LATENCY_MS: 1633;
  TARGET_P50_MS: 400;
  TARGET_P95_MS: 800;
  COLD_RUNS: {
    QUERIES: Record<string, number>;
    P50_MS: number;
    P95_MS: number;
    P99_MS: number;
  };
  WARM_RUNS: {
    SAMPLE_COUNT: number;
    QUERIES: Record<string, number[]>;
    P50_MS: number;
    P95_MS: number;
    P99_MS: number;
  };
  ALL_ARGENTINA_PAGINATION: {
    PAGE_1_MS: number;
    PAGE_2_MS: number;
    PAGE_5_MS: number;
    PAGE_10_MS: number;
    AVG_MS: number;
  };
  CONSOLIDATED: {
    OVERALL_P50_MS: number;
    OVERALL_P95_MS: number;
    OVERALL_P99_MS: number;
  };
}

function calculatePercentiles(latencies: number[]): { p50: number; p95: number; p99: number } {
  const sorted = [...latencies].sort((a, b) => a - b);
  const n = sorted.length;
  const p50 = sorted[Math.floor(n * 0.50)];
  const p95 = sorted[Math.floor(n * 0.95)];
  const p99 = sorted[Math.floor(n * 0.99)] || sorted[sorted.length - 1];
  return { p50, p95, p99 };
}

export async function runSearchBenchmark(): Promise<SearchBenchmarkResults> {
  console.log('================================================================');
  console.log('ATLAS INDUSTRIAL FACTORY V2 — SEARCH SCALE BENCHMARK (100K+ SSOT)');
  console.log('================================================================\n');
  console.log('UNIDADES: MILISEGUNDOS (ms) — Sin confusión de puntos ni comas.');
  console.log('OBJETIVO: P50 < 400 ms | P95 < 800 ms (Histórico sin optimizar: 1633 ms)\n');

  // Representative common query suite covering Names, Organizations, Roles, and Topics
  const testQueries = [
    'Salud', 'Justicia', 'Seguridad', 'Economía', 'Nación', 
    'Director', 'Investigador', 'Coordinador',
    'Gómez', 'Fernández', 'Rodríguez', 'López'
  ];

  // 1. Cold Runs
  console.log('--- 1. EJECUCIÓN COLD RUNS (Primera pasada por query) ---');
  const coldLatencies: Record<string, number> = {};
  const coldAll: number[] = [];

  for (const q of testQueries) {
    const t0 = Date.now();
    const res = await AtlasPeopleSearchV2.search({ evidence_state: 'ALL_ARGENTINA', query: q, limit: 10 });
    const dur = Date.now() - t0;
    coldLatencies[q] = dur;
    coldAll.push(dur);
    console.log(`[COLD] Query "${q}": ${dur} ms (db: ${res.db_query_ms} ms, matches: ${res.total_matches})`);
  }

  const coldPerc = calculatePercentiles(coldAll);
  console.log(`\nCold Stats: P50 = ${coldPerc.p50} ms | P95 = ${coldPerc.p95} ms | P99 = ${coldPerc.p99} ms\n`);

  // 2. Warm Runs (4 iteraciones por query = 48 queries)
  console.log('--- 2. EJECUCIÓN WARM RUNS (4 iteraciones por query = 48 queries) ---');
  const warmLatencies: Record<string, number[]> = {};
  const warmAll: number[] = [];

  for (const q of testQueries) {
    warmLatencies[q] = [];
    for (let iter = 1; iter <= 4; iter++) {
      const t0 = Date.now();
      const res = await AtlasPeopleSearchV2.search({ evidence_state: 'ALL_ARGENTINA', query: q, limit: 10 });
      const dur = Date.now() - t0;
      warmLatencies[q].push(dur);
      warmAll.push(dur);
    }
    const avgQ = Math.round(warmLatencies[q].reduce((a, b) => a + b, 0) / warmLatencies[q].length);
    console.log(`[WARM] Query "${q}": Promedio ${avgQ} ms (muestras: ${warmLatencies[q].join(', ')} ms)`);
  }

  const warmPerc = calculatePercentiles(warmAll);
  console.log(`\nWarm Stats: P50 = ${warmPerc.p50} ms | P95 = ${warmPerc.p95} ms | P99 = ${warmPerc.p99} ms\n`);

  // 3. ALL_ARGENTINA Pagination Benchmark
  console.log('--- 3. ALL_ARGENTINA PAGINACIÓN PURA (Sin full scan) ---');
  const pageTests = [1, 2, 5, 10];
  const pageResults: Record<string, number> = {};
  const pageAll: number[] = [];

  for (const p of pageTests) {
    const t0 = Date.now();
    const res = await AtlasPeopleSearchV2.search({ evidence_state: 'ALL_ARGENTINA', page: p, limit: 20 });
    const dur = Date.now() - t0;
    pageResults[`PAGE_${p}_MS`] = dur;
    pageAll.push(dur);
    console.log(`[PAGINATION] Página ${p}: ${dur} ms (db: ${res.db_query_ms} ms, items: ${res.results.length}, total: ${res.total_matches})`);
  }

  const avgPage = Math.round(pageAll.reduce((a, b) => a + b, 0) / pageAll.length);

  // 4. Overall Consolidated
  const allSamples = [...coldAll, ...warmAll, ...pageAll];
  const overallPerc = calculatePercentiles(allSamples);

  console.log(`\n================================================================`);
  console.log(`CERTIFICACIÓN FÍSICA CONSOLIDADA (${allSamples.length} muestras):`);
  console.log(`P50 GLOBAL: ${overallPerc.p50} ms (Target: < 400 ms)`);
  console.log(`P95 GLOBAL: ${overallPerc.p95} ms (Target: < 800 ms)`);
  console.log(`P99 GLOBAL: ${overallPerc.p99} ms`);
  console.log(`================================================================\n`);

  const pass = overallPerc.p50 < 400 && overallPerc.p95 < 800;

  const results: SearchBenchmarkResults = {
    BENCHMARK_STATUS: pass ? 'PASS' : 'FAIL',
    TIMESTAMP: new Date().toISOString(),
    UNITS: 'MILLISECONDS (ms)',
    HISTORICAL_UNOPTIMIZED_LATENCY_MS: 1633,
    TARGET_P50_MS: 400,
    TARGET_P95_MS: 800,
    COLD_RUNS: {
      QUERIES: coldLatencies,
      P50_MS: coldPerc.p50,
      P95_MS: coldPerc.p95,
      P99_MS: coldPerc.p99
    },
    WARM_RUNS: {
      SAMPLE_COUNT: warmAll.length,
      QUERIES: warmLatencies,
      P50_MS: warmPerc.p50,
      P95_MS: warmPerc.p95,
      P99_MS: warmPerc.p99
    },
    ALL_ARGENTINA_PAGINATION: {
      PAGE_1_MS: pageResults.PAGE_1_MS,
      PAGE_2_MS: pageResults.PAGE_2_MS,
      PAGE_5_MS: pageResults.PAGE_5_MS,
      PAGE_10_MS: pageResults.PAGE_10_MS,
      AVG_MS: avgPage
    },
    CONSOLIDATED: {
      OVERALL_P50_MS: overallPerc.p50,
      OVERALL_P95_MS: overallPerc.p95,
      OVERALL_P99_MS: overallPerc.p99
    }
  };

  const reportPath = path.resolve('reports/atlas/people/search_scale_optimization_report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`Reporte de latencia guardado en: ${reportPath}`);
  console.log(`SEARCH SCALE BENCHMARK GATE: ${results.BENCHMARK_STATUS}`);

  return results;
}

if (process.argv.includes('--run')) {
  runSearchBenchmark().catch(err => {
    console.error('Benchmark failed:', err);
    process.exit(1);
  });
}
