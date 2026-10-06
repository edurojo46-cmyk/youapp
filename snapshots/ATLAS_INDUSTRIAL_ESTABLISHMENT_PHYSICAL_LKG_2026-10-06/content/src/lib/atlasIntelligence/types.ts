/**
 * ATLAS — INTELLIGENCE LAYER V1
 * Architecture Types & Contract Definitions
 * 
 * Accumulative Self-Improving Operational Reasoning:
 * - Experience Memory: Structured recording of strategic decisions and outcomes
 * - Meta-Rule Engine: Induction of generalized, non-site-specific operational rules
 * - Hypothesis Engine: Multi-hypothesis generation with competing test plans
 * - Experimentation Engine: Physical canary / probe comparison and evidence-based promotion
 * - AI Escalation Policy: Autonomous decision execution vs escalation for genuine novelty
 * - Self-Challenge: Continuous degradation detection and confidence calibration
 */

export type DomainCategory = 
  | 'ACADEMIC_INSTITUTION' 
  | 'MUNICIPAL_GOVERNMENT' 
  | 'HEALTH_CLINICAL' 
  | 'PUBLIC_REGISTRY' 
  | 'PROFESSIONAL_COUNCIL' 
  | 'PUBLIC_PROCUREMENT'
  | 'GENERAL_PUBLIC';

export interface OperationalExperience {
  experienceId: string;
  timestamp: string;
  situation: string;
  context: {
    sector: string;
    domainType: DomainCategory;
    depthAvailable: boolean;
    surfaceCollisionRisk: number;
    entityScaleEstimate: number;
  };
  hypothesis: string;
  action: string;
  expectedOutcome: {
    expectedYield: number;
    expectedOverlap: number;
  };
  physicalOutcome: {
    pagesProbed: number;
    contactsExtracted: number;
    uniqueContacts: number;
    globalOverlap: number;
    trueNetNewYield: number;
    overlapRate: number;
    latencyMs: number;
    errorsCount: number;
  };
  success: boolean;
  lesson: string;
  tags: string[];
}

export interface GeneralizedMetaRule {
  ruleId: string;
  name: string;
  context: string;
  preconditions: {
    surfaceCollisionAbove?: number;
    structuredDepthAvailable?: boolean;
    accountingModelStrict?: boolean;
    entityScaleAbove?: number;
    unverifiedLegacyEstimate?: boolean;
    metaIndexDiscovered?: boolean;
  };
  action: string;
  confidence: number; // 0.0 to 1.0
  evidenceCount: number;
  successRate: number;
  failureCases: number;
  lastValidated: string;
  generalizationScope: string[]; // Cross-sector transferability
  active: boolean;
}

export interface OperationalHypothesis {
  hypothesisId: string;
  description: string;
  predictedAction: string;
  priorConfidence: number;
  rationale: string;
  testPlan: {
    probeUrl: string;
    protocol: string;
    maxPages: number;
  };
}

export interface PhysicalExperimentResult {
  experimentId: string;
  hypothesisId: string;
  targetUrl: string;
  pagesSampled: number;
  rawContacts: number;
  uniqueContacts: number;
  globalOverlap: number;
  trueNetNew: number;
  overlapRate: number;
  netNewRatio: number;
  verifiedImprovement: boolean;
  notes: string;
}

export interface AutonomousDecision {
  decisionId: string;
  situation: string;
  matchedRuleId: string | null;
  ruleConfidence: number;
  escalatedToAi: boolean;
  escalationReason?: string;
  chosenAction: string;
  competingHypothesesCount: number;
  timestamp: string;
}

export interface IntelligenceLayerMetrics {
  EXPERIENCES_STORED: number;
  GENERALIZED_RULES_CREATED: number;
  RULES_PHYSICALLY_VALIDATED: number;

  HYPOTHESES_GENERATED: number;
  PHYSICAL_EXPERIMENTS_RUN: number;

  DECISIONS_WITHOUT_AI: number;
  DECISIONS_ESCALATED_TO_AI: number;
  AI_CALL_AVOIDANCE_RATE: string;

  LEARNED_STRATEGIES_PROMOTED: number;
  FAILED_STRATEGIES_REMEMBERED: number;
  SELF_CHALLENGES_TRIGGERED: number;

  FIRST_GENERALIZED_RULE: string;
  FIRST_RULE_CONFIDENCE: string;
  FIRST_REUSE_WITHOUT_AI: string;
  PHYSICAL_IMPROVEMENT_OBSERVED: string;

  ATLAS_INTELLIGENCE_LAYER_READY: boolean;
  FINAL_STATUS: string;
}
