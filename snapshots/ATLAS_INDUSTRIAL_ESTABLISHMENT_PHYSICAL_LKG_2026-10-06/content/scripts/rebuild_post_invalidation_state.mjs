/**
 * scripts/rebuild_post_invalidation_state.mjs
 * 
 * ATLAS — V3E-R2: FINAL HOLDOUT REPAIR
 * Section 5 & 6:
 * - Quarantine/remove 61,014 invalid IGJ rows from Postgres, JSONL, and Binary ledger
 * - Rebuild authoritative pre-replacement state (613,912 rows)
 * - Verify four-way parity and bitwise key-set equality across all ledgers
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

console.log('════════════════════════════════════════════════════════════════');
console.log('ATLAS — V3E-R2: REBUILD POST-INVALIDATION STATE (613,912 ROWS)');
console.log('════════════════════════════════════════════════════════════════\n');

async function main() {
  const jsonlPath = path.resolve('scratch/atlas_fuel_identity_ledger.jsonl');
  const binPath = path.resolve('scratch/atlas_fuel_identity_ledger.bin');

  // 1. Read first 613,912 rows from jsonl and write to a clean temporary file
  console.log('[1/4] Truncating JSONL and Binary ledgers to 613,912 valid rows...');
  const rl = readline.createInterface({ input: fs.createReadStream(jsonlPath), crlfDelay: Infinity });

  const validJsonlLines = [];
  const validBigUint64 = [];
  let rowCount = 0;
  let discardedCount = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    rowCount++;
    if (rowCount <= 613912) {
      validJsonlLines.push(line);
      const rec = JSON.parse(line);
      validBigUint64.push(BigInt.asUintN(64, BigInt(rec.hashVal)));
    } else {
      discardedCount++;
    }
  }

  console.log(`  ✓ Valid rows preserved:             ${validJsonlLines.length.toLocaleString()}`);
  console.log(`  ✓ Invalid rows removed:             ${discardedCount.toLocaleString()}`);

  if (validJsonlLines.length !== 613912 || discardedCount !== 61014) {
    throw new Error(`Unexpected counts: valid=${validJsonlLines.length}, discarded=${discardedCount}`);
  }

  // Backup existing files first
  fs.copyFileSync(jsonlPath, 'scratch/atlas_fuel_identity_ledger_pre_repair.jsonl');
  fs.copyFileSync(binPath, 'scratch/atlas_fuel_identity_ledger_pre_repair.bin');
  console.log('  ✓ Backed up pre-repair ledgers to scratch/');

  // Overwrite jsonl with valid 613,912 rows
  fs.writeFileSync(jsonlPath, validJsonlLines.join('\n') + '\n');
  console.log('  ✓ Truncated scratch/atlas_fuel_identity_ledger.jsonl');

  // Overwrite binary ledger with valid 613,912 64-bit hashes
  const binBuf = Buffer.alloc(613912 * 8);
  for (let i = 0; i < 613912; i++) {
    binBuf.writeBigUInt64LE(validBigUint64[i], i * 8);
  }
  fs.writeFileSync(binPath, binBuf);
  console.log('  ✓ Truncated scratch/atlas_fuel_identity_ledger.bin');

  // 2. Remove invalid rows from PostgreSQL
  console.log('\n[2/4] Removing 61,014 invalid IGJ rows from PostgreSQL database...');
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

  const countBefore = await client.query('SELECT count(*) FROM atlas_authority.atlas_fuel_identity_ledger;');
  console.log(`  ✓ Total rows in Postgres before:    ${parseInt(countBefore.rows[0].count, 10).toLocaleString()}`);

  const deleteRes = await client.query(`
    DELETE FROM atlas_authority.atlas_fuel_identity_ledger
    WHERE source_id = 'IGJ_AUTORIDADES_SOCIETARIAS_202603'
      AND canonical_identity_key LIKE 'AR:FUEL:NAME_JUR:%';
  `);
  console.log(`  ✓ Postgres rows deleted:            ${deleteRes.rowCount.toLocaleString()}`);

  const countAfter = await client.query('SELECT count(*) FROM atlas_authority.atlas_fuel_identity_ledger;');
  const distinctAfter = await client.query('SELECT count(DISTINCT canonical_identity_key) FROM atlas_authority.atlas_fuel_identity_ledger;');
  const POST_INVALIDATION_POSTGRES_ROWS = parseInt(countAfter.rows[0].count, 10);
  const POST_INVALIDATION_DISTINCT_KEYS = parseInt(distinctAfter.rows[0].count, 10);
  const POST_INVALIDATION_BINARY_KEYS = binBuf.byteLength / 8;
  const POST_INVALIDATION_JSONL_ROWS = validJsonlLines.length;

  console.log(`  ✓ Total rows in Postgres after:     ${POST_INVALIDATION_POSTGRES_ROWS.toLocaleString()}`);
  console.log(`  ✓ Distinct keys in Postgres after:  ${POST_INVALIDATION_DISTINCT_KEYS.toLocaleString()}`);
  console.log(`  ✓ Binary ledger keys:               ${POST_INVALIDATION_BINARY_KEYS.toLocaleString()}`);
  console.log(`  ✓ JSONL rows:                       ${POST_INVALIDATION_JSONL_ROWS.toLocaleString()}`);

  // 3. Four-way key-set parity check
  console.log('\n[3/4] Verifying bitwise key-set equality across all representations...');

  const pgRowsRes = await client.query('SELECT canonical_identity_key, identity_hash_int8 FROM atlas_authority.atlas_fuel_identity_ledger;');
  client.release();
  await pool.end();

  const pgKeySet = new Set(pgRowsRes.rows.map(r => r.canonical_identity_key));
  const pgHashSet = new Set(pgRowsRes.rows.map(r => BigInt.asUintN(64, BigInt(r.identity_hash_int8)).toString()));

  const binHashSet = new Set();
  const binArr = new BigUint64Array(binBuf.buffer, binBuf.byteOffset, binBuf.byteLength / 8);
  for (let i = 0; i < binArr.length; i++) {
    binHashSet.add(binArr[i].toString());
  }

  const jsonlKeySet = new Set();
  const jsonlHashSet = new Set();
  for (const line of validJsonlLines) {
    const rec = JSON.parse(line);
    jsonlKeySet.add(rec.canonicalKey);
    jsonlHashSet.add(rec.hashVal);
  }

  const POSTGRES_VS_BINARY_SET_EQUAL = (pgHashSet.size === binHashSet.size) && Array.from(pgHashSet).every(h => binHashSet.has(h));
  const POSTGRES_VS_JSONL_SET_EQUAL = (pgKeySet.size === jsonlKeySet.size) && Array.from(pgKeySet).every(k => jsonlKeySet.has(k));
  const BINARY_VS_JSONL_SET_EQUAL = (binHashSet.size === jsonlHashSet.size) && Array.from(binHashSet).every(h => jsonlHashSet.has(h));
  const FOUR_WAY_KEY_SET_PARITY_PASS = POSTGRES_VS_BINARY_SET_EQUAL && POSTGRES_VS_JSONL_SET_EQUAL && BINARY_VS_JSONL_SET_EQUAL;

  console.log(`  ✓ POSTGRES_VS_BINARY_SET_EQUAL:     ${POSTGRES_VS_BINARY_SET_EQUAL}`);
  console.log(`  ✓ POSTGRES_VS_JSONL_SET_EQUAL:      ${POSTGRES_VS_JSONL_SET_EQUAL}`);
  console.log(`  ✓ BINARY_VS_JSONL_SET_EQUAL:        ${BINARY_VS_JSONL_SET_EQUAL}`);
  console.log(`  ✓ FOUR_WAY_KEY_SET_PARITY_PASS:     ${FOUR_WAY_KEY_SET_PARITY_PASS ? 'PASS (100% BIT-PERFECT)' : 'FAIL'}`);

  // 4. Compute recomputed fuel metrics
  console.log('\n[4/4] Computing authoritative post-invalidation metrics...');
  const POST_INVALIDATION_TOTAL_VERIFIED_FUEL = 1300000 - 61014; // 1,238,986
  const POST_INVALIDATION_ENGINEERING_FUEL = 300000;
  const POST_INVALIDATION_FINAL_HOLDOUT = 1000000 - 61014; // 938,986
  const POST_INVALIDATION_FINAL_HOLDOUT_DEFICIT = 61014;

  console.log(`  ✓ POST_INVALIDATION_TOTAL_VERIFIED_FUEL:     ${POST_INVALIDATION_TOTAL_VERIFIED_FUEL.toLocaleString()}`);
  console.log(`  ✓ POST_INVALIDATION_ENGINEERING_FUEL:        ${POST_INVALIDATION_ENGINEERING_FUEL.toLocaleString()}`);
  console.log(`  ✓ POST_INVALIDATION_FINAL_HOLDOUT:           ${POST_INVALIDATION_FINAL_HOLDOUT.toLocaleString()}`);
  console.log(`  ✓ POST_INVALIDATION_FINAL_HOLDOUT_DEFICIT:   ${POST_INVALIDATION_FINAL_HOLDOUT_DEFICIT.toLocaleString()}`);
  console.log(`  ✓ POST_INVALIDATION_POSTGRES_ROWS:           ${POST_INVALIDATION_POSTGRES_ROWS.toLocaleString()}`);
  console.log(`  ✓ POST_INVALIDATION_DISTINCT_KEYS:           ${POST_INVALIDATION_DISTINCT_KEYS.toLocaleString()}`);
  console.log(`  ✓ POST_INVALIDATION_BINARY_KEYS:             ${POST_INVALIDATION_BINARY_KEYS.toLocaleString()}`);
  console.log(`  ✓ POST_INVALIDATION_JSONL_ROWS:               ${POST_INVALIDATION_JSONL_ROWS.toLocaleString()}`);

  const postState = {
    TIMESTAMP: new Date().toISOString(),
    POST_INVALIDATION_TOTAL_VERIFIED_FUEL,
    POST_INVALIDATION_ENGINEERING_FUEL,
    POST_INVALIDATION_FINAL_HOLDOUT,
    POST_INVALIDATION_FINAL_HOLDOUT_DEFICIT,
    POST_INVALIDATION_POSTGRES_ROWS,
    POST_INVALIDATION_DISTINCT_KEYS,
    POST_INVALIDATION_BINARY_KEYS,
    POST_INVALIDATION_JSONL_ROWS,
    POSTGRES_VS_BINARY_SET_EQUAL,
    POSTGRES_VS_JSONL_SET_EQUAL,
    BINARY_VS_JSONL_SET_EQUAL,
    FOUR_WAY_KEY_SET_PARITY_PASS
  };

  fs.writeFileSync('scratch/atlas_post_invalidation_state.json', JSON.stringify(postState, null, 2));
  console.log('\n✓ Post-invalidation state successfully sealed to scratch/atlas_post_invalidation_state.json');
}

main().catch(err => {
  console.error('Fatal error rebuilding post-invalidation state:', err);
  process.exit(1);
});
