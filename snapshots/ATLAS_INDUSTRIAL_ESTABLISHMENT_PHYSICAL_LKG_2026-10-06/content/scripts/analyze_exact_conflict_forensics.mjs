import fs from 'fs';
import path from 'path';
import { buildRowIdentityKeys } from './ExactIdentityConflictScheduler.mjs';

/**
 * ATLAS — V1.6C EXACT CONFLICT FORENSICS & FALSE-POSITIVE AUDIT
 */

const REPORTS_DIR = path.resolve('reports/atlas/realtime');
const FORENSICS_REPORT_FILE = path.join(REPORTS_DIR, 'v16c_exact_conflict_forensics.json');

export function runConflictForensics(prospectiveBatchPairs = []) {
  console.log('========================================================================');
  console.log('🔍 ATLAS V1.6C — EXACT CONFLICT FORENSICS & AUDIT');
  console.log('========================================================================\n');

  // Check historical telemetry
  const targetEventsFile = path.join(REPORTS_DIR, 'target_commit_events.json');
  let historicalHasRowKeys = false;
  if (fs.existsSync(targetEventsFile)) {
    try {
      const events = JSON.parse(fs.readFileSync(targetEventsFile, 'utf8'));
      if (events.length > 0 && (events[0].cleanMapRows || events[0].identity_rows)) {
        historicalHasRowKeys = true;
      }
    } catch(e) {}
  }

  const historicalStatus = historicalHasRowKeys
    ? 'AVAILABLE'
    : 'INSUFFICIENT_ROW_LEVEL_EVIDENCE';

  console.log(`HISTORICAL_EXACT_CONFLICT_ANALYSIS = ${historicalStatus}`);

  // Prospective evaluation
  let rangeConflictsDetected = 0;
  let trueExactConflicts = 0;
  let falsePositiveConflicts = 0;
  let sourceKeyOverlaps = 0;
  let globalIdentifierOverlaps = 0;
  let personIdOverlaps = 0;
  let totalEvaluatedPairs = prospectiveBatchPairs.length;

  const pairDetails = [];

  for (const pair of prospectiveBatchPairs) {
    const { batchA, batchB, rangeOverlap } = pair;
    if (rangeOverlap) rangeConflictsDetected++;

    const keysA = batchA.cleanMapRows.map(r => buildRowIdentityKeys(r));
    const keysB = batchB.cleanMapRows.map(r => buildRowIdentityKeys(r));

    const hashesA = new Set();
    const sourceKeysA = new Set();
    const globalIdsA = new Set();
    const personIdsA = new Set();
    for (const k of keysA) {
      for (const h of k.hashes) hashesA.add(h);
      for (const rk of k.rawKeys) {
        if (rk.startsWith('SRC:')) sourceKeysA.add(rk);
        if (rk.startsWith('ID:')) globalIdsA.add(rk);
        if (rk.startsWith('PERSON:')) personIdsA.add(rk);
      }
    }

    let exactHashOverlap = 0;
    let srcOverlap = 0;
    let globalOverlap = 0;
    let personOverlap = 0;

    for (const k of keysB) {
      for (const h of k.hashes) {
        if (hashesA.has(h)) exactHashOverlap++;
      }
      for (const rk of k.rawKeys) {
        if (rk.startsWith('SRC:') && sourceKeysA.has(rk)) srcOverlap++;
        if (rk.startsWith('ID:') && globalIdsA.has(rk)) globalOverlap++;
        if (rk.startsWith('PERSON:') && personIdsA.has(rk)) personOverlap++;
      }
    }

    const hasExactConflict = exactHashOverlap > 0;
    if (hasExactConflict) trueExactConflicts++;
    if (rangeOverlap && !hasExactConflict) falsePositiveConflicts++;

    if (srcOverlap > 0) sourceKeyOverlaps++;
    if (globalOverlap > 0) globalIdentifierOverlaps++;
    if (personOverlap > 0) personIdOverlaps++;

    pairDetails.push({
      batch_a: batchA.batchIndex,
      batch_b: batchB.batchIndex,
      a_keys_count: hashesA.size,
      b_keys_count: keysB.reduce((acc, k) => acc + k.hashes.size, 0),
      exact_source_key_overlap: srcOverlap,
      exact_identifier_overlap: globalOverlap,
      exact_person_id_overlap: personOverlap,
      has_exact_conflict: hasExactConflict,
      range_blocked: rangeOverlap
    });
  }

  const falsePositiveRate = rangeConflictsDetected > 0
    ? Number(((falsePositiveConflicts / rangeConflictsDetected) * 100).toFixed(2))
    : 0.00;

  const report = {
    generated_at: new Date().toISOString(),
    historical_exact_conflict_analysis: historicalStatus,
    range_conflicts_detected: rangeConflictsDetected,
    true_exact_conflicts: trueExactConflicts,
    false_positive_conflicts: falsePositiveConflicts,
    range_scheduler_false_positive_rate: `${falsePositiveRate}%`,
    source_key_overlap_rate: totalEvaluatedPairs > 0 ? Number(((sourceKeyOverlaps / totalEvaluatedPairs) * 100).toFixed(2)) : 0.00,
    global_identifier_overlap_rate: totalEvaluatedPairs > 0 ? Number(((globalIdentifierOverlaps / totalEvaluatedPairs) * 100).toFixed(2)) : 0.00,
    person_id_overlap_rate: totalEvaluatedPairs > 0 ? Number(((personIdOverlaps / totalEvaluatedPairs) * 100).toFixed(2)) : 0.00,
    are_transactions_blocking_on_same_identity: trueExactConflicts > 0 ? 'YES' : 'NO',
    evaluated_pairs_count: totalEvaluatedPairs,
    sample_pairs: pairDetails.slice(0, 10)
  };

  fs.writeFileSync(FORENSICS_REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');
  console.log('[Forensics Report Saved]:', FORENSICS_REPORT_FILE);

  return report;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  runConflictForensics();
}
