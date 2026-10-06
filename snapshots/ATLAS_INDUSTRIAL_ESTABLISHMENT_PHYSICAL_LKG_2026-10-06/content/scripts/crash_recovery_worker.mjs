/**
 * scripts/crash_recovery_worker.mjs
 * 
 * Helper worker for Gate #32A Real Process Crash Recovery Test.
 * Simulates a continuous production worker processing items with checkpoints.
 * When it reaches item 50, it writes the checkpoint and emits 'CHECKPOINT_READY'.
 * It then enters a tight loop or sleeps waiting to be killed externally by SIGKILL.
 * When resumed with --resume flag, it loads the checkpoint and completes remaining items.
 */

import fs from 'node:fs';
import path from 'node:path';

const isResume = process.argv.includes('--resume');
const checkpointFile = path.resolve('reports/atlas/discovery/checkpoints/gate32a_crash_test_checkpoint.json');
const logFile = path.resolve('reports/atlas/discovery/checkpoints/gate32a_crash_test_processed.json');

fs.mkdirSync(path.dirname(checkpointFile), { recursive: true });

function loadCheckpoint() {
  if (fs.existsSync(checkpointFile)) {
    return JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));
  }
  return null;
}

function saveCheckpoint(state) {
  fs.writeFileSync(checkpointFile, JSON.stringify(state, null, 2), 'utf8');
}

let processed = [];
let startIdx = 0;
const totalItems = 100;

if (isResume) {
  const cp = loadCheckpoint();
  if (!cp) {
    console.error('NO_CHECKPOINT_FOUND_ON_RESUME');
    process.exit(1);
  }
  startIdx = cp.last_processed_index + 1;
  if (fs.existsSync(logFile)) {
    processed = JSON.parse(fs.readFileSync(logFile, 'utf8'));
  }
  console.log(`RESUMING_FROM_CHECKPOINT_INDEX_${startIdx}`);
}

for (let i = startIdx; i < totalItems; i++) {
  const item = {
    id: `item_${i}`,
    processed_at: new Date().toISOString()
  };
  processed.push(item);
  fs.writeFileSync(logFile, JSON.stringify(processed), 'utf8');

  // At record 50, if not in resume mode, save checkpoint and signal ready for kill
  if (!isResume && i === 49) {
    saveCheckpoint({
      last_processed_index: 49,
      processed_count: 50,
      checkpoint_timestamp: new Date().toISOString()
    });
    console.log('CHECKPOINT_READY_AT_50');
    // Keep running until killed externally
    setInterval(() => {}, 1000);
    break;
  }
}

if (isResume) {
  console.log(`WORKER_COMPLETED_TOTAL_${processed.length}`);
  process.exit(0);
}
