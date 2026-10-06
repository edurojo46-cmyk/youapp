/**
 * src/lib/atlas/discovery/snapshots/AtlasSourceSnapshotDiffer.mjs
 * 
 * ATLAS GATE #32: Source Snapshot Differ & Change Detection
 * 
 * Compares a baseline snapshot against a target snapshot by source key:
 * - ADDED_KEYS (INSERT_CANDIDATE)
 * - CHANGED_ROWS (UPDATE_EVIDENCE)
 * - UNCHANGED_ROWS (UNCHANGED - skip expensive downstream work)
 * - REMOVED_KEYS (REMOVED_FROM_SOURCE - evidence only, never deletes canonical)
 */

export class AtlasSourceSnapshotDiffer {
  /**
   * Computes differences between two maps of { [key]: rowHash }
   * 
   * @param {Map<string, string>} previousSnapshotMap Map of sourceKey -> rowFingerprint
   * @param {Map<string, string>} currentSnapshotMap  Map of sourceKey -> rowFingerprint
   * @returns {Object} Change detection classification
   */
  static diffSnapshots(previousSnapshotMap, currentSnapshotMap) {
    const insertCandidates = [];
    const updateEvidence = [];
    let unchangedCount = 0;
    const removedFromSource = [];

    // Check all current keys
    for (const [key, currentHash] of currentSnapshotMap.entries()) {
      const prevHash = previousSnapshotMap.get(key);
      if (!prevHash) {
        insertCandidates.push({
          source_key: key,
          action: 'INSERT_CANDIDATE',
          current_hash: currentHash
        });
      } else if (prevHash !== currentHash) {
        updateEvidence.push({
          source_key: key,
          action: 'UPDATE_EVIDENCE',
          previous_hash: prevHash,
          current_hash: currentHash
        });
      } else {
        unchangedCount++;
      }
    }

    // Check for removed keys
    for (const [key, prevHash] of previousSnapshotMap.entries()) {
      if (!currentSnapshotMap.has(key)) {
        removedFromSource.push({
          source_key: key,
          action: 'REMOVED_FROM_SOURCE',
          previous_hash: prevHash
        });
      }
    }

    return {
      summary: {
        total_previous_keys: previousSnapshotMap.size,
        total_current_keys: currentSnapshotMap.size,
        added_keys_count: insertCandidates.length,
        changed_rows_count: updateEvidence.length,
        unchanged_rows_count: unchangedCount,
        removed_keys_count: removedFromSource.length
      },
      insert_candidates: insertCandidates,
      update_evidence: updateEvidence,
      removed_from_source: removedFromSource
    };
  }
}
