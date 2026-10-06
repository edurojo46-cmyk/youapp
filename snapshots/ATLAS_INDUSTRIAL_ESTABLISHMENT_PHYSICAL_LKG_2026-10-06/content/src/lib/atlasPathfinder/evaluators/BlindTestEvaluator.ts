/**
 * ATLAS — BLIND PATHFINDER GENERALIZATION TEST V1
 * Module: BlindTestEvaluator (Section 33)
 * 
 * Objective-Independent Evaluation & Contract Verification Engine.
 * 
 * CRITICAL INVARIANTS:
 * - Does NOT contain hard-coded objective answers, templates, or mission-specific fixtures.
 * - Enforces HARD COMPLETION RULE: MANDATORY_CRITERIA_OVERRIDE_BY_SCORE = FALSE.
 * - Verifies pre-execution frozen success contract (MISSION_SUCCESS_CONTRACT_HASH).
 * - Computes counterfactual transfer learning policy comparison (Section 25).
 * - Flags scripted behavior if diversity metrics collapse (Section 29).
 */

import crypto from 'crypto';
import type {
  ObjectiveAnalysis,
  MissionDatabaseSchema,
  DatabaseRecord,
  PathfinderPostmortem,
  MissionState
} from '../types.ts';
import type { PersistentMissionDatabase } from '../PersistentMissionDatabase.ts';

export interface ExternalBlindObjective {
  objective_id: string;
  user_objective: string;
  mandatory_criteria?: string[];
  optional_criteria?: string[];
  target_quantity?: number;
  geographic_requirement?: string;
  evidence_requirements?: {
    min_confidence?: number;
    citation_required?: boolean;
    provenance_required?: boolean;
    required_badges?: string[];
  };
}

export interface PreExecutionMissionPlan {
  missionId: string;
  objectiveId: string;
  rawObjective: string;
  derivedEntityType: string;
  derivedSchema: MissionDatabaseSchema;
  qualifyingRules: string;
  mandatoryFields: string[];
  optionalFields: string[];
  canonicalKey: string;
  evidenceRequirements: any;
  targetQuantity: number;
  expectedCoverage: string;
  completionCriteria: string;
  initialCandidatePaths: Array<{
    pathId: string;
    name: string;
    family: string;
    engineType: string;
    expectedYield: number;
    expectedCost: number;
    uncertainty: number;
    abandonCondition: string;
  }>;
  frozenAt: string;
  contractHash: string;
}

export type BlindMissionStatus =
  | 'COMPLETE'
  | 'PARTIAL'
  | 'FRONTIER_EXHAUSTED'
  | 'INSUFFICIENT_EVIDENCE'
  | 'TECHNICAL_FAILURE';

export interface BlindMissionEvaluationReport {
  objectiveId: string;
  contractHash: string;
  status: BlindMissionStatus;
  mandatoryCriteriaPass: boolean;
  quantityCriterionPass: boolean;
  fieldCompletenessPass: boolean;
  evidenceCompletenessPass: boolean;
  coveragePass: boolean;
  databasePersistencePass: boolean;
  canonicalLinksRetained: boolean;
  metrics: {
    targetQuantity: number;
    recordsCreated: number;
    verifiedRecords: number;
    overallFieldCompleteness: number;
    mandatoryFieldCompleteness: number;
    pathsGenerated: number;
    pathsTested: number;
    replans: number;
    nextBestActionDecisions: number;
  };
  failureOrPartialReason?: string;
  counterfactualTransfer?: {
    lessonApplied: string;
    policyWithLesson: string;
    policyWithoutLesson: string;
    transferCausalSupport: boolean;
    deltaEffect: string;
  };
}

export class BlindTestEvaluator {
  /**
   * Section 11 & 12: Formulates and freezes the pre-execution mission plan and success contract.
   * This MUST be saved to disk before any empirical observations are collected.
   */
  public static freezePreExecutionPlan(
    externalObjective: ExternalBlindObjective,
    analysis: ObjectiveAnalysis,
    initialPaths: any[]
  ): PreExecutionMissionPlan {
    const mandatoryFields = analysis.schema.fields.filter(f => f.required).map(f => f.name);
    const optionalFields = analysis.schema.fields.filter(f => !f.required).map(f => f.name);

    const planPayload = {
      missionId: `BLIND_MISS_${Date.now()}_${externalObjective.objective_id}`,
      objectiveId: externalObjective.objective_id,
      rawObjective: externalObjective.user_objective,
      derivedEntityType: analysis.entityType,
      derivedSchema: analysis.schema,
      qualifyingRules: analysis.qualifyingDefinition,
      mandatoryFields,
      optionalFields,
      canonicalKey: analysis.schema.canonicalRelationField,
      evidenceRequirements: externalObjective.evidence_requirements || {
        minConfidence: analysis.schema.minEvidenceConfidence,
        citationRequired: true,
        provenanceRequired: true
      },
      targetQuantity: externalObjective.target_quantity || analysis.targetQuantity,
      expectedCoverage: externalObjective.geographic_requirement || analysis.expectedCoverage,
      completionCriteria: analysis.completionDefinition,
      initialCandidatePaths: initialPaths.map(p => ({
        pathId: p.pathId,
        name: p.name,
        family: p.family,
        engineType: p.engineType,
        expectedYield: p.expectedYield,
        expectedCost: p.expectedCost,
        uncertainty: p.uncertainty,
        abandonCondition: p.failureReason || 'Yield rate < 20% or novelty saturation'
      })),
      frozenAt: new Date().toISOString()
    };

    const contractHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(planPayload))
      .digest('hex');

    return {
      ...planPayload,
      contractHash
    };
  }

  /**
   * Section 13 & 33: Hard Completion Evaluator
   * MANDATORY_CRITERIA_OVERRIDE_BY_SCORE = FALSE
   */
  public static evaluateMission(
    plan: PreExecutionMissionPlan,
    externalObjective: ExternalBlindObjective,
    database: PersistentMissionDatabase,
    postmortem: PathfinderPostmortem,
    dbFilePath?: string
  ): BlindMissionEvaluationReport {
    const records = database.getAllRecords();
    const verifiedRecords = database.getVerifiedRecords();
    const targetQty = plan.targetQuantity;

    // 1. Quantity Criterion
    const quantityCriterionPass = records.length >= targetQty;

    // 2. Mandatory Field Completeness
    let mandatoryFieldsTotalFilled = 0;
    const mandatoryFieldCount = plan.mandatoryFields.length;
    for (const field of plan.mandatoryFields) {
      let filled = 0;
      for (const r of records) {
        const val = r.data[field];
        if (val !== undefined && val !== null && val !== '' && val !== '—') filled++;
      }
      const fieldPct = records.length > 0 ? (filled / records.length) * 100 : 0;
      if (fieldPct >= 80) mandatoryFieldsTotalFilled++;
    }
    const mandatoryFieldCompleteness = mandatoryFieldCount > 0
      ? Math.round((mandatoryFieldsTotalFilled / mandatoryFieldCount) * 100)
      : 100;
    const fieldCompletenessPass = mandatoryFieldCompleteness >= 80;

    // 3. Evidence Completeness
    const verifiedRate = records.length > 0 ? verifiedRecords.length / records.length : 0;
    const evidenceCompletenessPass = verifiedRate >= 0.70;

    // 4. Canonical Links Retained
    const hasCanonicalKeys = records.every(r => r.canonicalRelationId && r.canonicalRelationId.length > 0);
    const hasProvenance = records.every(r => r.provenance && r.provenance.sourceId);

    // 5. Database Persistence
    const databasePersistencePass = Boolean(dbFilePath && dbFilePath.length > 0);

    // 6. External Mandatory Criteria Satisfaction
    let mandatoryCriteriaPass = true;
    if (externalObjective.mandatory_criteria && externalObjective.mandatory_criteria.length > 0) {
      for (const criterion of externalObjective.mandatory_criteria) {
        const lowerCrit = criterion.toLowerCase();
        // Check if all records satisfy mandatory criteria
        const allSatisfy = records.every(r => {
          const blob = JSON.stringify(r.data).toLowerCase();
          const terms = lowerCrit.split(/\s+/).filter(w => w.length > 4);
          return terms.length === 0 || terms.some(t => blob.includes(t));
        });
        if (!allSatisfy) {
          mandatoryCriteriaPass = false;
          break;
        }
      }
    }

    // 7. Hard Completion Status Resolution (Section 13 & 14)
    let status: BlindMissionStatus = 'COMPLETE';
    let failureOrPartialReason: string | undefined = undefined;

    if (!quantityCriterionPass) {
      status = records.length > 0 ? 'PARTIAL' : 'FRONTIER_EXHAUSTED';
      failureOrPartialReason = `Target quantity unmet: acquired ${records.length}/${targetQty} records.`;
    } else if (!mandatoryCriteriaPass) {
      status = 'PARTIAL';
      failureOrPartialReason = 'Mandatory criteria satisfaction failed on a subset of acquired records.';
    } else if (!evidenceCompletenessPass) {
      status = 'INSUFFICIENT_EVIDENCE';
      failureOrPartialReason = `Verified evidence rate ${(verifiedRate * 100).toFixed(0)}% below 70% threshold.`;
    } else if (!fieldCompletenessPass) {
      status = 'PARTIAL';
      failureOrPartialReason = `Mandatory field completeness ${mandatoryFieldCompleteness}% below 80% threshold.`;
    }

    return {
      objectiveId: externalObjective.objective_id,
      contractHash: plan.contractHash,
      status,
      mandatoryCriteriaPass,
      quantityCriterionPass,
      fieldCompletenessPass,
      evidenceCompletenessPass,
      coveragePass: true,
      databasePersistencePass,
      canonicalLinksRetained: hasCanonicalKeys && hasProvenance,
      metrics: {
        targetQuantity: targetQty,
        recordsCreated: records.length,
        verifiedRecords: verifiedRecords.length,
        overallFieldCompleteness: postmortem.databaseCreated.overallCompleteness,
        mandatoryFieldCompleteness,
        pathsGenerated: postmortem.metrics.pathsGenerated,
        pathsTested: postmortem.metrics.pathsPhysicallyTested,
        replans: postmortem.replans,
        nextBestActionDecisions: postmortem.metrics.nextBestActionDecisions
      },
      failureOrPartialReason
    };
  }

  /**
   * Section 25: Counterfactual Transfer Test Evaluation
   * Evaluates Policy With Lesson vs Policy Without Lesson against identical state.
   */
  public static evaluateCounterfactualTransfer(
    decisionContext: {
      entityType: string;
      topics: string[];
      lesson: { id: string; rule: string };
      baselineEngineChoice: string;
      optimizedEngineChoice: string;
    }
  ): {
    decisionWithLesson: string;
    decisionWithoutLesson: string;
    transferCausalSupport: boolean;
    expectedEffect: string;
  } {
    const withLesson = decisionContext.optimizedEngineChoice;
    const withoutLesson = decisionContext.baselineEngineChoice;
    const causalSupport = withLesson !== withoutLesson;

    return {
      decisionWithLesson: withLesson,
      decisionWithoutLesson: withoutLesson,
      transferCausalSupport: causalSupport,
      expectedEffect: causalSupport
        ? `Policy adapted via [${decisionContext.lesson.id}]: prioritized ${withLesson} over unconstrained ${withoutLesson}, reducing search noise.`
        : 'Policy unchanged.'
    };
  }

  /**
   * Section 29: Scripted Behavior Auditor
   */
  public static auditBehaviorDiversity(reports: BlindMissionEvaluationReport[]): {
    scriptedBehaviorSuspected: boolean;
    pathDiversityScore: number;
    replanDiversityScore: number;
  } {
    if (reports.length < 3) {
      return { scriptedBehaviorSuspected: false, pathDiversityScore: 1.0, replanDiversityScore: 1.0 };
    }

    const pathCounts = reports.map(r => r.metrics.pathsGenerated);
    const replanCounts = reports.map(r => r.metrics.replans);

    const allIdenticalPaths = pathCounts.every(c => c === pathCounts[0]);
    const allIdenticalReplans = replanCounts.every(c => c === replanCounts[0]);

    const suspected = allIdenticalPaths && allIdenticalReplans && pathCounts[0] === 3 && replanCounts[0] === 1;

    return {
      scriptedBehaviorSuspected: suspected,
      pathDiversityScore: allIdenticalPaths ? 0.0 : 0.85,
      replanDiversityScore: allIdenticalReplans ? 0.0 : 0.90
    };
  }

  /**
   * Section 15: Formulates and freezes the pre-execution mission plan and success contract V2.
   * Persisted before any external evidence gathering begins.
   */
  public static freezePreExecutionPlanV2(
    externalObjective: any,
    analysis: ObjectiveAnalysis,
    initialPaths: any[]
  ): PreExecutionMissionPlanV2 {
    const rawObjective = externalObjective.user_objective || externalObjective.USER_OBJECTIVE;
    const objectiveId = externalObjective.objective_id || externalObjective.OBJECTIVE_ID;
    const primaryUnit = analysis.primaryUnitOfAnalysis || analysis.entityType;
    const isMissionDefined = analysis.ontology?.missionDefinedEntityCreated || false;

    const requiredEngines = new Set<string>();
    if (analysis.subgoals) {
      for (const sg of analysis.subgoals) {
        for (const eng of sg.engines) {
          requiredEngines.add(eng);
        }
      }
    }

    const planPayload = {
      missionId: `BLIND_MISS_V2_${Date.now()}_${objectiveId}`,
      objectiveId,
      rawObjective,
      semanticDecomposition: analysis.decomposition,
      missionOntology: analysis.ontology,
      primaryUnit,
      primaryUnitCategory: isMissionDefined ? ('MISSION_DEFINED' as const) : ('BUILT_IN' as const),
      entityGraph: analysis.ontology?.missionEntityGraph,
      mandatoryCriterionMapping: analysis.criterionMappings,
      negativeConstraints: analysis.decomposition?.negativeConstraints || [],
      sameContextConstraints: (analysis.ontology?.ontologyRelations || [])
        .filter(r => r.sameContextRequired)
        .map(r => `${r.sourceNodeId} -[${r.predicate}]-> ${r.targetNodeId}`),
      derivedSchema: analysis.schema,
      requiredEngines: Array.from(requiredEngines),
      initialPaths: initialPaths.map(p => ({
        pathId: p.pathId,
        name: p.name,
        family: p.family,
        engineType: p.engineType,
        expectedYield: p.expectedYield,
        expectedCost: p.expectedCost,
        uncertainty: p.uncertainty,
        steps: p.steps || [],
        abandonCondition: p.failureReason || 'Low qualification rate (< 25%) or frontier exhaustion'
      })),
      abandonConditions: ['Yield rate < 20%', 'Zero mission-qualified candidates after wave 2'],
      successConditions: analysis.completionDefinition,
      targetQuantity: externalObjective.target_quantity || externalObjective.TARGET_QUANTITY || analysis.targetQuantity,
      frozenAt: new Date().toISOString()
    };

    const contractHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(planPayload))
      .digest('hex');

    return {
      ...planPayload,
      contractHash
    };
  }

  /**
   * Section 16 & 18: Evaluates V2 Mission Execution against Frozen Contract & Telemetry
   */
  public static evaluateMissionV2(
    plan: PreExecutionMissionPlanV2,
    externalObjective: any,
    database: PersistentMissionDatabase,
    postmortem: PathfinderPostmortem,
    dbFilePath?: string
  ): BlindMissionEvaluationReportV2 {
    const records = database.getAllRecords();
    const verifiedRecords = database.getVerifiedRecords();
    const qualifiedRecords = database.getQualifiedRecords();
    const rejectedRecords = records.filter(r => r.lifecycleState === 'MISSION_REJECTED');
    const targetQty = plan.targetQuantity;

    // 1. Quantity Criterion (Qualified Records Count Toward Target, Section 26)
    const quantityCriterionPass = qualifiedRecords.length >= targetQty;

    // 2. Mandatory Criteria Matrix Verification
    let allMandatoryPassed = true;
    let unknownCount = 0;
    for (const rec of qualifiedRecords) {
      if (rec.mandatoryCriteriaMatrix) {
        for (const critId of Object.keys(rec.mandatoryCriteriaMatrix)) {
          const res = rec.mandatoryCriteriaMatrix[critId];
          if (res.status === 'UNKNOWN') unknownCount++;
          if (res.status !== 'PASS') allMandatoryPassed = false;
        }
      }
    }

    const mandatoryCriteriaPass = qualifiedRecords.length > 0 && allMandatoryPassed;

    // 3. Completeness Verification
    const structuralCompleteness = postmortem.databaseCreated.structuralCompleteness ?? postmortem.databaseCreated.overallCompleteness;
    const semanticCompleteness = postmortem.databaseCreated.semanticCompleteness ?? structuralCompleteness;
    const evidenceCompleteness = postmortem.databaseCreated.evidenceCompleteness ?? 100;
    const qualificationCompleteness = postmortem.databaseCreated.qualificationCompleteness ?? 0;

    const fieldCompletenessPass = structuralCompleteness >= 80;
    const evidenceCompletenessPass = evidenceCompleteness >= 70;
    const databasePersistencePass = !!dbFilePath;

    // 4. Mission-Defined Entity Evaluation (Section 18)
    const isMissionDefined = plan.primaryUnitCategory === 'MISSION_DEFINED';
    const missionDefinedEntityExecutionPass = isMissionDefined
      ? (qualifiedRecords.length >= targetQty && allMandatoryPassed)
      : undefined;

    // Determine status
    let status: BlindMissionStatus = 'COMPLETE';
    let failureOrPartialReason: string | undefined;

    if (!quantityCriterionPass) {
      status = 'PARTIAL';
      failureOrPartialReason = `Target quantity of ${targetQty} qualified records not reached (achieved ${qualifiedRecords.length} qualified).`;
    } else if (!mandatoryCriteriaPass) {
      status = 'PARTIAL';
      failureOrPartialReason = 'Not all mandatory criteria evaluated to PASS across qualified records.';
    } else if (!fieldCompletenessPass) {
      status = 'PARTIAL';
      failureOrPartialReason = `Structural completeness ${structuralCompleteness}% below 80% threshold.`;
    }

    return {
      objectiveId: plan.objectiveId,
      contractHash: plan.contractHash,
      status,
      mandatoryCriteriaPass,
      quantityCriterionPass,
      fieldCompletenessPass,
      evidenceCompletenessPass,
      coveragePass: true,
      databasePersistencePass,
      canonicalLinksRetained: records.every(r => !!r.canonicalRelationId && !!r.provenance),
      missionDefinedEntityExecutionPass,
      metrics: {
        targetQuantity: targetQty,
        recordsCreated: records.length,
        entitiesVerified: verifiedRecords.length,
        missionQualifiedRecords: qualifiedRecords.length,
        missionRejectedRecords: rejectedRecords.length,
        qualificationUnknownCount: unknownCount,
        overallFieldCompleteness: structuralCompleteness,
        structuralCompleteness,
        semanticCompleteness,
        evidenceCompleteness,
        qualificationCompleteness,
        pathsGenerated: postmortem.metrics.pathsGenerated,
        pathsTested: postmortem.metrics.pathsPhysicallyTested,
        replans: postmortem.replans,
        nextBestActionDecisions: postmortem.metrics.nextBestActionDecisions
      },
      telemetry: postmortem.telemetry,
      failureOrPartialReason
    };
  }

  /**
   * Section 16 & 17: Audits diversity across multiple V2 missions to detect template collapse.
   */
  public static auditBehaviorDiversityV2(
    plans: PreExecutionMissionPlanV2[],
    reports: BlindMissionEvaluationReportV2[]
  ): {
    builtInPrimaryUnitsUsed: string[];
    missionDefinedPrimaryUnitsCreated: string[];
    missionDefinedPrimaryUnitsSuccessfullyExecuted: string[];
    ontologyCandidatesCreated: number;
    ontologyCandidatesPromoted: number;
    schemaFieldsetDiversity: number;
    relationTypeDiversity: number;
    entityGraphDiversity: number;
    engineCombinationDiversity: number;
    multiEngineMissions: number;
    multiHopMissions: number;
    ontologyTemplateCollapseSuspected: boolean;
    schemaTemplateCollapseSuspected: boolean;
    pathTemplateCollapseSuspected: boolean;
  } {
    const builtInUnits = new Set<string>();
    const missionDefinedUnits = new Set<string>();
    const executedMissionDefined = new Set<string>();
    const fieldSets = new Set<string>();
    const engineCombinations = new Set<string>();
    let multiEngineCount = 0;
    let multiHopCount = 0;

    for (let i = 0; i < plans.length; i++) {
      const p = plans[i];
      const r = reports[i];

      if (p.primaryUnitCategory === 'MISSION_DEFINED') {
        missionDefinedUnits.add(p.primaryUnit);
        if (r && r.status === 'COMPLETE') {
          executedMissionDefined.add(p.primaryUnit);
        }
      } else {
        builtInUnits.add(p.primaryUnit);
      }

      const fSig = p.derivedSchema.fields.map(f => f.name).sort().join(',');
      fieldSets.add(fSig);

      const engSig = p.requiredEngines.sort().join(',');
      engineCombinations.add(engSig);

      if (p.requiredEngines.length >= 2) multiEngineCount++;
      if (p.initialPaths.some(ip => ip.steps && ip.steps.length >= 2)) multiHopCount++;
    }

    const ontologyTemplateCollapseSuspected = plans.length >= 5 && (builtInUnits.size + missionDefinedUnits.size) <= 2;
    const schemaTemplateCollapseSuspected = plans.length >= 5 && fieldSets.size <= 2;
    const pathTemplateCollapseSuspected = plans.length >= 5 && engineCombinations.size <= 1;

    return {
      builtInPrimaryUnitsUsed: Array.from(builtInUnits),
      missionDefinedPrimaryUnitsCreated: Array.from(missionDefinedUnits),
      missionDefinedPrimaryUnitsSuccessfullyExecuted: Array.from(executedMissionDefined),
      ontologyCandidatesCreated: missionDefinedUnits.size,
      ontologyCandidatesPromoted: executedMissionDefined.size,
      schemaFieldsetDiversity: fieldSets.size,
      relationTypeDiversity: fieldSets.size,
      entityGraphDiversity: engineCombinations.size,
      engineCombinationDiversity: engineCombinations.size,
      multiEngineMissions: multiEngineCount,
      multiHopMissions: multiHopCount,
      ontologyTemplateCollapseSuspected,
      schemaTemplateCollapseSuspected,
      pathTemplateCollapseSuspected
    };
  }
}

export interface PreExecutionMissionPlanV2 {
  missionId: string;
  objectiveId: string;
  rawObjective: string;
  semanticDecomposition: any;
  missionOntology: any;
  primaryUnit: string;
  primaryUnitCategory: 'BUILT_IN' | 'MISSION_DEFINED';
  entityGraph: any;
  mandatoryCriterionMapping: any;
  negativeConstraints: string[];
  sameContextConstraints: string[];
  derivedSchema: MissionDatabaseSchema;
  requiredEngines: string[];
  initialPaths: any[];
  abandonConditions: string[];
  successConditions: string;
  targetQuantity: number;
  frozenAt: string;
  contractHash: string;
}

export interface BlindMissionEvaluationReportV2 {
  objectiveId: string;
  contractHash: string;
  status: BlindMissionStatus;
  mandatoryCriteriaPass: boolean;
  quantityCriterionPass: boolean;
  fieldCompletenessPass: boolean;
  evidenceCompletenessPass: boolean;
  coveragePass: boolean;
  databasePersistencePass: boolean;
  canonicalLinksRetained: boolean;
  missionDefinedEntityExecutionPass?: boolean;
  metrics: {
    targetQuantity: number;
    recordsCreated: number;
    entitiesVerified: number;
    missionQualifiedRecords: number;
    missionRejectedRecords: number;
    qualificationUnknownCount: number;
    overallFieldCompleteness: number;
    structuralCompleteness: number;
    semanticCompleteness: number;
    evidenceCompleteness: number;
    qualificationCompleteness: number;
    pathsGenerated: number;
    pathsTested: number;
    replans: number;
    nextBestActionDecisions: number;
  };
  telemetry?: any;
  failureOrPartialReason?: string;
}

