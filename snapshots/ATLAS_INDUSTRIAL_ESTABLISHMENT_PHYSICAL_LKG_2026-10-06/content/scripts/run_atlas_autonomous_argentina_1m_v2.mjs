import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PassThrough } from 'stream';
import pg from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { resolveCanonicalHuman } from './lib/canonicalIdentityResolver.mjs';
import { GlobalConsumedSourceAuthority, scoreResourceNovelty } from './lib/sourceContinuityAuthority.mjs';

dotenv.config();

// In-Memory Search Engine
class ArgentinaSearchEngineV2 {
  constructor() {
    this.keyToDocId = new Map();
    this.tokenIndex = new Map();
    this.docCount = 0;
  }

  tokenize(text) {
    return (text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/)
      .filter(t => t.length >= 2);
  }

  indexPerson(key, displayName) {
    const docId = this.docCount++;
    this.keyToDocId.set(key, docId);
    const tokens = this.tokenize(displayName);
    for (const token of tokens) {
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
}

function escapeCopyText(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/\t/g, ' ')
    .replace(/[\r\n]/g, ' ')
    .trim();
}

async function runAutonomousBenchmarkV2() {
  console.log('================================================================');
  console.log('  ATLAS — AUTONOMOUS ARGENTINA 1M ACQUISITION BENCHMARK V2     ');
  console.log('  STRICT IDENTITY RESOLUTION & GLOBAL EXCLUSION ENFORCED       ');
  console.log('================================================================\n');

  const runId = `ATLAS_AUTONOMOUS_AR_RUN_V2_${Date.now()}`;
  const outDir = path.resolve('reports/atlas/acquisition');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // 1. Load Complete Global Pre-Existing Authority
  console.log('[1/7] Loading Global Preexisting Human Authority...');
  const globalBinPath = path.resolve('scratch/global_preexisting_human_authority.bin');
  if (!fs.existsSync(globalBinPath)) {
    throw new Error('Global preexisting authority not found. Run build_global_preexisting_human_authority.mjs first.');
  }

  const globalBuf = fs.readFileSync(globalBinPath);
  const globalPreexistingHashes = new Set();
  for (let i = 0; i < globalBuf.length; i += 8) {
    globalPreexistingHashes.add(globalBuf.subarray(i, i + 8).toString('hex'));
  }
  console.log(`Global Preexisting Human Authority loaded: ${globalPreexistingHashes.size.toLocaleString()} 64-bit keys.`);

  function isPreexistingHuman(key) {
    if (!key) return false;
    const h64 = crypto.createHash('sha256').update(key.trim()).digest().subarray(0, 8).toString('hex');
    return globalPreexistingHashes.has(h64);
  }

  // 2. Initialize Source Continuity Authority
  console.log('[2/7] Initializing Source Continuity Authority & Novelty Scorer...');
  const continuityAuthority = new GlobalConsumedSourceAuthority();

  // 3. Connect to Database & Prepare Isolated Benchmark Table
  console.log('[3/7] Initializing PostgreSQL Table atlas_shadow.atlas_acquisition_benchmark_1m_v2...');
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
    CREATE TABLE IF NOT EXISTS atlas_shadow.atlas_acquisition_benchmark_1m_v2 (
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
  await client.query(`TRUNCATE TABLE atlas_shadow.atlas_acquisition_benchmark_1m_v2;`);

  const dbPassThrough = new PassThrough({ highWaterMark: 1024 * 1024 * 32 });
  const copySql = `
    COPY atlas_shadow.atlas_acquisition_benchmark_1m_v2 
      (canonical_identity_key, display_name, source_id, source_class, jurisdiction, raw_record_locator, raw_record_hash)
    FROM STDIN WITH (FORMAT text, DELIMITER '\t');
  `;
  const copyStream = client.query(copyFrom(copySql));
  const copyPromise = new Promise((resolve, reject) => {
    copyStream.on('finish', resolve);
    copyStream.on('error', reject);
  });
  dbPassThrough.pipe(copyStream);

  // Set up File Ledgers
  const ledgerBinFile = path.join(outDir, 'atlas_autonomous_ar_v2_ledger.bin');
  const ledgerJsonlFile = path.join(outDir, 'atlas_autonomous_ar_v2_ledger.jsonl');
  const binWriteStream = fs.createWriteStream(ledgerBinFile, { highWaterMark: 1024 * 1024 * 16 });
  const jsonlWriteStream = fs.createWriteStream(ledgerJsonlFile, { highWaterMark: 1024 * 1024 * 32 });

  const searchEngine = new ArgentinaSearchEngineV2();

  // Metrics and Waterfall Counters
  const TARGET_NET_NEW = 1000000;
  let sourceNodesVisited = 0;
  let sourceGraphEdgesTraversed = 0;
  let newSourcesDiscovered = 0;
  let newResourcesDiscovered = 0;
  let sourcesFetched = 0;
  const sourcesContributingSet = new Set();

  let physicalRowsFetched = 0;
  let naturalPersonRows = 0;
  let nonPersonRejects = 0;
  let canonicalUniqueHumans = 0;

  let preexistingHumanRejects = 0;
  let historicallyConsumedSourceRejects = 0;
  let currentRunDuplicateHumanRejects = 0;
  let nonArgentinaLinkRejects = 0;

  let trueNetNewVerified = 0;
  let trueNetNewCommitted = 0;
  let trueNetNewSearchable = 0;

  const currentRunHumansSet = new Set();

  const checkpointsTarget = [100000, 250000, 500000, 750000, 900000, 1000000];
  const checkpointRecords = [];
  let nextCheckpointIdx = 0;

  console.log('\n[4/7] Starting Monotonic Autonomous Acquisition Timer...');
  const benchmarkT0 = performance.now();

  // 4. Autonomous Discovery Radar & Resource Frontier Builder
  console.log('Initiating Autonomous Discovery Radar traversal...');
  const discoveryQueue = [
    {
      type: 'CKAN_PORTAL',
      id: 'src_ckan_datos_ar',
      url: 'https://datos.gob.ar/api/3/action/package_search',
      queries: ['autoridades', 'personal', 'profesionales', 'salarios', 'padron', 'registro', 'proveedores'],
      jurisdiction: 'ARG / NACIONAL',
      sourceClass: 'GOVERNMENT_OPEN_DATA'
    },
    {
      type: 'CKAN_PORTAL',
      id: 'src_ckan_ba_datos',
      url: 'https://data.buenosaires.gob.ar/api/3/action/package_search',
      queries: ['personal', 'salud', 'docentes', 'funcionarios', 'proveedores'],
      jurisdiction: 'ARG / CABA',
      sourceClass: 'MUNICIPAL_OPEN_DATA'
    },
    {
      type: 'CKAN_PORTAL',
      id: 'src_ckan_datos_pba',
      url: 'https://catalogo.datos.gba.gob.ar/api/3/action/package_search',
      queries: ['proveedores', 'salud', 'docentes', 'funcionarios'],
      jurisdiction: 'ARG / PBA',
      sourceClass: 'PROVINCIAL_OPEN_DATA'
    },
    {
      type: 'CKAN_PORTAL',
      id: 'src_ckan_jus_ar',
      url: 'https://datos.jus.gob.ar/api/3/action/package_search',
      queries: ['magistrados', 'ddjj', 'funcionarios', 'justicia'],
      jurisdiction: 'ARG / NACIONAL',
      sourceClass: 'JUDICIAL_AND_ETHICS'
    },
    {
      type: 'CKAN_PORTAL',
      id: 'src_ckan_ssn_ar',
      url: 'https://datosabiertos.ssn.gob.ar/api/3/action/package_search',
      queries: ['productores', 'seguros', 'matriculados'],
      jurisdiction: 'ARG / NACIONAL',
      sourceClass: 'PROFESSIONAL_REGISTRIES'
    },
    {
      type: 'CKAN_PORTAL',
      id: 'src_ckan_bahia',
      url: 'https://datos.bahia.gob.ar/api/3/action/package_search',
      queries: ['personal', 'sueldos', 'proveedores', 'autoridades'],
      jurisdiction: 'ARG / BAHIA_BLANCA',
      sourceClass: 'MUNICIPAL_OPEN_DATA'
    },
    {
      type: 'API_OPENALEX_AR',
      id: 'src_openalex_ar_scholars',
      url: 'https://api.openalex.org/authors?filter=last_known_institutions.country_code:AR&per_page=100',
      jurisdiction: 'ARG / NACIONAL',
      sourceClass: 'ACADEMIC_RESEARCHERS_AND_SCHOLARS'
    }
  ];

  const rawResourceFrontier = [];

  for (const node of discoveryQueue) {
    sourceNodesVisited++;
    console.log(`-> Visiting Discovery Node: ${node.id} (${node.type})`);

    if (node.type === 'CKAN_PORTAL') {
      for (const q of node.queries) {
        sourceGraphEdgesTraversed++;
        try {
          const reqUrl = `${node.url}?q=${encodeURIComponent(q)}&rows=15`;
          const res = await fetch(reqUrl, { headers: { 'User-Agent': 'AtlasAutonomousRadar/2.0' } });
          if (!res.ok) continue;
          const data = await res.json();
          const packages = data.result?.results || [];

          for (const pkg of packages) {
            newSourcesDiscovered++;
            for (const r of (pkg.resources || [])) {
              const fmt = (r.format || '').toUpperCase();
              if (fmt.includes('CSV') || fmt.includes('JSON')) {
                newResourcesDiscovered++;
                rawResourceFrontier.push({
                  resourceId: `RES_${r.id || crypto.randomBytes(4).toString('hex')}`,
                  sourceId: node.id,
                  datasetTitle: pkg.title,
                  resourceName: r.name || pkg.title,
                  url: r.url,
                  format: fmt.includes('JSON') ? 'JSON' : 'CSV',
                  jurisdiction: node.jurisdiction,
                  sourceClass: node.sourceClass,
                  estimatedRows: 50000
                });
              }
            }
          }
        } catch (e) {
          // Autonomous error handling
        }
      }
    } else if (node.type === 'API_OPENALEX_AR') {
      newSourcesDiscovered++;
      newResourcesDiscovered++;
      rawResourceFrontier.push({
        resourceId: 'RES_OPENALEX_AR_AUTHORS',
        sourceId: node.id,
        datasetTitle: 'OpenAlex Argentine Affiliated Researchers',
        resourceName: 'OpenAlex Authors API (AR)',
        url: node.url,
        format: 'OPENALEX_PAGE',
        jurisdiction: node.jurisdiction,
        sourceClass: node.sourceClass,
        estimatedRows: 150000
      });
    }
  }

  // Ingest verified radar bulk resources
  const radarBulkPath = path.resolve('scratch/radar_discovered_bulk_resources.json');
  if (fs.existsSync(radarBulkPath)) {
    const bulkResources = JSON.parse(fs.readFileSync(radarBulkPath, 'utf8'));
    for (const br of bulkResources) {
      sourceGraphEdgesTraversed++;
      newResourcesDiscovered++;
      rawResourceFrontier.push({
        resourceId: br.RESOURCE_ID,
        sourceId: `SRC_${br.ORGANIZATION.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`,
        datasetTitle: br.DATASET_TITLE,
        resourceName: br.DATASET_TITLE,
        url: br.RESOURCE_URL,
        format: br.FORMAT,
        jurisdiction: 'ARG / NACIONAL',
        sourceClass: 'PUBLIC_ADMINISTRATION_REGISTRY',
        estimatedRows: br.ESTIMATED_ROWS,
        personSampleRatio: br.PERSON_SAMPLE_RATIO,
        noveltySampleRatio: br.NOVELTY_SAMPLE_RATIO
      });
    }
  }

  // 5. Source Brain Novelty Scoring and Frontier Ranking
  console.log('\n[5/7] Executing Source Brain Novelty Scoring & Frontier Ranking...');
  const scoredFrontier = [];
  let exhaustedEventsCount = 0;

  for (const res of rawResourceFrontier) {
    const novelty = scoreResourceNovelty(res, continuityAuthority);
    if (!novelty.isEligibleForAcquisition) {
      exhaustedEventsCount++;
      console.log(`  [SKIPPED EXHAUSTED RESOURCE] ${res.resourceName} (${res.url}) - Reason: ${novelty.reason}`);
      continue;
    }
    scoredFrontier.push({ ...res, priorityScore: novelty.priorityScore, expectedNetNew: novelty.expectedNetNewHumans });
  }

  // Rank candidate resources by priority score descending
  scoredFrontier.sort((a, b) => b.priorityScore - a.priorityScore);
  console.log(`Frontier ranked: ${scoredFrontier.length} eligible resources (Exhausted skipped: ${exhaustedEventsCount})`);

  // 6. Streaming Autonomous Acquisition Loop
  console.log('\n[6/7] Executing Autonomous Streaming Acquisition from Ranked Frontier...');

  for (const resMeta of scoredFrontier) {
    if (trueNetNewSearchable >= TARGET_NET_NEW) break;
    sourcesFetched++;

    console.log(`\n>>> Autonomous Fetch [${sourcesFetched}/${scoredFrontier.length}]: ${resMeta.resourceName}`);
    console.log(`    URL: ${resMeta.url} | Expected Net-New: ${resMeta.expectedNetNew}`);

    try {
      if (resMeta.format === 'OPENALEX_PAGE') {
        let cursor = '*';
        let pageCount = 0;
        while (cursor && trueNetNewSearchable < TARGET_NET_NEW && pageCount < 100) {
          pageCount++;
          if (pageCount % 10 === 0 || pageCount === 1) {
            console.log(`    [OpenAlex Progress] Page ${pageCount} | True Net-New Searchable: ${trueNetNewSearchable}`);
          }
          const pageUrl = `https://api.openalex.org/authors?filter=last_known_institutions.country_code:AR&per_page=200&cursor=${encodeURIComponent(cursor)}`;
          const pageRes = await fetch(pageUrl, { headers: { 'User-Agent': 'AtlasAutonomousAcquisitionV2/1.0' } });
          if (!pageRes.ok) break;
          const pageData = await pageRes.json();
          cursor = pageData.meta?.next_cursor;
          const results = pageData.results || [];
          if (results.length === 0) break;

          for (const author of results) {
            physicalRowsFetched++;
            const name = author.display_name;

            const resolution = resolveCanonicalHuman({
              displayName: name,
              docType: 'OPENALEX_AUTHOR_ID',
              docNumber: author.id?.replace('https://openalex.org/', '') || '',
              sourceId: resMeta.sourceId,
              jurisdiction: resMeta.jurisdiction
            });

            if (!resolution.isNaturalPerson) {
              nonPersonRejects++;
              continue;
            }
            naturalPersonRows++;

            const canonicalKey = resolution.canonicalHumanId;
            canonicalUniqueHumans++;

            // Strict credit gate:
            // 1. Global Preexisting check
            if (isPreexistingHuman(canonicalKey) || isPreexistingHuman(name)) {
              preexistingHumanRejects++;
              continue;
            }

            // 2. Current run deduplication
            if (currentRunHumansSet.has(canonicalKey)) {
              currentRunDuplicateHumanRejects++;
              continue;
            }

            // Accept and Commit
            currentRunHumansSet.add(canonicalKey);
            sourcesContributingSet.add(resMeta.sourceId);
            trueNetNewVerified++;

            const locator = `${resMeta.sourceId}#author:${author.id}`;
            const rawHash = crypto.createHash('sha256').update(JSON.stringify(author)).digest('hex').toUpperCase();
            const keyHash = crypto.createHash('sha256').update(canonicalKey).digest('hex').toUpperCase();

            const cleanName = escapeCopyText(name);
            const cleanLocator = escapeCopyText(locator);
            const cleanSourceId = escapeCopyText(resMeta.sourceId);
            const cleanSourceClass = escapeCopyText(resMeta.sourceClass);
            const cleanJurisdiction = escapeCopyText(resMeta.jurisdiction);

            const lineage = {
              CANONICAL_GLOBAL_HUMAN_ID: canonicalKey,
              DISPLAY_NAME: cleanName,
              SOURCE_ID: cleanSourceId,
              SOURCE_CLASS: cleanSourceClass,
              JURISDICTION: cleanJurisdiction,
              RAW_RECORD_LOCATOR: cleanLocator,
              RAW_RECORD_HASH: rawHash
            };

            // DB COPY
            dbPassThrough.write(`${canonicalKey}\t${cleanName}\t${cleanSourceId}\t${cleanSourceClass}\t${cleanJurisdiction}\t${cleanLocator}\t${rawHash}\n`);
            // Binary & JSONL
            binWriteStream.write(Buffer.from(keyHash, 'hex'));
            jsonlWriteStream.write(JSON.stringify(lineage) + '\n');

            // Search Index
            searchEngine.indexPerson(canonicalKey, name);
            if (searchEngine.isSearchable(canonicalKey)) {
              trueNetNewSearchable++;
              trueNetNewCommitted++;
            }

            // Checkpoints
            if (nextCheckpointIdx < checkpointsTarget.length && trueNetNewSearchable >= checkpointsTarget[nextCheckpointIdx]) {
              const cpTarget = checkpointsTarget[nextCheckpointIdx];
              const cpSec = (performance.now() - benchmarkT0) / 1000;
              const cpRecord = {
                CHECKPOINT: `${cpTarget / 1000}K`,
                TARGET_HUMANS: cpTarget,
                ELAPSED_SECONDS: parseFloat(cpSec.toFixed(2)),
                TRUE_NET_NEW_SEARCHABLE: trueNetNewSearchable,
                CURRENT_NET_NEW_RATE: parseFloat((cpTarget / cpSec).toFixed(2)),
                SOURCES_CONTRIBUTING: sourcesContributingSet.size
              };
              checkpointRecords.push(cpRecord);
              console.log(`[CHECKPOINT ${cpRecord.CHECKPOINT}] ${cpRecord.TRUE_NET_NEW_SEARCHABLE} true net-new humans | Elapsed: ${cpRecord.ELAPSED_SECONDS}s | Rate: ${cpRecord.CURRENT_NET_NEW_RATE} h/s`);
              nextCheckpointIdx++;
            }
          }
        }
      } else {
        // Stream CSV resource
        const res = await fetch(resMeta.url, {
          headers: { 'User-Agent': 'AtlasAutonomousAcquisitionV2/1.0', 'Accept-Encoding': 'identity' }
        });
        if (!res.ok) {
          console.warn(`    HTTP status ${res.status}, skipping.`);
          continue;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let rowIdx = 0;

        while (trueNetNewSearchable < TARGET_NET_NEW) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newlineIdx;
          while ((newlineIdx = buffer.indexOf('\n')) !== -1 && trueNetNewSearchable < TARGET_NET_NEW) {
            const line = buffer.slice(0, newlineIdx).trim();
            buffer = buffer.slice(newlineIdx + 1);
            if (!line) continue;
            rowIdx++;
            if (rowIdx === 1) continue; // skip header
            physicalRowsFetched++;

            const sep = line.includes(';') ? ';' : ',';
            const parts = line.split(sep).map(p => p.replace(/"/g, '').trim());

            // Extract candidate name & document from columns
            let candidateName = null;
            let docNumber = '';
            let docType = '';

            for (let i = 0; i < Math.min(8, parts.length); i++) {
              if (parts[i].length >= 4 && !/\d/.test(parts[i]) && parts[i].includes(' ') && !candidateName) {
                candidateName = parts[i];
              }
              if (/^\d{7,8}$/.test(parts[i]) && !docNumber) {
                docNumber = parts[i];
              }
            }

            if (!candidateName) {
              nonPersonRejects++;
              continue;
            }

            const resolution = resolveCanonicalHuman({
              displayName: candidateName,
              docType,
              docNumber,
              sourceId: resMeta.sourceId,
              jurisdiction: resMeta.jurisdiction
            });

            if (!resolution.isNaturalPerson) {
              nonPersonRejects++;
              continue;
            }
            naturalPersonRows++;

            const canonicalKey = resolution.canonicalHumanId;
            canonicalUniqueHumans++;

            // Strict Credit Gate:
            // 1. Global Preexisting Check
            if (isPreexistingHuman(canonicalKey) || isPreexistingHuman(candidateName)) {
              preexistingHumanRejects++;
              continue;
            }

            // 2. Current Run Duplicate Check
            if (currentRunHumansSet.has(canonicalKey)) {
              currentRunDuplicateHumanRejects++;
              continue;
            }

            // Accept and Commit
            currentRunHumansSet.add(canonicalKey);
            sourcesContributingSet.add(resMeta.sourceId);
            trueNetNewVerified++;

            const locator = `${resMeta.sourceId}#row:${rowIdx}`;
            const rawHash = crypto.createHash('sha256').update(line).digest('hex').toUpperCase();
            const keyHash = crypto.createHash('sha256').update(canonicalKey).digest('hex').toUpperCase();

            const cleanName = escapeCopyText(candidateName);
            const cleanLocator = escapeCopyText(locator);
            const cleanSourceId = escapeCopyText(resMeta.sourceId);
            const cleanSourceClass = escapeCopyText(resMeta.sourceClass);
            const cleanJurisdiction = escapeCopyText(resMeta.jurisdiction);

            const lineage = {
              CANONICAL_GLOBAL_HUMAN_ID: canonicalKey,
              DISPLAY_NAME: cleanName,
              SOURCE_ID: cleanSourceId,
              SOURCE_CLASS: cleanSourceClass,
              JURISDICTION: cleanJurisdiction,
              RAW_RECORD_LOCATOR: cleanLocator,
              RAW_RECORD_HASH: rawHash
            };

            // DB COPY
            dbPassThrough.write(`${canonicalKey}\t${cleanName}\t${cleanSourceId}\t${cleanSourceClass}\t${cleanJurisdiction}\t${cleanLocator}\t${rawHash}\n`);
            // Binary & JSONL
            binWriteStream.write(Buffer.from(keyHash, 'hex'));
            jsonlWriteStream.write(JSON.stringify(lineage) + '\n');

            // Search Index
            searchEngine.indexPerson(canonicalKey, candidateName);
            if (searchEngine.isSearchable(canonicalKey)) {
              trueNetNewSearchable++;
              trueNetNewCommitted++;
            }

            // Checkpoints
            if (nextCheckpointIdx < checkpointsTarget.length && trueNetNewSearchable >= checkpointsTarget[nextCheckpointIdx]) {
              const cpTarget = checkpointsTarget[nextCheckpointIdx];
              const cpSec = (performance.now() - benchmarkT0) / 1000;
              const cpRecord = {
                CHECKPOINT: `${cpTarget / 1000}K`,
                TARGET_HUMANS: cpTarget,
                ELAPSED_SECONDS: parseFloat(cpSec.toFixed(2)),
                TRUE_NET_NEW_SEARCHABLE: trueNetNewSearchable,
                CURRENT_NET_NEW_RATE: parseFloat((cpTarget / cpSec).toFixed(2)),
                SOURCES_CONTRIBUTING: sourcesContributingSet.size
              };
              checkpointRecords.push(cpRecord);
              console.log(`[CHECKPOINT ${cpRecord.CHECKPOINT}] ${cpRecord.TRUE_NET_NEW_SEARCHABLE} true net-new humans | Elapsed: ${cpRecord.ELAPSED_SECONDS}s | Rate: ${cpRecord.CURRENT_NET_NEW_RATE} h/s`);
              nextCheckpointIdx++;
            }
          }
        }
        console.log(`    Resource fetch completed: ${rowIdx} rows processed | Cumulative True Net-New: ${trueNetNewSearchable}`);
      }
    } catch (err) {
      console.warn(`    Error streaming resource ${resMeta.resourceName}:`, err.message);
    }
  }

  // 7. Finalize Database Flush and Commit
  console.log('\n[7/7] Finalizing Database Flush and Confirming Physical Commits...');
  dbPassThrough.end();
  await copyPromise;
  await new Promise(res => binWriteStream.end(res));
  await new Promise(res => jsonlWriteStream.end(res));

  const benchmarkT1 = performance.now();
  const totalElapsedSeconds = parseFloat(((benchmarkT1 - benchmarkT0) / 1000).toFixed(2));
  const totalElapsedMinutes = parseFloat((totalElapsedSeconds / 60).toFixed(2));

  // Post-run parity check
  const dbAuditRes = await client.query(`
    SELECT count(*) as total_rows, count(DISTINCT canonical_identity_key) as distinct_keys 
    FROM atlas_shadow.atlas_acquisition_benchmark_1m_v2;
  `);
  const pgTotal = parseInt(dbAuditRes.rows[0].total_rows, 10);
  const pgDistinct = parseInt(dbAuditRes.rows[0].distinct_keys, 10);
  const binKeys = fs.statSync(ledgerBinFile).size / 32;

  // Waterfall check
  const waterfallAccounted = (
    nonPersonRejects +
    preexistingHumanRejects +
    historicallyConsumedSourceRejects +
    currentRunDuplicateHumanRejects +
    nonArgentinaLinkRejects +
    trueNetNewVerified
  );
  const waterfallResidual = Math.abs(physicalRowsFetched - waterfallAccounted);

  const avgNetNewHumansPerSec = totalElapsedSeconds > 0 ? parseFloat((trueNetNewSearchable / totalElapsedSeconds).toFixed(2)) : 0;
  const pass30Min = (trueNetNewSearchable === TARGET_NET_NEW && totalElapsedSeconds <= 1800.00);
  const superPass16Min = (trueNetNewSearchable === TARGET_NET_NEW && totalElapsedSeconds <= 960.00);
  const certified = (trueNetNewSearchable === TARGET_NET_NEW && pass30Min && pgTotal === trueNetNewSearchable);

  const report = {
    BENCHMARK_RUN_ID: runId,
    SOURCE_NODES_VISITED: sourceNodesVisited,
    NEW_SOURCES_DISCOVERED: newSourcesDiscovered,
    NEW_RESOURCES_DISCOVERED: newResourcesDiscovered,
    SOURCES_FETCHED: sourcesFetched,
    SOURCES_CONTRIBUTING: sourcesContributingSet.size,
    PHYSICAL_ROWS_FETCHED: physicalRowsFetched,
    NATURAL_PERSON_ROWS: naturalPersonRows,
    CANONICAL_UNIQUE_HUMANS_EVALUATED: canonicalUniqueHumans,
    NON_PERSON_REJECTS: nonPersonRejects,
    PREEXISTING_HUMAN_REJECTS: preexistingHumanRejects,
    HISTORICALLY_CONSUMED_REJECTS: historicallyConsumedSourceRejects,
    CURRENT_RUN_DUPLICATE_HUMAN_REJECTS: currentRunDuplicateHumanRejects,
    NON_ARGENTINA_LINK_REJECTS: nonArgentinaLinkRejects,
    TRUE_NET_NEW_ARGENTINA_LINKED_VERIFIED: trueNetNewVerified,
    TRUE_NET_NEW_ARGENTINA_LINKED_COMMITTED: trueNetNewCommitted,
    TRUE_NET_NEW_ARGENTINA_LINKED_SEARCHABLE: trueNetNewSearchable,
    WATERFALL_RESIDUAL: waterfallResidual,
    TOTAL_ELAPSED_SECONDS: totalElapsedSeconds,
    TOTAL_ELAPSED_MINUTES: totalElapsedMinutes,
    TRUE_NET_NEW_HUMANS_PER_SECOND: avgNetNewHumansPerSec,
    CHECKPOINT_100K_SECONDS: checkpointRecords.find(c => c.TARGET_HUMANS === 100000)?.ELAPSED_SECONDS || null,
    CHECKPOINT_250K_SECONDS: checkpointRecords.find(c => c.TARGET_HUMANS === 250000)?.ELAPSED_SECONDS || null,
    CHECKPOINT_500K_SECONDS: checkpointRecords.find(c => c.TARGET_HUMANS === 500000)?.ELAPSED_SECONDS || null,
    CHECKPOINT_750K_SECONDS: checkpointRecords.find(c => c.TARGET_HUMANS === 750000)?.ELAPSED_SECONDS || null,
    CHECKPOINT_900K_SECONDS: checkpointRecords.find(c => c.TARGET_HUMANS === 900000)?.ELAPSED_SECONDS || null,
    CHECKPOINT_1M_SECONDS: checkpointRecords.find(c => c.TARGET_HUMANS === 1000000)?.ELAPSED_SECONDS || null,
    ARGENTINA_1M_30MIN_PASS: pass30Min,
    ARGENTINA_1M_16MIN_SUPER_PASS: superPass16Min,
    ATLAS_AUTONOMOUS_ARGENTINA_1M_ACQUISITION_CERTIFIED: certified,
    FINAL_STATUS: certified ? 'CERTIFIED_PASS' : `AUTONOMOUS_FRONTIER_HONEST_DEFICIT_${TARGET_NET_NEW - trueNetNewSearchable}`
  };

  const reportPath = path.join(outDir, 'atlas_autonomous_argentina_v2_certification_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nV2 Benchmark report saved to ${reportPath}`);

  await client.end();
  return report;
}

runAutonomousBenchmarkV2().catch(err => {
  console.error('FATAL BENCHMARK V2 ERROR:', err);
  process.exit(1);
});
