import fs from 'fs';
import readline from 'readline';
import { Readable } from 'stream';
import pg from 'pg';
import dotenv from 'dotenv';
import { from as copyFrom } from 'pg-copy-streams';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
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

async function runBatchSelection() {
  console.log('============================================================');
  console.log('  SECTION 9: BATCH SIZE SELECTION (B2500 - B15000)');
  console.log('============================================================\n');

  const allRecords = await loadSampleRecords(20000);
  const batchSizes = [2500, 5000, 7500, 10000, 15000];
  const client = await pool.connect();
  const evaluation = [];

  for (const bSize of batchSizes) {
    console.log(`Evaluating Batch Size: B${bSize}...`);
    const records = allRecords.slice(0, bSize);
    const batchId = `eval_batch_${bSize}_${Date.now()}`;
    const csvBuffer = formatBatchToCsv(records, batchId);

    // Get DB metrics before
    const walBeforeRes = await client.query('SELECT pg_current_wal_lsn() as wal_lsn;');
    const startWal = walBeforeRes.rows[0].wal_lsn;

    // 1. COPY Stage
    const tCopyStart = performance.now();
    const copySql = `
      COPY atlas_ingest_v2_shadow.staging_incoming_records (
        batch_id, batch_seq, identity_hash, source_id, source_record_key,
        display_name, organization, role, profession, geography_id,
        location_evidence, qualification_state, activity_state
      ) FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t', QUOTE '"', ESCAPE '"', NULL '');
    `;

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
    const copyDtMs = performance.now() - tCopyStart;

    // 2. Set-Based Merge
    const tMergeStart = performance.now();
    const mergeRes = await client.query(`
      SELECT * FROM atlas_ingest_v2_shadow.commit_staged_batch_v2($1);
    `, [batchId]);
    const mergeDtMs = performance.now() - tMergeStart;

    const walAfterRes = await client.query('SELECT pg_current_wal_lsn() as wal_lsn;');
    const walDiffRes = await client.query('SELECT pg_wal_lsn_diff($1::pg_lsn, $2::pg_lsn) as wal_bytes;', [walAfterRes.rows[0].wal_lsn, startWal]);
    const walMb = Number((Number(walDiffRes.rows[0].wal_bytes) / (1024 * 1024)).toFixed(2));

    const totalElapsedMs = copyDtMs + mergeDtMs;
    const totalElapsedSec = totalElapsedMs / 1000;
    const throughputRowsSec = Math.round(bSize / totalElapsedSec);

    console.log(`  B${bSize}: Total=${totalElapsedMs.toFixed(1)}ms (COPY=${copyDtMs.toFixed(1)}ms, Merge=${mergeDtMs.toFixed(1)}ms) -> ${throughputRowsSec} rows/sec | WAL=${walMb}MB`);

    evaluation.push({
      batch_size: bSize,
      copy_latency_ms: Number(copyDtMs.toFixed(1)),
      merge_latency_ms: Number(mergeDtMs.toFixed(1)),
      total_latency_ms: Number(totalElapsedMs.toFixed(1)),
      total_latency_sec: Number(totalElapsedSec.toFixed(2)),
      throughput_rows_sec: throughputRowsSec,
      wal_mb: walMb,
      recovery_cost_risk: bSize > 10000 ? 'ELEVATED' : 'LOW'
    });
  }

  client.release();

  // Sort by highest throughput with total latency <= 3000ms (safe tail SLA)
  const safeCandidates = evaluation.filter(e => e.total_latency_ms <= 3000);
  safeCandidates.sort((a, b) => b.throughput_rows_sec - a.throughput_rows_sec);
  const bestBatch = safeCandidates[0] || evaluation[0];

  console.log(`\n============================================================`);
  console.log(`BEST_BATCH_SIZE = B${bestBatch.batch_size} (${bestBatch.throughput_rows_sec} rows/sec, latency: ${bestBatch.total_latency_ms}ms)`);
  console.log(`============================================================\n`);

  const report = {
    timestamp: new Date().toISOString(),
    best_batch_size: `B${bestBatch.batch_size}`,
    best_batch_size_num: bestBatch.batch_size,
    benchmarks: evaluation
  };

  fs.writeFileSync('reports/atlas/realtime/v2_batch_size_selection.json', JSON.stringify(report, null, 2));
  console.log('Saved report to reports/atlas/realtime/v2_batch_size_selection.json\n');

  await pool.end();
}

runBatchSelection().catch(console.error);
