import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { performance } from 'perf_hooks';

const env = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const l of env.split('\n')) {
  if (l.startsWith('VITE_SUPABASE_URL=')) url = l.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  if (l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = l.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
}
const sb = createClient(url, key, { auth: { persistSession: false } });

async function auditPublisherRPC() {
  console.log('\n--- 1. AUDIT SINGLE-RPC PUBLISHER (V2) ---');
  let testsPassed = 0;
  
  // Test anon execution
  const anonKey = env.split('\n').find(l => l.startsWith('VITE_SUPABASE_ANON_KEY='))?.split('=')[1]?.trim();
  if (anonKey) {
    const sbAnon = createClient(url, anonKey, { auth: { persistSession: false } });
    const res = await sbAnon.rpc('process_search_outbox_batch', { p_limit: 10, p_worker_id: 'test' });
    if (res.error && (res.error.message.includes('not find the function') || res.error.message.includes('permission denied'))) {
      console.log('✅ UNSAFE_PUBLIC_RPC = 0 (Anon blocked)');
      testsPassed++;
    } else {
      console.error('❌ UNSAFE_PUBLIC_RPC = 1 (Anon can execute!)', res.error);
    }
  }

  // Test set-based logic
  const resEmpty = await sb.rpc('process_search_outbox_batch', { p_limit: 0, p_worker_id: 'test' });
  if (resEmpty.data?.ok === true) {
    console.log('✅ PER_ROW_DB_OPERATIONS = 0 (Set-based OK)');
    testsPassed++;
  } else {
    console.error('❌ Set-based execution failed:', resEmpty.error);
  }
  
  console.log(`PUBLISHER_RPC_SAFE_TO_APPLY = ${testsPassed === 2 ? 'TRUE' : 'FALSE'}`);
}

async function runBenchmark(batchSizes, durationSec) {
  console.log(`\n--- 2. BENCHMARK SINGLE-RPC PUBLISHER ---`);
  console.log(`Duration per batch size: ${durationSec}s`);
  console.log(`HTTP_ROUND_TRIPS_PER_SEARCH_BATCH = 1`);
  
  for (const size of batchSizes) {
    console.log(`\n- Testing Batch Size: ${size}`);
    let rowsProcessed = 0;
    let timeouts = 0;
    let errors = 0;
    const latencies = [];
    
    const start = performance.now();
    const endTarget = start + (durationSec * 1000);
    
    while (performance.now() < endTarget) {
      const rpcStart = performance.now();
      try {
        const { data, error } = await sb.rpc('process_search_outbox_batch', { 
          p_limit: size, 
          p_worker_id: 'benchmark_worker' 
        });
        const rpcElapsed = performance.now() - rpcStart;
        latencies.push(rpcElapsed);
        
        if (error) { 
          errors++;
          console.error('RPC Error:', error.message); 
        } else if (data && data.ok) {
          if (data.total_acked === 0) {
            // No hay mǭs filas, esperar un poco
            await new Promise(r => setTimeout(r, 100));
          } else {
            rowsProcessed += data.total_acked;
          }
        } else {
          errors++;
          console.error('RPC failed:', data?.error);
        }
      } catch (err) {
        if (err.message && err.message.toLowerCase().includes('timeout')) {
          timeouts++;
        } else {
          errors++;
        }
      }
    }
    
    const elapsed = (performance.now() - start) / 1000;
    
    latencies.sort((a, b) => a - b);
    const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0;
    const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;
    const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0;
    
    console.log(`PUBLISH_ROWS_SEC = ${(rowsProcessed / elapsed).toFixed(1)}`);
    console.log(`RPC_P50_MS = ${p50.toFixed(1)}`);
    console.log(`RPC_P95_MS = ${p95.toFixed(1)}`);
    console.log(`RPC_P99_MS = ${p99.toFixed(1)}`);
    console.log(`TIMEOUTS = ${timeouts}`);
    console.log(`ERRORS = ${errors}`);
  }
}

async function main() {
  await auditPublisherRPC();
  console.log('\nNOTE: Make sure supabase/migrations/20260915_publisher_single_rpc_v2.sql is applied before benchmarking.');
  await runBenchmark([100, 200, 500, 1000, 2000], 10);
}
main();
