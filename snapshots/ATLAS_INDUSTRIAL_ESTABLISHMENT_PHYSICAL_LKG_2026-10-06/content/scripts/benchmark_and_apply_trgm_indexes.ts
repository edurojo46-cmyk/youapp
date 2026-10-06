import 'dotenv/config';
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { AtlasPeopleSearchV2 } from '../src/lib/search/AtlasPeopleSearchV2';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.SUPABASE_POSTGRES_URL || '';

if (!dbUrl) {
  console.error("No DATABASE_URL found in environment");
  process.exit(1);
}

const client = new Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

interface QueryExplainResult {
  query: string;
  term: string;
  plan: string[];
  execution_time_ms: number;
  planning_time_ms: number;
  uses_bitmap_index_scan: boolean;
  uses_seq_scan: boolean;
}

async function runExplain(client: Client, term: string): Promise<QueryExplainResult> {
  const sql = `
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT discovery_id, display_name, organization, role, profession
    FROM public.atlas_people_discovery_candidates
    WHERE display_name ILIKE '%${term}%'
       OR organization ILIKE '%${term}%'
       OR role ILIKE '%${term}%'
       OR profession ILIKE '%${term}%'
    LIMIT 50;
  `;

  const res = await client.query(sql);
  const lines: string[] = res.rows.map((r: any) => r['QUERY PLAN']);
  const fullPlanText = lines.join('\n');

  let executionTimeMs = 0;
  let planningTimeMs = 0;

  for (const l of lines) {
    if (l.includes('Execution Time:')) {
      const m = l.match(/Execution Time:\s+([\d\.]+)\s+ms/);
      if (m) executionTimeMs = parseFloat(m[1]);
    }
    if (l.includes('Planning Time:')) {
      const m = l.match(/Planning Time:\s+([\d\.]+)\s+ms/);
      if (m) planningTimeMs = parseFloat(m[1]);
    }
  }

  const usesBitmap = fullPlanText.includes('Bitmap Index Scan') || fullPlanText.includes('Bitmap Heap Scan');
  const usesSeq = fullPlanText.includes('Seq Scan');

  return {
    query: sql.trim(),
    term,
    plan: lines,
    execution_time_ms: executionTimeMs,
    planning_time_ms: planningTimeMs,
    uses_bitmap_index_scan: usesBitmap,
    uses_seq_scan: usesSeq
  };
}

async function runApplicationBenchmark() {
  const testQueries = ['Salud', 'Educación', 'Seguridad', 'Justicia', 'Economía', 'Cultura', 'Trabajo', 'Ciencia'];
  const latencies: number[] = [];

  // Cold query
  const coldStart = Date.now();
  await AtlasPeopleSearchV2.search({ evidence_state: 'ALL_ARGENTINA', query: 'Presidencia de la Nación', limit: 10 });
  const coldP99 = Date.now() - coldStart;

  // Warm queries
  for (const q of testQueries) {
    const s = Date.now();
    await AtlasPeopleSearchV2.search({ evidence_state: 'ALL_ARGENTINA', query: q, limit: 10 });
    latencies.push(Date.now() - s);
  }

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[latencies.length - 1];
  const max = Math.max(...latencies, coldP99);

  return {
    p50_ms: p50,
    p95_ms: p95,
    p99_ms: p99,
    max_ms: max,
    cold_p99_ms: coldP99,
    warm_p99_ms: p99,
    samples: latencies
  };
}

async function main() {
  console.log('================================================================');
  console.log('ATLAS SEARCH P99 FIX: PG_TRGM GIN INDEX PHYSICAL BENCHMARK');
  console.log('================================================================\n');

  await client.connect();
  console.log('Connected to PostgreSQL successfully.');

  // Total rows check
  const countRes = await client.query('SELECT COUNT(*) FROM public.atlas_people_discovery_candidates;');
  const totalRows = parseInt(countRes.rows[0].count, 10);
  console.log(`Total rows in atlas_people_discovery_candidates: ${totalRows}\n`);

  // 1. BEFORE INDEX BENCHMARK
  console.log('--- 1. CAPTURING BASELINE PHYSICAL BENCHMARK (BEFORE GIN INDEXES) ---');
  const terms = ['Salud', 'Justicia', 'Economía'];
  const beforeExplains: QueryExplainResult[] = [];

  for (const term of terms) {
    console.log(`Ejecutando EXPLAIN (ANALYZE, BUFFERS) para '%${term}%' (BEFORE)...`);
    const exp = await runExplain(client, term);
    beforeExplains.push(exp);
    console.log(`  Plan: ${exp.uses_seq_scan ? 'Sequential Scan' : 'Indexed'} | Exec Time: ${exp.execution_time_ms} ms`);
  }

  console.log('\n--- 2. APPLYING MIGRATION (CREATE EXTENSION & GIN INDEXES) ---');
  const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20260914180000_atlas_search_trgm_indexes.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

  const tStart = Date.now();
  await client.query(migrationSql);
  console.log(`Migration applied successfully in ${Date.now() - tStart} ms.`);

  // Verify indexes exist
  const indexCheckRes = await client.query(`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename = 'atlas_people_discovery_candidates' 
      AND indexname LIKE '%trgm%';
  `);
  console.log(`Indexes verified in catalog (${indexCheckRes.rows.length}):`);
  for (const row of indexCheckRes.rows) {
    console.log(`  - ${row.indexname}`);
  }

  // 3. AFTER INDEX BENCHMARK
  console.log('\n--- 3. CAPTURING BENCHMARK POST-INDEX (AFTER GIN INDEXES) ---');
  const afterExplains: QueryExplainResult[] = [];

  for (const term of terms) {
    console.log(`Ejecutando EXPLAIN (ANALYZE, BUFFERS) para '%${term}%' (AFTER)...`);
    const exp = await runExplain(client, term);
    afterExplains.push(exp);
    console.log(`  Plan: ${exp.uses_bitmap_index_scan ? 'Bitmap Index Scan (PASS ✅)' : 'Seq Scan (FAIL ❌)'} | Exec Time: ${exp.execution_time_ms} ms`);
  }

  // 4. APPLICATION LEVEL BENCHMARK (AtlasPeopleSearchV2)
  console.log('\n--- 4. APPLICATION BENCHMARK (AtlasPeopleSearchV2) ---');
  const appMetrics = await runApplicationBenchmark();
  console.log(`Results: P50: ${appMetrics.p50_ms} ms | P95: ${appMetrics.p95_ms} ms | P99: ${appMetrics.p99_ms} ms | Cold: ${appMetrics.cold_p99_ms} ms`);

  const passed = (
    afterExplains.every(e => e.uses_bitmap_index_scan) &&
    appMetrics.p50_ms < 300 &&
    appMetrics.p95_ms < 800 &&
    appMetrics.p99_ms < 1000
  );

  const report = {
    REPORT_TITLE: 'ATLAS SEARCH P99 FIX PHYSICAL BENCHMARK REPORT',
    TIMESTAMP: new Date().toISOString(),
    TOTAL_ROWS_INDEXED: totalRows,
    INDEXES_CREATED: indexCheckRes.rows.map(r => r.indexname),
    BEFORE_INDEX_EXPLAIN: beforeExplains,
    AFTER_INDEX_EXPLAIN: afterExplains,
    APPLICATION_SEARCH_BENCHMARK: appMetrics,
    TARGET_VERIFICATIONS: {
      USES_BITMAP_INDEX_SCAN: afterExplains.every(e => e.uses_bitmap_index_scan),
      P50_UNDER_300MS: appMetrics.p50_ms < 300,
      P95_UNDER_800MS: appMetrics.p95_ms < 800,
      P99_UNDER_1000MS: appMetrics.p99_ms < 1000,
      GATE_STATUS: passed ? 'PASS' : 'FAIL'
    }
  };

  const reportPath = path.resolve('reports/atlas/people/search_trgm_benchmark_report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\nMaster Report saved to: ${reportPath}`);

  await client.end();
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
