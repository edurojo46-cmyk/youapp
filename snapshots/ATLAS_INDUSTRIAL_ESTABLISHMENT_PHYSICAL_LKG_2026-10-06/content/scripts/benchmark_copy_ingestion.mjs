import fs from 'fs';
import readline from 'readline';
import { Readable } from 'stream';
import pg from 'pg';
import dotenv from 'dotenv';
import { from as copyFrom } from 'pg-copy-streams';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
const SAMPLE_FILE = 'scratch/real_candidates_sample_100k.jsonl';

async function loadSampleRecords(maxNeeded = 25000) {
  console.log(`Loading ${maxNeeded} sample records into memory from ${SAMPLE_FILE}...`);
  const fileStream = fs.createReadStream(SAMPLE_FILE);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const records = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    records.push(JSON.parse(line));
    if (records.length >= maxNeeded) break;
  }
  console.log(`Loaded ${records.length} records into memory.`);
  return records;
}

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

async function runCopyBenchmark() {
  console.log('=== SECTION 5: COPY INGESTION BENCHMARK ===\n');

  const allRecords = await loadSampleRecords(25000);
  const batchSizes = [1000, 2500, 5000, 10000, 20000];
  const results = [];

  const client = await pool.connect();

  for (const bSize of batchSizes) {
    console.log(`\n------------------------------------------------------`);
    console.log(`Benchmarking PostgreSQL COPY with Batch Size = ${bSize}`);
    console.log(`------------------------------------------------------`);

    const batchSlice = allRecords.slice(0, bSize);
    const batchId = `copy_bench_${bSize}_${Date.now()}`;
    const csvBuffer = formatBatchToCsv(batchSlice, batchId);
    const bufferMb = csvBuffer.length / (1024 * 1024);

    // Truncate staging table
    await client.query('TRUNCATE atlas_ingest_v2_shadow.staging_incoming_records;');

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

    const dtMs = performance.now() - t0;
    const durationSec = dtMs / 1000;
    const rowsSec = Math.round(bSize / durationSec);
    const mbSec = Number((bufferMb / durationSec).toFixed(2));

    // Verify row count in staging
    const countRes = await client.query(`
      SELECT count(*) FROM atlas_ingest_v2_shadow.staging_incoming_records WHERE batch_id = $1;
    `, [batchId]);
    const verifiedRows = parseInt(countRes.rows[0].count, 10);

    const benchItem = {
      batch_size: bSize,
      verified_rows: verifiedRows,
      data_mb: Number(bufferMb.toFixed(2)),
      latency_ms: Number(dtMs.toFixed(1)),
      copy_rows_sec: rowsSec,
      copy_mb_sec: mbSec
    };

    results.push(benchItem);
    console.log(`Result: ${bSize} rows loaded in ${dtMs.toFixed(1)}ms (${rowsSec} rows/sec, ${mbSec} MB/sec)`);
  }

  client.release();

  // Find best batch
  results.sort((a, b) => b.copy_rows_sec - a.copy_rows_sec);
  const bestBatch = results[0];

  const report = {
    timestamp: new Date().toISOString(),
    copy_supported: true,
    best_bulk_batch: bestBatch.batch_size,
    best_copy_rows_sec: bestBatch.copy_rows_sec,
    benchmarks: results
  };

  fs.writeFileSync('reports/atlas/realtime/copy_ingestion_benchmark.json', JSON.stringify(report, null, 2));
  console.log('\nSaved benchmark report to reports/atlas/realtime/copy_ingestion_benchmark.json');
  console.log(`Best Bulk Batch: B${bestBatch.batch_size} at ${bestBatch.copy_rows_sec} rows/sec`);

  await pool.end();
}

runCopyBenchmark().catch(console.error);
