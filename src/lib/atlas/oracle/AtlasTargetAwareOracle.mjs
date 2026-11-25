/**
 * src/lib/atlas/oracle/AtlasTargetAwareOracle.mjs
 * 
 * ATLAS TARGET-DENOMINATOR TWO-LAYER ORACLE (V1.7B)
 * 
 * Architecture:
 * - Layer 1: GlobalIdentityOracle (All 13,529,634 global canonical identity keys)
 * - Layer 2: TargetMembershipOracle (Identity keys belonging to persons in CABA_PBA_QUALIFIED_UNIQUE_REAL_PEOPLE)
 * 
 * Advisory Classification:
 * 1. NEW_CANONICAL_TARGET_CANDIDATE:
 *    - Identity NOT in Global -> Potential contractual delta: +1
 * 2. EXISTING_CANONICAL_TARGET_UPGRADE:
 *    - Identity IN Global, BUT NOT in Target Membership -> Potential contractual delta: +1
 * 3. ALREADY_TARGET_COUNTED:
 *    - Identity IN Target Membership -> Potential contractual delta: 0 (Enrichment only)
 */

import crypto from 'crypto';
import { CompactSortedFingerprintSet } from './CompactSortedFingerprintSet.mjs';

export const ADVISORY_CLASSES = {
  NEW_CANONICAL_TARGET_CANDIDATE: 'NEW_CANONICAL_TARGET_CANDIDATE',
  EXISTING_CANONICAL_TARGET_UPGRADE: 'EXISTING_CANONICAL_TARGET_UPGRADE',
  ALREADY_TARGET_COUNTED: 'ALREADY_TARGET_COUNTED'
};

export class AtlasTargetAwareOracle {
  constructor(options = {}) {
    this.hmacSecret = options.hmacSecret || process.env.ATLAS_HMAC_SECRET || 'atlas_deterministic_identity_salt_2026';
    
    // Layer 1: Global Identity Universe
    this.globalOracle = new CompactSortedFingerprintSet();
    // Layer 2: Target CABA/PBA Membership Universe
    this.targetMembershipOracle = new CompactSortedFingerprintSet();

    // Regional sub-sets for fine-grained regional accounting
    this.cabaMembershipOracle = new CompactSortedFingerprintSet();
    this.pbaMembershipOracle = new CompactSortedFingerprintSet();

    this.watermarks = {
      bootstrapStartWatermark: null,
      bootstrapEndWatermark: null,
      isCaughtUp: false,
      lastSyncAt: null
    };

    this.stats = {
      evaluationsTotal: 0,
      newCanonicalTargetCandidates: 0,
      existingCanonicalTargetUpgrades: 0,
      alreadyTargetCounted: 0
    };
  }

  /**
   * Extracts strong normalized identity keys from a raw candidate record
   */
  extractIdentityKey(row) {
    if (row.identifier_value && (row.identifier_type === 'NATIONAL_IDENTITY_HMAC' || row.identifier_type === 'DNI_HMAC')) {
      return `ID:NATIONAL_IDENTITY_HMAC:${row.identifier_value}`;
    }
    if (row.identifier_value && row.identifier_value.length >= 6) {
      const cleanDoc = row.identifier_value.replace(/\D/g, '');
      if (cleanDoc.length >= 6 && cleanDoc.length <= 9) {
        const docHmac = crypto.createHmac('sha256', this.hmacSecret).update(`ARG:DNI:${cleanDoc}`).digest('hex');
        return `ID:NATIONAL_IDENTITY_HMAC:${docHmac}`;
      }
    }
    if (row.atlas_person_id && row.atlas_person_id.startsWith('atlas_arg_per_')) {
      return `PERSON:${row.atlas_person_id}`;
    }
    return null;
  }

  /**
   * Three-class Target-Aware Advisory Evaluation (Section 1 & 3)
   */
  evaluateCandidate(row) {
    this.stats.evaluationsTotal++;
    const key = this.extractIdentityKey(row);

    if (!key) {
      return {
        advisoryClass: ADVISORY_CLASSES.NEW_CANONICAL_TARGET_CANDIDATE,
        reason: 'UNRESOLVED_IDENTIFIER_ADVISORY_NEW',
        expectedCabaDelta: 0,
        expectedPbaDelta: 0,
        expectedCabaPbaUnionDelta: 1
      };
    }

    const inGlobal = this.globalOracle.has(key);
    const inTargetUnion = this.targetMembershipOracle.has(key);
    const inCaba = this.cabaMembershipOracle.has(key);
    const inPba = this.pbaMembershipOracle.has(key);

    const isCabaEvidence = (row.target_region === 'CABA' || row.geography_id === 'caba');
    const isPbaEvidence = (row.target_region === 'PBA' || (row.geography_id && row.geography_id.includes('pba')));

    if (!inGlobal) {
      this.stats.newCanonicalTargetCandidates++;
      return {
        advisoryClass: ADVISORY_CLASSES.NEW_CANONICAL_TARGET_CANDIDATE,
        inGlobal: false,
        inTargetUnion: false,
        expectedCabaDelta: isCabaEvidence ? 1 : 0,
        expectedPbaDelta: isPbaEvidence ? 1 : 0,
        expectedCabaPbaUnionDelta: 1,
        priority: 'ACQUISITION_PRIORITY'
      };
    }

    if (inGlobal && !inTargetUnion) {
      this.stats.existingCanonicalTargetUpgrades++;
      return {
        advisoryClass: ADVISORY_CLASSES.EXISTING_CANONICAL_TARGET_UPGRADE,
        inGlobal: true,
        inTargetUnion: false,
        expectedCabaDelta: isCabaEvidence ? 1 : 0,
        expectedPbaDelta: isPbaEvidence ? 1 : 0,
        expectedCabaPbaUnionDelta: 1,
        priority: 'ACQUISITION_PRIORITY'
      };
    }

    // Otherwise, already target counted
    this.stats.alreadyTargetCounted++;
    return {
      advisoryClass: ADVISORY_CLASSES.ALREADY_TARGET_COUNTED,
      inGlobal: true,
      inTargetUnion: true,
      expectedCabaDelta: (!inCaba && isCabaEvidence) ? 1 : 0,
      expectedPbaDelta: (!inPba && isPbaEvidence) ? 1 : 0,
      expectedCabaPbaUnionDelta: 0,
      priority: 'LOW_PRIORITY_ENRICHMENT'
    };
  }

  /**
   * Stream loads Global Oracle Layer
   */
  loadGlobalUniverse(pairs) {
    this.globalOracle.loadFromPairs(pairs);
  }

  /**
   * Stream loads Target Membership Layer
   */
  loadTargetUniverse(pairs, cabaPairs = [], pbaPairs = []) {
    this.targetMembershipOracle.loadFromPairs(pairs);
    if (cabaPairs.length) this.cabaMembershipOracle.loadFromPairs(cabaPairs);
    if (pbaPairs.length) this.pbaMembershipOracle.loadFromPairs(pbaPairs);
  }

  setWatermarks(startWatermark, endWatermark) {
    this.watermarks.bootstrapStartWatermark = startWatermark;
    this.watermarks.bootstrapEndWatermark = endWatermark;
    this.watermarks.isCaughtUp = true;
    this.watermarks.lastSyncAt = new Date().toISOString();
  }
}
