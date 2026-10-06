/**
 * scripts/reconcile_full_cardinality.mjs
 * Exhaustive parse of task-1348.log to reconcile every V2 attempt, timeout, and fallback
 */

import fs from 'fs';

const logPath = 'C:\\Users\\Eduardo\\.gemini\\antigravity-ide\\brain\\549aedbe-6898-4a4a-8c04-b63a8949ad4e\\.system_generated\\tasks\\task-1348.log';
const content = fs.readFileSync(logPath, 'utf8');
const lines = content.split('\n');

let totalV2Attempts = 0;
let v2SuccessCount = 0;
let v2TimeoutCount = 0;
let v2OtherErrorCount = 0;
let v4FallbackAttempts = 0;
let v4FallbackSuccessCount = 0;
let v4FallbackErrorCount = 0;
let unrecoveredFailures = 0;

for (const line of lines) {
  if (line.includes('Engine: V2_PRIMARY')) {
    totalV2Attempts++;
    v2SuccessCount++;
  } else if (line.includes('[V2 Primary Anomaly]:')) {
    totalV2Attempts++;
    v4FallbackAttempts++;
    if (line.includes('statement timeout')) {
      v2TimeoutCount++;
    } else {
      v2OtherErrorCount++;
    }
  }

  if (line.includes('Engine: V4_FALLBACK |')) {
    v4FallbackSuccessCount++;
  } else if (line.includes('Engine: V4_FALLBACK_ERROR')) {
    v4FallbackErrorCount++;
    // Check if this batch was retried or lost
  }
}

// In the code, when V4 failed:
// return { engine: 'V4_FALLBACK_ERROR', newCanonicals: 0 }
// The workers continued with the next batch.
unrecoveredFailures = v4FallbackErrorCount;

console.log({
  TOTAL_V2_ATTEMPTS: totalV2Attempts,
  V2_SUCCESS_COUNT: v2SuccessCount,
  V2_TIMEOUT_COUNT: v2TimeoutCount,
  V2_OTHER_ERROR_COUNT: v2OtherErrorCount,
  V4_FALLBACK_ATTEMPTS: v4FallbackAttempts,
  V4_FALLBACK_SUCCESS_COUNT: v4FallbackSuccessCount,
  V4_FALLBACK_ERROR_COUNT: v4FallbackErrorCount,
  UNRECOVERED_FAILURES: unrecoveredFailures
});
