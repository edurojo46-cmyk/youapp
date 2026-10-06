/**
 * ATLAS GENERAL OBJECTIVE INTELLIGENCE ENGINE V1
 * Module: EvidenceGate (Section 12)
 * 
 * Enforces the strict evidence hierarchy:
 * AI HYPOTHESIS ≠ FACT
 * HYPOTHESIS -> OBSERVATION -> EVIDENCE -> VALIDATED CONCLUSION
 */

import type { MissionSpecification, MissionResultItem, EvidenceRecord } from './types.ts';

export interface EvidenceVerificationResult {
  passed: boolean;
  confidence: number;
  rejectionReason?: string;
  verifiedEvidenceRecord?: EvidenceRecord;
}

export class EvidenceGate {
  public static verify(item: MissionResultItem, mission: MissionSpecification): EvidenceVerificationResult {
    // 1. Rejection of unverified synthetic or guessed records
    if (!item.title || item.title.trim().length === 0) {
      return { passed: false, confidence: 0.0, rejectionReason: 'MISSING_TITLE_OR_IDENTITY' };
    }

    // 2. Provenance Requirement Check
    if (!item.provenance || !item.provenance.sourceId) {
      return { passed: false, confidence: 0.0, rejectionReason: 'MISSING_OBSERVATION_PROVENANCE' };
    }

    // 3. Physical Observation Integrity Check
    if (item.provenance.isSynthetic === true || item.provenance.isInferred === true) {
      return { passed: false, confidence: 0.0, rejectionReason: 'PROHIBITED_SYNTHETIC_DATA' };
    }

    // 4. Argentina Link Verification
    const geoText = `${item.primaryDetails.geography || ''} ${item.primaryDetails.jurisdiction || ''} ${item.provenance.sourceUrl || ''}`.toLowerCase();
    const isArg = geoText.includes('arg') || geoText.includes('caba') || geoText.includes('.ar');
    if (!isArg) {
      return { passed: false, confidence: 0.2, rejectionReason: 'ARGENTINA_LINK_UNVERIFIED' };
    }

    // 5. Objective-Specific Gate
    let confidence = 0.85;
    if (mission.objectiveType === 'EXPERT_DISCOVERY') {
      const hasExpertiseEvidence = (item.evidenceBadges && item.evidenceBadges.length > 0) || !!item.primaryDetails.role;
      if (!hasExpertiseEvidence) {
        return { passed: false, confidence: 0.3, rejectionReason: 'NO_EXPERTISE_EVIDENCE' };
      }
      confidence = 0.90;
    } else if (mission.objectiveType === 'ORGANIZATION_DISCOVERY') {
      const hasLegalEntityEvidence = !!item.primaryDetails.cuit || !!item.primaryDetails.registrationNumber;
      if (!hasLegalEntityEvidence) {
        return { passed: false, confidence: 0.4, rejectionReason: 'NO_LEGAL_ENTITY_REGISTRATION' };
      }
      confidence = 0.92;
    } else if (mission.objectiveType === 'PUBLIC_CONTACT_DISCOVERY') {
      const hasPublicChannel = !!item.primaryDetails.normalizedEmail || !!item.primaryDetails.contactChannel;
      if (!hasPublicChannel) {
        return { passed: false, confidence: 0.0, rejectionReason: 'NO_PUBLIC_CHANNEL_FOUND' };
      }
      confidence = 0.95;
    } else if (mission.objectiveType === 'CONTENT_DISCOVERY') {
      const isPlayable = item.primaryDetails.playable !== false && !!item.primaryDetails.videoId;
      if (!isPlayable) {
        return { passed: false, confidence: 0.1, rejectionReason: 'VIDEO_NOT_PLAYABLE' };
      }
      confidence = 0.94;
    }

    const verifiedRecord: EvidenceRecord = {
      evidenceId: `EVID_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      missionId: mission.missionId,
      subgoalId: 'SUB_EVIDENCE_VALIDATION',
      strategyId: item.specializedEngineOrigin,
      entityKey: item.canonicalKey,
      entityType: item.entityType,
      evidenceType: 'OBSERVATION',
      provenance: {
        sourceId: item.provenance.sourceId,
        sourceUrl: item.provenance.sourceUrl,
        observedAt: new Date().toISOString(),
        rawRecordHash: item.provenance.rawRecordHash
      },
      confidence,
      verified: true
    };

    return {
      passed: true,
      confidence,
      verifiedEvidenceRecord: verifiedRecord
    };
  }
}
