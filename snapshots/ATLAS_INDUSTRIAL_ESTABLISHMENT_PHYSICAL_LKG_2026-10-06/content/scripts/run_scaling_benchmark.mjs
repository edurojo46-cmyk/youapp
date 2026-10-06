import { spawn } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import pg from 'pg';
const { Client } = pg;

const env = fs.readFileSync('.env', 'utf8');
let url = '', key = '', dbUrl = '';
for (const l of env.split('\n')) {
  if (l.startsWith('VITE_SUPABASE_URL=')) url = l.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  if (l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = l.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  if (l.startsWith('DATABASE_URL=')) dbUrl = l.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function getOutboxDepth() {
  const { count } = await sb.from('atlas_search_outbox')
    .select('*', { count: 'exact', head: true })
    .in('status', ['PENDING', 'RETRY']);
  return count || 0;
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a,b) => a - b);
  return sorted[Math.floor(sorted.length * p)] ?? sorted[sorted.length - 1];
}

async function runScalingLevel(workerCount, batchSize, warmupSec, measureSec) {
  console.log(`\n======================================================`);
  console.log(`🚀 STARTING SCALING TEST: ${workerCount} WORKER(S) | BATCH: ${batchSize}`);
  console.log(`======================================================`);
  
  const depthStart = await getOutboxDepth();
  const testEnv = { ...process.env, BATCH_SIZE: batchSize.toString() };
  
  const workers = [];
  let published = 0, failed = 0, timeouts = 0, errors = 0;
  const rpcTimes = [];
  
  let inMeasurementPhase = false;

  for (let i = 0; i < workerCount; i++) {
    const w = spawn('node', ['scripts/atlas_search_publisher.mjs'], { env: testEnv });
    w.stdout.on('data', data => {
      if (!inMeasurementPhase) return; // Skip metrics during warmup
      const chunk = data.toString();
      const lines = chunk.split('\n');
      for (const line of lines) {
        const text = line.trim();
        if (!text) continue;
        const match = text.match(/Published: (\d+) \[.*Failed: (\d+)/);
        if (match) {
          published += parseInt(match[1]);
          failed += parseInt(match[2]);
        }
        const timeMatch = text.match(/ms\(.*total:(\d+)\)/) || text.match(/ms\(c:\d+,vq:\d+,u:\d+,a:\d+\)/); 
        if (timeMatch) {
           const sumMatch = text.match(/ms\(c:(\d+),vq:(\d+),u:(\d+),a:(\d+)\)/);
           if (sumMatch) {
              rpcTimes.push(parseInt(sumMatch[1]) + parseInt(sumMatch[2]) + parseInt(sumMatch[3]) + parseInt(sumMatch[4]));
           }
        }
        if (text.includes('timeout') || text.includes('abort')) timeouts++;
        if (text.includes('[Error]')) errors++;
      }
    });
    w.stderr.on('data', data => {
      if (!inMeasurementPhase) return;
      const text = data.toString();
      if (text.includes('timeout') || text.includes('abort')) timeouts++;
      if (text.includes('[Error]')) errors++;
    });
    workers.push(w);
  }

  // --- DB Polling setup ---
  let dbClient = null;
  const dbStats = { cpu: [], activeQ: [], lockWaits: [], txs: [] };
  if (dbUrl) {
    dbClient = new Client({ connectionString: dbUrl });
    try {
      await dbClient.connect();
    } catch(e) {
      console.log("[DB] Could not connect directly to Postgres, skipping DB stats");
      dbClient = null;
    }
  }

  let dbInterval = null;
  if (dbClient) {
    dbInterval = setInterval(async () => {
      try {
        const res = await dbClient.query(`
          SELECT 
            (SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND pid <> pg_backend_pid()) as active_q,
            (SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND pid <> pg_backend_pid()) as locks
        `);
        if (inMeasurementPhase) {
           dbStats.activeQ.push(parseInt(res.rows[0].active_q));
           dbStats.lockWaits.push(parseInt(res.rows[0].locks));
        }
      } catch(e){}
    }, 2000);
  }

  // Warmup
  console.log(`[Warmup] ${warmupSec} seconds...`);
  await new Promise(r => setTimeout(r, warmupSec * 1000));
  
  // Measurement
  console.log(`[Measure] ${measureSec} seconds...`);
  inMeasurementPhase = true;
  await new Promise(r => setTimeout(r, measureSec * 1000));
  inMeasurementPhase = false;

  // Cleanup
  workers.forEach(w => w.kill());
  if (dbInterval) clearInterval(dbInterval);
  if (dbClient) await dbClient.end();
  
  const depthEnd = await getOutboxDepth();
  const rowsPerSec = (published / measureSec).toFixed(2);
  
  const res = {
    workerCount, batchSize,
    depthStart, depthEnd,
    published, failed, timeouts, errors,
    rowsPerSec: parseFloat(rowsPerSec),
    p50: percentile(rpcTimes, 0.5),
    p95: percentile(rpcTimes, 0.95),
    p99: percentile(rpcTimes, 0.99),
    avgActiveQ: dbStats.activeQ.length ? (dbStats.activeQ.reduce((a,b)=>a+b,0)/dbStats.activeQ.length).toFixed(1) : 'N/A',
    avgLocks: dbStats.lockWaits.length ? (dbStats.lockWaits.reduce((a,b)=>a+b,0)/dbStats.lockWaits.length).toFixed(1) : 'N/A'
  };

  console.log(`\n--- LEVEL ${workerCount} WORKERS SUMMARY ---`);
  console.log(`PUBLISHED: ${res.published} | FAILED: ${res.failed} | TIMEOUTS: ${res.timeouts}`);
  console.log(`ROWS/SEC: ${res.rowsPerSec} | RPC (P50/95/99): ${res.p50}ms / ${res.p95}ms / ${res.p99}ms`);
  console.log(`DB ACTIVE_Q: ${res.avgActiveQ} | LOCK_WAITS: ${res.avgLocks}`);
  console.log(`------------------------------------------------------\n`);
  
  return res;
}

async function runScalingTest() {
  const batchSize = 30; // Small batch to prevent single-RPC timeouts
  const warmupSec = 30;
  const measureSec = 120;
  const workersToTest = [1, 2, 4, 8, 16];
  
  const results = [];
  
  for (const w of workersToTest) {
    const res = await runScalingLevel(w, batchSize, warmupSec, measureSec);
    results.push(res);
    
    // Stop Conditions Check
    if (res.timeouts > 0 || res.errors > 0) {
      console.log(`🛑 STOP CONDITION MET: Timeouts (${res.timeouts}) or Errors (${res.errors}) > 0`);
      break;
    }
    if (results.length > 1) {
      const prev = results[results.length - 2];
      const scalingEfficiency = (res.rowsPerSec / (prev.rowsPerSec * (res.workerCount / prev.workerCount))) * 100;
      console.log(`↳ Scaling Efficiency vs previous: ${scalingEfficiency.toFixed(1)}%`);
      
      if (res.rowsPerSec < prev.rowsPerSec) {
         console.log(`🛑 STOP CONDITION MET: Throughput DECREASED (${res.rowsPerSec} < ${prev.rowsPerSec})`);
         break;
      }
      if (scalingEfficiency < 10) { // e.g. < 10% increase relative to expectation (meaning it barely increased)
         console.log(`🛑 STOP CONDITION MET: Scaling efficiency dropped below 10%`);
         // we might continue if it's just efficiency dropping, but the user said:
         // "throughput aumenta menos de 10% al duplicar workers"
         const rawIncrease = (res.rowsPerSec - prev.rowsPerSec) / prev.rowsPerSec;
         if (rawIncrease < 0.10) {
             console.log(`🛑 STOP CONDITION MET: Throughput increased by less than 10% (${(rawIncrease*100).toFixed(1)}%)`);
             break;
         }
      }
      if (res.p95 > prev.p95 * 2 && prev.p95 > 100) {
         console.log(`🛑 STOP CONDITION MET: P95 latency doubled (${prev.p95}ms -> ${res.p95}ms)`);
         break;
      }
      if (res.avgLocks > 5) { // Arbitrary high lock wait count
         console.log(`🛑 STOP CONDITION MET: Significant Lock Waits detected (${res.avgLocks})`);
         break;
      }
    }
    
    console.log("Cooling down 10 seconds before next level...");
    await new Promise(r => setTimeout(r, 10000));
  }
  
  console.log(`\n\n======================================================`);
  console.log(`🏆 FINAL SCALING EFFICIENCY CURVE`);
  console.log(`======================================================`);
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    let eff = '100.0%';
    if (i > 0) {
      const baseline = results[0].rowsPerSec * r.workerCount;
      eff = ((r.rowsPerSec / baseline) * 100).toFixed(1) + '%';
    }
    console.log(`[${r.workerCount.toString().padStart(2)} WORKERS] THRPT: ${r.rowsPerSec.toString().padStart(6)} rows/s | EFF: ${eff.padStart(6)} | P50: ${r.p50}ms | LOCKS: ${r.avgLocks} | TOs: ${r.timeouts}`);
  }
}

runScalingTest().catch(console.error);
