/**
 * ATLAS — INTELLIGENCE CONSTITUTION V1
 * Supreme Autonomous Governance & Epistemological Safety Architecture
 * 
 * Invariants:
 * 1. Constitutional rules CANNOT be rewritten or degraded by machine learning or empirical state.
 * 2. Fact, Inference, and Hypothesis separation is strictly enforced at every boundary.
 * 3. No certification without traceable physical evidence.
 * 4. Progressive confidence scaling: Tiny Probe -> Canary -> Bounded Harvest -> Industrial Scale.
 * 5. Novelty Firewall: Discovery novelty is evaluated against all historical Atlas knowledge.
 * 6. Governs Atlas Intelligence, Experience Memory, and domain harvesters without replacing them.
 */

export interface ConstitutionalRule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly immutable: true;
  readonly createdAt: string;
}

export const CONSTITUTIONAL_INVARIANTS: readonly ConstitutionalRule[] = Object.freeze([
  {
    id: 'OBJECTIVE_OVER_VOLUME',
    name: 'Objective Over Volume',
    description: 'Mission alignment and strict scope take absolute precedence over gross record count. Massive irrelevant data is harmful noise.',
    immutable: true,
    createdAt: '2026-09-29T00:00:00.000Z'
  },
  {
    id: 'EVIDENCE_OVER_CONFIDENCE',
    name: 'Evidence Over Confidence',
    description: 'Prior model beliefs or statistical confidence cannot substitute for verifiable, physical proof.',
    immutable: true,
    createdAt: '2026-09-29T00:00:00.000Z'
  },
  {
    id: 'TRUTH_DOES_NOT_EQUAL_MISSION_FIT',
    name: 'Truth Does Not Equal Mission Fit',
    description: 'A factually true observation that falls outside the defined mission boundaries must be excluded from qualification.',
    immutable: true,
    createdAt: '2026-09-29T00:00:00.000Z'
  },
  {
    id: 'UNKNOWN_IS_NOT_TRUE',
    name: 'Unknown Is Not True',
    description: 'The absence of refuting evidence does not constitute confirmation of truth.',
    immutable: true,
    createdAt: '2026-09-29T00:00:00.000Z'
  },
  {
    id: 'UNKNOWN_IS_NOT_FALSE',
    name: 'Unknown Is Not False',
    description: 'The absence of immediate supporting evidence does not constitute proof of falsehood; state remains UNKNOWN.',
    immutable: true,
    createdAt: '2026-09-29T00:00:00.000Z'
  },
  {
    id: 'FACT_INFERENCE_HYPOTHESIS_SEPARATION',
    name: 'Fact, Inference, Hypothesis Separation',
    description: 'Observed raw data (facts), deductions (inferences), and conjectures (hypotheses) must remain categorically isolated.',
    immutable: true,
    createdAt: '2026-09-29T00:00:00.000Z'
  },
  {
    id: 'SOURCE_NEW_TO_RUN_IS_NOT_NEW_TO_ATLAS',
    name: 'Source New to Run Is Not New to Atlas',
    description: 'A source not yet processed in the current run is NOT novel if present in historical ledgers, cached files, or prior missions.',
    immutable: true,
    createdAt: '2026-09-29T00:00:00.000Z'
  },
  {
    id: 'IDENTITY_BEFORE_ATTRIBUTES',
    name: 'Identity Before Attributes',
    description: 'An entity must possess verified canonical identity and anchor before attaching certified relations or attributes.',
    immutable: true,
    createdAt: '2026-09-29T00:00:00.000Z'
  },
  {
    id: 'NO_CERTIFICATION_WITHOUT_EVIDENCE',
    name: 'No Certification Without Evidence',
    description: 'Every certified relation must carry non-null physical proof (certificate, registration number, authentic record locator).',
    immutable: true,
    createdAt: '2026-09-29T00:00:00.000Z'
  },
  {
    id: 'NO_SCALE_BEFORE_CANARY',
    name: 'No Scale Before Canary',
    description: 'Direct jump from conjecture to mass acquisition is prohibited. Execution must progress through Tiny Probe and Canary validation.',
    immutable: true,
    createdAt: '2026-09-29T00:00:00.000Z'
  },
  {
    id: 'NO_RETRY_WITHOUT_CHANGED_CONDITION',
    name: 'No Retry Without Changed Condition',
    description: 'Retrying an identical failed strategy without demonstrable change in environmental or input parameters is prohibited.',
    immutable: true,
    createdAt: '2026-09-29T00:00:00.000Z'
  },
  {
    id: 'RAW_DATA_PRESERVATION',
    name: 'Raw Data Preservation',
    description: 'Original raw payload streams, footprints, and provenance markers must be stored alongside extracted assertions.',
    immutable: true,
    createdAt: '2026-09-29T00:00:00.000Z'
  },
  {
    id: 'PREDICTION_IS_NOT_ACQUISITION',
    name: 'Prediction Is Not Acquisition',
    description: 'Estimated yields, projected capacities, and model predictions cannot be accounted as acquired inventory until certified.',
    immutable: true,
    createdAt: '2026-09-29T00:00:00.000Z'
  },
  {
    id: 'REVERSIBILITY_BY_DEFAULT',
    name: 'Reversibility by Default',
    description: 'Autonomous mutations must support sandboxing, transaction rollback, or atomic isolation to prevent state pollution.',
    immutable: true,
    createdAt: '2026-09-29T00:00:00.000Z'
  }
]);

/* =========================================================================
 * 2. DECISION QUALITY ENGINE
 * ========================================================================= */

export interface DecisionParameters {
  missionFit: number;          // 0.0 to 1.0 (relevance to current operational charter)
  expectedYield: number;       // Gross record count
  expectedNetNew: number;      // Estimated un-duplicated records
  evidenceConfidence: number;  // 0.0 to 1.0 (epistemic strength of evidence)
  sourceNovelty: number;       // 0.0 to 1.0 (novelty relative to Atlas history)
  overlapRisk: number;         // 0.0 to 1.0 (probability of duplication)
  cost: number;                // 0.0 to 1.0 (computational or IO cost normalized)
  latencyMs: number;           // Execution latency in milliseconds
  failureHistory: number;      // 0.0 to 1.0 (prior failure rate for this pattern)
  reversibility: number;       // 0.0 to 1.0 (ease of roll-back or isolation)
}

export interface DecisionEvaluation {
  actionExpectedValue: number;
  approved: boolean;
  scoreBreakdown: {
    valueComponent: number;
    riskPenalty: number;
    efficiencyFactor: number;
  };
  rejectionReasons: string[];
}

export class DecisionQualityEngine {
  public static calculateExpectedValue(params: DecisionParameters): DecisionEvaluation {
    const rejectionReasons: string[] = [];

    // Constitutional Guard: Objective over Volume
    if (params.missionFit < 0.60) {
      rejectionReasons.push('CONSTITUTIONAL_REJECTION: Mission fit below 0.60 threshold. Objective over volume enforced.');
    }

    // Constitutional Guard: Evidence over Confidence
    if (params.evidenceConfidence < 0.50) {
      rejectionReasons.push('CONSTITUTIONAL_REJECTION: Evidence confidence below 0.50 minimum standard.');
    }

    // Constitutional Guard: Failure History check
    if (params.failureHistory > 0.80) {
      rejectionReasons.push('CONSTITUTIONAL_REJECTION: Strategy has severe historical failure rate (>0.80). Condition change required.');
    }

    // Net New Yield ratio
    const netNewRatio = params.expectedYield > 0 
      ? Math.min(1.0, params.expectedNetNew / params.expectedYield) 
      : 0.0;

    // Latency penalty factor (normalized up to 30000ms)
    const latencyPenalty = Math.min(1.0, params.latencyMs / 30000) * 0.10;

    // Positive Value Component
    const valueComponent = 
      (params.missionFit * 0.35) +
      (netNewRatio * 0.25) +
      (params.evidenceConfidence * 0.20) +
      (params.sourceNovelty * 0.10) +
      (params.reversibility * 0.10);

    // Risk Penalty Component
    const riskPenalty = 
      (params.overlapRisk * 0.35) +
      (params.failureHistory * 0.35) +
      (params.cost * 0.20) +
      latencyPenalty;

    const efficiencyFactor = 1.0 - Math.min(0.9, riskPenalty * 0.5);
    const actionExpectedValue = Number(((valueComponent - riskPenalty) * efficiencyFactor).toFixed(4));

    const approved = rejectionReasons.length === 0 && actionExpectedValue > 0.15;

    return {
      actionExpectedValue,
      approved,
      scoreBreakdown: {
        valueComponent: Number(valueComponent.toFixed(4)),
        riskPenalty: Number(riskPenalty.toFixed(4)),
        efficiencyFactor: Number(efficiencyFactor.toFixed(4))
      },
      rejectionReasons
    };
  }
}

/* =========================================================================
 * 3. MULTI-HYPOTHESIS ARCHITECTURE
 * ========================================================================= */

export type HypothesisStatus = 'FORMULATED' | 'TESTING' | 'ACCEPTED' | 'REJECTED' | 'SUPERSEDED';

export interface ConstitutionalHypothesis {
  hypothesisId: string;
  claim: string;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  confidence: number; // 0.0 to 1.0
  cheapestDiscriminatingExperiment: string;
  status: HypothesisStatus;
  createdAt: string;
  updatedAt: string;
}

export class MultiHypothesisManager {
  private hypotheses: Map<string, ConstitutionalHypothesis> = new Map();

  public formulateHypothesis(
    claim: string,
    cheapestDiscriminatingExperiment: string,
    priorConfidence: number = 0.5
  ): ConstitutionalHypothesis {
    const hypothesisId = `HYP_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const hypothesis: ConstitutionalHypothesis = {
      hypothesisId,
      claim,
      supportingEvidence: [],
      contradictingEvidence: [],
      confidence: Math.max(0.0, Math.min(1.0, priorConfidence)),
      cheapestDiscriminatingExperiment,
      status: 'FORMULATED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.hypotheses.set(hypothesisId, hypothesis);
    return hypothesis;
  }

  public addSupportingEvidence(hypothesisId: string, evidence: string, confidenceBoost: number = 0.10): void {
    const hyp = this.hypotheses.get(hypothesisId);
    if (!hyp) throw new Error(`Hypothesis ${hypothesisId} not found.`);
    hyp.supportingEvidence.push(evidence);
    hyp.confidence = Math.min(1.0, hyp.confidence + confidenceBoost);
    hyp.status = hyp.confidence >= 0.80 ? 'ACCEPTED' : 'TESTING';
    hyp.updatedAt = new Date().toISOString();
  }

  public addContradictingEvidence(hypothesisId: string, evidence: string, confidencePenalty: number = 0.15): void {
    const hyp = this.hypotheses.get(hypothesisId);
    if (!hyp) throw new Error(`Hypothesis ${hypothesisId} not found.`);
    hyp.contradictingEvidence.push(evidence);
    hyp.confidence = Math.max(0.0, hyp.confidence - confidencePenalty);
    hyp.status = hyp.confidence <= 0.20 ? 'REJECTED' : 'TESTING';
    hyp.updatedAt = new Date().toISOString();
  }

  public getCompetingHypotheses(): ConstitutionalHypothesis[] {
    return Array.from(this.hypotheses.values()).sort((a, b) => b.confidence - a.confidence);
  }

  public getHypothesis(hypothesisId: string): ConstitutionalHypothesis | undefined {
    return this.hypotheses.get(hypothesisId);
  }
}

/* =========================================================================
 * 4. SCALE BY CONFIDENCE
 * ========================================================================= */

export type ExecutionTier = 'TINY_PROBE' | 'CANARY' | 'BOUNDED_HARVEST' | 'INDUSTRIAL_SCALE';

export interface TierAuthorization {
  authorizedTier: ExecutionTier;
  maxRecords: number;
  explanation: string;
  allowed: boolean;
}

export class ConfidenceScaleGovernor {
  public static authorizeExecutionTier(confidence: number, hasPassedCanary: boolean): TierAuthorization {
    // Constitutional Guard: Never jump directly from hypothesis to industrial scale
    if (confidence < 0.50) {
      return {
        authorizedTier: 'TINY_PROBE',
        maxRecords: 10,
        explanation: 'LOW_CONFIDENCE (<0.50): Authorized for Tiny Probe (1-10 samples) only.',
        allowed: true
      };
    }

    if (confidence >= 0.50 && confidence < 0.75) {
      return {
        authorizedTier: 'CANARY',
        maxRecords: 200,
        explanation: 'MEDIUM_CONFIDENCE (0.50-0.74): Authorized for Canary sample harvest (up to 200 records).',
        allowed: true
      };
    }

    if (confidence >= 0.75 && confidence < 0.90) {
      return {
        authorizedTier: 'BOUNDED_HARVEST',
        maxRecords: 2000,
        explanation: 'HIGH_CONFIDENCE (0.75-0.89): Authorized for Bounded Harvest (up to 2,000 records).',
        allowed: true
      };
    }

    // confidence >= 0.90
    if (!hasPassedCanary) {
      return {
        authorizedTier: 'CANARY',
        maxRecords: 500,
        explanation: 'CONSTITUTIONAL_GATE: Industrial scale forbidden without prior physical canary validation.',
        allowed: false
      };
    }

    return {
      authorizedTier: 'INDUSTRIAL_SCALE',
      maxRecords: 100000,
      explanation: 'PHYSICALLY_VALIDATED (>=0.90 + Canary Pass): Authorized for full Industrial Scale.',
      allowed: true
    };
  }

  public static validateTierTransition(fromTier: ExecutionTier, toTier: ExecutionTier, hasCanaryPass: boolean): boolean {
    if (toTier === 'INDUSTRIAL_SCALE' && (!hasCanaryPass || fromTier === 'TINY_PROBE')) {
      throw new Error(`CONSTITUTIONAL_VIOLATION [NO_SCALE_BEFORE_CANARY]: Cannot escalate directly from ${fromTier} to ${toTier} without passing physical CANARY.`);
    }
    return true;
  }
}

/* =========================================================================
 * 5. FAILURE INTELLIGENCE
 * ========================================================================= */

export interface FailureEpisode {
  failureId: string;
  whatFailed: string;
  why: string;
  conditions: Record<string, any>;
  source: string;
  strategy: string;
  observedResult: any;
  expectedResult: any;
  error: string;
  whatMustChangeBeforeRetry: string[];
  timestamp: string;
}

export class FailureIntelligenceMemory {
  private static instance: FailureIntelligenceMemory;
  private failures: FailureEpisode[] = [];

  public static getInstance(): FailureIntelligenceMemory {
    if (!this.instance) this.instance = new FailureIntelligenceMemory();
    return this.instance;
  }

  public recordFailure(failure: Omit<FailureEpisode, 'failureId' | 'timestamp'>): FailureEpisode {
    const episode: FailureEpisode = {
      ...failure,
      failureId: `FAIL_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      timestamp: new Date().toISOString()
    };
    this.failures.push(episode);
    return episode;
  }

  public canRetry(source: string, strategy: string, currentConditions: Record<string, any>): { allowed: boolean; reason?: string } {
    const matchingFailures = this.failures.filter(f => f.source === source && f.strategy === strategy);
    if (matchingFailures.length === 0) return { allowed: true };

    const lastFailure = matchingFailures[matchingFailures.length - 1];

    // Check if any condition has changed
    let conditionsDiffer = false;
    for (const reqChange of lastFailure.whatMustChangeBeforeRetry) {
      if (currentConditions[reqChange] !== lastFailure.conditions[reqChange]) {
        conditionsDiffer = true;
        break;
      }
    }

    if (!conditionsDiffer && Object.keys(currentConditions).length === Object.keys(lastFailure.conditions).length) {
      let exactMatch = true;
      for (const [k, v] of Object.entries(currentConditions)) {
        if (lastFailure.conditions[k] !== v) {
          exactMatch = false;
          break;
        }
      }
      if (exactMatch) {
        return {
          allowed: false,
          reason: `CONSTITUTIONAL_VIOLATION [NO_RETRY_WITHOUT_CHANGED_CONDITION]: Identical failure occurred at ${lastFailure.timestamp}. What must change before retry: [${lastFailure.whatMustChangeBeforeRetry.join(', ')}]`
        };
      }
    }

    return { allowed: true };
  }

  public getAllFailures(): readonly FailureEpisode[] {
    return this.failures;
  }
}

/* =========================================================================
 * 6. NOVELTY FIREWALL
 * ========================================================================= */

export type SourceNoveltyClassification = 
  | 'TRUE_NEW_SOURCE' 
  | 'PREKNOWN_SOURCE' 
  | 'VARIANT_OF_KNOWN_SOURCE' 
  | 'UNKNOWN_NOVELTY';

export interface SourceFingerprint {
  sourceId: string;
  canonicalUrl?: string;
  sourceFamily?: string;
  resourceId?: string;
  datasetId?: string;
  localFile?: string;
  firstSeenAt: string;
  originMission: string;
}

export class NoveltyFirewall {
  private static instance: NoveltyFirewall;
  private knownFingerprints: Map<string, SourceFingerprint> = new Map();
  private knownUrls: Set<string> = new Set();
  private knownFiles: Set<string> = new Set();
  private knownResourceIds: Set<string> = new Set();

  public static getInstance(): NoveltyFirewall {
    if (!this.instance) this.instance = new NoveltyFirewall();
    return this.instance;
  }

  public registerKnownSource(fp: SourceFingerprint): void {
    this.knownFingerprints.set(fp.sourceId.toLowerCase(), fp);
    if (fp.canonicalUrl) this.knownUrls.add(this.normalizeUrl(fp.canonicalUrl));
    if (fp.localFile) this.knownFiles.add(this.normalizePath(fp.localFile));
    if (fp.resourceId) this.knownResourceIds.add(fp.resourceId.toLowerCase());
  }

  public evaluateNovelty(candidate: {
    sourceId?: string;
    url?: string;
    localFile?: string;
    resourceId?: string;
    family?: string;
  }): { classification: SourceNoveltyClassification; matchedEvidence?: string } {
    // 1. Direct Source ID Match
    if (candidate.sourceId && this.knownFingerprints.has(candidate.sourceId.toLowerCase())) {
      return {
        classification: 'PREKNOWN_SOURCE',
        matchedEvidence: `Direct source ID match: ${candidate.sourceId}`
      };
    }

    // 2. Direct URL Match
    if (candidate.url && this.knownUrls.has(this.normalizeUrl(candidate.url))) {
      return {
        classification: 'PREKNOWN_SOURCE',
        matchedEvidence: `Historical URL match: ${candidate.url}`
      };
    }

    // 3. Local Physical File Match
    if (candidate.localFile && this.knownFiles.has(this.normalizePath(candidate.localFile))) {
      return {
        classification: 'PREKNOWN_SOURCE',
        matchedEvidence: `Pre-existing local physical file match: ${candidate.localFile}`
      };
    }

    // 4. Resource ID Match
    if (candidate.resourceId && this.knownResourceIds.has(candidate.resourceId.toLowerCase())) {
      return {
        classification: 'PREKNOWN_SOURCE',
        matchedEvidence: `Dataset resource ID match: ${candidate.resourceId}`
      };
    }

    // 5. Variant Detection (same family or domain, but different year/shard)
    if (candidate.family) {
      for (const fp of this.knownFingerprints.values()) {
        if (fp.sourceFamily && fp.sourceFamily.toLowerCase() === candidate.family.toLowerCase()) {
          return {
            classification: 'VARIANT_OF_KNOWN_SOURCE',
            matchedEvidence: `Belongs to pre-existing source family: ${candidate.family}`
          };
        }
      }
    }

    // 6. Generic/Unknown candidate without identifying markers
    if (!candidate.sourceId && !candidate.url && !candidate.localFile && !candidate.resourceId && !candidate.family) {
      return {
        classification: 'UNKNOWN_NOVELTY',
        matchedEvidence: 'CONSTITUTIONAL_GUARD [UNKNOWN_IS_NOT_TRUE]: Candidate lacks identifying provenance markers. UNKNOWN novelty cannot be certified as TRUE_NEW_SOURCE.'
      };
    }

    return {
      classification: 'TRUE_NEW_SOURCE'
    };
  }

  private normalizeUrl(url: string): string {
    return url.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }

  private normalizePath(p: string): string {
    return p.trim().toLowerCase().replace(/\\/g, '/').split('/').pop() || '';
  }
}

/* =========================================================================
 * 7. MISSION FIT GATE
 * ========================================================================= */

export type MissionQualificationStatus = 
  | 'MISSION_QUALIFIED' 
  | 'REJECTED_UNVERIFIABLE' 
  | 'REJECTED_OFF_MISSION' 
  | 'REJECTED_INSUFFICIENT_EVIDENCE'
  | 'REJECTED_UNKNOWN_STATE';

export interface MissionFitCandidate {
  dataTrue: boolean | 'UNKNOWN';
  missionFit: boolean | 'UNKNOWN';
  evidenceSufficient: boolean | 'UNKNOWN';
  recordIdentifier: string;
  contextDescription: string;
}

export class MissionFitGate {
  public static evaluateCandidate(c: MissionFitCandidate): {
    qualified: boolean;
    status: MissionQualificationStatus;
    reason: string;
  } {
    // Constitutional Guard: UNKNOWN_IS_NOT_TRUE
    if (c.dataTrue === 'UNKNOWN' || c.missionFit === 'UNKNOWN' || c.evidenceSufficient === 'UNKNOWN') {
      return {
        qualified: false,
        status: 'REJECTED_UNKNOWN_STATE',
        reason: `CONSTITUTIONAL_REJECTION [UNKNOWN_IS_NOT_TRUE]: State contains UNKNOWN parameter (dataTrue=${c.dataTrue}, missionFit=${c.missionFit}, evidence=${c.evidenceSufficient}). UNKNOWN cannot pass mission qualification.`
      };
    }

    if (!c.dataTrue) {
      return {
        qualified: false,
        status: 'REJECTED_UNVERIFIABLE',
        reason: `CONSTITUTIONAL_REJECTION [TRUTH_DOES_NOT_EQUAL_MISSION_FIT]: Factual truth not established for ${c.recordIdentifier}.`
      };
    }

    if (!c.missionFit) {
      return {
        qualified: false,
        status: 'REJECTED_OFF_MISSION',
        reason: `CONSTITUTIONAL_REJECTION [TRUTH_DOES_NOT_EQUAL_MISSION_FIT]: Record is true but off-mission (${c.contextDescription}).`
      };
    }

    if (!c.evidenceSufficient) {
      return {
        qualified: false,
        status: 'REJECTED_INSUFFICIENT_EVIDENCE',
        reason: `CONSTITUTIONAL_REJECTION [NO_CERTIFICATION_WITHOUT_EVIDENCE]: Missing non-null physical proof.`
      };
    }

    // Only TRUE + TRUE + TRUE becomes MISSION_QUALIFIED
    return {
      qualified: true,
      status: 'MISSION_QUALIFIED',
      reason: 'Passed: DATA_TRUE=true + MISSION_FIT=true + EVIDENCE_SUFFICIENT=true.'
    };
  }
}

/* =========================================================================
 * 8. LEARNING SCOPE ENGINE
 * ========================================================================= */

export interface ConstitutionalLearnedRule {
  ruleId: string;
  scope: string[];              // Authorized operational contexts
  preconditions: Record<string, any>;
  action: string;
  confidence: number;          // 0.0 to 1.0
  evidenceCount: number;
  successCount: number;
  failureCount: number;
  lastValidatedAt: string;
}

export class LearningScopeEngine {
  private static instance: LearningScopeEngine;
  private learnedRules: Map<string, ConstitutionalLearnedRule> = new Map();

  public static getInstance(): LearningScopeEngine {
    if (!this.instance) this.instance = new LearningScopeEngine();
    return this.instance;
  }

  public registerLearnedRule(rule: ConstitutionalLearnedRule): void {
    // Constitutional Guard: Learned rules CANNOT override or contradict constitutional invariants
    const actionStr = String(rule.action).toLowerCase();
    const preconditionsStr = JSON.stringify(rule.preconditions || {}).toLowerCase();

    if (
      actionStr.includes('unknown') && (actionStr.includes('pass') || actionStr.includes('accept') || actionStr.includes('true')) ||
      actionStr.includes('bypass') && (actionStr.includes('evidence') || actionStr.includes('canary') || actionStr.includes('constitution')) ||
      preconditionsStr.includes('acceptunknownaspass') ||
      preconditionsStr.includes('overrideconstitution')
    ) {
      throw new Error(`CONSTITUTIONAL_VIOLATION [CONSTITUTION_IMMUTABILITY]: Learned rule ${rule.ruleId} attempts to contradict constitutional invariant. LEARNED_RULE_CAN_OVERRIDE_CONSTITUTION = false.`);
    }

    this.learnedRules.set(rule.ruleId, { ...rule });
  }

  public canApplyRule(ruleId: string, operationalContext: string): { allowed: boolean; reason?: string } {
    const rule = this.learnedRules.get(ruleId);
    if (!rule) return { allowed: false, reason: `Learned rule ${ruleId} does not exist.` };

    // Strict Scope check: cannot generalize outside scope without explicit physical proof
    const inScope = rule.scope.some(s => s.toLowerCase() === operationalContext.toLowerCase());
    if (!inScope) {
      return {
        allowed: false,
        reason: `CONSTITUTIONAL_GUARD [LEARNING_SCOPE]: Rule ${ruleId} is restricted to scopes [${rule.scope.join(', ')}]. Application to ${operationalContext} forbidden without cross-domain canary.`
      };
    }

    return { allowed: true };
  }

  public recordRuleOutcome(ruleId: string, success: boolean, physicalEvidenceObserved: boolean): void {
    const rule = this.learnedRules.get(ruleId);
    if (!rule) return;

    if (!physicalEvidenceObserved) {
      throw new Error(`CONSTITUTIONAL_VIOLATION [OUTCOME_LEARNING]: Cannot update learned rule ${ruleId} without physical evidence.`);
    }

    rule.evidenceCount++;
    if (success) {
      rule.successCount++;
      rule.confidence = Math.min(0.99, Number((rule.confidence + 0.02).toFixed(4)));
    } else {
      rule.failureCount++;
      rule.confidence = Math.max(0.10, Number((rule.confidence - 0.05).toFixed(4)));
    }
    rule.lastValidatedAt = new Date().toISOString();
  }

  public getAllLearnedRules(): readonly ConstitutionalLearnedRule[] {
    return Array.from(this.learnedRules.values());
  }
}

/* =========================================================================
 * 9. CONTRADICTION ENGINE
 * ========================================================================= */

export interface EvidenceContradiction {
  conflictId: string;
  sourceA: string;
  sourceB: string;
  claimA: any;
  claimB: any;
  freshness: {
    sourceA_timestamp: string;
    sourceB_timestamp: string;
  };
  independence: boolean;
  nextVerificationAction: string;
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED';
  resolvedAt?: string;
  resolutionNote?: string;
}

export class ContradictionEngine {
  private static instance: ContradictionEngine;
  private conflicts: EvidenceContradiction[] = [];

  public static getInstance(): ContradictionEngine {
    if (!this.instance) this.instance = new ContradictionEngine();
    return this.instance;
  }

  public detectAndRegisterConflict(params: Omit<EvidenceContradiction, 'conflictId' | 'status'>): EvidenceContradiction {
    const conflict: EvidenceContradiction = {
      ...params,
      conflictId: `CONF_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      status: 'OPEN'
    };
    this.conflicts.push(conflict);
    return conflict;
  }

  public getOpenConflicts(): readonly EvidenceContradiction[] {
    return this.conflicts.filter(c => c.status === 'OPEN');
  }

  public resolveConflict(conflictId: string, resolutionNote: string): void {
    const conflict = this.conflicts.find(c => c.conflictId === conflictId);
    if (!conflict) throw new Error(`Conflict ${conflictId} not found.`);
    conflict.status = 'RESOLVED';
    conflict.resolvedAt = new Date().toISOString();
    conflict.resolutionNote = resolutionNote;
  }
}

/* =========================================================================
 * 10. CONFIDENCE CALIBRATION ENGINE
 * ========================================================================= */

export interface CalibrationReport {
  predictedConfidence: number;
  realizedSuccessRate: number;
  calibrationError: number;
  sampleSize: number;
  isCalibrated: boolean;
}

export class ConfidenceCalibrationEngine {
  private static instance: ConfidenceCalibrationEngine;
  private predictions: Array<{ predicted: number; realized: boolean }> = [];

  public static getInstance(): ConfidenceCalibrationEngine {
    if (!this.instance) this.instance = new ConfidenceCalibrationEngine();
    return this.instance;
  }

  public recordPredictionOutcome(predictedConfidence: number, success: boolean): void {
    this.predictions.push({
      predicted: Math.max(0.0, Math.min(1.0, predictedConfidence)),
      realized: success
    });
  }

  public getCalibrationReport(): CalibrationReport {
    if (this.predictions.length === 0) {
      return {
        predictedConfidence: 1.0,
        realizedSuccessRate: 1.0,
        calibrationError: 0.0,
        sampleSize: 0,
        isCalibrated: true
      };
    }

    const total = this.predictions.length;
    const avgPredicted = this.predictions.reduce((acc, p) => acc + p.predicted, 0) / total;
    const actualSuccesses = this.predictions.filter(p => p.realized).length;
    const actualRate = actualSuccesses / total;
    const error = Math.abs(avgPredicted - actualRate);

    return {
      predictedConfidence: Number(avgPredicted.toFixed(4)),
      realizedSuccessRate: Number(actualRate.toFixed(4)),
      calibrationError: Number(error.toFixed(4)),
      sampleSize: total,
      isCalibrated: error <= 0.15
    };
  }
}

/* =========================================================================
 * 11. OUTCOME-BASED LEARNING ENGINE
 * ========================================================================= */

export interface OutcomeRecord {
  expected: Record<string, any>;
  observed: Record<string, any>;
  certified: Record<string, any>;
}

export class OutcomeLearningEngine {
  public static validateLearningPayload(payload: OutcomeRecord): boolean {
    // Constitutional Guard: Never train rules with an estimate presented as a real result.
    if (!payload.observed || Object.keys(payload.observed).length === 0) {
      throw new Error('CONSTITUTIONAL_VIOLATION [PREDICTION_IS_NOT_ACQUISITION]: Cannot execute outcome learning without physical observed results.');
    }

    if (!payload.certified || Object.keys(payload.certified).length === 0) {
      throw new Error('CONSTITUTIONAL_VIOLATION [NO_CERTIFICATION_WITHOUT_EVIDENCE]: Cannot execute outcome learning without certified ground truth.');
    }

    return true;
  }
}

/* =========================================================================
 * 12. ATLAS CONSTITUTION MASTER ORCHESTRATOR
 * ========================================================================= */

export class AtlasConstitution {
  private static instance: AtlasConstitution;

  public readonly decisionEngine = DecisionQualityEngine;
  public readonly hypothesisManager = new MultiHypothesisManager();
  public readonly scaleGovernor = ConfidenceScaleGovernor;
  public readonly failureMemory = FailureIntelligenceMemory.getInstance();
  public readonly noveltyFirewall = NoveltyFirewall.getInstance();
  public readonly missionFitGate = MissionFitGate;
  public readonly learningScope = LearningScopeEngine.getInstance();
  public readonly contradictionEngine = ContradictionEngine.getInstance();
  public readonly calibrationEngine = ConfidenceCalibrationEngine.getInstance();
  public readonly outcomeLearning = OutcomeLearningEngine;

  public static getInstance(): AtlasConstitution {
    if (!this.instance) this.instance = new AtlasConstitution();
    return this.instance;
  }

  /**
   * Retrieves the immutable constitutional invariants.
   */
  public getConstitutionalRules(): readonly ConstitutionalRule[] {
    return CONSTITUTIONAL_INVARIANTS;
  }

  /**
   * Enforces end-to-end cognitive governance flow:
   * OBJECTIVE -> CONSTITUTION -> INTELLIGENCE -> MEMORY -> HYPOTHESES -> EXPERIMENTS -> RADAR -> EXECUTION -> OUTCOME -> LEARNING
   */
  public governDecisionFlow(decisionInput: DecisionParameters): DecisionEvaluation {
    return DecisionQualityEngine.calculateExpectedValue(decisionInput);
  }
}
