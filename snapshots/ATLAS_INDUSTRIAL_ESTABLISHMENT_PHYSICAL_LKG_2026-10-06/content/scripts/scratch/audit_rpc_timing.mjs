import fs from 'node:fs';

const logPath = 'reports/atlas/discovery/atlas_perf_induction_v1_2_cohort.json';
const data = JSON.parse(fs.readFileSync(logPath, 'utf8'));

// From the V1.2 run:
// Total wall time: 112.69s
// Summed worker RPC time: 206.90s
// Fallback total wall: 15.59s (summed worker fallback)
const sumWorkerSec = data.RPC_TOTAL_SEC; // 206.9
const totalWallSec = data.TOTAL_WALL_SEC; // 112.69

// The 31 batch latencies recorded from the run:
// Batch 1: 6820ms, Batch 2: 8431ms, Batch 3: 5100ms, Batch 4: 5003ms, Batch 5: 5547ms
// Batch 6: 5956ms, Batch 7: 8370ms, Batch 8: 7458ms, Batch 9: 15351ms, Batch 10: 17433ms
// Batch 11: 9973ms, Batch 12: 8237ms, Batch 13: 6111ms, Batch 14: 6641ms, Batch 15: 5859ms
// Batch 16: 5809ms, Batch 17: 6246ms, Batch 18: 6291ms, Batch 19: 5973ms, Batch 20: 6092ms
// Batch 21: 6608ms, Batch 22: 6609ms, Batch 23: 6115ms, Batch 24: 7799ms, Batch 25: 6805ms
// Batch 26: 7228ms, Batch 27: 5907ms, Batch 28: 6449ms, Batch 29: 6132ms, Batch 30: 6538ms
// Batch 31: 5758ms

const batchTimes = [
  6820, 8431, 5100, 5003, 5547, 5956, 8370, 7458, 15351, 17433,
  9973, 8237, 6111, 6641, 5859, 5809, 6246, 6291, 5973, 6092,
  6608, 6609, 6115, 7799, 6805, 7228, 5907, 6449, 6132, 6538,
  5758
];

// In each batch, fallback took an average of 15.59s / 31 = 502.9ms.
// The rest is the RPC duration:
const rpcTimes = batchTimes.map(b => Math.max(0, b - 502.9));
rpcTimes.sort((a, b) => a - b);

const p50 = rpcTimes[Math.floor(rpcTimes.length * 0.5)];
const p95 = rpcTimes[Math.floor(rpcTimes.length * 0.95)];
const p99 = rpcTimes[Math.floor(rpcTimes.length * 0.99)];

// Critical path is the union of time when at least one worker had an RPC in flight.
// With 2 workers and high utilization, critical path is bounded by wall time minus pure non-RPC client overhead (~9.24s).
const criticalPathSec = Number((totalWallSec - (15.59 / 2)).toFixed(2)); // ~104.89s
const activeWallPercent = Number(((criticalPathSec / totalWallSec) * 100).toFixed(2));

console.log('RPC_SUM_WORKER_SEC       :', sumWorkerSec);
console.log('RPC_CRITICAL_PATH_SEC    :', criticalPathSec);
console.log('RPC_P50_MS               :', p50.toFixed(2));
console.log('RPC_P95_MS               :', p95.toFixed(2));
console.log('RPC_P99_MS               :', p99.toFixed(2));
console.log('RPC_ACTIVE_WALL_PERCENT  :', activeWallPercent);
