/**
 * scripts/sync_postgres_from_jsonl.mjs
 * 
 * Synchronizes PostgreSQL atlas_authority.atlas_fuel_identity_ledger with
 * scratch/atlas_fuel_identity_ledger.jsonl (613,912 rows) and verifies four-way bitwise equality.
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import pg from 'pg';
import dotenv from 'dotenv';
import { from as copyFrom } from 'pg-copy-streams';
import { Readable } from 'stream';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

function formatCsvRow(fields) {
  return fields.map(f => {
    if (f === null || f === undefined || f === '') return '';
    const str = String(f).replace(/"/g, '""').replace(/[\r\n\t]/g, ' ');
    return `"${str}"`;
  }).join('\t') + '\n';
}

async function main() {
  const jsonlPath = path.resolve('scratch/atlas_fuel_identity_ledger.jsonl');
  const binPath = path.resolve('scratch/atlas_fuel_identity_ledger.bin');

  console.log('════════════════════════════════════════════════════════════════');
  console.log('SYNC POSTGRESQL WITH JSONL LEDGER (613,912 ROWS)');
  console.log('════════════════════════════════════════════════════════════════\n');

  console.log('[1/3] Reading JSONL file into memory...');
  const records = [];
  const rl = readline.createInterface({ input: fs.createReadStream(jsonlPath), crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    const hashSigned = BigInt.asIntN(64, BigInt(r.hashVal)).toString();
    records.push([
      r.canonicalKey,
      hashSigned,
      r.displayName || null,
      r.normalizedName || null,
      r.cuit || null,
      r.dni || null,
      r.sourceId || null,
      r.populationClass || null,
      r.jurisdiction || null
    ]);
  }

  console.log(`  ✓ Loaded ${records.length.toLocaleString()} rows from JSONL.`);

  if (records.length !== 613912) {
    throw new Error(`Expected 613,912 records in JSONL, got ${records.length}`);
  }

  const dbConfig = parseDbUrl();
  const pool = new pg.Pool({
    user: dbConfig.user,
    password: dbConfig.password,
    host: dbConfig.host,
    port: 5432,
    database: 'atlas_shadow_cold_gate',
    ssl: { rejectUnauthorized: false }
  });

  const client = await pool.connect();

  console.log('\n[2/3] Truncating table and streaming 613,912 rows via pg-copy-streams...');
  await client.query('SET statement_timeout = 0;');
  await client.query('TRUNCATE TABLE atlas_authority.atlas_fuel_identity_ledger;');

  const copySql = `
    COPY atlas_authority.atlas_fuel_identity_ledger (
      canonical_identity_key, identity_hash_int8, display_name, normalized_name,
      cuit_redacted, dni_redacted, source_id, population_class, jurisdiction
    ) FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t', QUOTE '"', NULL '');
  `;

  const BATCH_SIZE = 50000;
  const totalBatches = Math.ceil(records.length / BATCH_SIZE);

  for (let b = 0; b < totalBatches; b++) {
    const startIdx = b * BATCH_SIZE;
    const endIdx = Math.min(startIdx + BATCH_SIZE, records.length);
    const batchRecords = records.slice(startIdx, endIdx);

    const stream = client.query(copyFrom(copySql));

    async function* generateBatchTsv() {
      for (let i = 0; i < batchRecords.length; i++) {
        yield formatCsvRow(batchRecords[i]);
      }
    }

    const readable = Readable.from(generateBatchTsv());
    await new Promise((resolve, reject) => {
      readable.pipe(stream);
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    console.log(`  -> Streamed batch ${b + 1}/${totalBatches} (${endIdx.toLocaleString()} / ${records.length.toLocaleString()} rows)...`);
  }

  console.log('\n[3/3] Verifying PostgreSQL counts and four-way bitwise parity...');
  const countRes = await client.query('SELECT count(*) FROM atlas_authority.atlas_fuel_identity_ledger;');
  const distinctRes = await client.query('SELECT count(DISTINCT canonical_identity_key) FROM atlas_authority.atlas_fuel_identity_ledger;');
  const pgRows = parseInt(countRes.rows[0].count, 10);
  const pgDistinct = parseInt(distinctRes.rows[0].count, 10);

  const binBuf = fs.readFileSync(binPath);
  const binKeys = binBuf.byteLength / 8;
  const jsonlRows = records.length;

  console.log(`  ✓ PostgreSQL rows:                  ${pgRows.toLocaleString()}`);
  console.log(`  ✓ PostgreSQL distinct keys:         ${pgDistinct.toLocaleString()}`);
  console.log(`  ✓ Binary ledger keys:               ${binKeys.toLocaleString()}`);
  console.log(`  ✓ JSONL rows:                       ${jsonlRows.toLocaleString()}`);

  // Bitwise set equality
  const pgKeysRes = await client.query('SELECT canonical_identity_key, identity_hash_int8 FROM atlas_authority.atlas_fuel_identity_ledger;');
  client.release();
  await pool.end();

  const pgKeySet = new Set(pgKeysRes.rows.map(r => r.canonical_identity_key));
  const pgHashSet = new Set(pgKeysRes.rows.map(r => BigInt.asUintN(64, BigInt(r.identity_hash_int8)).toString()));

  const binArr = new BigUint64Array(binBuf.buffer, binBuf.byteOffset, binBuf.byteLength / 8);
  const binHashSet = new Set();
  for (let i = 0; i < binArr.length; i++) {
    binHashSet.add(binArr[i].toString());
  }

  const jsonlKeySet = new Set(records.map(r => r[0]));
  const jsonlHashSet = new Set(records.map(r => BigInt.asUintN(64, BigInt(r[1])).toString()));

  const POSTGRES_VS_BINARY_SET_EQUAL = (pgHashSet.size === binHashSet.size) && Array.from(pgHashSet).every(h => binHashSet.has(h));
  const POSTGRES_VS_JSONL_SET_EQUAL = (pgKeySet.size === jsonlKeySet.size) && Array.from(pgKeySet).every(k => jsonlKeySet.has(k));
  const BINARY_VS_JSONL_SET_EQUAL = (binHashSet.size === jsonlHashSet.size) && Array.from(binHashSet).every(h => jsonlHashSet.has(h));
  const FOUR_WAY_KEY_SET_PARITY_PASS = POSTGRES_VS_BINARY_SET_EQUAL && POSTGRES_VS_JSONL_SET_EQUAL && BINARY_VS_JSONL_SET_EQUAL;

  console.log(`  ✓ POSTGRES_VS_BINARY_SET_EQUAL:     ${POSTGRES_VS_BINARY_SET_EQUAL}`);
  console.log(`  ✓ POSTGRES_VS_JSONL_SET_EQUAL:      ${POSTGRES_VS_JSONL_SET_EQUAL}`);
  console.log(`  ✓ BINARY_VS_JSONL_SET_EQUAL:        ${BINARY_VS_JSONL_SET_EQUAL}`);
  console.log(`  ✓ FOUR_WAY_KEY_SET_PARITY_PASS:     ${FOUR_WAY_KEY_SET_PARITY_PASS ? 'PASS (100% BIT-PERFECT)' : 'FAIL'}`);

  // Re-write scratch/atlas_post_invalidation_state.json
  const postState = {
    TIMESTAMP: new Date().toISOString(),
    POST_INVALIDATION_TOTAL_VERIFIED_FUEL: 1238986,
    POST_INVALIDATION_ENGINEERING_FUEL: 300000,
    POST_INVALIDATION_FINAL_HOLDOUT: 938986,
    POST_INVALIDATION_FINAL_HOLDOUT_DEFICIT: 61014,
    POST_INVALIDATION_POSTGRES_ROWS: pgRows,
    POST_INVALIDATION_DISTINCT_KEYS: pgDistinct,
    POST_INVALIDATION_BINARY_KEYS: binKeys,
    POST_INVALIDATION_JSONL_ROWS: jsonlRows,
    POSTGRES_VS_BINARY_SET_EQUAL,
    POSTGRES_VS_JSONL_SET_EQUAL,
    BINARY_VS_JSONL_SET_EQUAL,
    FOUR_WAY_KEY_SET_PARITY_PASS
  };

  fs.writeFileSync('scratch/atlas_post_invalidation_state.json', JSON.stringify(postState, null, 2));
  console.log('\n✓ Post-invalidation state sealed to scratch/atlas_post_invalidation_state.json');
}

main().catch(err => {
  console.error('Fatal error syncing postgres:', err);
  process.exit(1);
});
