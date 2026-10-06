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

async function workerRun(workerId, batchSize, endTarget, stats) {
  while (performance.now() < endTarget) {
    const { data: claimed, error: claimErr } = await sb.rpc('claim_search_outbox_batch', { p_batch_size: batchSize, p_lease_seconds: 300, p_worker_id: workerId });
    if (claimErr) break;
    if (!claimed || claimed.length === 0) { await new Promise(r => setTimeout(r, 500)); continue; }
    
    const discRows = claimed.map(r => ({
      discovery_id: r.atlas_person_id,
      identity_hash: r.payload.identity_hash,
      search_vector: `benchmark ${r.payload.source_person_id}`
    }));
    await sb.from('atlas_people_discovery_candidates').upsert(discRows);
    
    const ackPayload = claimed.map(r => ({
      outbox_id: r.outbox_id,
      payload_version: r.payload_version,
      status: 'PUBLISHED',
      error: null,
      attempt_count: 0
    }));
    await sb.rpc('mark_search_outbox_batch_status', { p_rows: ackPayload });
    stats.processed += claimed.length;
  }
}

async function runMulti(workers, batchSize, durationSec) {
  console.log(`\n▶ Testing ${workers} workers with batch size ${batchSize}...`);
  const stats = { processed: 0 };
  const start = performance.now();
  const endTarget = start + (durationSec * 1000);
  
  const promises = [];
  for(let i=0; i<workers; i++) promises.push(workerRun(`w${i}`, batchSize, endTarget, stats));
  await Promise.all(promises);
  
  const elapsed = (performance.now() - start) / 1000;
  console.log(`TOTAL_PUBLISH_ROWS_SEC = ${(stats.processed / elapsed).toFixed(1)}`);
}

async function main() {
  await runMulti(1, 1000, 10);
  await runMulti(2, 1000, 10);
  await runMulti(4, 1000, 10);
}
main();
