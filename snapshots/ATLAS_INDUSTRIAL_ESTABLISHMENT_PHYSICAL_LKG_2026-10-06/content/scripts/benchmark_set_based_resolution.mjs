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

async function runSetBasedBenchmark() {
  console.log('=== SECTION 6: SET-BASED IDENTITY RESOLUTION & CANONICAL MERGE BENCHMARK ===\n');

  const allRecords = await loadSampleRecords(25000);
  const batchSizes = [1000, 2500, 5000, 10000, 20000];
  const results = [];

  const client = await pool.connect();

  for (const bSize of batchSizes) {
    console.log(`\n------------------------------------------------------`);
    console.log(`Benchmarking Batch Size = ${bSize}`);
    console.log(`------------------------------------------------------`);

    const batchSlice = allRecords.slice(0, bSize);
    const batchId = `set_bench_${bSize}_${Date.now()}`;
    const csvBuffer = formatBatchToCsv(batchSlice, batchId);

    // 1. Stage records via COPY
    await client.query('TRUNCATE atlas_ingest_v2_shadow.staging_incoming_records;');
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

    // 2. Measure Pure Set-Based Identity Resolution (EXPLAIN ANALYZE)
    const resolveSql = `
      EXPLAIN (ANALYZE, FORMAT JSON)
      SELECT 
        s.identity_hash,
        k.atlas_person_id,
        CASE WHEN k.atlas_person_id IS NULL THEN 'NEW_CANONICAL' ELSE 'EXISTING_CANONICAL' END as classification
      FROM atlas_ingest_v2_shadow.staging_incoming_records s
      LEFT JOIN atlas_ingest_v2_shadow.atlas_identity_keys_v2 k
        ON k.identity_hash = s.identity_hash
      WHERE s.batch_id = $1;
    `;
    const planRes = await client.query(resolveSql, [batchId]);
    const planJson = planRes.rows[0]['QUERY PLAN'][0];
    const resolveTimeMs = Number(planJson['Execution Time']);
    const identityRowsSec = Math.round((bSize / (resolveTimeMs / 1000)));

    console.log(`Pure Identity Resolution: ${bSize} rows evaluated in ${resolveTimeMs.toFixed(2)}ms (${identityRowsSec} rows/sec)`);

    // 3. Measure Full Set-Based Canonical Merge + Outbox Emission
    const mergeRes = await client.query(`
      SELECT * FROM atlas_ingest_v2_shadow.commit_staged_batch_v2($1);
    `, [batchId]);

    const mergeData = mergeRes.rows[0];
    const mergeTimeMs = Number(mergeData.execution_time_ms);
    const mergeRowsSec = Math.round((bSize / (mergeTimeMs / 1000)));

    console.log(`Full Set-Based Merge: ${bSize} rows merged in ${mergeTimeMs.toFixed(2)}ms (${mergeRowsSec} rows/sec)`);
    console.log(`  - New Canonicals Created: ${mergeData.new_canonical_count}`);
    console.log(`  - Existing Re-classified: ${mergeData.existing_canonical_count}`);

    results.push({
      batch_size: bSize,
      identity_resolution_time_ms: resolveTimeMs,
      identity_rows_sec: identityRowsSec,
      merge_execution_time_ms: mergeTimeMs,
      merge_rows_sec: mergeRowsSec,
      new_canonical_count: mergeData.new_canonical_count,
      existing_canonical_count: mergeData.existing_canonical_count
    });
  }

  client.release();

  const report = {
    timestamp: new Date().toISOString(),
    benchmarks: results
  };

  fs.writeFileSync('reports/atlas/realtime/set_based_resolution_benchmark.json', JSON.stringify(report, null, 2));
  console.log('\nSaved benchmark report to reports/atlas/realtime/set_based_resolution_benchmark.json');

  await pool.end();
}

runSetBasedBenchmark().catch(console.error);
