import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/["']/g, '');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = line.split('=')[1].trim().replace(/["']/g, '');
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function runBulkBenchmark() {
  console.log('========================================================================');
  console.log('🔍 ATLAS PEOPLE — BULK SEARCH KEYSET RETRIEVAL BENCHMARK');
  console.log('Testing Industrial Keyset Pagination: 10k, 100k, 500k results');
  console.log('========================================================================\n');

  const PAGE_SIZE = 1000;
  let totalRetrieved = 0;
  let lastDiscoveryId = '';
  let errors = 0;
  let timeouts = 0;

  let timeToFirstResultMs = null;
  let timeToFirst100Ms = null;
  let timeToRetrieve10kMs = null;
  let timeToRetrieve100kMs = null;
  let timeToRetrieve500kMs = null;

  const tStart = performance.now();

  // 1. Measure Time to First Result & First 100
  const t0 = performance.now();
  try {
    const { data: firstPage, error } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('discovery_id, display_name, profession, organization')
      .order('discovery_id', { ascending: true })
      .limit(100);

    if (error) throw error;
    timeToFirstResultMs = Number((performance.now() - t0).toFixed(1));
    timeToFirst100Ms = timeToFirstResultMs;
    console.log(`[FIRST] Time to first result & first 100: ${timeToFirst100Ms}ms`);
  } catch (e) {
    console.error('Error fetching first 100:', e);
    errors++;
  }

  // 2. Keyset Stream for 10k, 100k, 500k
  console.log('\nStreaming bulk entities using cursor/keyset pagination (PAGE_SIZE = 1000)...');
  
  const targetCheckpoints = [
    { count: 10000, key: '10k' },
    { count: 100000, key: '100k' },
    { count: 500000, key: '500k' }
  ];

  while (totalRetrieved < 500000) {
    let query = supabase
      .from('atlas_people_discovery_candidates')
      .select('discovery_id, display_name, profession, organization')
      .order('discovery_id', { ascending: true })
      .limit(PAGE_SIZE);

    if (lastDiscoveryId) {
      query = query.gt('discovery_id', lastDiscoveryId);
    }

    const tPage0 = performance.now();
    let retries = 0;
    let pageSuccess = false;
    let data = null;

    while (!pageSuccess && retries < 3) {
      try {
        const res = await query;
        if (res.error) throw res.error;
        data = res.data;
        pageSuccess = true;
      } catch (err) {
        retries++;
        if (err.message && err.message.includes('timeout')) timeouts++;
        else errors++;
        if (retries >= 3) {
          console.error(`Page fetch failed after 3 retries at ${totalRetrieved}:`, err.message);
          break;
        }
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (!data || data.length === 0) {
      console.log(`Stream exhausted at ${totalRetrieved} results.`);
      break;
    }

    totalRetrieved += data.length;
    lastDiscoveryId = data[data.length - 1].discovery_id;

    const elapsed = performance.now() - tStart;

    if (!timeToRetrieve10kMs && totalRetrieved >= 10000) {
      timeToRetrieve10kMs = Number(elapsed.toFixed(1));
      const rate10k = Math.round((10000 / (timeToRetrieve10kMs / 1000)));
      console.log(`[10,000 CHECKPOINT] Retrieved in ${timeToRetrieve10kMs}ms (${rate10k} results/s)`);
    }

    if (!timeToRetrieve100kMs && totalRetrieved >= 100000) {
      timeToRetrieve100kMs = Number(elapsed.toFixed(1));
      const rate100k = Math.round((100000 / (timeToRetrieve100kMs / 1000)));
      console.log(`[100,000 CHECKPOINT] Retrieved in ${timeToRetrieve100kMs}ms (${rate100k} results/s)`);
    }

    if (!timeToRetrieve500kMs && totalRetrieved >= 500000) {
      timeToRetrieve500kMs = Number(elapsed.toFixed(1));
      const rate500k = Math.round((500000 / (timeToRetrieve500kMs / 1000)));
      console.log(`[500,000 CHECKPOINT] Retrieved in ${timeToRetrieve500kMs}ms (${rate500k} results/s)`);
      break;
    }

    if (totalRetrieved % 25000 === 0) {
      const currentRate = Math.round((totalRetrieved / (elapsed / 1000)));
      console.log(`  Progress: ${totalRetrieved.toLocaleString()} results | Rate: ${currentRate} results/s | Last ID: ${lastDiscoveryId}`);
    }
  }

  const totalTimeMs = performance.now() - tStart;
  const bulkResultsPerSecond = Math.round((totalRetrieved / (totalTimeMs / 1000)));

  const benchmarkReport = {
    benchmark: 'ATLAS_PEOPLE_BULK_SEARCH_KEYSET',
    timestamp: new Date().toISOString(),
    total_results_retrieved: totalRetrieved,
    page_size: PAGE_SIZE,
    time_to_first_result_ms: timeToFirstResultMs,
    time_to_first_100_ms: timeToFirst100Ms,
    time_to_retrieve_10k_ms: timeToRetrieve10kMs,
    time_to_retrieve_100k_ms: timeToRetrieve100kMs,
    time_to_retrieve_500k_ms: timeToRetrieve500kMs,
    bulk_results_per_second: bulkResultsPerSecond,
    bulk_errors: errors,
    bulk_timeouts: timeouts,
    pagination_strategy: 'KEYSET_CURSOR (discovery_id > last_seen_id)',
    deep_offset_prohibited: true
  };

  const reportPath = path.resolve('reports/atlas/people/atlas_bulk_search_benchmark.json');
  fs.writeFileSync(reportPath, JSON.stringify(benchmarkReport, null, 2), 'utf-8');

  console.log('\n========================================================================');
  console.log('✅ BULK SEARCH BENCHMARK COMPLETED');
  console.log(`Total Retrieved: ${totalRetrieved.toLocaleString()}`);
  console.log(`Bulk Rate: ${bulkResultsPerSecond.toLocaleString()} results/sec`);
  console.log(`Time to 10k: ${timeToRetrieve10kMs}ms`);
  console.log(`Time to 100k: ${timeToRetrieve100kMs}ms`);
  console.log(`Time to 500k: ${timeToRetrieve500kMs}ms`);
  console.log(`Errors: ${errors} | Timeouts: ${timeouts}`);
  console.log(`Report written to: ${reportPath}`);
  console.log('========================================================================\n');
}

runBulkBenchmark().catch(console.error);
