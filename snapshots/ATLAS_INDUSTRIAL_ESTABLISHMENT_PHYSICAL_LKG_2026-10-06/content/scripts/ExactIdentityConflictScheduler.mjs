import crypto from 'crypto';

/**
 * ATLAS — V1.6C EXACT IDENTITY CONFLICT ROUTING & PRE-DEDUPE MODULE
 */

export const HASH_BITS = 256;
export const IDENTITY_CONFLICT_KEY_SCHEME = 'MULTI_KEY_UNION_SHA256';

/**
 * Construct multi-key exact identity signature for a row.
 * Includes every available strong key:
 * - ID:<identifier_type>:<identifier_value>
 * - PERSON:<atlas_person_id>
 * - SRC:<source_id>:<source_person_id>
 */
export function buildRowIdentityKeys(row) {
  const rawKeys = new Set();
  const hashes = new Set();

  if (!row) return { rawKeys, hashes };

  // 1. Strongest canonical / global identifier
  const idType = row.identifier_type || (row.docHmac ? 'NATIONAL_IDENTITY_HMAC' : null);
  const idVal = row.identifier_value || row.docHmac;
  if (idType && idVal && typeof idVal === 'string' && idVal.trim().length >= 8) {
    const k = `ID:${idType.trim().toUpperCase()}:${idVal.trim()}`;
    rawKeys.add(k);
    hashes.add(crypto.createHash('sha256').update(k).digest('hex'));
  }

  // 2. Canonical atlas_person_id
  const personId = row.atlas_person_id || row.atlasPersonId;
  if (personId && typeof personId === 'string' && personId.trim().length > 0 && !personId.startsWith('atlas_arg_per_anon') && !personId.startsWith('per_anon')) {
    const k = `PERSON:${personId.trim()}`;
    rawKeys.add(k);
    hashes.add(crypto.createHash('sha256').update(k).digest('hex'));
  }

  // 3. Source identity tuple
  const sourceId = row.source_id || row.sourceId || row.motor_id;
  const sourcePersonId = row.source_person_id || row.sourceRecordHash || row.source_record_id;
  if (sourceId && sourcePersonId && typeof sourcePersonId === 'string' && sourcePersonId.trim().length > 0) {
    const k = `SRC:${sourceId.trim()}:${sourcePersonId.trim()}`;
    rawKeys.add(k);
    hashes.add(crypto.createHash('sha256').update(k).digest('hex'));
  }

  return { rawKeys, hashes };
}

/**
 * Deterministic Pre-Dedupe & Merge before RPC (Section 4 & 5).
 * Merges rows sharing ANY exact key within the same dispatch window.
 * Preserves strongest evidence, geo confidence, and enrichment fields.
 */
export function preDedupeAndMergeBatch(cleanMapRows, outboxRows, rawItems = []) {
  if (!cleanMapRows || cleanMapRows.length === 0) {
    return {
      cleanMapRows: [],
      outboxRows: [],
      rawItems: [],
      rowsBeforePreDedupe: 0,
      rowsAfterPreDedupe: 0,
      preDedupeRowsMerged: 0,
      preDedupeRowsDropped: 0,
      preDedupeReductionPercent: 0
    };
  }

  const rowsBefore = cleanMapRows.length;
  const keyToGroupIndex = new Map();
  const groups = []; // array of { mapRow, outboxRow, rawItem, keys: Set }

  for (let i = 0; i < cleanMapRows.length; i++) {
    const mMap = cleanMapRows[i];
    const mOut = outboxRows ? outboxRows[i] : null;
    const mRaw = rawItems ? rawItems[i] : null;

    const { rawKeys, hashes } = buildRowIdentityKeys({
      ...mMap,
      docHmac: mMap.identifier_value,
      sourceId: mMap.source_id,
      sourceRecordHash: mMap.source_person_id
    });

    // Check if any key matches an existing group
    let matchedGroupIdx = -1;
    for (const h of hashes) {
      if (keyToGroupIndex.has(h)) {
        matchedGroupIdx = keyToGroupIndex.get(h);
        break;
      }
    }

    if (matchedGroupIdx === -1) {
      // New group
      const newIdx = groups.length;
      groups.push({
        mapRow: { ...mMap },
        outboxRow: mOut ? { ...mOut } : null,
        rawItem: mRaw ? { ...mRaw } : null,
        keys: hashes,
        rawKeys: rawKeys,
        mergeCount: 0
      });
      for (const h of hashes) {
        keyToGroupIndex.set(h, newIdx);
      }
    } else {
      // Deterministic Merge into existing group (Section 4)
      const target = groups[matchedGroupIdx];
      target.mergeCount++;

      // Merge Map Row: preserve strongest evidence
      if (!target.mapRow.identifier_value && mMap.identifier_value) {
        target.mapRow.identifier_type = mMap.identifier_type;
        target.mapRow.identifier_value = mMap.identifier_value;
      }
      target.mapRow.confidence = Math.max(target.mapRow.confidence || 0, mMap.confidence || 0);

      // Merge Outbox Row: preserve strongest geo, display_name, enrichment
      if (target.outboxRow && mOut) {
        const tPayload = target.outboxRow.payload || target.outboxRow;
        const sPayload = mOut.payload || mOut;

        tPayload.geo_confidence = Math.max(tPayload.geo_confidence || 0, sPayload.geo_confidence || 0);
        if (sPayload.evidence_strength === 'HIGH') tPayload.evidence_strength = 'HIGH';

        if (!tPayload.display_name && sPayload.display_name) tPayload.display_name = sPayload.display_name;
        if (!tPayload.profession && sPayload.profession) tPayload.profession = sPayload.profession;
        if (!tPayload.organization && sPayload.organization) tPayload.organization = sPayload.organization;

        // Merge social profiles
        if (Array.isArray(sPayload.social_profiles)) {
          tPayload.social_profiles = tPayload.social_profiles || [];
          for (const sp of sPayload.social_profiles) {
            if (!tPayload.social_profiles.some(p => p.source_url === sp.source_url)) {
              tPayload.social_profiles.push(sp);
            }
          }
        }

        // Keep earliest first_seen_at
        if (sPayload.first_seen_at && (!tPayload.first_seen_at || sPayload.first_seen_at < tPayload.first_seen_at)) {
          tPayload.first_seen_at = sPayload.first_seen_at;
        }
      }

      // Add any new keys to the existing group
      for (const h of hashes) {
        target.keys.add(h);
        keyToGroupIndex.set(h, matchedGroupIdx);
      }
      for (const rk of rawKeys) {
        target.rawKeys.add(rk);
      }
    }
  }

  const mergedCleanMapRows = groups.map(g => g.mapRow);
  const mergedOutboxRows = groups.map(g => g.outboxRow).filter(Boolean);
  const mergedRawItems = groups.map(g => g.rawItem).filter(Boolean);

  const rowsAfter = mergedCleanMapRows.length;
  const rowsMerged = groups.filter(g => g.mergeCount > 0).length;
  const rowsDropped = rowsBefore - rowsAfter;
  const reductionPercent = rowsBefore > 0 ? Number(((rowsDropped / rowsBefore) * 100).toFixed(2)) : 0;

  return {
    cleanMapRows: mergedCleanMapRows,
    outboxRows: mergedOutboxRows,
    rawItems: mergedRawItems,
    rowsBeforePreDedupe: rowsBefore,
    rowsAfterPreDedupe: rowsAfter,
    preDedupeRowsMerged: rowsMerged,
    preDedupeRowsDropped: rowsDropped,
    preDedupeReductionPercent: reductionPercent
  };
}

/**
 * EXACT IDENTITY CONFLICT SCHEDULER
 * Manages concurrent slots by exact multi-key set intersection.
 * Also tracks shadow range-scheduler decisions to provide empirical false-positive proof.
 */
export class ExactIdentityConflictScheduler {
  constructor() {
    this.inFlightHashes = new Map(); // hash -> refCount
    this.inFlightBySlot = new Map(); // slotToken -> Set<hash>
    
    // Shadow Range Scheduler tracking
    this.inFlightRanges = new Map(); // slotToken -> { minKey, maxKey, sources }
    this.shadowRangeBlocks = 0;
    this.shadowExactConflicts = 0;
    this.shadowBothConflicts = 0;
    this.shadowEvaluations = 0;

    // Latency & Memory tracking
    this.decisionLatenciesUs = [];
    this.maxInFlightHashes = 0;
    this.totalBatchesEvaluated = 0;
    this.exactConflictsDetected = 0;
    this.waiters = [];

    // V1.6D Priority & Slot Occupancy Tracking
    this.fairStepCounter = 0;
    this.lastSlotStateChangeTime = performance.now();
    this.slotTimeMap = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  }

  /**
   * Derive BATCH_CONFLICT_KEYS = union(all row IDENTITY_CONFLICT_KEYS).
   */
  static extractBatchConflictSignature(batch) {
    const batchHashes = new Set();
    const batchRawKeys = new Set();
    const rows = batch.cleanMapRows || batch.mapRows || batch.rawItems || [];

    for (const r of rows) {
      const { rawKeys, hashes } = buildRowIdentityKeys({
        ...r,
        docHmac: r.identifier_value || r.docHmac,
        sourceId: r.source_id || r.sourceId,
        sourcePersonId: r.source_person_id || r.sourceRecordHash
      });
      for (const h of hashes) batchHashes.add(h);
      for (const k of rawKeys) batchRawKeys.add(k);
    }

    return { batchHashes, batchRawKeys };
  }

  /**
   * Check if candidate batch conflicts with currently in-flight transactions.
   */
  conflictsWithInFlight(batch) {
    const t0 = performance.now();
    this.shadowEvaluations++;

    // 1. Exact conflict check
    let exactConflict = false;
    let overlappingHashCount = 0;

    const hashes = batch.batchHashes || ExactIdentityConflictScheduler.extractBatchConflictSignature(batch).batchHashes;
    for (const h of hashes) {
      if (this.inFlightHashes.has(h)) {
        exactConflict = true;
        overlappingHashCount++;
      }
    }

    // 2. Shadow Range Scheduler check (Section 9)
    let rangeWouldBlock = false;
    if (batch.sources && this.inFlightRanges.size > 0) {
      for (const [token, active] of this.inFlightRanges.entries()) {
        let sourceOverlap = false;
        for (const s of batch.sources) {
          if (active.sources.has(s)) {
            sourceOverlap = true;
            break;
          }
        }
        if (sourceOverlap && batch.minIdentityKey <= active.maxKey && batch.maxIdentityKey >= active.minKey) {
          rangeWouldBlock = true;
          break;
        }
      }
    }

    if (rangeWouldBlock) this.shadowRangeBlocks++;
    if (exactConflict) this.shadowExactConflicts++;
    if (rangeWouldBlock && exactConflict) this.shadowBothConflicts++;

    const dtUs = Number(((performance.now() - t0) * 1000).toFixed(1));
    this.decisionLatenciesUs.push(dtUs);
    if (this.decisionLatenciesUs.length > 2000) this.decisionLatenciesUs.shift();

    return {
      conflicts: exactConflict,
      shadowRangeWouldBlock: rangeWouldBlock,
      overlappingHashCount,
      decisionUs: dtUs
    };
  }

  /**
   * Pop the first non-conflicting batch from the FIFO queue.
   */
  popNonConflicting(queue) {
    this.totalBatchesEvaluated++;

    for (let i = 0; i < queue.length; i++) {
      const candidate = queue[i];
      if (!candidate.batchHashes) {
        const sig = ExactIdentityConflictScheduler.extractBatchConflictSignature(candidate);
        candidate.batchHashes = sig.batchHashes;
        candidate.batchRawKeys = sig.batchRawKeys;
      }

      const evalRes = this.conflictsWithInFlight(candidate);
      if (!evalRes.conflicts) {
        queue.splice(i, 1);
        return { batch: candidate, overlapped: false, evalRes };
      }
    }

    this.exactConflictsDetected++;
    return null;
  }

  /**
   * V1.6D Fair Priority Scheduler (Section 3, 4, 5)
   * Dispatches according to priorityRatio (e.g. 80% Net-New, 20% Enrichment)
   * Falls back immediately if the preferred queue is empty or conflicting.
   */
  popFairPriorityBatch(netNewQueue, enrichmentQueue, priorityRatio = 0.80) {
    const cycle = 10;
    const netNewThreshold = Math.round(priorityRatio * cycle);
    const step = this.fairStepCounter % cycle;
    this.fairStepCounter++;

    const preferNetNew = step < netNewThreshold;
    const primaryQueue = preferNetNew ? netNewQueue : enrichmentQueue;
    const secondaryQueue = preferNetNew ? enrichmentQueue : netNewQueue;

    // 1. Try primary priority class FIFO
    let dispatch = this.popNonConflicting(primaryQueue);
    if (dispatch) {
      return { ...dispatch, dispatchedQueue: preferNetNew ? 'NET_NEW_PRIORITY' : 'EXISTING_ENRICHMENT' };
    }

    // 2. Fallback to secondary class to avoid idle commit capacity
    dispatch = this.popNonConflicting(secondaryQueue);
    if (dispatch) {
      return { ...dispatch, dispatchedQueue: preferNetNew ? 'EXISTING_ENRICHMENT' : 'NET_NEW_PRIORITY' };
    }

    return null;
  }

  _recordSlotOccupancy() {
    const now = performance.now();
    const curSize = this.inFlightBySlot.size;
    const dt = now - this.lastSlotStateChangeTime;
    this.slotTimeMap[curSize] = (this.slotTimeMap[curSize] || 0) + dt;
    this.lastSlotStateChangeTime = now;
  }

  resetOccupancyTracking() {
    this.lastSlotStateChangeTime = performance.now();
    this.slotTimeMap = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  }

  /**
   * Atomically register batch conflict keys for a leased slot.
   */
  registerInFlight(slotToken, batch) {
    this._recordSlotOccupancy();

    if (!batch.batchHashes) {
      const sig = ExactIdentityConflictScheduler.extractBatchConflictSignature(batch);
      batch.batchHashes = sig.batchHashes;
      batch.batchRawKeys = sig.batchRawKeys;
    }

    this.inFlightBySlot.set(slotToken, batch.batchHashes);
    for (const h of batch.batchHashes) {
      this.inFlightHashes.set(h, (this.inFlightHashes.get(h) || 0) + 1);
    }

    // Shadow range registration
    if (batch.sources) {
      this.inFlightRanges.set(slotToken, {
        sources: batch.sources,
        minKey: batch.minIdentityKey || 'A',
        maxKey: batch.maxIdentityKey || 'Z'
      });
    }

    if (this.inFlightHashes.size > this.maxInFlightHashes) {
      this.maxInFlightHashes = this.inFlightHashes.size;
    }
  }

  /**
   * Release keys immediately after PostgreSQL transaction completes.
   */
  release(slotToken) {
    this._recordSlotOccupancy();

    const hashes = this.inFlightBySlot.get(slotToken);
    if (hashes) {
      for (const h of hashes) {
        const count = this.inFlightHashes.get(h) || 1;
        if (count <= 1) {
          this.inFlightHashes.delete(h);
        } else {
          this.inFlightHashes.set(h, count - 1);
        }
      }
      this.inFlightBySlot.delete(slotToken);
    }

    this.inFlightRanges.delete(slotToken);
    this.drainWaiters();
  }

  drainWaiters() {
    while (this.waiters.length > 0) {
      const w = this.waiters.shift();
      w();
    }
  }

  /**
   * Quantiles & Summary Statistics
   */
  getStats() {
    const lats = [...this.decisionLatenciesUs].sort((a, b) => a - b);
    const p50Us = lats.length > 0 ? (lats[Math.floor(lats.length * 0.50)] || 0) : 0;
    const p95Us = lats.length > 0 ? (lats[Math.floor(lats.length * 0.95)] || 0) : 0;

    const rangeFalsePositives = Math.max(0, this.shadowRangeBlocks - this.shadowBothConflicts);
    const rangeFalsePositiveRate = this.shadowRangeBlocks > 0
      ? Number(((rangeFalsePositives / this.shadowRangeBlocks) * 100).toFixed(2))
      : 0.00;

    // Slot Occupancy Statistics (Section 6)
    const now = performance.now();
    const curSize = this.inFlightBySlot.size;
    const currentDt = now - this.lastSlotStateChangeTime;
    const time0 = (this.slotTimeMap[0] || 0) + (curSize === 0 ? currentDt : 0);
    const time1 = (this.slotTimeMap[1] || 0) + (curSize === 1 ? currentDt : 0);
    const time2 = (this.slotTimeMap[2] || 0) + (curSize >= 2 ? currentDt : 0);
    const totalTime = Math.max(1, time0 + time1 + time2);
    const timeWith0SlotsBusyPercent = Number(((time0 / totalTime) * 100).toFixed(2));
    const timeWith1SlotBusyPercent = Number(((time1 / totalTime) * 100).toFixed(2));
    const timeWith2SlotsBusyPercent = Number(((time2 / totalTime) * 100).toFixed(2));
    const activeSlotUtilizationPercent = Number((((time1 * 1 + time2 * 2) / (totalTime * 2)) * 100).toFixed(2));

    // Approximate memory: Map overhead + 64 bytes per SHA256 string
    const memoryBytes = (this.inFlightHashes.size * 96) + (this.inFlightBySlot.size * 256) + 1024;

    return {
      activeInFlightSlots: this.inFlightBySlot.size,
      activeInFlightHashes: this.inFlightHashes.size,
      maxInFlightHashes: this.maxInFlightHashes,
      decisionP50Us: p50Us,
      decisionP95Us: p95Us,
      schedulerMemoryBytes: memoryBytes,
      totalEvaluations: this.shadowEvaluations,
      rangeBlocks: this.shadowRangeBlocks,
      exactConflicts: this.shadowExactConflicts,
      collisionRate: this.shadowEvaluations > 0 ? Number(((this.shadowExactConflicts / this.shadowEvaluations) * 100).toFixed(2)) : 0.00,
      rangeFalsePositives,
      rangeFalsePositiveRate,
      timeWith0SlotsBusyPercent,
      timeWith1SlotBusyPercent,
      timeWith2SlotsBusyPercent,
      activeSlotUtilizationPercent
    };
  }
}
