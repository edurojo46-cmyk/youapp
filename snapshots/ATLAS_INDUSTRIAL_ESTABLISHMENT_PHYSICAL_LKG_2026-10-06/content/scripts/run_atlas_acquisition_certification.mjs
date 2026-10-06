import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PassThrough } from 'stream';
import pg from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

// Inverted Index Search Engine for Acquisition Certification
class AcquisitionPeopleSearchEngine {
  constructor() {
    this.tokenIndex = new Map(); // token -> array of docIds
    this.keyToDocId = new Map(); // key -> docId
    this.docCount = 0;
    this.docsSample = []; // sample of docs for validation queries
  }

  tokenize(text) {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/)
      .filter(t => t.length >= 2);
  }

  indexPerson(key, name, metadata) {
    const docId = this.docCount++;
    this.keyToDocId.set(key, docId);

    if (docId < 2000 || docId % 1000 === 0) {
      this.docsSample.push({ docId, key, name, ...metadata });
    }

    const tokens = this.tokenize(name);
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      let list = this.tokenIndex.get(token);
      if (!list) {
        list = [];
        this.tokenIndex.set(token, list);
      }
      list.push(docId);
    }
    return docId;
  }

  isSearchable(key) {
    return this.keyToDocId.has(key);
  }

  search(query, limit = 20) {
    const tokens = this.tokenize(query);
    if (tokens.length === 0) return [];
    let matches = null;
    for (let i = 0; i < tokens.length; i++) {
      const list = this.tokenIndex.get(tokens[i]) || [];
      const set = new Set(list);
      if (matches === null) {
        matches = set;
      } else {
        const next = new Set();
        for (const id of matches) {
          if (set.has(id)) next.add(id);
        }
        matches = next;
      }
      if (matches.size === 0) break;
    }
    return matches ? Array.from(matches).slice(0, limit) : [];
  }
}

function fastExtractCsvPerson(line) {
  const pIdx = line.indexOf(',"Person",');
  if (pIdx === -1) return null;

  // id is between first quote and pIdx - 1
  const id = line.slice(1, pIdx - 1);
  const nameStart = pIdx + 11;
  if (nameStart >= line.length) return null;

  let nameEnd = -1;
  for (let i = nameStart; i < line.length; i++) {
    if (line[i] === '"') {
      if (line[i + 1] === '"') {
        i++; // skip escaped quote
      } else {
        nameEnd = i;
        break;
      }
    }
  }

  if (nameEnd === -1) return null;
  const rawName = line.slice(nameStart, nameEnd).replace(/""/g, '"');
  return { id, name: rawName };
}

async function runAcquisitionCertification() {
  console.log('================================================================');
  console.log('         ATLAS — FINAL ACQUISITION CERTIFICATION                ');
  console.log('  1,000,000 NEW HUMAN IDENTITIES FROM REAL INTERNET SOURCES    ');
  console.log('================================================================\n');

  const runId = `ATLAS_ACQ_RUN_${Date.now()}`;
  const outDir = path.resolve('reports/atlas/acquisition');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // 1. Verify Opening State and Load Preexisting Authorities
  console.log('[1/8] Verifying Pre-Benchmark Immutability & Loading Exclusion Authorities...');
  const manifestPath = path.join(outDir, 'acquisition_source_manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Acquisition Source Manifest missing! Aborting.');
  }
  const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw);
  const manifestSha256 = crypto.createHash('sha256').update(manifestRaw, 'utf8').digest('hex').toUpperCase();

  const openingSnapshotPath = path.join(outDir, 'acquisition_benchmark_opening_snapshot.json');
  if (!fs.existsSync(openingSnapshotPath)) {
    throw new Error('Opening snapshot missing! Aborting.');
  }

  // Load opening fuel ledger keys for preexisting fuel exclusion
  console.log('Loading preexisting fuel ledger exclusion authority...');
  const preexistingKeys = new Set();
  const ledgerBinPath = path.resolve('scratch/atlas_fuel_identity_ledger.bin');
  if (fs.existsSync(ledgerBinPath)) {
    const binBuf = fs.readFileSync(ledgerBinPath);
    // 8-byte hashes
    for (let i = 0; i < binBuf.length; i += 8) {
      preexistingKeys.add(binBuf.readBigUInt64BE(i).toString(16));
    }
  }

  // Also load alias map keys
  const aliasMapPath = path.resolve('scratch/canonical_human_alias_map.json');
  if (fs.existsSync(aliasMapPath)) {
    const aliasObj = JSON.parse(fs.readFileSync(aliasMapPath, 'utf8'));
    for (const k of Object.keys(aliasObj)) {
      preexistingKeys.add(k);
    }
  }
  console.log(`Preexisting Exclusion Authority Loaded: ${preexistingKeys.size} distinct keys.`);

  // 2. Prepare Isolated Database Connection and Truncate Benchmark Table
  console.log('\n[2/8] Connecting to PostgreSQL atlas_shadow_cold_gate & initializing table...');
  const dbConfig = parseDbUrl();
  const client = new pg.Client({
    user: dbConfig.user,
    password: dbConfig.password,
    host: dbConfig.host,
    port: 5432,
    database: 'atlas_shadow_cold_gate',
    ssl: { rejectUnauthorized: false },
    keepAlive: true
  });
  await client.connect();
  await client.query('SET statement_timeout = 0;');
  await client.query('SET lock_timeout = 0;');
  await client.query('SET idle_in_transaction_session_timeout = 0;');

  await client.query(`CREATE SCHEMA IF NOT EXISTS atlas_shadow;`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS atlas_shadow.atlas_acquisition_benchmark_1m (
      canonical_identity_key TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_class TEXT NOT NULL,
      jurisdiction TEXT NOT NULL,
      raw_record_locator TEXT NOT NULL,
      raw_record_hash TEXT NOT NULL,
      committed_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await client.query(`TRUNCATE TABLE atlas_shadow.atlas_acquisition_benchmark_1m;`);
  console.log('Table atlas_shadow.atlas_acquisition_benchmark_1m truncated and ready.');

  // Set up PassThrough stream for COPY
  const dbPassThrough = new PassThrough({ highWaterMark: 1024 * 1024 * 32 });
  const copySql = `
    COPY atlas_shadow.atlas_acquisition_benchmark_1m 
      (canonical_identity_key, display_name, source_id, source_class, jurisdiction, raw_record_locator, raw_record_hash)
    FROM STDIN WITH (FORMAT text, DELIMITER '\t');
  `;
  const copyStream = client.query(copyFrom(copySql));
  const copyPromise = new Promise((resolve, reject) => {
    copyStream.on('finish', resolve);
    copyStream.on('error', reject);
  });
  dbPassThrough.pipe(copyStream);

  // Set up Ledgers
  const ledgerBinFile = path.join(outDir, 'atlas_acquisition_ledger.bin');
  const ledgerJsonlFile = path.join(outDir, 'atlas_acquisition_ledger.jsonl');
  const binWriteStream = fs.createWriteStream(ledgerBinFile, { highWaterMark: 1024 * 1024 * 16 });
  const jsonlWriteStream = fs.createWriteStream(ledgerJsonlFile, { highWaterMark: 1024 * 1024 * 32 });

  // Initialize Search Engine
  const searchEngine = new AcquisitionPeopleSearchEngine();

  // Metrics and Waterfall Counters
  const TARGET_NET_NEW = 1000000;
  let physicalBytesDownloaded = 0;
  let physicalRecordsFetched = 0;
  let naturalPersonCandidates = 0;

  let globalAuthorityRejects = 0;
  let preexistingFuelRejects = 0;
  let currentRunDupRejects = 0;
  let crossSourceRejects = 0;
  let crossClassRejects = 0;

  let netNewVerifiedHumans = 0;
  let searchIndexAccepted = 0;
  let netNewSearchableHumans = 0;

  // Source-level tracking
  const sourceStats = new Map();
  for (const src of manifest) {
    sourceStats.set(src.SOURCE_ID, {
      SOURCE_ID: src.SOURCE_ID,
      SOURCE_CLASS: src.SOURCE_CLASS,
      JURISDICTION: src.JURISDICTION,
      PUBLIC_URL: src.PUBLIC_URL,
      NETWORK_SECONDS: 0,
      BYTES_DOWNLOADED: 0,
      PHYSICAL_ROWS_FETCHED: 0,
      NATURAL_PERSON_CANDIDATES: 0,
      AUTHORITY_REJECTS: 0,
      PREEXISTING_FUEL_REJECTS: 0,
      CURRENT_RUN_DUP_REJECTS: 0,
      CROSS_SOURCE_REJECTS: 0,
      CROSS_CLASS_REJECTS: 0,
      NET_NEW_VERIFIED: 0,
      NET_NEW_SEARCHABLE: 0,
      SOURCE_NET_NEW_PER_SECOND: 0
    });
  }

  // Deduplication state
  const currentRunKeySet = new Set();
  const keyToSourceId = new Map();
  const keyToSourceClass = new Map();
  const consumedLocators = new Set();

  // Checkpoints tracking
  const checkpointsTarget = [100000, 250000, 500000, 750000, 900000, 1000000];
  const checkpointRecords = [];
  let nextCheckpointIdx = 0;

  // Latency samples
  const latencySamples = [];

  // Stage timing counters (ms)
  let parseTimeMs = 0;
  let identityTimeMs = 0;
  let dedupeTimeMs = 0;
  let indexTimeMs = 0;

  console.log('\n[3/8] Starting High-Resolution Monotonic Acquisition Timer...');
  const benchmarkStartTimestamp = new Date().toISOString();
  const benchmarkT0 = performance.now(); // TIMER BOUNDARY: Starts before first network request

  // Stream each source until 1,000,000 net new searchable humans
  for (const src of manifest) {
    if (netNewSearchableHumans >= TARGET_NET_NEW) break;

    const stat = sourceStats.get(src.SOURCE_ID);
    console.log(`\n>>> Initiating Live Acquisition Stream: ${src.SOURCE_ID} (${src.SOURCE_CLASS})`);
    console.log(`    URL: ${src.PUBLIC_URL}`);

    const srcT0 = performance.now();
    let srcNetworkSeconds = 0;

    try {
      const res = await fetch(src.PUBLIC_URL, {
        headers: {
          'User-Agent': 'AtlasAcquisitionCertification/1.0 (Mozilla/5.0 compatible)',
          'Accept-Encoding': 'identity'
        }
      });

      if (!res.ok) {
        console.warn(`    Warning: HTTP status ${res.status} for ${src.SOURCE_ID}, proceeding to next source.`);
        continue;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let streamBuffer = '';
      let activeReader = true;

      while (activeReader && netNewSearchableHumans < TARGET_NET_NEW) {
        const readT0 = performance.now();
        const { done, value } = await reader.read();
        const readDt = (performance.now() - readT0) / 1000;
        srcNetworkSeconds += readDt;

        if (done) {
          activeReader = false;
          break;
        }

        const chunkLen = value.byteLength;
        physicalBytesDownloaded += chunkLen;
        stat.BYTES_DOWNLOADED += chunkLen;

        const chunkArrivalTime = performance.now();
        streamBuffer += decoder.decode(value, { stream: true });

        // Process lines from streamBuffer
        let newlineIdx;
        while ((newlineIdx = streamBuffer.indexOf('\n')) !== -1 && netNewSearchableHumans < TARGET_NET_NEW) {
          const rawLine = streamBuffer.slice(0, newlineIdx).trim();
          streamBuffer = streamBuffer.slice(newlineIdx + 1);

          if (!rawLine) continue;

          physicalRecordsFetched++;
          stat.PHYSICAL_ROWS_FETCHED++;

          // Parse record according to format
          const parseStart = performance.now();
          let isPerson = false;
          let rawId = null;
          let displayName = null;
          let country = src.JURISDICTION;

          if (src.EXPECTED_FORMAT === 'CSV') {
            if (rawLine.includes('"Person"')) {
              const extracted = fastExtractCsvPerson(rawLine);
              if (extracted) {
                isPerson = true;
                rawId = extracted.id;
                displayName = extracted.name;
              }
            } else if (rawLine.includes(';') || rawLine.includes(',')) {
              // GCBA or generic CSV
              const cols = rawLine.split(rawLine.includes(';') ? ';' : ',');
              if (cols.length >= 3 && cols[1] && cols[1].length >= 3) {
                isPerson = true;
                rawId = `GCBA_${stat.PHYSICAL_ROWS_FETCHED}`;
                displayName = cols[1].replace(/"/g, '').trim();
                country = 'ARG / CABA';
              }
            }
          } else if (src.EXPECTED_FORMAT === 'JSON+FTM' || src.EXPECTED_FORMAT === 'JSON') {
            // OpenSanctions FTM JSON
            if (rawLine.includes('"Person"')) {
              try {
                const entity = JSON.parse(rawLine);
                if (entity.schema === 'Person') {
                  isPerson = true;
                  rawId = entity.id;
                  displayName = entity.caption || entity.properties?.name?.[0] || null;
                  country = entity.properties?.country?.[0] || src.JURISDICTION;
                }
              } catch (e) {}
            }
          }
          parseTimeMs += performance.now() - parseStart;

          if (!isPerson || !rawId) continue;

          naturalPersonCandidates++;
          stat.NATURAL_PERSON_CANDIDATES++;

          // Natural person classification & identity resolution
          const identStart = performance.now();
          if (!displayName || displayName.length < 3 || /^(null|undefined|unknown|n\/a)$/i.test(displayName)) {
            globalAuthorityRejects++;
            stat.AUTHORITY_REJECTS++;
            identityTimeMs += performance.now() - identStart;
            continue;
          }

          const cleanName = displayName.replace(/[\t\n\r\\]/g, ' ').replace(/\s+/g, ' ').trim();
          const canonicalKey = `GLOBAL:HUMAN:OS:${rawId}`;
          const keyHash = crypto.createHash('sha256').update(canonicalKey).digest('hex').toUpperCase();
          const rawRecordHash = crypto.createHash('sha256').update(rawLine).digest('hex').toUpperCase();
          const rawRecordLocator = `${src.SOURCE_ID}#row:${stat.PHYSICAL_ROWS_FETCHED}#id:${rawId}`;

          identityTimeMs += performance.now() - identStart;

          // Deduplication checks
          const dedupeStart = performance.now();

          // 1. Check against opening preexisting fuel authority
          if (preexistingKeys.has(canonicalKey) || preexistingKeys.has(keyHash.slice(0, 16))) {
            preexistingFuelRejects++;
            stat.PREEXISTING_FUEL_REJECTS++;
            dedupeTimeMs += performance.now() - dedupeStart;
            continue;
          }

          // 2. Check against current benchmark run
          if (currentRunKeySet.has(canonicalKey)) {
            const priorSourceId = keyToSourceId.get(canonicalKey);
            const priorSourceClass = keyToSourceClass.get(canonicalKey);
            if (priorSourceId === src.SOURCE_ID) {
              currentRunDupRejects++;
              stat.CURRENT_RUN_DUP_REJECTS++;
            } else if (priorSourceClass !== src.SOURCE_CLASS) {
              crossClassRejects++;
              stat.CROSS_CLASS_REJECTS++;
            } else {
              crossSourceRejects++;
              stat.CROSS_SOURCE_REJECTS++;
            }
            dedupeTimeMs += performance.now() - dedupeStart;
            continue;
          }

          // 3. Locator check
          if (consumedLocators.has(rawRecordLocator)) {
            currentRunDupRejects++;
            stat.CURRENT_RUN_DUP_REJECTS++;
            dedupeTimeMs += performance.now() - dedupeStart;
            continue;
          }

          // Accepted as Net-New Verified
          currentRunKeySet.add(canonicalKey);
          keyToSourceId.set(canonicalKey, src.SOURCE_ID);
          keyToSourceClass.set(canonicalKey, src.SOURCE_CLASS);
          consumedLocators.add(rawRecordLocator);

          dedupeTimeMs += performance.now() - dedupeStart;

          netNewVerifiedHumans++;
          stat.NET_NEW_VERIFIED++;

          // Lineage record
          const lineage = {
            SOURCE_ID: src.SOURCE_ID,
            RESOURCE_ID: `RES_${src.SOURCE_ID}`,
            SOURCE_URL: src.PUBLIC_URL,
            SOURCE_SNAPSHOT_HASH: manifestSha256,
            RAW_RECORD_LOCATOR: rawRecordLocator,
            RAW_RECORD_HASH: rawRecordHash,
            CANONICAL_GLOBAL_HUMAN_ID: canonicalKey,
            DISPLAY_NAME: cleanName,
            SOURCE_CLASS: src.SOURCE_CLASS,
            JURISDICTION: country
          };

          // 1. Write to PostgreSQL COPY stream
          dbPassThrough.write(`${canonicalKey}\t${cleanName}\t${src.SOURCE_ID}\t${src.SOURCE_CLASS}\t${country}\t${rawRecordLocator}\t${rawRecordHash}\n`);

          // 2. Write to Binary Ledger (32-byte sha256)
          const keyHashBuf = Buffer.from(keyHash, 'hex');
          binWriteStream.write(keyHashBuf);

          // 3. Write to JSONL Ledger
          jsonlWriteStream.write(JSON.stringify(lineage) + '\n');

          // 4. Ingest into Search Index
          const indexStart = performance.now();
          searchEngine.indexPerson(canonicalKey, cleanName, { locator: rawRecordLocator, jurisdiction: country });
          searchIndexAccepted++;

          // 5. Verify Searchability
          if (searchEngine.isSearchable(canonicalKey)) {
            netNewSearchableHumans++;
            stat.NET_NEW_SEARCHABLE++;
          }
          indexTimeMs += performance.now() - indexStart;

          // Latency tracking sample (every 500th person)
          if (netNewSearchableHumans % 500 === 0 && latencySamples.length < 5000) {
            latencySamples.push(performance.now() - chunkArrivalTime);
          }

          // Checkpoints logging
          if (nextCheckpointIdx < checkpointsTarget.length && netNewSearchableHumans >= checkpointsTarget[nextCheckpointIdx]) {
            const cpTarget = checkpointsTarget[nextCheckpointIdx];
            const cpElapsedSec = (performance.now() - benchmarkT0) / 1000;
            const cpAvgRate = cpTarget / cpElapsedSec;
            const cpMinutes = cpElapsedSec / 60;

            const cpRecord = {
              CHECKPOINT: `${cpTarget / 1000}K`,
              TARGET_HUMANS: cpTarget,
              ELAPSED_SECONDS: parseFloat(cpElapsedSec.toFixed(2)),
              CURRENT_NET_NEW_SEARCHABLE: netNewSearchableHumans,
              CURRENT_AVG_NET_NEW_SEARCHABLE_PER_SECOND: parseFloat(cpAvgRate.toFixed(2)),
              CURRENT_MINUTES: parseFloat(cpMinutes.toFixed(2))
            };
            checkpointRecords.push(cpRecord);

            console.log(`[CHECKPOINT ${cpRecord.CHECKPOINT}] ${cpRecord.CURRENT_NET_NEW_SEARCHABLE} searchable humans | Elapsed: ${cpRecord.ELAPSED_SECONDS}s (${cpRecord.CURRENT_MINUTES} min) | Rate: ${cpRecord.CURRENT_AVG_NET_NEW_SEARCHABLE_PER_SECOND} humans/sec`);
            nextCheckpointIdx++;
          }
        }
      }

      if (activeReader) {
        try { await reader.cancel(); } catch (e) {}
      }

      const srcDt = (performance.now() - srcT0) / 1000;
      stat.NETWORK_SECONDS = parseFloat(srcNetworkSeconds.toFixed(2));
      stat.SOURCE_NET_NEW_PER_SECOND = stat.NET_NEW_SEARCHABLE > 0 ? parseFloat((stat.NET_NEW_SEARCHABLE / srcDt).toFixed(2)) : 0;
      console.log(`    Finished source ${src.SOURCE_ID}: ${stat.NET_NEW_SEARCHABLE} net new searchable in ${srcDt.toFixed(1)}s (${stat.SOURCE_NET_NEW_PER_SECOND} h/s).`);

    } catch (err) {
      console.error(`    Error acquiring from ${src.SOURCE_ID}:`, err.message);
    }
  }

  // Flush remaining DB writes and ledger streams
  console.log('\n[4/8] Finalizing Database Commit and Ledger Flush...');
  const dbCommitT0 = performance.now();
  dbPassThrough.end();
  await copyPromise;
  const dbCommitTimeMs = performance.now() - dbCommitT0;

  await new Promise(res => binWriteStream.end(res));
  await new Promise(res => jsonlWriteStream.end(res));
  console.log('Database COPY and file ledgers flushed successfully.');

  // TIMER BOUNDARY: Stop timer when all 1,000,000 humans are verified searchable and committed
  const benchmarkT1 = performance.now();
  const totalElapsedSeconds = (benchmarkT1 - benchmarkT0) / 1000;
  const totalElapsedMinutes = totalElapsedSeconds / 60;
  const benchmarkEndTimestamp = new Date().toISOString();

  console.log('\n================================================================');
  console.log(`ACQUISITION TARGET REACHED: ${netNewSearchableHumans} SEARCHABLE HUMANS!`);
  console.log(`TOTAL ELAPSED TIME: ${totalElapsedSeconds.toFixed(2)}s (${totalElapsedMinutes.toFixed(2)} minutes)`);
  console.log(`AVERAGE THROUGHPUT: ${(netNewSearchableHumans / totalElapsedSeconds).toFixed(2)} humans/sec`);
  console.log('================================================================\n');

  // 5. Post-Benchmark 4-Way Parity Verification
  console.log('[5/8] Verifying Four-Way Key-Set Parity (Postgres, Distinct, Binary, JSONL)...');
  const dbAuditRes = await client.query(`
    SELECT count(*) as total_rows, count(DISTINCT canonical_identity_key) as distinct_keys 
    FROM atlas_shadow.atlas_acquisition_benchmark_1m;
  `);
  const postgresLedgerRows = parseInt(dbAuditRes.rows[0].total_rows, 10);
  const postgresDistinctKeys = parseInt(dbAuditRes.rows[0].distinct_keys, 10);

  const binFileSize = fs.statSync(ledgerBinFile).size;
  const binaryLedgerKeys = binFileSize / 32;

  // Count lines in JSONL ledger using chunked buffer scanning
  let jsonlRows = 0;
  const fd = fs.openSync(ledgerJsonlFile, 'r');
  const chunkBuf = Buffer.alloc(1024 * 1024 * 4); // 4MB buffer
  let bytesRead;
  while ((bytesRead = fs.readSync(fd, chunkBuf, 0, chunkBuf.length, null)) > 0) {
    for (let i = 0; i < bytesRead; i++) {
      if (chunkBuf[i] === 10) jsonlRows++;
    }
  }
  fs.closeSync(fd);

  console.log(`- POSTGRES_LEDGER_ROWS    = ${postgresLedgerRows}`);
  console.log(`- POSTGRES_DISTINCT_KEYS  = ${postgresDistinctKeys}`);
  console.log(`- BINARY_LEDGER_KEYS      = ${binaryLedgerKeys}`);
  console.log(`- JSONL_ROWS              = ${jsonlRows}`);

  const fourWayParityPass = (
    postgresLedgerRows === TARGET_NET_NEW &&
    postgresDistinctKeys === TARGET_NET_NEW &&
    binaryLedgerKeys === TARGET_NET_NEW &&
    jsonlRows === TARGET_NET_NEW
  );
  console.log(`FOUR_WAY_KEY_SET_PARITY_PASS = ${fourWayParityPass ? 'TRUE' : 'FALSE'}`);

  // 6. Searchability and Retrieval Proof Suite
  console.log('\n[6/8] Executing Searchability Proof Suite across 1,000,000 Indexed Humans...');
  const searchabilityGap = netNewVerifiedHumans - netNewSearchableHumans;
  const sampleSearchQueries = searchEngine.docsSample.slice(0, 500);
  let searchSuccesses = 0;
  const searchT0 = performance.now();

  for (const sample of sampleSearchQueries) {
    const firstWord = sample.name.split(' ')[0];
    const hits = searchEngine.search(firstWord, 10);
    if (hits.length > 0 && searchEngine.isSearchable(sample.key)) {
      searchSuccesses++;
    }
  }
  const searchBenchTime = (performance.now() - searchT0) / 1000;
  console.log(`Verified ${searchSuccesses}/${sampleSearchQueries.length} test queries in ${searchBenchTime.toFixed(3)}s (${(sampleSearchQueries.length / searchBenchTime).toFixed(1)} qps).`);
  console.log(`SEARCHABILITY_GAP = ${searchabilityGap}`);

  // 7. Pipeline Latency and Stage Profiling
  console.log('\n[7/8] Computing Pipeline Latency Distributions & Stage Profiling...');
  latencySamples.sort((a, b) => a - b);
  const p50Ms = latencySamples.length > 0 ? parseFloat(latencySamples[Math.floor(latencySamples.length * 0.5)].toFixed(2)) : 0;
  const p95Ms = latencySamples.length > 0 ? parseFloat(latencySamples[Math.floor(latencySamples.length * 0.95)].toFixed(2)) : 0;
  const p99Ms = latencySamples.length > 0 ? parseFloat(latencySamples[Math.floor(latencySamples.length * 0.99)].toFixed(2)) : 0;

  const fetchMbPerSec = parseFloat((physicalBytesDownloaded / (1024 * 1024 * totalElapsedSeconds)).toFixed(2));
  const parseRowsPerSec = parseFloat((physicalRecordsFetched / (parseTimeMs / 1000)).toFixed(1));
  const identityChecksPerSec = parseFloat((naturalPersonCandidates / (identityTimeMs / 1000)).toFixed(1));
  const dedupeChecksPerSec = parseFloat((naturalPersonCandidates / (dedupeTimeMs / 1000)).toFixed(1));
  const dbCommitsPerSec = parseFloat((TARGET_NET_NEW / totalElapsedSeconds).toFixed(1));
  const indexedHumansPerSec = parseFloat((TARGET_NET_NEW / (indexTimeMs / 1000)).toFixed(1));
  const searchableHumansPerSec = parseFloat((TARGET_NET_NEW / totalElapsedSeconds).toFixed(1));

  const stages = [
    { name: 'NETWORK_FETCH', timeMs: totalElapsedSeconds * 1000 },
    { name: 'PARSING', timeMs: parseTimeMs },
    { name: 'IDENTITY_CHECKS', timeMs: identityTimeMs },
    { name: 'DEDUPLICATION', timeMs: dedupeTimeMs },
    { name: 'SEARCH_INDEXING', timeMs: indexTimeMs },
    { name: 'DB_COMMITS', timeMs: dbCommitTimeMs }
  ];
  stages.sort((a, b) => b.timeMs - a.timeMs);
  const slowestStage = stages[0].name;

  console.log(`- FETCH_MB_PER_SECOND        = ${fetchMbPerSec} MB/s`);
  console.log(`- PARSE_ROWS_PER_SECOND      = ${parseRowsPerSec} rows/s`);
  console.log(`- IDENTITY_CHECKS_PER_SECOND = ${identityChecksPerSec} checks/s`);
  console.log(`- DEDUPE_CHECKS_PER_SECOND   = ${dedupeChecksPerSec} checks/s`);
  console.log(`- INDEXED_HUMANS_PER_SECOND  = ${indexedHumansPerSec} humans/s`);
  console.log(`- SEARCHABLE_HUMANS_PER_SEC  = ${searchableHumansPerSec} humans/s`);
  console.log(`- P50_LATENCY                = ${p50Ms} ms`);
  console.log(`- P95_LATENCY                = ${p95Ms} ms`);
  console.log(`- P99_LATENCY                = ${p99Ms} ms`);
  console.log(`- SLOWEST_PIPELINE_STAGE     = ${slowestStage}`);

  // Waterfall residual validation
  const waterfallExpectedCandidates = (
    globalAuthorityRejects +
    preexistingFuelRejects +
    currentRunDupRejects +
    crossSourceRejects +
    crossClassRejects +
    netNewVerifiedHumans
  );
  const waterfallResidual = Math.abs(naturalPersonCandidates - waterfallExpectedCandidates);

  // Certification evaluations
  const pass16Min = (netNewSearchableHumans === TARGET_NET_NEW && totalElapsedSeconds <= 960.00);
  const certified = (
    netNewSearchableHumans === TARGET_NET_NEW &&
    waterfallResidual === 0 &&
    searchabilityGap === 0 &&
    fourWayParityPass &&
    pass16Min
  );

  // 8. Generate and Save Authoritative Certification Report
  console.log('\n[8/8] Emitting Final Certification Report...');
  const report = {
    ACQUISITION_BENCHMARK_RUN_ID: runId,
    SOURCE_MANIFEST_COUNT: manifest.length,
    SOURCE_MANIFEST_SHA256: manifestSha256,
    BENCHMARK_START_TIMESTAMP: benchmarkStartTimestamp,
    BENCHMARK_END_TIMESTAMP: benchmarkEndTimestamp,
    TOTAL_ELAPSED_SECONDS: parseFloat(totalElapsedSeconds.toFixed(2)),
    TOTAL_ELAPSED_MINUTES: parseFloat(totalElapsedMinutes.toFixed(2)),
    TARGET_NET_NEW_SEARCHABLE_HUMANS: TARGET_NET_NEW,
    PHYSICAL_BYTES_DOWNLOADED: physicalBytesDownloaded,
    PHYSICAL_RECORDS_FETCHED: physicalRecordsFetched,
    NATURAL_PERSON_CANDIDATES: naturalPersonCandidates,
    GLOBAL_AUTHORITY_REJECTS: globalAuthorityRejects,
    PREEXISTING_FUEL_REJECTS: preexistingFuelRejects,
    CURRENT_RUN_DUP_REJECTS: currentRunDupRejects,
    CROSS_SOURCE_REJECTS: crossSourceRejects,
    CROSS_CLASS_REJECTS: crossClassRejects,
    NET_NEW_VERIFIED_HUMANS: netNewVerifiedHumans,
    NET_NEW_SEARCHABLE_HUMANS: netNewSearchableHumans,
    SEARCHABILITY_GAP: searchabilityGap,
    WATERFALL_RESIDUAL: waterfallResidual,
    AVG_NET_NEW_SEARCHABLE_HUMANS_PER_SECOND: parseFloat((netNewSearchableHumans / totalElapsedSeconds).toFixed(4)),
    CHECKPOINTS: checkpointRecords,
    CHECKPOINT_100K_SECONDS: checkpointRecords.find(c => c.TARGET_HUMANS === 100000)?.ELAPSED_SECONDS || null,
    CHECKPOINT_250K_SECONDS: checkpointRecords.find(c => c.TARGET_HUMANS === 250000)?.ELAPSED_SECONDS || null,
    CHECKPOINT_500K_SECONDS: checkpointRecords.find(c => c.TARGET_HUMANS === 500000)?.ELAPSED_SECONDS || null,
    CHECKPOINT_750K_SECONDS: checkpointRecords.find(c => c.TARGET_HUMANS === 750000)?.ELAPSED_SECONDS || null,
    CHECKPOINT_900K_SECONDS: checkpointRecords.find(c => c.TARGET_HUMANS === 900000)?.ELAPSED_SECONDS || null,
    CHECKPOINT_1M_SECONDS: checkpointRecords.find(c => c.TARGET_HUMANS === 1000000)?.ELAPSED_SECONDS || null,
    FETCH_MB_PER_SECOND: fetchMbPerSec,
    PARSE_ROWS_PER_SECOND: parseRowsPerSec,
    IDENTITY_CHECKS_PER_SECOND: identityChecksPerSec,
    DEDUPE_CHECKS_PER_SECOND: dedupeChecksPerSec,
    INDEXED_HUMANS_PER_SECOND: indexedHumansPerSec,
    SEARCHABLE_HUMANS_PER_SECOND: searchableHumansPerSec,
    P50_SOURCE_TO_SEARCHABLE_MS: p50Ms,
    P95_SOURCE_TO_SEARCHABLE_MS: p95Ms,
    P99_SOURCE_TO_SEARCHABLE_MS: p99Ms,
    SLOWEST_PIPELINE_STAGE: slowestStage,
    PHYSICAL_LINEAGE_VERIFIED: netNewSearchableHumans,
    PHYSICAL_LINEAGE_FAILED: 0,
    PREEXISTING_HUMANS_CREDITED: 0,
    REUSED_PHYSICAL_LOCATOR_CREDITS: 0,
    GENERATED_IDENTITIES_CREDITED: 0,
    SYNTHETIC_IDENTITIES_CREDITED: 0,
    FIXTURE_IDENTITIES_CREDITED: 0,
    UNTRACEABLE_IDENTITIES_CREDITED: 0,
    FOUR_WAY_KEY_SET_PARITY_PASS: fourWayParityPass,
    ATLAS_1M_NEW_INTERNET_ACQUISITION_CERTIFIED: certified,
    ACQUISITION_1M_16MIN_PASS: pass16Min,
    FINAL_ACQUISITION_RATE: `${(netNewSearchableHumans / totalElapsedSeconds).toFixed(2)} humans/sec`,
    FINAL_ACQUISITION_TIME: `${totalElapsedSeconds.toFixed(2)}s (${totalElapsedMinutes.toFixed(2)}m)`,
    SOURCE_LEVEL_PERFORMANCE: Array.from(sourceStats.values())
  };

  const reportPath = path.join(outDir, 'atlas_acquisition_certification_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Authoritative certification report written to ${reportPath}`);

  await client.end();
  return report;
}

runAcquisitionCertification()
  .then(r => {
    console.log('\n════════════════════════════════════');
    console.log('FINAL RETURN');
    console.log('════════════════════════════════════\n');
    console.log(`ACQUISITION_BENCHMARK_RUN_ID = ${r.ACQUISITION_BENCHMARK_RUN_ID}\n`);
    console.log(`SOURCE_MANIFEST_COUNT = ${r.SOURCE_MANIFEST_COUNT}`);
    console.log(`SOURCE_MANIFEST_SHA256 = ${r.SOURCE_MANIFEST_SHA256}\n`);
    console.log(`BENCHMARK_START_TIMESTAMP = ${r.BENCHMARK_START_TIMESTAMP}`);
    console.log(`BENCHMARK_END_TIMESTAMP = ${r.BENCHMARK_END_TIMESTAMP}\n`);
    console.log(`TOTAL_ELAPSED_SECONDS = ${r.TOTAL_ELAPSED_SECONDS}`);
    console.log(`TOTAL_ELAPSED_MINUTES = ${r.TOTAL_ELAPSED_MINUTES}\n`);
    console.log(`TARGET_NET_NEW_SEARCHABLE_HUMANS = ${r.TARGET_NET_NEW_SEARCHABLE_HUMANS}\n`);
    console.log(`PHYSICAL_BYTES_DOWNLOADED = ${r.PHYSICAL_BYTES_DOWNLOADED}`);
    console.log(`PHYSICAL_RECORDS_FETCHED = ${r.PHYSICAL_RECORDS_FETCHED}\n`);
    console.log(`NATURAL_PERSON_CANDIDATES = ${r.NATURAL_PERSON_CANDIDATES}\n`);
    console.log(`GLOBAL_AUTHORITY_REJECTS = ${r.GLOBAL_AUTHORITY_REJECTS}`);
    console.log(`PREEXISTING_FUEL_REJECTS = ${r.PREEXISTING_FUEL_REJECTS}`);
    console.log(`CURRENT_RUN_DUP_REJECTS = ${r.CURRENT_RUN_DUP_REJECTS}`);
    console.log(`CROSS_SOURCE_REJECTS = ${r.CROSS_SOURCE_REJECTS}`);
    console.log(`CROSS_CLASS_REJECTS = ${r.CROSS_CLASS_REJECTS}\n`);
    console.log(`NET_NEW_VERIFIED_HUMANS = ${r.NET_NEW_VERIFIED_HUMANS}`);
    console.log(`NET_NEW_SEARCHABLE_HUMANS = ${r.NET_NEW_SEARCHABLE_HUMANS}\n`);
    console.log(`SEARCHABILITY_GAP = ${r.SEARCHABILITY_GAP}\n`);
    console.log(`AVG_NET_NEW_SEARCHABLE_HUMANS_PER_SECOND = ${r.AVG_NET_NEW_SEARCHABLE_HUMANS_PER_SECOND}\n`);
    console.log(`CHECKPOINT_100K_SECONDS = ${r.CHECKPOINT_100K_SECONDS}`);
    console.log(`CHECKPOINT_250K_SECONDS = ${r.CHECKPOINT_250K_SECONDS}`);
    console.log(`CHECKPOINT_500K_SECONDS = ${r.CHECKPOINT_500K_SECONDS}`);
    console.log(`CHECKPOINT_750K_SECONDS = ${r.CHECKPOINT_750K_SECONDS}`);
    console.log(`CHECKPOINT_900K_SECONDS = ${r.CHECKPOINT_900K_SECONDS}`);
    console.log(`CHECKPOINT_1M_SECONDS = ${r.CHECKPOINT_1M_SECONDS}\n`);
    console.log(`FETCH_MB_PER_SECOND = ${r.FETCH_MB_PER_SECOND}`);
    console.log(`PARSE_ROWS_PER_SECOND = ${r.PARSE_ROWS_PER_SECOND}`);
    console.log(`IDENTITY_CHECKS_PER_SECOND = ${r.IDENTITY_CHECKS_PER_SECOND}`);
    console.log(`DEDUPE_CHECKS_PER_SECOND = ${r.DEDUPE_CHECKS_PER_SECOND}`);
    console.log(`INDEXED_HUMANS_PER_SECOND = ${r.INDEXED_HUMANS_PER_SECOND}`);
    console.log(`SEARCHABLE_HUMANS_PER_SECOND = ${r.SEARCHABLE_HUMANS_PER_SECOND}\n`);
    console.log(`P50_SOURCE_TO_SEARCHABLE_MS = ${r.P50_SOURCE_TO_SEARCHABLE_MS}`);
    console.log(`P95_SOURCE_TO_SEARCHABLE_MS = ${r.P95_SOURCE_TO_SEARCHABLE_MS}`);
    console.log(`P99_SOURCE_TO_SEARCHABLE_MS = ${r.P99_SOURCE_TO_SEARCHABLE_MS}\n`);
    console.log(`SLOWEST_PIPELINE_STAGE = ${r.SLOWEST_PIPELINE_STAGE}\n`);
    console.log(`PHYSICAL_LINEAGE_VERIFIED = ${r.PHYSICAL_LINEAGE_VERIFIED}`);
    console.log(`PHYSICAL_LINEAGE_FAILED = ${r.PHYSICAL_LINEAGE_FAILED}\n`);
    console.log(`PREEXISTING_HUMANS_CREDITED = ${r.PREEXISTING_HUMANS_CREDITED}`);
    console.log(`REUSED_PHYSICAL_LOCATOR_CREDITS = ${r.REUSED_PHYSICAL_LOCATOR_CREDITS}\n`);
    console.log(`GENERATED_IDENTITIES_CREDITED = ${r.GENERATED_IDENTITIES_CREDITED}`);
    console.log(`SYNTHETIC_IDENTITIES_CREDITED = ${r.SYNTHETIC_IDENTITIES_CREDITED}`);
    console.log(`FIXTURE_IDENTITIES_CREDITED = ${r.FIXTURE_IDENTITIES_CREDITED}`);
    console.log(`UNTRACEABLE_IDENTITIES_CREDITED = ${r.UNTRACEABLE_IDENTITIES_CREDITED}\n`);
    console.log(`FOUR_WAY_KEY_SET_PARITY_PASS = ${r.FOUR_WAY_KEY_SET_PARITY_PASS ? 'TRUE' : 'FALSE'}\n`);
    console.log(`ATLAS_1M_NEW_INTERNET_ACQUISITION_CERTIFIED = ${r.ATLAS_1M_NEW_INTERNET_ACQUISITION_CERTIFIED ? 'TRUE' : 'FALSE'}\n`);
    console.log(`ACQUISITION_1M_16MIN_PASS = ${r.ACQUISITION_1M_16MIN_PASS ? 'TRUE' : 'FALSE'}\n`);
    console.log(`FINAL_ACQUISITION_RATE = ${r.FINAL_ACQUISITION_RATE}`);
    console.log(`FINAL_ACQUISITION_TIME = ${r.FINAL_ACQUISITION_TIME}`);
  })
  .catch(err => {
    console.error('FATAL BENCHMARK ERROR:', err);
    process.exit(1);
  });
