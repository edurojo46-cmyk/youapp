import { spawn } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const l of env.split('\n')) {
  if (l.startsWith('VITE_SUPABASE_URL=')) url = l.split('=')[1].trim().replace(/['"]/g, '');
  if (l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = l.split('=')[1].trim().replace(/['"]/g, '');
}
const sb = createClient(url, key, { auth: { persistSession: false } });

async function getOutboxDepth() {
  const { count } = await sb.from('atlas_search_outbox').select('*', { count: 'exact', head: true }).in('status', ['PENDING', 'RETRY']);
  return count || 0;
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a,b) => a - b);
  return sorted[Math.floor(sorted.length * p)] ?? sorted[sorted.length - 1];
}

async function run() {
  const depthStart = await getOutboxDepth();
  console.log(`OUTBOX_DEPTH_START: ${depthStart}`);

  console.log("Starting Publisher...");
  const publisher = spawn('node', ['scripts/atlas_search_publisher.mjs'], { env: process.env });
  
  let claimed = 0, published = 0, quarantined = 0, failed = 0, timeouts = 0, nullRollbacks = 0;
  let errors = 0;
  const rpcTimes = [];
  
  publisher.stdout.on('data', data => {
    const text = data.toString();
    process.stdout.write(text); // Print for debugging
    
    // Parse normal metrics
    const match = text.match(/Published: (\d+) \| Failed: (\d+) \| Quar: (\d+)/);
    if (match) {
      const p = parseInt(match[1]), f = parseInt(match[2]), q = parseInt(match[3]);
      published += p;
      failed += f;
      quarantined += q;
      claimed += (p + f + q);
    }
    
    // Parse timing metrics ms(c:...,vq:...,u:...,a:...)
    const timeMatch = text.match(/ms\(c:(\d+),vq:(\d+),u:(\d+),a:(\d+)\)/);
    if (timeMatch) {
      const c = parseInt(timeMatch[1]);
      const vq = parseInt(timeMatch[2]);
      const u = parseInt(timeMatch[3]);
      const a = parseInt(timeMatch[4]);
      rpcTimes.push(c + vq + u + a);
    }
    
    if (text.includes('timeout') || text.includes('abort')) timeouts++;
    if (text.includes('null value in column "discovery_id"')) nullRollbacks++;
    if (text.includes('[Error]')) errors++;
  });
  
  publisher.stderr.on('data', data => {
    const text = data.toString();
    process.stderr.write(text);
    if (text.includes('timeout') || text.includes('abort')) timeouts++;
    if (text.includes('null value in column "discovery_id"')) nullRollbacks++;
    if (text.includes('[Publisher Error]')) errors++;
  });

  await new Promise(r => setTimeout(r, 65000));
  
  publisher.kill();
  const depthEnd = await getOutboxDepth();
  
  console.log(`\n--- SMOKE TEST RESULTS ---`);
  console.log(`OUTBOX_DEPTH_START: ${depthStart}`);
  console.log(`OUTBOX_DEPTH_END: ${depthEnd}`);
  console.log(`TOTAL_CLAIMED: ${claimed}`);
  console.log(`TOTAL_PUBLISHED: ${published}`);
  console.log(`TOTAL_QUARANTINED: ${quarantined}`);
  console.log(`TOTAL_FAILED: ${failed}`);
  console.log(`PUBLISH_ROWS_SEC: ${(published / 65).toFixed(2)}`);
  console.log(`RPC_P50_MS: ${percentile(rpcTimes, 0.50)}`);
  console.log(`RPC_P95_MS: ${percentile(rpcTimes, 0.95)}`);
  console.log(`RPC_P99_MS: ${percentile(rpcTimes, 0.99)}`);
  console.log(`TIMEOUTS: ${timeouts}`);
  console.log(`ERRORS: ${errors}`);
  console.log(`NULL_DISCOVERY_ID_ROLLBACKS: ${nullRollbacks}`);
}

run().catch(console.error);
