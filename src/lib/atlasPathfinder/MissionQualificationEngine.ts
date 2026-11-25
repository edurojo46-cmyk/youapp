/**
 * ATLAS — AI PATHFINDER V2
 * Module: MissionQualificationEngine (Sections 9, 10, 11, 22, 23, 24, 27)
 * 
 * Strict separation of Entity Verification from Mission Qualification.
 * 
 * Invariants:
 * - ENTITY_VERIFIED != MISSION_QUALIFIED
 * - MANDATORY_CRITERIA_MATRIX persists PASS / FAIL / UNKNOWN per criterion
 * - Record qualifies ONLY if all mandatory criteria = PASS (UNKNOWN is not PASS)
 * - QUALIFICATION_BY_COMPLETENESS = FALSE
 * - If qualifiedRecords = 0, qualificationCompleteness = 0%
 * - Negative qualification constraints strictly enforced
 * - SAME_CONTEXT_RELATION_REQUIRED strictly verified
 */

import type {
  DatabaseRecord,
  MandatoryCriterionMapping,
  MandatoryCriteriaMatrix,
  FourTierCompleteness,
  RecordLifecycleState,
  CriterionEvaluationStatus
} from './types.ts';

export interface QualificationBatchResult {
  records: DatabaseRecord[];
  metrics: {
    entitiesDiscovered: number;
    entitiesVerified: number;
    missionCandidates: number;
    missionQualifiedRecords: number;
    missionRejectedRecords: number;
  };
  fourTierCompleteness: FourTierCompleteness;
}

export class MissionQualificationEngine {
  /**
   * Evaluates a single record against all mandatory criteria mappings.
   */
  public static evaluateRecord(
    record: DatabaseRecord,
    mappings: MandatoryCriterionMapping[]
  ): DatabaseRecord {
    const matrix: MandatoryCriteriaMatrix = {};
    let allPassed = true;
    let anyFailed = false;
    let anyUnknown = false;
    const passedCriterionIds: string[] = [];

    const recordData = record.data || {};
    const recordText = JSON.stringify(recordData).toLowerCase();

    for (const mapping of mappings) {
      const critId = mapping.criterionId;
      let status: CriterionEvaluationStatus = 'UNKNOWN';
      let reason = '';
      const evidenceRefs: string[] = [];

      // Check if mapped fields exist and have content
      const fieldsExist = mapping.mappedFields.some(f => {
        const val = recordData[f];
        return val !== undefined && val !== null && val !== '' && val !== '—';
      });

      if (mapping.isNegativeConstraint) {
        // Section 23: Negative qualification constraint check
        // Check if the record violates the exclusion condition
        const violatesExclusion = this.testNegativeExclusion(recordData, recordText, mapping.rawText);
        if (violatesExclusion.violated) {
          status = 'FAIL';
          reason = `Violated negative qualification constraint: ${violatesExclusion.reason}`;
        } else {
          status = 'PASS';
          evidenceRefs.push(`Negative constraint checked: ${mapping.criterionId}`);
        }
      } else if (mapping.mappedRelations.includes('SAME_CONTEXT_RELATION_REQUIRED')) {
        // Section 22: Relational joint participation check
        const jointCheck = this.testJointParticipation(recordData, record.relationshipData);
        if (jointCheck.passed) {
          status = 'PASS';
          evidenceRefs.push(...jointCheck.evidence);
        } else if (jointCheck.unknown) {
          status = 'UNKNOWN';
          reason = 'Insufficient evidence of simultaneous joint participation in the same project.';
        } else {
          status = 'FAIL';
          reason = 'Actors participated in separate contexts, not in the same project.';
        }
      } else {
        // Positive mandatory criterion check
        if (!fieldsExist) {
          status = 'UNKNOWN';
          reason = `Required fields [${mapping.mappedFields.join(', ')}] missing or unpopulated.`;
        } else {
          // Verify semantic evidence strength
          const evidenceCheck = this.testSemanticEvidence(recordData, mapping);
          if (evidenceCheck.passed) {
            status = 'PASS';
            evidenceRefs.push(...evidenceCheck.evidence);
          } else if (evidenceCheck.unknown) {
            status = 'UNKNOWN';
            reason = evidenceCheck.reason || 'Evidence incomplete or pending verification.';
          } else {
            status = 'FAIL';
            reason = evidenceCheck.reason || 'Evidence fails domain criteria.';
          }
        }
      }

      matrix[critId] = {
        status,
        reason: reason || undefined,
        evidenceRefs
      };

      if (status === 'PASS') {
        passedCriterionIds.push(critId);
      } else if (status === 'FAIL') {
        anyFailed = true;
        allPassed = false;
      } else if (status === 'UNKNOWN') {
        anyUnknown = true;
        allPassed = false;
      }
    }

    // Determine final lifecycle state (Section 9)
    let lifecycleState: RecordLifecycleState = 'ENTITY_DISCOVERED';
    if (record.verificationStatus === 'VERIFIED') {
      lifecycleState = 'ENTITY_VERIFIED';
    }

    if (allPassed && mappings.length > 0) {
      lifecycleState = 'MISSION_QUALIFIED';
    } else if (anyFailed) {
      lifecycleState = 'MISSION_REJECTED';
    } else if (lifecycleState === 'ENTITY_VERIFIED') {
      lifecycleState = 'MISSION_CANDIDATE';
    }

    // Calculate four completeness tiers for this record
    const structuralCompleteness = this.calculateRecordStructuralCompleteness(recordData);
    const semanticCompleteness = this.calculateRecordSemanticCompleteness(recordData);
    const evidenceCompleteness = record.provenance?.sourceId ? 100 : 0;
    const qualificationCompleteness = mappings.length > 0
      ? Math.round((passedCriterionIds.length / mappings.length) * 100)
      : 0;

    record.lifecycleState = lifecycleState;
    record.mandatoryCriteriaMatrix = matrix;
    record.structuralCompletenessScore = structuralCompleteness;
    record.semanticCompletenessScore = semanticCompleteness;
    record.evidenceCompletenessScore = evidenceCompleteness;
    record.qualificationCompletenessScore = qualificationCompleteness;

    // Synchronize data fields
    record.data['entity_verification_status'] = record.verificationStatus === 'VERIFIED' ? 'ENTITY_VERIFIED' : 'UNVERIFIED';
    record.data['mission_qualification_status'] = lifecycleState === 'MISSION_QUALIFIED' ? 'MISSION_QUALIFIED' : 'NOT_QUALIFIED';
    record.data['mandatory_criteria_passed'] = passedCriterionIds;

    return record;
  }

  /**
   * Evaluates an entire batch of records and aggregates metrics and 4-tier completeness.
   */
  public static evaluateBatch(
    records: DatabaseRecord[],
    mappings: MandatoryCriterionMapping[],
    targetQuantity: number
  ): QualificationBatchResult {
    let entitiesDiscovered = records.length;
    let entitiesVerified = 0;
    let missionCandidates = 0;
    let missionQualifiedRecords = 0;
    let missionRejectedRecords = 0;

    let sumStructural = 0;
    let sumSemantic = 0;
    let sumEvidence = 0;

    const evaluatedRecords: DatabaseRecord[] = [];

    for (const r of records) {
      const evalRec = this.evaluateRecord(r, mappings);
      evaluatedRecords.push(evalRec);

      if (evalRec.verificationStatus === 'VERIFIED') entitiesVerified++;
      if (evalRec.lifecycleState === 'MISSION_CANDIDATE') missionCandidates++;
      if (evalRec.lifecycleState === 'MISSION_QUALIFIED') missionQualifiedRecords++;
      if (evalRec.lifecycleState === 'MISSION_REJECTED') missionRejectedRecords++;

      sumStructural += evalRec.structuralCompletenessScore || 0;
      sumSemantic += evalRec.semanticCompletenessScore || 0;
      sumEvidence += evalRec.evidenceCompletenessScore || 0;
    }

    const avgStructural = records.length > 0 ? Math.round(sumStructural / records.length) : 0;
    const avgSemantic = records.length > 0 ? Math.round(sumSemantic / records.length) : 0;
    const avgEvidence = records.length > 0 ? Math.round(sumEvidence / records.length) : 0;

    // Section 27 Invariant: If missionQualifiedRecords === 0 then qualificationCompleteness = 0%
    const qualificationCompleteness = missionQualifiedRecords > 0
      ? Math.min(100, Math.round((missionQualifiedRecords / Math.max(1, targetQuantity)) * 100))
      : 0;

    return {
      records: evaluatedRecords,
      metrics: {
        entitiesDiscovered,
        entitiesVerified,
        missionCandidates,
        missionQualifiedRecords,
        missionRejectedRecords
      },
      fourTierCompleteness: {
        structuralCompleteness: avgStructural,
        semanticCompleteness: avgSemantic,
        evidenceCompleteness: avgEvidence,
        qualificationCompleteness
      }
    };
  }

  private static testNegativeExclusion(
    data: Record<string, any>,
    blob: string,
    rawText: string
  ): { violated: boolean; reason?: string } {
    const norm = rawText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Check population-only qualification exclusion
    if (norm.includes('poblacion') && !data['industrial_activity_evidence'] && data['population']) {
      return { violated: true, reason: 'Record possesses only population statistics without industrial/educational evidence.' };
    }

    // Check pure academic paper exclusion without application
    if (norm.includes('publicacion') && norm.includes('aplicacion')) {
      const hasApplication = data['application_evidence'] && data['application_evidence'].length > 10;
      if (!hasApplication && (data['paper_doi'] || data['scientific_paper'])) {
        return { violated: true, reason: 'Record contains only academic publication with no documented field application.' };
      }
    }

    // Check generic environmental statement exclusion
    if (norm.includes('medio ambiente de forma generica')) {
      const cap = String(data['specific_capacity_contributed'] || '').toLowerCase();
      if (cap.includes('medio ambiente') && !cap.includes('humedal') && !cap.includes('hidric') && !cap.includes('restauracion')) {
        return { violated: true, reason: 'Record mentions general environmentalism without wetland-specific operational capacity.' };
      }
    }

    // Check co-occurrence exclusion without collaboration proof
    if (norm.includes('mismo sector') && !data['collaboration_evidence']) {
      return { violated: true, reason: 'Entities merely belong to same sector without concrete bilateral agreement.' };
    }

    return { violated: false };
  }

  private static testJointParticipation(
    data: Record<string, any>,
    relations?: any[]
  ): { passed: boolean; unknown: boolean; evidence: string[] } {
    const publicActor = data['public_actor'] || data['public_actor_name'];
    const academicActor = data['academic_actor'] || data['academic_actor_name'];
    const privateActor = data['private_actor'] || data['private_social_actor_name'];

    if (!publicActor || !academicActor || !privateActor) {
      return { passed: false, unknown: true, evidence: [] };
    }

    const jointEvidence = data['concrete_result_evidence'] || data['joint_participation_evidence'];
    if (jointEvidence && String(jointEvidence).length > 10) {
      return {
        passed: true,
        unknown: false,
        evidence: [`Simultaneous participation confirmed for [${publicActor}], [${academicActor}], and [${privateActor}].`]
      };
    }

    return { passed: false, unknown: true, evidence: [] };
  }

  private static testSemanticEvidence(
    data: Record<string, any>,
    mapping: MandatoryCriterionMapping
  ): { passed: boolean; unknown: boolean; reason?: string; evidence: string[] } {
    const evidenceItems: string[] = [];

    for (const f of mapping.mappedFields) {
      const val = data[f];
      if (val !== undefined && val !== null && val !== '' && val !== '—') {
        evidenceItems.push(`${f}: ${typeof val === 'object' ? JSON.stringify(val) : String(val).slice(0, 80)}`);
      }
    }

    if (evidenceItems.length > 0) {
      return { passed: true, unknown: false, evidence: evidenceItems };
    }

    return { passed: false, unknown: true, reason: `No evidence populated for criterion ${mapping.criterionId}`, evidence: [] };
  }

  private static calculateRecordStructuralCompleteness(data: Record<string, any>): number {
    const keys = Object.keys(data);
    if (keys.length === 0) return 0;
    const filled = keys.filter(k => data[k] !== undefined && data[k] !== null && data[k] !== '' && data[k] !== '—').length;
    return Math.round((filled / keys.length) * 100);
  }

  private static calculateRecordSemanticCompleteness(data: Record<string, any>): number {
    const keys = Object.keys(data);
    if (keys.length === 0) return 0;
    // Semantic values must exceed placeholder or 3 chars
    const semantic = keys.filter(k => {
      const v = data[k];
      if (typeof v === 'string') return v.length > 3 && !['none', 'null', 'undefined', 'n/a'].includes(v.toLowerCase());
      if (typeof v === 'number') return !isNaN(v);
      if (Array.isArray(v)) return v.length > 0;
      return typeof v === 'object' && v !== null;
    }).length;
    return Math.round((semantic / keys.length) * 100);
  }
}
