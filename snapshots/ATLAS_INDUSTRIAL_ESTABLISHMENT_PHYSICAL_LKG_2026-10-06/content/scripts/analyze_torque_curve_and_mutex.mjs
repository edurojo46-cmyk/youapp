import fs from 'fs';

const data = JSON.parse(fs.readFileSync('reports/atlas/realtime/target_commit_events.json', 'utf8'));

function computeStats(batchRows) {
  const events = data.filter(e => e.input_rows === batchRows && e.rpc_execution_ms !== null && e.rpc_execution_ms !== undefined);
  if (events.length === 0) return null;

  const rpcWait = events.map(e => e.rpc_wait_ms).filter(v => v !== null).sort((a,b) => a-b);
  const rpcExec = events.map(e => e.rpc_execution_ms).filter(v => v !== null).sort((a,b) => a-b);
  const p50Wait = rpcWait[Math.floor(rpcWait.length * 0.5)] || 0;
  const p95Wait = rpcWait[Math.floor(rpcWait.length * 0.95)] || 0;
  const p50Exec = rpcExec[Math.floor(rpcExec.length * 0.5)] || 0;
  const p95Exec = rpcExec[Math.floor(rpcExec.length * 0.95)] || 0;
  const p99Exec = rpcExec[Math.floor(rpcExec.length * 0.99)] || 0;

  const totalTrueNew = events.reduce((acc, e) => acc + (e.global_true_new || 0), 0);
  const targetTrueNew = events.reduce((acc, e) => acc + (e.target_true_new || 0), 0);
  const firstT = events[0].ts;
  const lastT = events[events.length - 1].ts;
  const durationSec = Math.max((lastT - firstT) / 1000, 1);
  const trueNewSec = totalTrueNew / durationSec;
  const targetTrueNewSec = targetTrueNew / durationSec;
  const rpcCallsSec = events.length / durationSec;
  const avgRowsRpc = events.reduce((acc, e) => acc + e.input_rows, 0) / events.length;

  const avgRpcWait = rpcWait.reduce((a, b) => a + b, 0) / rpcWait.length;
  const avgRpcExec = rpcExec.reduce((a, b) => a + b, 0) / rpcExec.length;
  const avgPrep = events.map(e => e.rpc_prep_ms || 0).reduce((a, b) => a + b, 0) / events.length;
  const totalCommitLatency = avgRpcWait + avgPrep + avgRpcExec;
  const mutexAmplificationFactor = totalCommitLatency / Math.max(avgRpcExec, 1);
  const waitToExecRatio = avgRpcWait / Math.max(avgRpcExec, 1);

  // Commit service rate
  const commitServiceRateBatchesSec = 1000 / Math.max(p50Exec, 1);
  const commitServiceRateRowsSec = commitServiceRateBatchesSec * avgRowsRpc;
  const trueNewPerRpc = totalTrueNew / events.length;

  // Queue arrival rate (from upstream producer: ~2 workers fetching batches of `batchRows`)
  // During each experiment, producer buffer was green (8,000+ candidates)
  // Queue arrivals happen roughly as workers process or backpressure keeps high watermark
  const queueArrivalRate = rpcCallsSec; // in steady state with locked concurrency C=2
  const queueStabilityMargin = ((commitServiceRateBatchesSec - queueArrivalRate) / commitServiceRateBatchesSec) * 100;

  return {
    batch_size: batchRows,
    count: events.length,
    total_true_new: totalTrueNew,
    target_true_new: targetTrueNew,
    duration_sec: Number(durationSec.toFixed(1)),
    true_new_sec: Number(trueNewSec.toFixed(2)),
    target_true_new_sec: Number(targetTrueNewSec.toFixed(2)),
    rpc_calls_sec: Number(rpcCallsSec.toFixed(2)),
    rows_rpc: Number(avgRowsRpc.toFixed(1)),
    rpc_wait_p50: Number(p50Wait.toFixed(0)),
    rpc_wait_p95: Number(p95Wait.toFixed(0)),
    rpc_exec_p50: Number(p50Exec.toFixed(0)),
    rpc_exec_p95: Number(p95Exec.toFixed(0)),
    rpc_exec_p99: Number(p99Exec.toFixed(0)),
    total_commit_latency_ms: Number(totalCommitLatency.toFixed(1)),
    mutex_amplification_factor: Number(mutexAmplificationFactor.toFixed(2)),
    wait_to_exec_ratio: Number(waitToExecRatio.toFixed(2)),
    commit_service_rate_batches_sec: Number(commitServiceRateBatchesSec.toFixed(2)),
    commit_service_rate_rows_sec: Number(commitServiceRateRowsSec.toFixed(2)),
    true_new_per_rpc: Number(trueNewPerRpc.toFixed(2)),
    queue_arrival_rate: Number(queueArrivalRate.toFixed(2)),
    queue_stability_margin_pct: Number(queueStabilityMargin.toFixed(1))
  };
}

const stats25 = computeStats(25);
const stats50 = computeStats(50);
const stats100 = computeStats(100);

const summary = {
  BATCH_25_RESULTS: stats25,
  BATCH_50_RESULTS: stats50,
  BATCH_100_RESULTS: stats100
};

console.log(JSON.stringify(summary, null, 2));
fs.writeFileSync('reports/atlas/realtime/torque_curve_summary.json', JSON.stringify(summary, null, 2), 'utf8');
