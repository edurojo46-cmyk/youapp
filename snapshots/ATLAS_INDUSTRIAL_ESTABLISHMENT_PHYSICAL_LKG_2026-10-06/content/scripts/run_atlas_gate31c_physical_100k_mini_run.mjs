/**
 * scripts/run_atlas_gate31c_physical_100k_mini_run.mjs
 * 
 * ATLAS GATE #31C: PHYSICAL 100,000 PEOPLE / 180 SECOND MINI-RUN
 * 
 * True Physical Mini-Certification:
 * - Target: 100,000 net-new unique searchable persons
 * - Time budget: 180 seconds (Target rate: >= 555.56 net-new/sec)
 * - Source: Real ARCA RG 1817 physical file
 * - Hardware monotonic clock: process.hrtime.bigint()
 * - T0 dedup against PostgreSQL SSOT (1,279,304 canonical people)
 * - SQLite shadow canonical ledger with PRIMARY KEY constraint
 * - Orama full-text search shadow index
 * - Zero simulation, zero synthetic entropy
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { create as createOrama, insertMultiple as insertMultipleOrama, count as countOrama, search as searchOrama } from '@orama/orama';
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { ArcaConditionTaxBulkConnector } from '../src/lib/atlas/discovery/connectors/ArcaConditionTaxBulkConnector.mjs';

const { Client } = pg;

export async function run100kMiniRun(options = {}) {
  const targetNetNew = options.targetNetNew || 100000;
  const timeBudgetSeconds = options.timeBudgetSeconds || 180;
  const filePath = options.filePath || path.resolve('cache_arca/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp');

  if (!fs.existsSync(filePath)) {
    throw new Error(`SOURCE_FILE_NOT_FOUND: ${filePath}`);
  }

  // Load HMAC secret
  const env = fs.readFileSync('.env', 'utf8');
  let hmacSecret = '';
  for (const line of env.split('\n')) {
    if (line.startsWith('ATLAS_IGJ_IDENTITY_HMAC_KEY=')) {
      hmacSecret = line.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
    }
  }
  if (!hmacSecret) hmacSecret = '1e7b93df021b3394a11f95304b0dfb925b4ec91428a2a5df0db036af6b88950d';

  console.log('================================================================================');
  console.log(`ATLAS GATE #31C: PHYSICAL ${targetNetNew.toLocaleString()} PERSON MINI-RUN (BUDGET: ${timeBudgetSeconds}s)`);
  console.log('================================================================================\n');

  // 1. Invariant pre-check: PostgreSQL SSOT distinct canonical count
  console.log('Verifying PostgreSQL SSOT T0 count...');
  const pgClient = new Client(parseDbUrl());
  await pgClient.connect();
  const preCheckRes = await pgClient.query('SELECT COUNT(DISTINCT atlas_person_id) AS cnt FROM public.atlas_person_identity_map WHERE atlas_person_id IS NOT NULL');
  const ssotT0Count = parseInt(preCheckRes.rows[0].cnt, 10);
  console.log(`Verified SSOT T0 count: ${ssotT0Count.toLocaleString()} distinct canonical people.`);

  // 2. Preload T0 Set into memory for instant O(1) identity resolution
  console.log('Preloading T0 canonical keys into memory Set...');
  const t0PreloadStart = Date.now();
  const t0QueryRes = await pgClient.query('SELECT atlas_person_id FROM public.atlas_person_identity_map WHERE atlas_person_id IS NOT NULL');
  const t0Set = new Set();
  for (let i = 0; i < t0QueryRes.rows.length; i++) {
    t0Set.add(t0QueryRes.rows[i].atlas_person_id);
  }
  console.log(`T0 Set preloaded: ${t0Set.size.toLocaleString()} unique keys in ${Date.now() - t0PreloadStart} ms.\n`);
  await pgClient.end();

  // 3. Initialize physical SQLite shadow ledger
  const sqliteDbPath = path.resolve('scratch_gate31c_100k_ledger.sqlite');
  if (fs.existsSync(sqliteDbPath)) {
    try { fs.unlinkSync(sqliteDbPath); } catch (e) {}
  }
  const ledgerDb = new DatabaseSync(sqliteDbPath);
  ledgerDb.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS gate31c_mini_run_shadow_ledger (
      safe_shadow_person_key TEXT PRIMARY KEY,
      cuit_masked TEXT NOT NULL,
      decision TEXT NOT NULL,
      indexed_in_search INTEGER NOT NULL,
      created_at_monotonic_ns INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mini_ledger_decision ON gate31c_mini_run_shadow_ledger(decision);
  `);

  const insertLedgerStmt = ledgerDb.prepare(`
    INSERT INTO gate31c_mini_run_shadow_ledger (
      safe_shadow_person_key,
      cuit_masked,
      decision,
      indexed_in_search,
      created_at_monotonic_ns
    ) VALUES (?, ?, ?, ?, ?)
  `);

  // 4. Initialize physical Orama full-text search shadow index
  console.log('Initializing Orama physical search shadow index...');
  const searchIndex = await createOrama({
    schema: {
      shadow_person_id: 'string',
      display_name: 'string',
      cuit_masked: 'string',
      source_surface_id: 'string'
    }
  });

  // Counters
  const decisions = {
    MERGE_EXISTING: 0,
    NEW_CANONICAL_SHADOW: 0,
    RUN_DUPLICATE: 0,
    REJECT: 0,
    INSUFFICIENT: 0
  };
  const inRunSeen = new Set();
  let rawLinesScanned = 0;
  let naturalPersonsEncountered = 0;

  // Batch buffer for SQLite and Orama
  const BATCH_SIZE = 2500;
  let pendingLedgerRows = [];
  let pendingSearchDocs = [];

  console.log(`Starting physical execution against ${path.basename(filePath)}...`);
  console.log(`Target: ${targetNetNew.toLocaleString()} net-new canonical persons in <= ${timeBudgetSeconds}s.\n`);

  const monotonicStart = process.hrtime.bigint();
  const fileStream = fs.createReadStream(filePath, { encoding: 'latin1' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  async function flushBatch() {
    if (pendingLedgerRows.length === 0) return;

    // Flush SQLite in transaction
    ledgerDb.exec('BEGIN TRANSACTION');
    for (const row of pendingLedgerRows) {
      insertLedgerStmt.run(row[0], row[1], row[2], row[3], row[4]);
    }
    ledgerDb.exec('COMMIT');
    pendingLedgerRows = [];

    // Flush Orama search docs
    if (pendingSearchDocs.length > 0) {
      await insertMultipleOrama(searchIndex, pendingSearchDocs);
      pendingSearchDocs = [];
    }
  }

  for await (const line of rl) {
    rawLinesScanned++;

    const parsed = ArcaConditionTaxBulkConnector.parseRow(line);
    if (!parsed) {
      decisions.REJECT++;
      continue;
    }

    if (parsed.entity_type !== 'NATURAL_PERSON') {
      decisions.REJECT++;
      continue;
    }

    if (!parsed.raw_name || parsed.raw_name.length < 2) {
      decisions.INSUFFICIENT++;
      continue;
    }

    naturalPersonsEncountered++;

    // Safe key derivation
    const cleanDni = parsed.dni;
    const identifierValue = crypto.createHmac('sha256', hmacSecret).update(`ARG:DNI:${cleanDni}`).digest('hex');
    const safeKey = `atlas_arg_per_${identifierValue.slice(0, 16)}`;

    // In-run duplicate check
    if (inRunSeen.has(safeKey)) {
      decisions.RUN_DUPLICATE++;
      continue;
    }
    inRunSeen.add(safeKey);

    const cuitMasked = `${parsed.cuit.slice(0, 2)}***${parsed.cuit.slice(-2)}`;
    const nowNs = Number(process.hrtime.bigint() - monotonicStart);

    let isNetNew = false;
    if (t0Set.has(safeKey)) {
      decisions.MERGE_EXISTING++;
      pendingLedgerRows.push([safeKey, cuitMasked, 'MERGE_EXISTING', 0, nowNs]);
    } else {
      decisions.NEW_CANONICAL_SHADOW++;
      isNetNew = true;

      const normalizedName = parsed.raw_name
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      pendingLedgerRows.push([safeKey, cuitMasked, 'NEW_CANONICAL_SHADOW', 1, nowNs]);
      pendingSearchDocs.push({
        shadow_person_id: safeKey,
        display_name: normalizedName,
        cuit_masked: cuitMasked,
        source_surface_id: 'SURF_ARCA_RG1817'
      });
    }

    if (pendingLedgerRows.length >= BATCH_SIZE) {
      await flushBatch();
    }

    if (decisions.NEW_CANONICAL_SHADOW % 20000 === 0 && isNetNew) {
      const currentElapsed = Number(process.hrtime.bigint() - monotonicStart) / 1e9;
      const currentRate = (decisions.NEW_CANONICAL_SHADOW / currentElapsed).toFixed(0);
      console.log(`[Progress] Net-New: ${decisions.NEW_CANONICAL_SHADOW.toLocaleString()} / ${targetNetNew.toLocaleString()} in ${currentElapsed.toFixed(2)}s (${currentRate} net-new/s)...`);
    }

    if (decisions.NEW_CANONICAL_SHADOW >= targetNetNew) {
      await flushBatch();
      break;
    }

    // Check timeout
    const currentElapsedSec = Number(process.hrtime.bigint() - monotonicStart) / 1e9;
    if (currentElapsedSec >= timeBudgetSeconds) {
      console.log(`TIME_BUDGET_EXCEEDED: Reached ${currentElapsedSec.toFixed(2)}s`);
      await flushBatch();
      break;
    }
  }

  await flushBatch();

  const monotonicEnd = process.hrtime.bigint();
  const totalDurationSeconds = Number(monotonicEnd - monotonicStart) / 1e9;

  // Physical verification of storage
  console.log('\nConducting physical verification of SQLite ledger and Orama search index...');
  const ledgerStats = ledgerDb.prepare(`
    SELECT 
      COUNT(*) AS total_rows,
      COUNT(DISTINCT safe_shadow_person_key) AS distinct_keys,
      SUM(CASE WHEN decision = 'NEW_CANONICAL_SHADOW' THEN 1 ELSE 0 END) AS net_new_ledger_count,
      SUM(CASE WHEN decision = 'MERGE_EXISTING' THEN 1 ELSE 0 END) AS merge_existing_count
    FROM gate31c_mini_run_shadow_ledger
  `).get();

  const searchDocCount = await countOrama(searchIndex);

  // Spot test Orama search capability
  const searchProbe = await searchOrama(searchIndex, {
    term: 'GARCIA',
    limit: 5
  });

  // Check post-run invariant on PostgreSQL SSOT
  const pgPostCheck = new Client(parseDbUrl());
  await pgPostCheck.connect();
  const postCheckRes = await pgPostCheck.query('SELECT COUNT(DISTINCT atlas_person_id) AS cnt FROM public.atlas_person_identity_map WHERE atlas_person_id IS NOT NULL');
  const ssotPostCount = parseInt(postCheckRes.rows[0].cnt, 10);
  await pgPostCheck.end();

  const ssotUnchanged = ssotT0Count === ssotPostCount;
  const netNewAchieved = decisions.NEW_CANONICAL_SHADOW;
  const netNewRate = totalDurationSeconds > 0 ? (netNewAchieved / totalDurationSeconds) : 0;
  const passCondition = (
    netNewAchieved >= targetNetNew &&
    totalDurationSeconds <= timeBudgetSeconds &&
    Number(ledgerStats.net_new_ledger_count) >= targetNetNew &&
    searchDocCount >= targetNetNew &&
    ssotUnchanged
  );

  // Clean up scratch db
  ledgerDb.close();
  if (fs.existsSync(sqliteDbPath)) {
    try { fs.unlinkSync(sqliteDbPath); } catch (e) {}
  }

  const resultStatus = passCondition ? 'SOURCE_ACCESS_RECOVERED_100K_PASS' : 'SOURCE_ACCESS_RECOVERED_100K_FAIL';

  const miniRunReport = {
    gate_id: 'GATE_31C',
    mission: 'PHYSICAL_100K_MINI_RUN_CERTIFICATION',
    result_state: resultStatus,
    target_net_new: targetNetNew,
    actual_net_new: netNewAchieved,
    time_budget_seconds: timeBudgetSeconds,
    actual_duration_seconds: parseFloat(totalDurationSeconds.toFixed(3)),
    required_rate_net_new_sec: 555.56,
    actual_rate_net_new_sec: parseFloat(netNewRate.toFixed(2)),
    rate_margin_ratio: parseFloat((netNewRate / 555.56).toFixed(2)),
    evaluations: {
      raw_lines_scanned: rawLinesScanned,
      natural_persons_encountered: naturalPersonsEncountered,
      new_canonical_shadow: decisions.NEW_CANONICAL_SHADOW,
      merge_existing_canonical: decisions.MERGE_EXISTING,
      run_duplicates: decisions.RUN_DUPLICATE,
      rejects: decisions.REJECT,
      insufficient: decisions.INSUFFICIENT,
      net_new_ratio: parseFloat((decisions.NEW_CANONICAL_SHADOW / (decisions.NEW_CANONICAL_SHADOW + decisions.MERGE_EXISTING)).toFixed(4))
    },
    physical_storage_verification: {
      sqlite_ledger_total_rows: Number(ledgerStats.total_rows),
      sqlite_ledger_distinct_keys: Number(ledgerStats.distinct_keys),
      sqlite_ledger_net_new_rows: Number(ledgerStats.net_new_ledger_count),
      orama_search_documents: searchDocCount,
      search_spot_probe_hits: searchProbe.count,
      sqlite_integrity_pass: Number(ledgerStats.total_rows) === Number(ledgerStats.distinct_keys),
      search_integrity_pass: searchDocCount === Number(ledgerStats.net_new_ledger_count)
    },
    ssot_invariants: {
      t0_canonical_count: ssotT0Count,
      post_run_canonical_count: ssotPostCount,
      ssot_mutation: !ssotUnchanged,
      ssot_preserved: ssotUnchanged
    }
  };

  console.log('\n================================================================================');
  console.log(`MINI-RUN RESULT:        ${miniRunReport.result_state}`);
  console.log(`Net-New Persons:        ${miniRunReport.actual_net_new.toLocaleString()} (Target: ${targetNetNew.toLocaleString()})`);
  console.log(`Duration:               ${miniRunReport.actual_duration_seconds} s (Budget: ${timeBudgetSeconds}s)`);
  console.log(`Physical Rate:          ${miniRunReport.actual_rate_net_new_sec} net-new/sec (Required: 555.56/s)`);
  console.log(`Rate Margin:            ${miniRunReport.rate_margin_ratio}x`);
  console.log(`SQLite Ledger Net-New:  ${miniRunReport.physical_storage_verification.sqlite_ledger_net_new_rows.toLocaleString()}`);
  console.log(`Orama Search Docs:      ${miniRunReport.physical_storage_verification.orama_search_documents.toLocaleString()}`);
  console.log(`SSOT Preserved:         ${miniRunReport.ssot_invariants.ssot_preserved}`);
  console.log('================================================================================\n');

  return miniRunReport;
}

if (process.argv[1] && process.argv[1].endsWith('run_atlas_gate31c_physical_100k_mini_run.mjs')) {
  run100kMiniRun().then(report => {
    fs.writeFileSync('reports/atlas/discovery/atlas_gate31c_physical_100k_mini_run_v1.json', JSON.stringify(report, null, 2));
    console.log('Mini-run report saved to reports/atlas/discovery/atlas_gate31c_physical_100k_mini_run_v1.json');
  }).catch(err => {
    console.error('MINI-RUN CRITICAL ERROR:', err);
    process.exit(1);
  });
}
