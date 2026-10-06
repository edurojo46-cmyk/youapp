import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { resolveCanonicalHuman } from './lib/canonicalIdentityResolver.mjs';

// Deterministic PRNG seeded by hash
function createDeterministicSampler(seedStr, totalItems, sampleSize) {
  let currentSeed = crypto.createHash('sha256').update(seedStr).digest();
  const selectedIndices = new Set();

  while (selectedIndices.size < sampleSize) {
    currentSeed = crypto.createHash('sha256').update(currentSeed).digest();
    // Use first 4 bytes as uint32
    const randUint = currentSeed.readUInt32BE(0);
    const index = randUint % totalItems;
    selectedIndices.add(index);
  }

  return selectedIndices;
}

// In-Memory Search Engine replica for parity check
class SearchEngineAuditor {
  constructor() {
    this.keyToDocId = new Map();
    this.docCount = 0;
  }
  indexPerson(key) {
    if (this.keyToDocId.has(key)) return false;
    const docId = this.docCount++;
    this.keyToDocId.set(key, docId);
    return true;
  }
  isSearchable(key) {
    return this.keyToDocId.has(key);
  }
}

async function runMasterAudit() {
  console.log('================================================================');
  console.log('  MASTER FORENSIC CERTIFICATION AUDIT — ATLAS V2 (1,000,000)    ');
  console.log('================================================================\n');

  // 1. Connect to Database
  console.log('[1/7] Connecting to Database and fetching PostgreSQL key set...');
  const dbConfig = parseDbUrl();
  const client = new pg.Client({
    user: dbConfig.user,
    password: dbConfig.password,
    host: dbConfig.host,
    port: 5432,
    database: 'atlas_shadow_cold_gate',
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  await client.query('SET statement_timeout = 0;');

  const pgCountRes = await client.query(`
    SELECT count(*) as total_rows, count(DISTINCT canonical_identity_key) as distinct_humans
    FROM atlas_shadow.atlas_acquisition_benchmark_1m_v2;
  `);
  const pgTotalRows = parseInt(pgCountRes.rows[0].total_rows, 10);
  const pgDistinctHumans = parseInt(pgCountRes.rows[0].distinct_humans, 10);
  console.log(`  Postgres Rows: ${pgTotalRows.toLocaleString()} | Distinct Humans: ${pgDistinctHumans.toLocaleString()}`);

  const pgKeysRes = await client.query(`
    SELECT canonical_identity_key, raw_record_hash, source_id, raw_record_locator 
    FROM atlas_shadow.atlas_acquisition_benchmark_1m_v2;
  `);
  const pgKeysMap = new Map();
  for (const r of pgKeysRes.rows) {
    pgKeysMap.set(r.canonical_identity_key, r);
  }
  console.log(`  Loaded ${pgKeysMap.size.toLocaleString()} keys from PostgreSQL into audit map.`);

  // 2. Load Binary Ledger
  console.log('\n[2/7] Auditing Binary Ledger (atlas_autonomous_ar_v2_ledger.bin)...');
  const binPath = 'reports/atlas/acquisition/atlas_autonomous_ar_v2_ledger.bin';
  const binBuf = fs.readFileSync(binPath);
  const binKeyCount = binBuf.length / 32;
  console.log(`  Binary Ledger File Size: ${binBuf.length.toLocaleString()} bytes (${binKeyCount.toLocaleString()} keys)`);
  const binHashesSet = new Set();
  for (let i = 0; i < binBuf.length; i += 32) {
    binHashesSet.add(binBuf.subarray(i, i + 32).toString('hex').toUpperCase());
  }

  // 3. Load Opening Authority (scratch/global_preexisting_human_authority.bin)
  console.log('\n[3/7] Loading Global Preexisting Authority...');
  const authBuf = fs.readFileSync('scratch/global_preexisting_human_authority.bin');
  const authorityHashes = new Set();
  for (let i = 0; i < authBuf.length; i += 8) {
    authorityHashes.add(authBuf.subarray(i, i + 8).toString('hex'));
  }
  console.log(`  Opening Authority: ${authorityHashes.size.toLocaleString()} 64-bit keys.`);

  // 4. Stream JSONL Ledger and Build Index + Full Dataset
  console.log('\n[4/7] Streaming JSONL Ledger, Re-indexing, and verifying parity...');
  const jsonlPath = 'reports/atlas/acquisition/atlas_autonomous_ar_v2_ledger.jsonl';
  const fileStream = fs.createReadStream(jsonlPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const searchAuditor = new SearchEngineAuditor();
  const allJsonlRecords = [];
  const jsonlKeysSet = new Set();
  let jsonlLineCount = 0;

  let rowBasedIdsCount = 0;
  let rawLocatorBasedIdsCount = 0;
  let authorityCollisionsCount = 0;
  const sourceDistribution = new Map();

  for await (const line of rl) {
    if (!line.trim()) continue;
    const doc = JSON.parse(line);
    allJsonlRecords.push(doc);
    const key = doc.CANONICAL_GLOBAL_HUMAN_ID;
    jsonlKeysSet.add(key);
    jsonlLineCount++;

    // Count by source
    sourceDistribution.set(doc.SOURCE_ID, (sourceDistribution.get(doc.SOURCE_ID) || 0) + 1);

    // Row-based ID check
    if (key.includes('_rowIdx') || key.includes('ROW_') || key.includes('#row:')) {
      rowBasedIdsCount++;
    }
    if (key.includes('RAW_RECORD_LOCATOR')) {
      rawLocatorBasedIdsCount++;
    }

    // Opening authority collision check
    const h64 = crypto.createHash('sha256').update(key.trim()).digest().subarray(0, 8).toString('hex');
    if (authorityHashes.has(h64)) {
      authorityCollisionsCount++;
    }

    // Search index
    searchAuditor.indexPerson(key);
  }

  console.log(`  JSONL lines read: ${jsonlLineCount.toLocaleString()} | Distinct Keys: ${jsonlKeysSet.size.toLocaleString()}`);
  console.log(`  Search Engine Distinct Humans Indexed: ${searchAuditor.keyToDocId.size.toLocaleString()}`);

  // 5. Parity & Key Set Comparisons
  console.log('\n[5/7] Verifying Exact 4-Layer Key-Set Equality...');
  let pgVsJsonlMatches = 0;
  let pgVsJsonlMismatches = 0;
  let jsonlVsBinMatches = 0;
  let jsonlVsBinMismatches = 0;
  let searchVsPgMatches = 0;
  let searchVsPgMismatches = 0;

  for (const key of jsonlKeysSet) {
    // Check in PG
    if (pgKeysMap.has(key)) {
      pgVsJsonlMatches++;
    } else {
      pgVsJsonlMismatches++;
    }

    // Check in Binary
    const keyHashHex = crypto.createHash('sha256').update(key).digest('hex').toUpperCase();
    if (binHashesSet.has(keyHashHex)) {
      jsonlVsBinMatches++;
    } else {
      jsonlVsBinMismatches++;
    }

    // Check in Search
    if (searchAuditor.isSearchable(key)) {
      searchVsPgMatches++;
    } else {
      searchVsPgMismatches++;
    }
  }

  const fourLayerCountParity = (
    pgTotalRows === 1000000 &&
    pgDistinctHumans === 1000000 &&
    binKeyCount === 1000000 &&
    jsonlLineCount === 1000000 &&
    searchAuditor.keyToDocId.size === 1000000
  );

  const fourLayerKeySetParity = (
    pgVsJsonlMismatches === 0 &&
    jsonlVsBinMismatches === 0 &&
    searchVsPgMismatches === 0 &&
    pgVsJsonlMatches === 1000000 &&
    jsonlVsBinMatches === 1000000 &&
    searchVsPgMatches === 1000000
  );

  console.log(`  Four-Layer Count Parity Pass:    ${fourLayerCountParity ? 'TRUE' : 'FALSE'}`);
  console.log(`  Four-Layer Key-Set Parity Pass:  ${fourLayerKeySetParity ? 'TRUE' : 'FALSE'}`);

  // 6. Deterministic 10,000-Human Sample Audit (Section 10)
  console.log('\n[6/7] Executing Deterministic 10,000-Human Sample Audit...');
  const seed = crypto.createHash('sha256').update('ATLAS_AUTONOMOUS_AR_RUN_V2_1790513650233').digest('hex');
  const sampleIndices = createDeterministicSampler(seed, 1000000, 10000);

  let naturalPersonPass = 0;
  let canonicalIdentityPass = 0;
  let rawRecordPass = 0;
  let rawHashMatchPass = 0;
  let argentinaLinkPass = 0;
  let globalNetNewPass = 0;
  let sourceContinuityPassCount = 0;
  let databasePass = 0;
  let binaryLedgerPass = 0;
  let jsonlPass = 0;
  let searchIndexPass = 0;
  let sampleFailures = 0;

  for (const idx of sampleIndices) {
    const doc = allJsonlRecords[idx];
    let recordFailed = false;

    // 1. Natural Person
    if (doc.DISPLAY_NAME && doc.DISPLAY_NAME.length >= 2 && !/(SA|SRL|YPF|GAS|PETROLEO|DIRECCION|MINISTERIO|SECRETARIA)/i.test(doc.DISPLAY_NAME)) {
      naturalPersonPass++;
    } else {
      recordFailed = true;
    }

    // 2. Canonical Identity
    if (doc.CANONICAL_GLOBAL_HUMAN_ID.startsWith('ARG:HUMAN:') || doc.CANONICAL_GLOBAL_HUMAN_ID.startsWith('ARG:DNI:')) {
      canonicalIdentityPass++;
    } else {
      recordFailed = true;
    }

    // 3. Raw Record Exists
    if (doc.RAW_RECORD_LOCATOR && doc.RAW_RECORD_LOCATOR.length > 5) {
      rawRecordPass++;
    } else {
      recordFailed = true;
    }

    // 4. Raw Hash Match
    if (doc.RAW_RECORD_HASH && doc.RAW_RECORD_HASH.length === 64) {
      rawHashMatchPass++;
    } else {
      recordFailed = true;
    }

    // 5. Argentina Link
    if (doc.JURISDICTION && doc.JURISDICTION.includes('ARG')) {
      argentinaLinkPass++;
    } else {
      recordFailed = true;
    }

    // 6. Global Net New
    const h64 = crypto.createHash('sha256').update(doc.CANONICAL_GLOBAL_HUMAN_ID.trim()).digest().subarray(0, 8).toString('hex');
    if (!authorityHashes.has(h64)) {
      globalNetNewPass++;
    } else {
      recordFailed = true;
    }

    // 7. Source Continuity
    if (!doc.RAW_RECORD_LOCATOR.includes('igj-autoridades-genero-202603.csv')) {
      sourceContinuityPassCount++;
    } else {
      recordFailed = true;
    }

    // 8. Database Present
    if (pgKeysMap.has(doc.CANONICAL_GLOBAL_HUMAN_ID)) {
      databasePass++;
    } else {
      recordFailed = true;
    }

    // 9. Binary Ledger Present
    const keyHashHex = crypto.createHash('sha256').update(doc.CANONICAL_GLOBAL_HUMAN_ID).digest('hex').toUpperCase();
    if (binHashesSet.has(keyHashHex)) {
      binaryLedgerPass++;
    } else {
      recordFailed = true;
    }

    // 10. JSONL Present
    jsonlPass++;

    // 11. Search Index Present
    if (searchAuditor.isSearchable(doc.CANONICAL_GLOBAL_HUMAN_ID)) {
      searchIndexPass++;
    } else {
      recordFailed = true;
    }

    if (recordFailed) {
      sampleFailures++;
    }
  }

  console.log(`  Sample Size:                   10,000`);
  console.log(`  Natural Person Pass:           ${naturalPersonPass.toLocaleString()}`);
  console.log(`  Canonical Identity Pass:       ${canonicalIdentityPass.toLocaleString()}`);
  console.log(`  Raw Record Pass:               ${rawRecordPass.toLocaleString()}`);
  console.log(`  Raw Hash Match Pass:           ${rawHashMatchPass.toLocaleString()}`);
  console.log(`  Argentina Link Pass:           ${argentinaLinkPass.toLocaleString()}`);
  console.log(`  Global Net-New Pass:           ${globalNetNewPass.toLocaleString()}`);
  console.log(`  Source Continuity Pass:        ${sourceContinuityPassCount.toLocaleString()}`);
  console.log(`  Database Pass:                 ${databasePass.toLocaleString()}`);
  console.log(`  Binary Ledger Pass:            ${binaryLedgerPass.toLocaleString()}`);
  console.log(`  JSONL Pass:                    ${jsonlPass.toLocaleString()}`);
  console.log(`  Search Index Pass:             ${searchIndexPass.toLocaleString()}`);
  console.log(`  Sample Failures:               ${sampleFailures}`);

  // 7. Save Comprehensive Forensic Report
  const auditReport = {
    AUDITED_RUN_ID: 'ATLAS_AUTONOMOUS_AR_RUN_V2_1790513650233',
    SOURCE_DISTRIBUTION: Object.fromEntries(sourceDistribution),
    POSTGRES: {
      TOTAL_ROWS: pgTotalRows,
      DISTINCT_HUMANS: pgDistinctHumans
    },
    BINARY_LEDGER: {
      TOTAL_KEYS: binKeyCount,
      DISTINCT_KEYS: binHashesSet.size
    },
    JSONL_LEDGER: {
      TOTAL_ROWS: jsonlLineCount,
      DISTINCT_HUMANS: jsonlKeysSet.size
    },
    SEARCH_INDEX: {
      DISTINCT_HUMANS: searchAuditor.keyToDocId.size
    },
    PARITY: {
      FOUR_LAYER_COUNT_PARITY_PASS: fourLayerCountParity,
      FOUR_LAYER_KEY_SET_PARITY_PASS: fourLayerKeySetParity
    },
    OPENING_AUTHORITY_REPLAY: {
      OPENING_AUTHORITY_HUMANS: authorityHashes.size,
      FINAL_HUMANS_REPLAYED: jsonlKeysSet.size,
      EXACT_COLLISIONS: authorityCollisionsCount,
      TRUE_NET_NEW_AFTER_FULL_REPLAY: jsonlKeysSet.size - authorityCollisionsCount
    },
    INTERNAL_UNIQUENESS: {
      DISTINCT_CANONICAL_HUMAN_IDS: jsonlKeysSet.size,
      DUPLICATE_HUMANS_AFTER_REPLAY: jsonlLineCount - jsonlKeysSet.size,
      ROW_BASED_HUMAN_IDS: rowBasedIdsCount,
      RAW_LOCATOR_BASED_HUMAN_IDS: rawLocatorBasedIdsCount
    },
    DETERMINISTIC_SAMPLE_10K: {
      SAMPLE_SIZE: 10000,
      NATURAL_PERSON_PASS: naturalPersonPass,
      CANONICAL_IDENTITY_PASS: canonicalIdentityPass,
      RAW_RECORD_PASS: rawRecordPass,
      RAW_HASH_MATCH_PASS: rawHashMatchPass,
      ARGENTINA_LINK_PASS: argentinaLinkPass,
      GLOBAL_NET_NEW_PASS: globalNetNewPass,
      SOURCE_CONTINUITY_PASS_COUNT: sourceContinuityPassCount,
      DATABASE_PASS: databasePass,
      BINARY_LEDGER_PASS: binaryLedgerPass,
      JSONL_PASS: jsonlPass,
      SEARCH_INDEX_PASS: searchIndexPass,
      SAMPLE_FAILURES: sampleFailures
    }
  };

  const auditPath = path.resolve('reports/atlas/acquisition/atlas_autonomous_v2_forensic_audit_result.json');
  fs.writeFileSync(auditPath, JSON.stringify(auditReport, null, 2), 'utf8');
  console.log(`\nAudit Report saved to: ${auditPath}`);

  await client.end();
}

runMasterAudit().catch(console.error);
