import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

function makeBatch(workerId, batchIdx, size) {
  const testRows = [];
  const outRows = [];
  const now = Date.now();
  for (let i = 0; i < size; i++) {
    const pid = `per_test_w${workerId}_b${batchIdx}_${now}_${i}`;
    testRows.push({
      atlas_person_id: pid,
      source_id: `BENCH_W${workerId}`,
      source_person_id: `rec_w${workerId}_b${batchIdx}_${now}_${i}`,
      identifier_type: 'NATIONAL_IDENTITY_HMAC',
      identifier_value: `hmac_w${workerId}_b${batchIdx}_${now}_${i}`,
      evidence_id: `ev_${i}`,
      confidence: 1.0,
      resolution_method: 'BENCH',
      observed_at: new Date().toISOString()
    });
    outRows.push({
      atlas_person_id: pid,
      source_id: `BENCH_W${workerId}`,
      source_record_id: `rec_w${workerId}_b${batchIdx}_${now}_${i}`,
      payload: { name: `Test W${workerId} ${i}` },
      payload_version: 1
    });
  }
  return { idJson: JSON.stringify(testRows), outJson: JSON.stringify(outRows) };
}

async function testMatrixConfig(batchSize, concurrency, numBatchesPerWorker = 2) {
  console.log(`\n================================================================`);
  console.log(`Testing Config: Batch Size ${batchSize} × Concurrency ${concurrency}`);
  console.log(`================================================================`);

  const dbConfig = parseDbUrl();
  const clients = await Promise.all(
    Array.from({ length: concurrency }, async () => {
      const c = new pg.Client(dbConfig);
      await c.connect();
      return c;
    })
  );

  const latencies = [];
  let totalCommitted = 0;
  let errors = 0;
  const tStart = performance.now();

  const workerPromises = clients.map(async (client, workerIdx) => {
    for (let b = 0; b < numBatchesPerWorker; b++) {
      const { idJson, outJson } = makeBatch(workerIdx, b, batchSize);
      const t0 = performance.now();
      try {
        await client.query('BEGIN');
        const res = await client.query(
          'SELECT public.commit_canonical_with_search_outbox($1::jsonb, $2::jsonb) AS result',
          [idJson, outJson]
        );
        await client.query('ROLLBACK');
        const dt = performance.now() - t0;
        latencies.push(dt);
        const r = res.rows[0].result;
        if (r.ok) {
          totalCommitted += r.identity_rows_inserted;
        } else {
          errors++;
          console.error(`[Worker ${workerIdx}] RPC error:`, r.error);
        }
      } catch (err) {
        errors++;
        console.error(`[Worker ${workerIdx}] DB error:`, err.message);
        try { await client.query('ROLLBACK'); } catch {}
      }
    }
  });

  await Promise.all(workerPromises);
  const totalElapsed = performance.now() - tStart;

  await Promise.all(clients.map(c => c.end()));

  latencies.sort((a, b) => a - b);
  const avgLat = latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const throughput = (totalCommitted / (totalElapsed / 1000));

  console.log(`Total rows processed: ${totalCommitted} in ${totalElapsed.toFixed(1)} ms`);
  console.log(`Avg RPC Latency:      ${avgLat.toFixed(1)} ms (p50: ${p50.toFixed(1)} ms, p95: ${p95.toFixed(1)} ms)`);
  console.log(`Throughput:           ${throughput.toFixed(1)} rows/second`);
  console.log(`Errors / Deadlocks:   ${errors}`);

  return {
    batchSize,
    concurrency,
    totalCommitted,
    totalElapsedMs: totalElapsed,
    avgLatencyMs: avgLat,
    p50Ms: p50,
    p95Ms: p95,
    throughputRowsPerSec: throughput,
    errors
  };
}

async function run() {
  const configs = [
    { batchSize: 100, concurrency: 4 },
    { batchSize: 100, concurrency: 8 },
    { batchSize: 200, concurrency: 4 },
    { batchSize: 200, concurrency: 8 }
  ];

  const results = [];
  for (const cfg of configs) {
    const res = await testMatrixConfig(cfg.batchSize, cfg.concurrency, 3);
    results.push(res);
  }

  console.log(`\n================================================================`);
  console.log(`📊 MATRIX BENCHMARK SUMMARY (POSTGRES ENGINE)`);
  console.log(`================================================================`);
  console.table(results.map(r => ({
    Config: `${r.batchSize} × ${r.concurrency}`,
    'Throughput (rows/s)': r.throughputRowsPerSec.toFixed(1),
    'Avg Latency (ms)': r.avgLatencyMs.toFixed(1),
    'p95 Latency (ms)': r.p95Ms.toFixed(1),
    Errors: r.errors
  })));
}

run().catch(console.error);
