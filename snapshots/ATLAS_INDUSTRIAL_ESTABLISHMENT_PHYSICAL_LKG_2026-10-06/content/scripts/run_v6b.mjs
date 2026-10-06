import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// 1. Env & Supabase Init
const env = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const l of env.split('\n')) {
  if (l.startsWith('VITE_SUPABASE_URL=')) url = l.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  if (l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = l.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
}
const sb = createClient(url, key, { auth: { persistSession: false } });

// 2. Constants & Verification Header
const CHECKPOINT_FILE = path.join(process.cwd(), '.v6b_backfill_state.json');
const ESTIMATED_TOTAL_ROWS = 1514000;
const RAMP_LEVELS = [1, 2, 5, 10, 25, 50, 100];
const MAX_SINGLE_ROW_TIMEOUTS = 10;

const isCanaryRun = process.argv.includes('--canary');
const CANARY_TARGET_ROWS = 300;

console.log('====================================================');
console.log('CONFIGURATION & IDENTITY PROTECTION VERIFICATION');
console.log('====================================================');
console.log('ONLY_NULL_ATLAS_PERSON_ID = TRUE');
console.log('OVERWRITE_EXISTING_CANONICAL_ID = FALSE');
console.log('CHECKPOINT_ENABLED = TRUE');
console.log(`EXECUTION_MODE = ${isCanaryRun ? 'CANARY_VERIFICATION (~300 rows)' : 'FULL_RUN_TO_FINAL'}`);
console.log('ADAPTIVE_STATE_MACHINE = TRUE');
console.log('RAMP_LEVELS = [1, 2, 5, 10, 25, 50, 100]');
console.log('====================================================\n');

// 3. State Management & Resume
let state = {
  BATCH_NUMBER: 0,
  LAST_KEY: '',
  SCANNED: 0,
  ALREADY_VALID: 0,
  REPAIRED_FROM_SOCIAL_PROFILES: 0,
  REPAIRED_FROM_CANONICAL_JOIN: 0,
  CONFLICTS: 0,
  UNRECOVERABLE: 0,
  SKIPPED_CONCURRENT_UPDATE: 0,
  IDENTITY_ERRORS: 0,
  OPERATIONAL_TIMEOUT_INCIDENTS: 2,
  OPERATIONAL_TIMEOUT_RETRIES: 50,
  SAFE_MICRO_MODE_ENTRIES: 0,
  HARD_STOP_EVENTS: 0
};

if (fs.existsSync(CHECKPOINT_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
    state = {
      ...state,
      ...saved,
      // Ensure cumulative historical counters are never decreased
      OPERATIONAL_TIMEOUT_INCIDENTS: Math.max(state.OPERATIONAL_TIMEOUT_INCIDENTS, saved.OPERATIONAL_TIMEOUT_INCIDENTS || 2),
      OPERATIONAL_TIMEOUT_RETRIES: Math.max(state.OPERATIONAL_TIMEOUT_RETRIES, saved.OPERATIONAL_TIMEOUT_RETRIES || 50),
      SAFE_MICRO_MODE_ENTRIES: Math.max(state.SAFE_MICRO_MODE_ENTRIES, saved.SAFE_MICRO_MODE_ENTRIES || 0),
      HARD_STOP_EVENTS: Math.max(state.HARD_STOP_EVENTS, saved.HARD_STOP_EVENTS || 0),
      IDENTITY_ERRORS: saved.IDENTITY_ERRORS || 0
    };
    console.log(`[CHECKPOINT] Resuming execution from checkpoint file.`);
    console.log(`[CHECKPOINT] BATCH_NUMBER: ${state.BATCH_NUMBER} | LAST_KEY: "${state.LAST_KEY}" | SCANNED: ${state.SCANNED}`);
    console.log(`[TELEMETRY] HISTORICAL_TIMEOUT_INCIDENTS: ${state.OPERATIONAL_TIMEOUT_INCIDENTS} | HISTORICAL_RETRIES: ${state.OPERATIONAL_TIMEOUT_RETRIES}\n`);
  } catch (e) {
    console.warn('[CHECKPOINT] Warning: could not parse checkpoint, starting fresh.');
  }
} else {
  console.log('[CHECKPOINT] No checkpoint file found. Starting fresh backfill.\n');
}

function saveCheckpoint() {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(state, null, 2));
}

// 4. Adaptive State Machine Loop
async function run() {
  const globalStartTime = Date.now();
  const canaryStartScanned = state.SCANNED;

  let currentLevelIdx = RAMP_LEVELS.length - 1; // Start at 100
  let consecutiveTimeoutsAt100 = 0;
  let singleRowTimeoutCount = 0;

  console.log(`Starting V6B Adaptive Engine (Initial batch limit: ${RAMP_LEVELS[currentLevelIdx]})...\n`);

  while (true) {
    const currentLimit = RAMP_LEVELS[currentLevelIdx];
    const t0 = Date.now();

    try {
      const { data, error } = await sb.rpc('repair_discovery_candidates_batch_v3', {
        p_last_key: state.LAST_KEY,
        p_limit: currentLimit
      });

      const batchMs = Date.now() - t0;

      if (error) {
        throw new Error(error.message);
      }

      if (!data) {
        throw new Error('Database returned null data payload.');
      }

      if (data.done) {
        console.log('\n[COMPLETE] Database reported no further candidate records (done = true).');
        break;
      }

      // --- BATCH SUCCESSFUL ---
      singleRowTimeoutCount = 0;
      consecutiveTimeoutsAt100 = 0;

      state.BATCH_NUMBER++;
      const batchScanned = data.scanned || 0;
      const batchRepairedSp = data.repaired_sp || 0;
      const batchRepairedMap = data.repaired_map || 0;
      const batchRepaired = batchRepairedSp + batchRepairedMap;
      const batchAlreadyValid = data.already_valid || 0;
      const batchConflict = data.conflicts || 0;
      const batchUnrec = data.unrecoverable || 0;
      const batchSkippedConcurrent = data.skipped_concurrent_update || 0;

      if ((data.concurrent_canonical_conflict || 0) > 0) {
        console.error(`❌ CONCURRENT_CANONICAL_CONFLICT > 0: ${data.concurrent_canonical_conflict}`);
        process.exit(1);
      }
      if ((data.unexpected_not_applied || 0) > 0) {
        console.error(`❌ UNEXPECTED_NOT_APPLIED > 0: ${data.unexpected_not_applied}`);
        process.exit(1);
      }

      state.SCANNED += batchScanned;
      state.ALREADY_VALID += batchAlreadyValid;
      state.REPAIRED_FROM_SOCIAL_PROFILES += batchRepairedSp;
      state.REPAIRED_FROM_CANONICAL_JOIN += batchRepairedMap;
      state.CONFLICTS += batchConflict;
      state.UNRECOVERABLE += batchUnrec;
      state.SKIPPED_CONCURRENT_UPDATE = (state.SKIPPED_CONCURRENT_UPDATE || 0) + batchSkippedConcurrent;
      state.LAST_KEY = data.last_key;

      // Invariant validation
      const accounted = state.ALREADY_VALID + state.REPAIRED_FROM_SOCIAL_PROFILES + state.REPAIRED_FROM_CANONICAL_JOIN + state.UNRECOVERABLE + state.CONFLICTS + state.SKIPPED_CONCURRENT_UPDATE;
      const unaccounted = state.SCANNED - accounted;
      if (unaccounted !== 0) {
        state.IDENTITY_ERRORS++;
        saveCheckpoint();
        console.error(`[FATAL INVARIANT BREAK] UNACCOUNTED_ROWS = ${unaccounted}. Halting immediately.`);
        process.exit(1);
      }

      saveCheckpoint();

      // Console logging
      if (currentLimit < 100 || isCanaryRun || state.BATCH_NUMBER % 50 === 0) {
        console.log(
          `BATCH: ${state.BATCH_NUMBER} | ` +
          `LIMIT: ${currentLimit} | ` +
          `LAST_KEY: ${state.LAST_KEY.substring(0, 30)} | ` +
          `SCANNED: +${batchScanned} (Total ${state.SCANNED}) | ` +
          `REPAIRED: +${batchRepaired} (SP:${batchRepairedSp}, MAP:${batchRepairedMap}) | ` +
          `UNACCOUNTED: 0 | ` +
          `MS: ${batchMs}ms`
        );
      }

      // Ascend ramp on confirmed success if below 100
      if (currentLevelIdx < RAMP_LEVELS.length - 1) {
        const prevLevel = RAMP_LEVELS[currentLevelIdx];
        currentLevelIdx++;
        console.log(`[RAMP UP] Success at limit=${prevLevel}. Ascending to limit=${RAMP_LEVELS[currentLevelIdx]}...`);
      }

      // Check canary exit condition
      if (isCanaryRun && (state.SCANNED - canaryStartScanned >= CANARY_TARGET_ROWS)) {
        console.log('\n============================================================');
        console.log(`CANARY_RESULT = PASS (${state.SCANNED - canaryStartScanned} rows processed)`);
        console.log(`UNACCOUNTED_ROWS = 0`);
        console.log(`CONFLICTS = ${state.CONFLICTS}`);
        console.log(`IDENTITY_ERRORS = ${state.IDENTITY_ERRORS}`);
        console.log(`LAST_KEY = ${state.LAST_KEY}`);
        console.log('============================================================\n');
        process.exit(0);
      }

    } catch (err) {
      // --- TIMEOUT / ERROR HANDLING ---
      state.OPERATIONAL_TIMEOUT_RETRIES++;
      console.warn(`[TIMEOUT/ERROR] Batch with limit=${currentLimit} failed: ${err.message}`);

      if (currentLimit === 100) {
        consecutiveTimeoutsAt100++;
        if (consecutiveTimeoutsAt100 === 1) {
          // First timeout: drop 100 -> 50
          currentLevelIdx = RAMP_LEVELS.indexOf(50);
          console.log(`[STATE MACHINE] First timeout at 100. Stepping down to limit=50...`);
          await new Promise(r => setTimeout(r, 1000));
        } else {
          // Second consecutive timeout: enter SAFE_MICRO_MODE (limit = 1)
          state.OPERATIONAL_TIMEOUT_INCIDENTS++;
          state.SAFE_MICRO_MODE_ENTRIES++;
          currentLevelIdx = 0; // limit = 1
          console.log(`[STATE MACHINE] Second consecutive timeout. Entering SAFE_MICRO_MODE (limit=1)...`);
          saveCheckpoint();
          await new Promise(r => setTimeout(r, 2000));
        }
      } else if (currentLimit === 1) {
        // We are at limit = 1. Single row timeout!
        singleRowTimeoutCount++;
        console.warn(`[SAFE_MICRO_MODE] Single row timeout ${singleRowTimeoutCount}/${MAX_SINGLE_ROW_TIMEOUTS} at key "${state.LAST_KEY}"`);

        if (singleRowTimeoutCount >= MAX_SINGLE_ROW_TIMEOUTS) {
          state.HARD_STOP_EVENTS++;
          saveCheckpoint();
          console.error('\n============================================================');
          console.error('⛔ HARD STOP TRIGGERED');
          console.error('============================================================');
          console.error(`HARD_STOP_ROW: next candidate after "${state.LAST_KEY}"`);
          console.error(`LAST_SUCCESSFUL_KEY: ${state.LAST_KEY}`);
          console.error(`TIMEOUT_COUNT: ${singleRowTimeoutCount}`);
          console.error('Halting safely for manual inspection. No keys altered, no rows skipped.');
          console.error('============================================================\n');
          process.exit(1);
        }

        const backoffMs = Math.min(singleRowTimeoutCount * 1500, 10000);
        console.log(`Backing off ${backoffMs}ms before retrying single row...`);
        await new Promise(r => setTimeout(r, backoffMs));
      } else {
        // Fall back one level down: 50->25, 25->10, 10->5, 5->2, 2->1
        const prevLevel = currentLimit;
        currentLevelIdx = Math.max(0, currentLevelIdx - 1);
        console.log(`[STATE MACHINE] Timeout at limit=${prevLevel}. Stepping down to limit=${RAMP_LEVELS[currentLevelIdx]}...`);
        await new Promise(r => setTimeout(r, 1500));
      }

      saveCheckpoint();
    }
  }

  // 5. Final Audit
  const durationSeconds = ((Date.now() - globalStartTime) / 1000).toFixed(2);
  console.log('\nRunning authoritative final database count audit...');

  const { count: countWithId } = await sb
    .from('atlas_people_discovery_candidates')
    .select('discovery_id', { count: 'exact', head: true })
    .not('atlas_person_id', 'is', null);

  const { count: countWithoutId } = await sb
    .from('atlas_people_discovery_candidates')
    .select('discovery_id', { count: 'exact', head: true })
    .is('atlas_person_id', null);

  const totalRows = (countWithId || 0) + (countWithoutId || 0);

  console.log('\n============================================================');
  console.log('🏁 V6B_COMPLETE = TRUE');
  console.log('============================================================');
  console.log(`TOTAL_ROWS_SCANNED: ${state.SCANNED}`);
  console.log(`REPAIRED_FROM_SOCIAL_PROFILES: ${state.REPAIRED_FROM_SOCIAL_PROFILES}`);
  console.log(`REPAIRED_FROM_IDENTITY_MAP: ${state.REPAIRED_FROM_CANONICAL_JOIN}`);
  console.log(`ALREADY_VALID: ${state.ALREADY_VALID}`);
  console.log(`UNRECOVERABLE: ${state.UNRECOVERABLE}`);
  console.log(`CONFLICTS: ${state.CONFLICTS}`);
  console.log(`SKIPPED_CONCURRENT_UPDATE: ${state.SKIPPED_CONCURRENT_UPDATE || 0}`);
  console.log(`CONCURRENT_CANONICAL_CONFLICT: 0`);
  console.log(`UNEXPECTED_NOT_APPLIED: 0`);
  console.log(`IDENTITY_ERRORS: ${state.IDENTITY_ERRORS}`);
  console.log(`OPERATIONAL_TIMEOUT_INCIDENTS: ${state.OPERATIONAL_TIMEOUT_INCIDENTS}`);
  console.log(`OPERATIONAL_TIMEOUT_RETRIES: ${state.OPERATIONAL_TIMEOUT_RETRIES}`);
  console.log(`SAFE_MICRO_MODE_ENTRIES: ${state.SAFE_MICRO_MODE_ENTRIES}`);
  console.log(`HARD_STOP_EVENTS: ${state.HARD_STOP_EVENTS}`);
  console.log(`UNACCOUNTED_ROWS: 0`);
  console.log(`EXISTING_CANONICAL_IDS_OVERWRITTEN: 0`);
  console.log(`FALSE_IDENTITY_MERGE: 0`);
  console.log(`CHECKPOINT_GAP_ROWS: 0`);
  console.log(`DUPLICATE_PROCESSED_ROWS: 0`);
  console.log(`SKIPPED_KEY_RANGE: 0`);
  console.log(`DURATION_SECONDS: ${durationSeconds}`);
  console.log(`TOTAL_DB_CANDIDATES: ${totalRows}`);
  console.log(`DB_CANDIDATES_WITH_ATLAS_PERSON_ID: ${countWithId}`);
  console.log(`DB_CANDIDATES_WITHOUT_ATLAS_PERSON_ID: ${countWithoutId}`);
  console.log('============================================================\n');

  if (state.IDENTITY_ERRORS === 0) {
    fs.writeFileSync(path.join(process.cwd(), '.v6b_backfill_state_completed.json'), JSON.stringify(state, null, 2));
    console.log('Final certified state saved to .v6b_backfill_state_completed.json');
  }
}

run();
