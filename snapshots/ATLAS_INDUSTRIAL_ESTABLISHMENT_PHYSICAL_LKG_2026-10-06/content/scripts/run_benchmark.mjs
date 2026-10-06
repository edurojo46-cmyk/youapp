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

async function runBenchmark(batchSize, seconds) {
  console.log(`\n\n======================================================`);
  console.log(`🚀 STARTING BENCHMARK: BATCH_SIZE = ${batchSize}`);
  console.log(`======================================================`);
  
  const depthStart = await getOutboxDepth();
  const testEnv = { ...process.env, BATCH_SIZE: batchSize.toString() };
  
  const publisher = spawn('node', ['scripts/atlas_search_publisher.mjs'], { env: testEnv });
  
  let claimed = 0, published = 0, quarantined = 0, failed = 0, timeouts = 0, errors = 0;
  let inserted = 0, updated = 0, unchanged = 0;
  const cTimes = [], vqTimes = [], uTimes = [], aTimes = [], totalTimes = [];
  
  publisher.stdout.on('data', data => {
    const text = data.toString();
    process.stdout.write(text);
    
    // Parse normal metrics: Published: 500 [ins:0 upd:0 unch:500] | Failed: 0
    const match = text.match(/Published: (\d+) \[ins:(\d+) upd:(\d+) unch:(\d+)\] \| Failed: (\d+)/);
    if (match) {
      const p = parseInt(match[1]), ins = parseInt(match[2]), upd = parseInt(match[3]), unch = parseInt(match[4]), f = parseInt(match[5]);
      published += p;
      inserted += ins;
      updated += upd;
      unchanged += unch;
      failed += f;
      claimed += (p + f);
    }
    
    // Parse timing metrics ms(c:...,vq:...,u:...,a:...)
    const timeMatch = text.match(/ms\(c:(\d+),vq:(\d+),u:(\d+),a:(\d+)\)/);
    if (timeMatch) {
      const c = parseInt(timeMatch[1]);
      const vq = parseInt(timeMatch[2]);
      const u = parseInt(timeMatch[3]);
      const a = parseInt(timeMatch[4]);
      cTimes.push(c);
      vqTimes.push(vq);
      uTimes.push(u);
      aTimes.push(a);
      totalTimes.push(c + vq + u + a);
    }
    
    if (text.includes('timeout') || text.includes('abort')) timeouts++;
    if (text.includes('[Error]')) errors++;
  });
  
  publisher.stderr.on('data', data => {
    const text = data.toString();
    process.stderr.write(text);
    if (text.includes('timeout') || text.includes('abort')) timeouts++;
    if (text.includes('[Publisher Error]')) errors++;
  });

  await new Promise(r => setTimeout(r, seconds * 1000));
  
  publisher.kill();
  const depthEnd = await getOutboxDepth();
  
  const res = {
    batchSize,
    depthStart, depthEnd,
    claimed, published, failed,
    inserted, updated, unchanged,
    rowsPerSec: (published / seconds).toFixed(2),
    timeouts, errors,
    c_p50: percentile(cTimes, 0.5),
    vq_p50: percentile(vqTimes, 0.5),
    u_p50: percentile(uTimes, 0.5),
    a_p50: percentile(aTimes, 0.5),
    total_p50: percentile(totalTimes, 0.5)
  };
  
  console.log(`\n--- BENCHMARK RESULTS (BATCH ${batchSize}) ---`);
  console.log(`PUBLISHED: ${res.published} | FAILED: ${res.failed} | TIMEOUTS: ${res.timeouts}`);
  console.log(`INSERTED: ${res.inserted} | UPDATED: ${res.updated} | UNCHANGED: ${res.unchanged}`);
  console.log(`ROWS/SEC: ${res.rowsPerSec}`);
  console.log(`MS(P50) -> CLAIM: ${res.c_p50} | VQ: ${res.vq_p50} | UPSERT: ${res.u_p50} | ACK: ${res.a_p50} | TOTAL: ${res.total_p50}`);
  
  return res;
}

async function runAll() {
  const sizes = [100, 200, 500, 1000];
  const results = [];
  
  for (const size of sizes) {
    const r = await runBenchmark(size, 65); // 65 seconds per size
    results.push(r);
    // Cool down for 5 seconds between runs
    await new Promise(res => setTimeout(res, 5000));
  }
  
  console.log(`\n\n======================================================`);
  console.log(`🏆 FINAL BENCHMARK SUMMARY`);
  console.log(`======================================================`);
  for (const r of results) {
    console.log(`[BATCH ${r.batchSize.toString().padStart(4)}] TIMEOUTS: ${r.timeouts.toString().padEnd(2)} | ROWS/SEC: ${r.rowsPerSec.padStart(6)} | UNCHANGED: ${r.unchanged} | UPSERT_MS: ${r.u_p50.toString().padStart(4)} | ACK_MS: ${r.a_p50.toString().padStart(4)}`);
  }
}

runAll().catch(console.error);
