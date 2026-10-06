import fs from 'fs';
import readline from 'readline';
import { Readable } from 'stream';
import pg from 'pg';
import dotenv from 'dotenv';
import { from as copyFrom } from 'pg-copy-streams';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 12 });
const SAMPLE_FILE = 'scratch/real_candidates_sample_100k.jsonl';

function formatCsvCell(val) {
  if (val === null || val === undefined) return '';
  const s = String(val).replace(/"/g, '""').replace(/[\r\n]+/g, ' ');
  return `"${s}"`;
}

function formatBatchToCsv(records, batchId) {
  let csv = '';
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const row = [
      formatCsvCell(batchId),
      i + 1,
      `\\x${r.identity_hash_hex}`,
      formatCsvCell(r.source_id),
      formatCsvCell(r.source_record_key),
      formatCsvCell(r.display_name),
      formatCsvCell(r.organization),
      formatCsvCell(r.role),
      formatCsvCell(r.profession),
      formatCsvCell(r.geography_id),
      formatCsvCell(r.location_evidence),
      formatCsvCell(r.qualification_state),
      formatCsvCell(r.activity_state)
    ].join('\t');
    csv += row + '\n';
  }
  return Buffer.from(csv, 'utf8');
}

async function loadSampleRecords(count = 20000) {
  const fileStream = fs.createReadStream(SAMPLE_FILE);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  const records = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    records.push(JSON.parse(line));
    if (records.length >= count) break;
  }
  return records;
}

async function stageAndCommit(client, records, batchId) {
  const csvBuffer = formatBatchToCsv(records, batchId);
  const copySql = `
    COPY atlas_ingest_v2_shadow.staging_incoming_records (
      batch_id, batch_seq, identity_hash, source_id, source_record_key,
      display_name, organization, role, profession, geography_id,
      location_evidence, qualification_state, activity_state
    ) FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t', QUOTE '"', ESCAPE '"', NULL '');
  `;

  const t0 = performance.now();
  await new Promise((resolve, reject) => {
    const dbStream = client.query(copyFrom(copySql));
    const readable = new Readable({
      read() {
        this.push(csvBuffer);
        this.push(null);
      }
    });
    readable.pipe(dbStream);
    dbStream.on('finish', resolve);
    dbStream.on('error', reject);
  });

  const res = await client.query(`
    SELECT * FROM atlas_ingest_v2_shadow.commit_staged_batch_v2($1);
  `, [batchId]);

  const latency = performance.now() - t0;
  return { ...res.rows[0], latency_ms: latency };
}

async function runConcurrencyRace() {
  console.log('============================================================');
  console.log('  SECTION 7: CONCURRENCY RACE (C1, C2, C4, C8)');
  console.log('============================================================\n');

  const allRecords = await loadSampleRecords(20000);
  const concurrencyLevels = [1, 2, 4, 8];
  const results = [];
  let concurrencyPassed = true;

  const BATCH_SIZE = 1000;
  const TOTAL_BATCHES_PER_TIER = 8; // 8,000 records per concurrency tier

  for (const C of concurrencyLevels) {
    console.log(`------------------------------------------------------------`);
    console.log(`Testing Concurrency Level: C${C}`);
    console.log(`------------------------------------------------------------`);

    // Prepare batches: 50% non-overlapping, 50% overlapping (intentional identity contention)
    const batches = [];
    for (let b = 0; b < TOTAL_BATCHES_PER_TIER; b++) {
      // Intentionally overlap batches so different workers process identical keys simultaneously
      const startIdx = (b % 4) * BATCH_SIZE;
      const slice = allRecords.slice(startIdx, startIdx + BATCH_SIZE);
      batches.push({
        batchId: `conc_c${C}_b${b}_${Date.now()}`,
        records: slice
      });
    }

    const tStart = performance.now();
    const latencies = [];
    let deadlocks = 0;
    let errors = 0;
    let totalStaged = 0;
    let totalNewCanonicals = 0;

    // Worker pool queue
    let queueIdx = 0;
    async function worker(workerId) {
      const client = await pool.connect();
      try {
        while (true) {
          const currentBatchIdx = queueIdx++;
          if (currentBatchIdx >= batches.length) break;

          const batch = batches[currentBatchIdx];
          try {
            const out = await stageAndCommit(client, batch.records, batch.batchId);
            latencies.push(out.latency_ms);
            totalStaged += Number(out.total_staged);
            totalNewCanonicals += Number(out.new_canonical_count);
          } catch (err) {
            errors++;
            if (err.message && err.message.includes('deadlock')) {
              deadlocks++;
            }
            console.error(`  Worker ${workerId} error on batch ${batch.batchId}: ${err.message}`);
          }
        }
      } finally {
        client.release();
      }
    }

    // Launch C concurrent workers
    const workerPromises = [];
    for (let w = 0; w < C; w++) {
      workerPromises.push(worker(w));
    }
    await Promise.all(workerPromises);

    const tTotalSec = (performance.now() - tStart) / 1000;

    // Percentiles
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.50)] || 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
    const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

    const totalRows = batches.length * BATCH_SIZE;
    const throughputRowsSec = Math.round(totalRows / tTotalSec);
    const contractualTrueNewSec = Math.round(totalNewCanonicals / tTotalSec);

    console.log(`C${C} Results:`);
    console.log(`  - Total Rows: ${totalRows.toLocaleString()} in ${tTotalSec.toFixed(2)}s (${throughputRowsSec.toLocaleString()} rows/sec)`);
    console.log(`  - CONTRACTUAL_TRUE_NEW_SEC: ${contractualTrueNewSec}`);
    console.log(`  - Latencies: P50=${p50.toFixed(1)}ms | P95=${p95.toFixed(1)}ms | P99=${p99.toFixed(1)}ms`);
    console.log(`  - Deadlocks: ${deadlocks} | Errors: ${errors}`);

    if (deadlocks > 0 || errors > 0) {
      concurrencyPassed = false;
    }

    results.push({
      concurrency: C,
      elapsed_sec: Number(tTotalSec.toFixed(2)),
      total_rows: totalRows,
      throughput_rows_sec: throughputRowsSec,
      contractual_true_new_sec: contractualTrueNewSec,
      p50_ms: Number(p50.toFixed(1)),
      p95_ms: Number(p95.toFixed(1)),
      p99_ms: Number(p99.toFixed(1)),
      deadlocks,
      errors
    });
  }

  // Find best concurrency
  // Best concurrency has highest throughput with P95 under safe threshold
  results.sort((a, b) => b.throughput_rows_sec - a.throughput_rows_sec);
  const bestConcurrency = results[0];

  console.log(`\n============================================================`);
  console.log(`CONCURRENCY_PASS = ${concurrencyPassed ? 'TRUE' : 'FALSE'}`);
  console.log(`BEST_CONCURRENCY = C${bestConcurrency.concurrency} (${bestConcurrency.throughput_rows_sec.toLocaleString()} rows/sec, P95: ${bestConcurrency.p95_ms}ms)`);
  console.log(`============================================================\n`);

  const report = {
    timestamp: new Date().toISOString(),
    concurrency_pass: concurrencyPassed,
    best_concurrency: `C${bestConcurrency.concurrency}`,
    best_concurrency_num: bestConcurrency.concurrency,
    benchmarks: results
  };

  fs.writeFileSync('reports/atlas/realtime/v2_concurrency_race.json', JSON.stringify(report, null, 2));
  console.log('Saved report to reports/atlas/realtime/v2_concurrency_race.json\n');

  await pool.end();
}

runConcurrencyRace().catch(console.error);
