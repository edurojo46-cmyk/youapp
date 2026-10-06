import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

// Forbidden keywords in script path/name for mutating production
const FORBIDDEN_MUTATION_KEYWORDS = ['test', 'mock', 'debug', 'synthetic', 'benchmark', 'scratch'];

// Expected certified baseline before Stage 3E mutations
export const CERTIFIED_PRE_3E_BASELINE = {
  canonical_distinct: 1500220,
  identity_map_rows: 2392776,
  search_outbox_total: 702061,
  meilisearch_delta_docs: 226974
};

/**
 * Layer A & B Guard Check
 */
export function checkMutationAllowed(callingScriptPath) {
  const scriptName = path.basename(callingScriptPath || process.argv[1] || '').toLowerCase();
  
  // Layer B: Hard-forbidden check
  for (const kw of FORBIDDEN_MUTATION_KEYWORDS) {
    if (scriptName.includes(kw)) {
      return {
        allowed: false,
        reason: `FORBIDDEN_SCRIPT_CLASSIFICATION: Script name "${scriptName}" contains forbidden keyword "${kw}". Scripts classified as test/mock/debug/synthetic/benchmark/scratch are strictly prohibited from mutating production SSOT.`
      };
    }
  }

  // Layer A: Environment variable check
  const mutationAllowed = process.env.PRODUCTION_MUTATION_ALLOWED === 'TRUE';
  const executionMode = process.env.ATLAS_EXECUTION_MODE;

  if (!mutationAllowed) {
    return {
      allowed: false,
      reason: `PRODUCTION_MUTATION_DISALLOWED: PRODUCTION_MUTATION_ALLOWED must be explicitly set to 'TRUE'. Currently: '${process.env.PRODUCTION_MUTATION_ALLOWED}'.`
    };
  }

  if (executionMode !== 'PRODUCTION_CERTIFIED_WRITE') {
    return {
      allowed: false,
      reason: `INVALID_EXECUTION_MODE: ATLAS_EXECUTION_MODE must be 'PRODUCTION_CERTIFIED_WRITE'. Currently: '${executionMode}'.`
    };
  }

  return { allowed: true };
}

/**
 * Assert mutation allowed or throw fail-closed error
 */
export function assertMutationAllowed(callingScriptPath) {
  const check = checkMutationAllowed(callingScriptPath);
  if (!check.allowed) {
    console.error(`\n🚨 [PRODUCTION SAFETY GUARD TRIGGERED]: ${check.reason}\n`);
    throw new Error(`SAFETY_GUARD_BLOCKED: ${check.reason}`);
  }
}

/**
 * Layer D: Pre-write fingerprint verification against PostgreSQL and Meilisearch
 */
export async function verifyPreWriteFingerprint(client, options = {}) {
  const { runId, expectedBaseline = CERTIFIED_PRE_3E_BASELINE, meiliUrl = 'http://127.0.0.1:7700', meiliIndex = 'atlas_people_discovery_gate32_delta' } = options;

  console.log('🔒 [Layer D] Running Pre-Write Fingerprint Verification...');

  // 1. Verify DB identity and schema
  const dbInfo = await client.query('SELECT current_database(), current_user, current_schema()');
  const dbName = dbInfo.rows[0].current_database;
  const dbUser = dbInfo.rows[0].current_user;
  console.log(`  Database: ${dbName}, User: ${dbUser}, Schema: ${dbInfo.rows[0].current_schema}`);

  // 2. Verify baseline counts
  const mapCounts = await client.query(`
    SELECT count(DISTINCT atlas_person_id) as canonical_distinct, count(*) as identity_map_rows 
    FROM public.atlas_person_identity_map
  `);
  const outboxCounts = await client.query(`
    SELECT count(*) as search_outbox_total,
           count(*) FILTER (WHERE status = 'PENDING') as pending,
           count(*) FILTER (WHERE status = 'PROCESSING') as processing
    FROM public.atlas_search_outbox
  `);

  const currentCounts = {
    canonical_distinct: parseInt(mapCounts.rows[0].canonical_distinct, 10),
    identity_map_rows: parseInt(mapCounts.rows[0].identity_map_rows, 10),
    search_outbox_total: parseInt(outboxCounts.rows[0].search_outbox_total, 10),
    pending: parseInt(outboxCounts.rows[0].pending, 10),
    processing: parseInt(outboxCounts.rows[0].processing, 10)
  };

  console.log('  Current DB Counts:', currentCounts);

  // Check against expected baseline if enforced
  if (expectedBaseline) {
    if (currentCounts.canonical_distinct < expectedBaseline.canonical_distinct ||
        currentCounts.identity_map_rows < expectedBaseline.identity_map_rows ||
        currentCounts.search_outbox_total < expectedBaseline.search_outbox_total) {
      throw new Error(`FINGERPRINT_BASELINE_MISMATCH: Current counts are less than certified baseline! Current: ${JSON.stringify(currentCounts)}, Expected: ${JSON.stringify(expectedBaseline)}`);
    }
  }

  // 3. Verify zero lingering pending/processing
  if (currentCounts.pending > 0 || currentCounts.processing > 0) {
    throw new Error(`FINGERPRINT_UNCLEAN_QUEUE: Outbox has ${currentCounts.pending} PENDING and ${currentCounts.processing} PROCESSING events. Must be clean before run.`);
  }

  // 4. Verify Meilisearch availability
  try {
    const meiliStatsRes = await fetch(`${meiliUrl}/indexes/${meiliIndex}/stats`);
    if (!meiliStatsRes.ok) {
      throw new Error(`Meilisearch returned HTTP ${meiliStatsRes.status}`);
    }
    const meiliStats = await meiliStatsRes.json();
    console.log(`  Meilisearch Delta docs: ${meiliStats.numberOfDocuments}, isIndexing: ${meiliStats.isIndexing}`);
    if (meiliStats.isIndexing) {
      throw new Error('FINGERPRINT_MEILI_BUSY: Meilisearch index is currently busy indexing.');
    }
  } catch (err) {
    throw new Error(`FINGERPRINT_MEILI_UNAVAILABLE: ${err.message}`);
  }

  console.log('✔ [Layer D] Pre-Write Fingerprint Verified Successfully.\n');
  return { verified: true, currentCounts, runId };
}

/**
 * Transactional Rollback Wrapper for Benchmarks / Shadow Runs
 */
export async function executeInRollback(client, workerFn) {
  await client.query('BEGIN');
  try {
    const result = await workerFn(client);
    await client.query('ROLLBACK');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}
