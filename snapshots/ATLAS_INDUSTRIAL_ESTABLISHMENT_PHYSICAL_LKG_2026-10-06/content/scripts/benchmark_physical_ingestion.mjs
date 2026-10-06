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

async function runBenchmark(batchSizes, durationSec) {
  console.log(`\n--- CARRIL B: BENCHMARK INGESTIÓN FÍSICA ---`);
  
  for (const size of batchSizes) {
    console.log(`\n▶ Testing Canonical Batch Size: ${size}`);
    let rowsProcessed = 0;
    const start = performance.now();
    const endTarget = start + (durationSec * 1000);
    
    // Generate dummy payload
    const idRows = [];
    const outRows = [];
    for (let i = 0; i < size; i++) {
      const ts = Date.now() + i;
      idRows.push({
        atlas_person_id: `test-bm-${ts}`,
        source_id: 'test-source',
        source_person_id: `${ts}`,
        identifier_type: 'DNI',
        identifier_value: `${ts}`,
        confidence: 1,
        resolution_method: 'test'
      });
      outRows.push({
        atlas_person_id: `test-bm-${ts}`,
        source_id: 'test-source',
        source_record_id: `rec-${ts}`,
        payload: { a: 1 },
        payload_version: 1
      });
    }

    let rpcCalls = 0;
    while (performance.now() < endTarget) {
      const t0 = performance.now();
      const { data, error } = await sb.rpc('commit_canonical_with_search_outbox', { p_identity_rows: idRows, p_outbox_rows: outRows });
      const t1 = performance.now();
      
      if (error) { console.error('RPC Error:', error); break; }
      
      rowsProcessed += size;
      rpcCalls++;
      
      // Clean up to avoid bloat (optional, depends on if we want true DB insert simulation)
      if (rpcCalls % 10 === 0) console.log(`  ... running ${size} (${(t1 - t0).toFixed(2)}ms)`);
    }
    
    const elapsed = (performance.now() - start) / 1000;
    console.log(`UNIQUE_PHYSICAL_SEC = ${(rowsProcessed / elapsed).toFixed(1)} (Batch Size: ${size})`);
    console.log(`RPC_CALLS_PER_SEC = ${(rpcCalls / elapsed).toFixed(2)}`);
  }
}

async function main() {
  console.log('NOTE: Run benchmark manually for full testing.');
  await runBenchmark([50, 100, 200, 500, 1000, 2000, 5000, 10000], 5);
}
main();
