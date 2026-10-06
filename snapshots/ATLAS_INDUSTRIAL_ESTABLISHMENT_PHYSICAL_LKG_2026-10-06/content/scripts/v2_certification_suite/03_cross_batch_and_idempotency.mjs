import fs from 'fs';
import readline from 'readline';
import { Readable } from 'stream';
import pg from 'pg';
import dotenv from 'dotenv';
import { from as copyFrom } from 'pg-copy-streams';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 4 });
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

async function loadSampleRecords(count = 10000) {
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

async function stageAndCommitBatch(client, records, batchId) {
  const csvBuffer = formatBatchToCsv(records, batchId);
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

  const res = await client.query(`
    SELECT * FROM atlas_ingest_v2_shadow.commit_staged_batch_v2($1);
  `, [batchId]);

  return res.rows[0];
}

async function runCrossBatchAndIdempotencyTests() {
  console.log('============================================================');
  console.log('  SECTION 4 & 5: CROSS-BATCH DUPLICATION & IDEMPOTENCY TESTS');
  console.log('============================================================\n');

  const records10K = await loadSampleRecords(10000);
  const client = await pool.connect();

  let crossBatchPass = true;
  let idempotencyPass = true;

  try {
    // -----------------------------------------------------------------
    // TEST 4: CROSS-BATCH DUPLICATION
    // -----------------------------------------------------------------
    console.log('--- TEST 4: CROSS-BATCH DUPLICATION SCENARIOS ---');

    // Pick 5 specific distinct candidate records to test cross-batch injection
    const testCands = records10K.slice(0, 5);
    const testHash = testCands[0].identity_hash_hex;

    // Clean test identity from shadow tables if already present
    await client.query(`
      DELETE FROM atlas_ingest_v2_shadow.atlas_identity_keys_v2 WHERE identity_hash = decode($1, 'hex');
    `, [testHash]);
    await client.query(`
      DELETE FROM atlas_ingest_v2_shadow.atlas_canonical_persons_v2 WHERE primary_identity_hash = decode($1, 'hex');
    `, [testHash]);

    // Scenario A: Twice in same batch
    console.log('Scenario A: Duplicate identity appearing twice in ONE batch...');
    const batchA = [testCands[0], testCands[0]]; // identical identity twice
    const resA = await stageAndCommitBatch(client, batchA, `test_dup_same_${Date.now()}`);
    console.log(`  Result: staged=${resA.total_staged}, new=${resA.new_canonical_count}, existing=${resA.existing_canonical_count}`);
    if (resA.new_canonical_count !== 1) {
      console.error('FAIL: Expected exactly 1 new canonical for intra-batch duplicate!');
      crossBatchPass = false;
    }

    // Scenario B: Consecutive batches
    console.log('Scenario B: Identity appearing in CONSECUTIVE batch...');
    const batchB = [testCands[0]];
    const resB = await stageAndCommitBatch(client, batchB, `test_dup_consec_${Date.now()}`);
    console.log(`  Result: staged=${resB.total_staged}, new=${resB.new_canonical_count}, existing=${resB.existing_canonical_count}`);
    if (resB.new_canonical_count !== 0 || resB.existing_canonical_count !== 1) {
      console.error('FAIL: Expected 0 new canonicals and 1 existing for consecutive batch!');
      crossBatchPass = false;
    }

    // Verify canonical persons count in shadow table for this hash
    const countRes = await client.query(`
      SELECT count(*) as count FROM atlas_ingest_v2_shadow.atlas_canonical_persons_v2 
      WHERE primary_identity_hash = decode($1, 'hex');
    `, [testHash]);
    const personCount = parseInt(countRes.rows[0].count, 10);
    console.log(`  Physical Canonical Person Count for identity in DB: ${personCount}`);
    if (personCount !== 1) {
      console.error('FAIL: Expected exactly 1 physical person in DB!');
      crossBatchPass = false;
    }

    // -----------------------------------------------------------------
    // TEST 5: IDEMPOTENCY TEST (Replay exact same 10K batch 2x, 5x, 10x)
    // -----------------------------------------------------------------
    console.log('\n--- TEST 5: IDEMPOTENCY REPLAY TEST (10K BATCH) ---');

    // Run 1: Base execution
    console.log('Execution 1 (Base)...');
    const res1 = await stageAndCommitBatch(client, records10K, `idemp_run_1_${Date.now()}`);
    const baseNew = res1.new_canonical_count;
    console.log(`  Run 1: Total Staged=${res1.total_staged}, New Canonical=${baseNew}, Existing=${res1.existing_canonical_count}`);

    // Replay runs (2, 5, 10)
    const replayIterations = [2, 3, 4, 5, 6, 7, 8, 9, 10];
    let duplicateIncrementsDetected = 0;

    for (const iter of replayIterations) {
      const resIter = await stageAndCommitBatch(client, records10K, `idemp_run_${iter}_${Date.now()}`);
      if (resIter.new_canonical_count > 0) {
        console.error(`  FAIL at Replay ${iter}: new_canonical_count = ${resIter.new_canonical_count} (Expected 0!)`);
        duplicateIncrementsDetected += resIter.new_canonical_count;
        idempotencyPass = false;
      }
      if (iter === 2 || iter === 5 || iter === 10) {
        console.log(`  Replay ${iter}x: Total Staged=${resIter.total_staged}, New Canonical=${resIter.new_canonical_count}, Existing=${resIter.existing_canonical_count}`);
      }
    }

    console.log(`\nIdempotency Replay Summary:`);
    console.log(`  - 10 Total Replays Executed across 10,000 records`);
    console.log(`  - DUPLICATE_CONTRACTUAL_INCREMENT: ${duplicateIncrementsDetected}`);
    console.log(`  - IDEMPOTENCY_PASS: ${idempotencyPass ? 'TRUE' : 'FALSE'}`);
    console.log(`  - CROSS_BATCH_DUPLICATION_PASS: ${crossBatchPass ? 'TRUE' : 'FALSE'}`);

    const report = {
      timestamp: new Date().toISOString(),
      cross_batch_duplication_pass: crossBatchPass,
      idempotency_pass: idempotencyPass,
      duplicate_contractual_increment: duplicateIncrementsDetected,
      replays_tested: 10,
      batch_size_tested: 10000
    };

    fs.writeFileSync('reports/atlas/realtime/v2_idempotency_and_cross_batch_report.json', JSON.stringify(report, null, 2));
    console.log('Saved report to reports/atlas/realtime/v2_idempotency_and_cross_batch_report.json\n');

  } finally {
    client.release();
    await pool.end();
  }
}

runCrossBatchAndIdempotencyTests().catch(console.error);
