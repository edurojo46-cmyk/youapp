import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/["']/g, '');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = line.split('=')[1].trim().replace(/["']/g, '');
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function streamPartition(workerId, startAfter, maxId, targetCount) {
  let retrieved = 0;
  let lastId = startAfter;
  const PAGE_SIZE = 1000;

  while (retrieved < targetCount) {
    let q = supabase
      .from('atlas_people_discovery_candidates')
      .select('discovery_id, display_name, profession, organization')
      .order('discovery_id', { ascending: true })
      .limit(PAGE_SIZE);

    if (lastId) q = q.gt('discovery_id', lastId);
    if (maxId) q = q.lte('discovery_id', maxId);

    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;

    retrieved += data.length;
    lastId = data[data.length - 1].discovery_id;
  }
  return retrieved;
}

async function benchmarkParallelBulk() {
  console.log('========================================================================');
  console.log('⚡ ATLAS PEOPLE — PARALLEL KEYSET STREAMING BENCHMARK (BULK SEARCH)');
  console.log('Testing 2-Partition Concurrent Keyset Retrieval (Target: 100,000 results)');
  console.log('========================================================================\n');

  const TARGET_TOTAL = 100000;
  const PER_WORKER = TARGET_TOTAL / 2;

  // Split key space at midpoint 'disc_biep_8'
  const t0 = performance.now();
  console.log('Launching 2 parallel partition streams...');

  const [w1Count, w2Count] = await Promise.all([
    streamPartition(1, '', 'disc_biep_8', PER_WORKER),
    streamPartition(2, 'disc_biep_8', null, PER_WORKER)
  ]);

  const totalRetrieved = w1Count + w2Count;
  const totalDurationSec = (performance.now() - t0) / 1000;
  const parallelRate = Math.round(totalRetrieved / totalDurationSec);
  const timeTo1MMinutes = Number(((1000000 / parallelRate) / 60).toFixed(1));

  console.log(`\nParallel Stream Completed in ${totalDurationSec.toFixed(1)}s`);
  console.log(`Retrieved: ${totalRetrieved.toLocaleString()} entities (${w1Count} + ${w2Count})`);
  console.log(`Parallel Bulk Retrieval Rate: ${parallelRate.toLocaleString()} results/sec`);
  console.log(`Estimated Time to 1,000,000 results: ${timeTo1MMinutes} minutes (${timeTo1MMinutes <= 10 ? 'MET <= 10 MIN TARGET!' : 'Approaching target'})`);

  const report = {
    benchmark_title: 'ATLAS_PARALLEL_KEYSET_BULK_SEARCH_BENCHMARK',
    timestamp: new Date().toISOString(),
    total_retrieved: totalRetrieved,
    duration_seconds: Number(totalDurationSec.toFixed(1)),
    bulk_results_per_second: parallelRate,
    time_to_1m_minutes: timeTo1MMinutes,
    time_to_1m_seconds: Math.round(1000000 / parallelRate),
    ten_minute_target_met: timeTo1MMinutes <= 10,
    partitions: 2,
    partition_strategy: 'RANGE_KEYSET_SPLIT (discovery_id)'
  };

  const reportPath = path.resolve('reports/atlas/people/atlas_parallel_bulk_search_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`Report saved to: ${reportPath}`);
}

benchmarkParallelBulk().catch(console.error);
