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

async function loadSampleRecords(count = 500) {
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

async function runCrashRecoveryTests() {
  console.log('============================================================');
  console.log('  SECTION 6: CRASH RECOVERY & UNLOGGED STAGING TESTS');
  console.log('============================================================\n');

  const records = await loadSampleRecords(500);
  const client = await pool.connect();
  let allTestsPassed = true;
  const testResults = [];

  try {
    // -------------------------------------------------------------
    // CASE 1: INJECT FAILURE DURING COPY
    // -------------------------------------------------------------
    console.log('Case 1: Injecting failure DURING COPY stream...');
    const bId1 = `crash_during_copy_${Date.now()}`;
    const partialBuffer = formatBatchToCsv(records.slice(0, 100), bId1).slice(0, 500); // truncated mid-byte

    let copyFailedCleanly = false;
    try {
      const copySql = `
        COPY atlas_ingest_v2_shadow.staging_incoming_records (
          batch_id, batch_seq, identity_hash, source_id, source_record_key,
          display_name, organization, role, profession, geography_id,
          location_evidence, qualification_state, activity_state
        ) FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t', QUOTE '"', ESCAPE '"', NULL '');
      `;
      const stream = client.query(copyFrom(copySql));
      const readable = new Readable({
        read() {
          this.push(partialBuffer);
          this.destroy(new Error('Simulated network socket termination during COPY'));
        }
      });
      await new Promise((resolve, reject) => {
        readable.pipe(stream);
        stream.on('finish', resolve);
        stream.on('error', reject);
        readable.on('error', reject);
      });
    } catch (e) {
      copyFailedCleanly = true;
      console.log(`  Expected COPY failure caught: ${e.message}`);
    }

    // Recover by replaying full batch from raw manifest
    console.log('  Replaying batch from durable raw manifest...');
    const fullBuffer1 = formatBatchToCsv(records, bId1);
    const clientRecover1 = await pool.connect();
    await clientRecover1.query('DELETE FROM atlas_ingest_v2_shadow.staging_incoming_records WHERE batch_id = $1;', [bId1]);

    const copySql1 = `
      COPY atlas_ingest_v2_shadow.staging_incoming_records (
        batch_id, batch_seq, identity_hash, source_id, source_record_key,
        display_name, organization, role, profession, geography_id,
        location_evidence, qualification_state, activity_state
      ) FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t', QUOTE '"', ESCAPE '"', NULL '');
    `;
    const s1 = clientRecover1.query(copyFrom(copySql1));
    const r1 = new Readable({ read() { this.push(fullBuffer1); this.push(null); } });
    await new Promise((resolve, reject) => { r1.pipe(s1); s1.on('finish', resolve); s1.on('error', reject); });
    const resMerge1 = await clientRecover1.query('SELECT * FROM atlas_ingest_v2_shadow.commit_staged_batch_v2($1);', [bId1]);
    console.log(`  Recovery complete: total_staged=${resMerge1.rows[0].total_staged}, new=${resMerge1.rows[0].new_canonical_count}`);
    clientRecover1.release();

    testResults.push({ case: 'DURING_COPY', pass: copyFailedCleanly && resMerge1.rows[0].total_staged === 500 });

    // -------------------------------------------------------------
    // CASE 2: INJECT FAILURE AFTER COPY BEFORE MERGE
    // -------------------------------------------------------------
    console.log('\nCase 2: Injecting failure AFTER COPY BEFORE MERGE...');
    const bId2 = `crash_after_copy_${Date.now()}`;
    const fullBuffer2 = formatBatchToCsv(records, bId2);
    const client2 = await pool.connect();
    const s2 = client2.query(copyFrom(copySql1));
    const r2 = new Readable({ read() { this.push(fullBuffer2); this.push(null); } });
    await new Promise((resolve, reject) => { r2.pipe(s2); s2.on('finish', resolve); s2.on('error', reject); });

    // Simulated worker crash: connection closed without calling merge
    client2.release(true); // destroy client
    console.log('  Worker simulated crash: connection severed before merge.');

    // Next worker wakes up, inspects staging or replays batch
    const clientRecover2 = await pool.connect();
    const resMerge2 = await clientRecover2.query('SELECT * FROM atlas_ingest_v2_shadow.commit_staged_batch_v2($1);', [bId2]);
    console.log(`  Resumed execution: total_staged=${resMerge2.rows[0].total_staged}, new=${resMerge2.rows[0].new_canonical_count}`);
    clientRecover2.release();

    testResults.push({ case: 'AFTER_COPY_BEFORE_MERGE', pass: resMerge2.rows[0].total_staged === 500 });

    // -------------------------------------------------------------
    // CASE 3: INJECT FAILURE AFTER CANONICAL MERGE BEFORE ACK (RETRY)
    // -------------------------------------------------------------
    console.log('\nCase 3: Injecting failure AFTER MERGE BEFORE ACK (Idempotent Retry)...');
    const bId3 = `crash_after_merge_${Date.now()}`;
    const fullBuffer3 = formatBatchToCsv(records, bId3);
    const client3 = await pool.connect();
    const s3 = client3.query(copyFrom(copySql1));
    const r3 = new Readable({ read() { this.push(fullBuffer3); this.push(null); } });
    await new Promise((resolve, reject) => { r3.pipe(s3); s3.on('finish', resolve); s3.on('error', reject); });

    // Successfully committed in DB
    const resCommit3 = await client3.query('SELECT * FROM atlas_ingest_v2_shadow.commit_staged_batch_v2($1);', [bId3]);
    console.log(`  DB commit succeeded (new=${resCommit3.rows[0].new_canonical_count}), but client network dropped before ACK.`);
    client3.release(true);

    // Client retries entire batch from durable manifest
    const clientRetry3 = await pool.connect();
    const s3Retry = clientRetry3.query(copyFrom(copySql1));
    const r3Retry = new Readable({ read() { this.push(fullBuffer3); this.push(null); } });
    await new Promise((resolve, reject) => { r3Retry.pipe(s3Retry); s3Retry.on('finish', resolve); s3Retry.on('error', reject); });
    const resRetry3 = await clientRetry3.query('SELECT * FROM atlas_ingest_v2_shadow.commit_staged_batch_v2($1);', [bId3]);
    console.log(`  Retry execution: new_canonical_count=${resRetry3.rows[0].new_canonical_count}, existing=${resRetry3.rows[0].existing_canonical_count}`);

    const retryPassed = (resRetry3.rows[0].new_canonical_count === 0);
    clientRetry3.release();

    testResults.push({ case: 'AFTER_MERGE_BEFORE_ACK', pass: retryPassed });

    console.log('\n--- CRASH RECOVERY SUMMARY ---');
    console.table(testResults);

    allTestsPassed = testResults.every(t => t.pass);
    console.log(`CRASH_RECOVERY_PASS: ${allTestsPassed ? 'TRUE' : 'FALSE'}\n`);

    const report = {
      timestamp: new Date().toISOString(),
      crash_recovery_pass: allTestsPassed,
      test_results: testResults
    };

    fs.writeFileSync('reports/atlas/realtime/v2_crash_recovery_report.json', JSON.stringify(report, null, 2));
    console.log('Saved report to reports/atlas/realtime/v2_crash_recovery_report.json\n');

  } finally {
    client.release();
    await pool.end();
  }
}

runCrashRecoveryTests().catch(console.error);
