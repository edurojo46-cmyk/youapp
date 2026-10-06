import fs from 'node:fs';
import pg from 'pg';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { performance } from 'node:perf_hooks';
import copyStreams from 'pg-copy-streams';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const { from: copyFrom } = copyStreams;

function calcPercentiles(arr) {
  if (!arr || !arr.length) return { P50: 0, P95: 0, P99: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    P50: Number(sorted[Math.floor(sorted.length * 0.50)].toFixed(2)),
    P95: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
    P99: Number(sorted[Math.floor(sorted.length * 0.99)].toFixed(2))
  };
}

async function main() {
  console.log('================================================================');
  console.log('⚡ BENCHMARK: WRITE PATH COMPARISON');
  console.log('1. CURRENT TWO-STATEMENT UNNEST PATH');
  console.log('2. COMBINED SERVER-SIDE CTE PATH');
  console.log('3. COPY-TO-STAGING PATH');
  console.log('================================================================\n');

  const pool = new pg.Pool({ ...parseDbUrl(), max: 5 });

  const BATCH_SIZE = 2000;
  const NUM_BATCHES = 5; // 10,000 candidates per test for clean matched comparison
  const TOTAL_ROWS = BATCH_SIZE * NUM_BATCHES;

  function generateTestData(prefix) {
    const batches = [];
    for (let b = 0; b < NUM_BATCHES; b++) {
      const mapIds = [], mapSources = [], mapPersonIds = [], mapTypes = [], mapValues = [], mapEvidences = [], mapConfidences = [], mapResolutions = [];
      const outboxIds = [], outboxSources = [], outboxRecords = [], outboxPayloads = [], outboxVersions = [], outboxStatuses = [], outboxAttempts = [];
      const copyLines = [];

      for (let i = 0; i < BATCH_SIZE; i++) {
        const atlasId = `atlas_arg_per_${crypto.randomBytes(8).toString('hex')}`;
        const sourceId = 'ARCA_CONDICION_TRIBUTARIA';
        const sourcePersonId = `rec_arca_${prefix}_b${b}_${i}_${crypto.randomBytes(4).toString('hex')}`;
        const val = crypto.randomBytes(32).toString('hex');
        const ev = `ev_${prefix}_${b}_${i}`;
        const name = `TEST PERSON ${prefix} ${b} ${i}`;

        mapIds.push(atlasId);
        mapSources.push(sourceId);
        mapPersonIds.push(sourcePersonId);
        mapTypes.push('NATIONAL_IDENTITY_HMAC');
        mapValues.push(val);
        mapEvidences.push(ev);
        mapConfidences.push(1.0);
        mapResolutions.push('DETERMINISTIC');

        const payload = JSON.stringify({
          atlas_person_id: atlasId,
          display_name: name,
          display_name_normalized: name.toLowerCase(),
          search_text_normalized: name.toLowerCase(),
          source_id: sourceId,
          source_record_id: sourcePersonId
        });

        outboxIds.push(atlasId);
        outboxSources.push(sourceId);
        outboxRecords.push(sourcePersonId);
        outboxPayloads.push(payload);
        outboxVersions.push(1);
        outboxStatuses.push('PENDING');
        outboxAttempts.push(0);

        // Escape for tab-separated COPY: atlas_person_id, source_id, source_person_id, identifier_type, identifier_value, evidence_id, confidence, resolution_method, payload
        // Escape quotes and backslashes in payload
        const escapedPayload = payload.replace(/\\/g, '\\\\').replace(/\t/g, ' ').replace(/\n/g, ' ');
        copyLines.push(`${atlasId}\t${sourceId}\t${sourcePersonId}\tNATIONAL_IDENTITY_HMAC\t${val}\t${ev}\t1.0\tDETERMINISTIC\t${escapedPayload}`);
      }

      batches.push({
        map: { mapIds, mapSources, mapPersonIds, mapTypes, mapValues, mapEvidences, mapConfidences, mapResolutions },
        outbox: { outboxIds, outboxSources, outboxRecords, outboxPayloads, outboxVersions, outboxStatuses, outboxAttempts },
        copyData: copyLines.join('\n') + '\n'
      });
    }
    return batches;
  }

  // --- PATH 1: CURRENT TWO-STATEMENT UNNEST PATH ---
  console.log('--- Testing Path 1: Current Two-Statement UNNEST ---');
  const batches1 = generateTestData('p1_unnest');
  const client1 = await pool.connect();
  const txMs1 = [];
  const idMs1 = [];
  const outMs1 = [];
  const commitMs1 = [];

  const wal0_1 = await client1.query('SELECT pg_current_wal_lsn() as lsn');
  const tStart1 = performance.now();

  for (const b of batches1) {
    const tTx0 = performance.now();
    await client1.query('BEGIN');

    const tId0 = performance.now();
    await client1.query(`
      INSERT INTO public.atlas_person_identity_map (
        atlas_person_id, source_id, source_person_id, identifier_type, identifier_value,
        evidence_id, confidence, resolution_method, observed_at
      )
      SELECT * FROM UNNEST(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
        $6::text[], $7::float[], $8::text[], array_fill(NOW(), ARRAY[cardinality($1::text[])])
      )
      ON CONFLICT (source_id, source_person_id) DO NOTHING
    `, [
      b.map.mapIds, b.map.mapSources, b.map.mapPersonIds, b.map.mapTypes, b.map.mapValues,
      b.map.mapEvidences, b.map.mapConfidences, b.map.mapResolutions
    ]);
    idMs1.push(performance.now() - tId0);

    const tOut0 = performance.now();
    await client1.query(`
      INSERT INTO public.atlas_search_outbox (
        atlas_person_id, source_id, source_record_id, payload, payload_version, status, attempt_count
      )
      SELECT * FROM UNNEST(
        $1::text[], $2::text[], $3::text[], $4::jsonb[], $5::int[], $6::text[], $7::int[]
      )
      ON CONFLICT (source_id, source_record_id) DO NOTHING
    `, [
      b.outbox.outboxIds, b.outbox.outboxSources, b.outbox.outboxRecords, b.outbox.outboxPayloads,
      b.outbox.outboxVersions, b.outbox.outboxStatuses, b.outbox.outboxAttempts
    ]);
    outMs1.push(performance.now() - tOut0);

    const tCommit0 = performance.now();
    await client1.query('COMMIT');
    commitMs1.push(performance.now() - tCommit0);

    txMs1.push(performance.now() - tTx0);
  }
  const wallSec1 = (performance.now() - tStart1) / 1000;
  const wal1_1 = await client1.query(`SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), $1::pg_lsn) as wal_bytes`, [wal0_1.rows[0].lsn]);
  client1.release();

  const res1 = {
    path: 'CURRENT_TWO_STATEMENT_PATH',
    totalRows: TOTAL_ROWS,
    wallSec: Number(wallSec1.toFixed(2)),
    newSec: Number((TOTAL_ROWS / wallSec1).toFixed(2)),
    txMsP50: calcPercentiles(txMs1).P50,
    txMsP95: calcPercentiles(txMs1).P95,
    idMsP50: calcPercentiles(idMs1).P50,
    outMsP50: calcPercentiles(outMs1).P50,
    commitMsP50: calcPercentiles(commitMs1).P50,
    walBytes: Number(wal1_1.rows[0].wal_bytes)
  };
  console.log('Path 1 Result:', res1);

  // --- PATH 2: COMBINED SERVER-SIDE CTE PATH ---
  console.log('\n--- Testing Path 2: Combined Server-Side CTE Path ---');
  const batches2 = generateTestData('p2_cte');
  const client2 = await pool.connect();
  const txMs2 = [];
  const combinedMs2 = [];
  const commitMs2 = [];

  const wal0_2 = await client2.query('SELECT pg_current_wal_lsn() as lsn');
  const tStart2 = performance.now();

  for (const b of batches2) {
    const tTx0 = performance.now();
    await client2.query('BEGIN');

    const tComb0 = performance.now();
    await client2.query(`
      WITH ins_identity AS (
        INSERT INTO public.atlas_person_identity_map (
          atlas_person_id, source_id, source_person_id, identifier_type, identifier_value,
          evidence_id, confidence, resolution_method, observed_at
        )
        SELECT * FROM UNNEST(
          $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
          $6::text[], $7::float[], $8::text[], array_fill(NOW(), ARRAY[cardinality($1::text[])])
        )
        ON CONFLICT (source_id, source_person_id) DO NOTHING
        RETURNING atlas_person_id, source_id, source_person_id
      )
      INSERT INTO public.atlas_search_outbox (
        atlas_person_id, source_id, source_record_id, payload, payload_version, status, attempt_count
      )
      SELECT * FROM UNNEST(
        $9::text[], $10::text[], $11::text[], $12::jsonb[], $13::int[], $14::text[], $15::int[]
      )
      ON CONFLICT (source_id, source_record_id) DO NOTHING
    `, [
      b.map.mapIds, b.map.mapSources, b.map.mapPersonIds, b.map.mapTypes, b.map.mapValues,
      b.map.mapEvidences, b.map.mapConfidences, b.map.mapResolutions,
      b.outbox.outboxIds, b.outbox.outboxSources, b.outbox.outboxRecords, b.outbox.outboxPayloads,
      b.outbox.outboxVersions, b.outbox.outboxStatuses, b.outbox.outboxAttempts
    ]);
    combinedMs2.push(performance.now() - tComb0);

    const tCommit0 = performance.now();
    await client2.query('COMMIT');
    commitMs2.push(performance.now() - tCommit0);

    txMs2.push(performance.now() - tTx0);
  }
  const wallSec2 = (performance.now() - tStart2) / 1000;
  const wal1_2 = await client2.query(`SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), $1::pg_lsn) as wal_bytes`, [wal0_2.rows[0].lsn]);
  client2.release();

  const res2 = {
    path: 'COMBINED_SERVER_SIDE_PATH',
    totalRows: TOTAL_ROWS,
    wallSec: Number(wallSec2.toFixed(2)),
    newSec: Number((TOTAL_ROWS / wallSec2).toFixed(2)),
    txMsP50: calcPercentiles(txMs2).P50,
    txMsP95: calcPercentiles(txMs2).P95,
    combinedMsP50: calcPercentiles(combinedMs2).P50,
    commitMsP50: calcPercentiles(commitMs2).P50,
    walBytes: Number(wal1_2.rows[0].wal_bytes),
    speedupVsTwoStatement: Number((wallSec1 / wallSec2).toFixed(2))
  };
  console.log('Path 2 Result:', res2);

  // --- PATH 3: COPY-TO-STAGING PATH ---
  console.log('\n--- Testing Path 3: COPY-to-Staging Path ---');
  const batches3 = generateTestData('p3_copy');
  const client3 = await pool.connect();

  const txMs3 = [];
  const copyMs3 = [];
  const commitMs3 = [];

  const wal0_3 = await client3.query('SELECT pg_current_wal_lsn() as lsn');
  const tStart3 = performance.now();

  for (const b of batches3) {
    const tTx0 = performance.now();
    await client3.query('BEGIN');

    await client3.query(`
      CREATE TEMP TABLE IF NOT EXISTS temp_batch_staging (
        atlas_person_id text NOT NULL,
        source_id text NOT NULL,
        source_person_id text NOT NULL,
        identifier_type text NOT NULL,
        identifier_value text NOT NULL,
        evidence_id text,
        confidence double precision,
        resolution_method text,
        payload jsonb
      );
      TRUNCATE temp_batch_staging;
    `);

    // 1. COPY stream into temp_batch_staging
    const tCopy0 = performance.now();
    const ingestStream = client3.query(copyFrom(`
      COPY temp_batch_staging (
        atlas_person_id, source_id, source_person_id, identifier_type, identifier_value,
        evidence_id, confidence, resolution_method, payload
      ) FROM STDIN WITH (FORMAT text)
    `));
    const srcStream = Readable.from([b.copyData]);
    await pipeline(srcStream, ingestStream);
    copyMs3.push(performance.now() - tCopy0);

    // 2. Transfer from staging to identity map and outbox
    await client3.query(`
      WITH ins_id AS (
        INSERT INTO public.atlas_person_identity_map (
          atlas_person_id, source_id, source_person_id, identifier_type, identifier_value,
          evidence_id, confidence, resolution_method, observed_at
        )
        SELECT 
          atlas_person_id, source_id, source_person_id, identifier_type, identifier_value,
          evidence_id, confidence, resolution_method, NOW()
        FROM temp_batch_staging
        ON CONFLICT (source_id, source_person_id) DO NOTHING
      )
      INSERT INTO public.atlas_search_outbox (
        atlas_person_id, source_id, source_record_id, payload, payload_version, status, attempt_count
      )
      SELECT 
        atlas_person_id, source_id, source_person_id, payload, 1, 'PENDING', 0
      FROM temp_batch_staging
      ON CONFLICT (source_id, source_record_id) DO NOTHING
    `);

    const tCommit0 = performance.now();
    await client3.query('COMMIT');
    commitMs3.push(performance.now() - tCommit0);

    txMs3.push(performance.now() - tTx0);
  }
  const wallSec3 = (performance.now() - tStart3) / 1000;
  const wal1_3 = await client3.query(`SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), $1::pg_lsn) as wal_bytes`, [wal0_3.rows[0].lsn]);
  client3.release();

  const res3 = {
    path: 'COPY_STAGE_PATH',
    totalRows: TOTAL_ROWS,
    wallSec: Number(wallSec3.toFixed(2)),
    newSec: Number((TOTAL_ROWS / wallSec3).toFixed(2)),
    txMsP50: calcPercentiles(txMs3).P50,
    txMsP95: calcPercentiles(txMs3).P95,
    copyMsP50: calcPercentiles(copyMs3).P50,
    commitMsP50: calcPercentiles(commitMs3).P50,
    walBytes: Number(wal1_3.rows[0].wal_bytes),
    speedupVsTwoStatement: Number((wallSec1 / wallSec3).toFixed(2))
  };
  console.log('Path 3 Result:', res3);

  const writePathReport = {
    timestamp: new Date().toISOString(),
    stage: 'atlas_perf_1m30_p22_write_path_comparison',
    CURRENT_TWO_STATEMENT_PATH: res1,
    COMBINED_SERVER_SIDE_PATH: res2,
    COPY_STAGE_PATH: res3,
    ANALYSIS: {
      COMBINED_SQL_SPEEDUP: Number((res2.newSec / res1.newSec).toFixed(2)),
      COPY_STAGE_SPEEDUP: Number((res3.newSec / res1.newSec).toFixed(2)),
      WAL_BYTES_COMPARISON: {
        UNNEST_WAL_BYTES: res1.walBytes,
        COMBINED_WAL_BYTES: res2.walBytes,
        COPY_STAGE_WAL_BYTES: res3.walBytes
      },
      TRANSACTION_MS_COMPARISON: {
        UNNEST_TX_P50: res1.txMsP50,
        COMBINED_TX_P50: res2.txMsP50,
        COPY_STAGE_TX_P50: res3.txMsP50
      }
    }
  };

  fs.mkdirSync('reports/atlas/discovery', { recursive: true });
  fs.writeFileSync(
    'reports/atlas/discovery/atlas_perf_1m30_p22_write_paths_v1.json',
    JSON.stringify(writePathReport, null, 2)
  );

  console.log('\n================================================================');
  console.log('🏆 WRITE PATH BENCHMARK COMPLETE:');
  console.log(`Current Two-Statement:  ${res1.newSec} NEW/sec | Tx P50: ${res1.txMsP50}ms | WAL: ${res1.walBytes} bytes`);
  console.log(`Combined Server-Side:   ${res2.newSec} NEW/sec | Tx P50: ${res2.txMsP50}ms | WAL: ${res2.walBytes} bytes (Speedup: ${writePathReport.ANALYSIS.COMBINED_SQL_SPEEDUP}x)`);
  console.log(`COPY-to-Staging:        ${res3.newSec} NEW/sec | Tx P50: ${res3.txMsP50}ms | WAL: ${res3.walBytes} bytes (Speedup: ${writePathReport.ANALYSIS.COPY_STAGE_SPEEDUP}x)`);
  console.log('================================================================\n');

  await pool.end();
}

main().catch(err => {
  console.error('Fatal Write Path Benchmark Error:', err);
  process.exit(1);
});
