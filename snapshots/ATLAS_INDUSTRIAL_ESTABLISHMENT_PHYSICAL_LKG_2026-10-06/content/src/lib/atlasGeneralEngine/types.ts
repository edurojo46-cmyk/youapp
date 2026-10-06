/**
 * ATLAS GENERAL OBJECTIVE INTELLIGENCE ENGINE V1
 * Core Type Definitions & Contract Invariants
 * 
 * Strict Isolation Invariants:
 * - NO_SHARED_SPECIALIZED_INDEXES = TRUE
 * - NO_SHARED_SPECIALIZED_RANKING = TRUE
 * - DUPLICATE_PERSON_AUTHORITY_CREATED = FALSE
 * - NO_CIRCULAR_ENGINE_DEPENDENCIES = TRUE
 */

export type ObjectiveType =
  | 'EXPERT_DISCOVERY'
  | 'ORGANIZATION_DISCOVERY'
  | 'SOURCE_DISCOVERY'
  | 'PUBLIC_CONTACT_DISCOVERY'
  | 'CONTENT_DISCOVERY'
  | 'GENERAL_AUTONOMOUS_OBJECTIVE';

export type TargetEntityType =
  | 'PERSON'
  | 'ORGANIZATION'
  | 'COMPANY'
  | 'PROJECT'
  | 'RELATIONSHIP'
  | 'EVENT'
  | 'DOCUMENT'
  | 'LOCATION'
  | 'PRODUCT'
  | 'TECHNOLOGY'
  | 'SOFTWARE'
  | 'SERVICE'
  | 'DATASET'
  | 'CONTACT'
  | 'PUBLIC_SOURCE'
  | 'CONTACT_CHANNEL'
  | 'VIDEO_CONTENT'
  | 'COMPOSITE'
  | 'MISSION_DEFINED_ENTITY_TYPE';

export type QualificationState =
  | 'DISCOVERED'
  | 'VERIFIED'
  | 'MISSION_CANDIDATE'
  | 'MISSION_QUALIFIED'
  | 'REJECTED';

export type CriterionVerdict = 'PASS' | 'FAIL' | 'UNKNOWN';

export interface EvidenceGoal {
  goalId: string;
  criterion: string;
  whatMustBeProven: string;
  verifiableAttributes: string[];
  confidenceThreshold: number;
  status: CriterionVerdict;
}

export type SourceFamilyClass =
  | 'OFFICIAL_REGISTRY'
  | 'GOVERNMENT_PORTAL'
  | 'INSTITUTIONAL_WEBSITE'
  | 'OPEN_DATA_PORTAL'
  | 'ACADEMIC_REPOSITORY'
  | 'MUNICIPAL_PORTAL'
  | 'PROFESSIONAL_COUNCIL'
  | 'BUSINESS_CHAMBER'
  | 'PROCUREMENT_PLATFORM'
  | 'PUBLIC_PROCUREMENT_SYSTEM'
  | 'CUSTOMS_AND_TRADE_REGISTRY'
  | 'PATENT_AND_TRADEMARK_OFFICE'
  | 'UNIVERSITY_TECH_TRANSFER_OFFICE'
  | 'CIVIL_SOCIETY_REGISTRY'
  | 'CULTURAL_SPACES_REGISTRY'
  | 'HEALTHCARE_INSTITUTION_DIRECTORY'
  | 'LOCAL_GOVERNMENT_GAZETTE'
  | 'SCIENTIFIC_BIBLIOGRAPHIC_DATABASE'
  | 'STRUCTURED_FEED'
  | 'SEARCH_DISCOVERED_ECOSYSTEM';

export interface CaseGraphRelation {
  source: string;
  predicate: string;
  target: string;
  temporalIndex?: number;
}

export interface CaseGraph {
  caseEntities: string[];
  caseEvents: string[];
  caseRelations: CaseGraphRelation[];
  temporalOrder: string[];
  finalState: string;
}

export interface SemanticArgumentRoles {
  headEntity: string;
  primaryUnit: TargetEntityType;
  subject: string;
  action?: string;
  object?: string;
  recipient?: string;
  counterpart?: string;
  qualifiers: string[];
  relations: string[];
  geography: string;
  timeScope: string;
  authorityRole?: {
    subjectOwnership?: string;
    fundingSource?: string;
    certifyingAuthority?: string;
    contractingAuthority?: string;
    registryCustodian?: string;
  };
  caseGraph?: CaseGraph;
}

export interface GeneralMissionInterpretation {
  mission: string;
  primaryRecordUnit: TargetEntityType;
  target: number;
  targetMode: 'EXPLICIT_QUANTITY' | 'OPEN_ENDED_EXPLORATION';
  targetDescription: string;
  semanticArguments?: SemanticArgumentRoles;
  caseGraph?: CaseGraph;
  mandatoryCriteria: string[];
  evidenceGoals: string[];
  sourceFamiliesHypothesized: string[];
  whyThoseSourceFamilies: string;
  enginesSelected: string[];
  whyThoseEngines: string;
  currentBottleneck: string;
  currentStrategy: string;
  nextAutonomousAction: string;
  sourceFamilyGapDetected: boolean;
}

export type StrategicBottleneck =
  | 'DISCOVERY'
  | 'SOURCE_QUALITY'
  | 'HARVEST'
  | 'QUALIFICATION'
  | 'DEDUPE'
  | 'SUPPLY'
  | 'PROTOCOL'
  | 'GEOGRAPHIC_COVERAGE'
  | 'SCHEMA'
  | 'NONE';

export interface AutonomousResolverOutput {
  mission: string;
  primaryRecordUnit: TargetEntityType;
  target: number;
  qualifiedAcquired: number;
  remaining: number;
  currentRate: string;
  supportedRemainingSupply: number;
  productiveSourceFamilies: string[];
  productiveEcosystems: number;
  primaryBottleneck: string;
  currentStrategy: string;
  nextAutonomousAction: string;
  missionSuccess: boolean;
  trueFrontierExhaustionProven: boolean;
}

export type NextActionType =
  | 'SEARCH_ATLAS_MEMORY'
  | 'CALL_PEOPLE_SEARCH'
  | 'CALL_VIDEO_SEARCH'
  | 'SEARCH_ORGANIZATIONS'
  | 'DISCOVER_SOURCES'
  | 'EXPAND_SOURCE_GRAPH'
  | 'TEST_HYPOTHESIS'
  | 'FETCH_PUBLIC_RESOURCE'
  | 'VERIFY_ENTITY'
  | 'VERIFY_EVIDENCE'
  | 'COMPARE_STRATEGIES'
  | 'EXPAND_WINNER'
  | 'ABANDON_BRANCH'
  | 'COMPLETE_SUBGOAL'
  | 'FINISH_MISSION'
  | 'TRIGGER_SUPPLY_EXPANSION';

export interface UserObjectiveInput {
  text: string;
  geographyHint?: string;
  targetQuantity?: number;
  timeLimitMs?: number;
  publicDataOnly?: boolean;
}

export interface MissionSpecification {
  missionId: string;
  rawObjective: string;
  objectiveType: ObjectiveType;
  targetEntityType: TargetEntityType;
  geography: string;
  targetQuantity: number;
  domainTopics: string[];
  requiredAttributes: string[];
  optionalAttributes: string[];
  evidenceRequirements: {
    minConfidence: number;
    citationRequired: boolean;
    observationProvenanceRequired: boolean;
  };
  successCriteria: string[];
  noveltyRequirements: {
    allowPreexisting: boolean;
    noveltyTargetRate: number;
  };
  qualityRequirements: {
    verifyPublicAccessibility: boolean;
    verifyEntityLink: boolean;
  };
  constraints: {
    maxTimeMs: number;
    maxCostUsd: number;
    publicDataOnly: boolean;
    noPrivateApis: boolean;
  };
  createdAt: string;
}

export interface SubgoalNode {
  id: string;
  title: string;
  description: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED' | 'FAILED';
  dependencies: string[];
  assignedStrategyId?: string;
  evidenceCollected: any[];
  resultData?: any;
}

export interface StrategyPlan {
  strategyId: string;
  name: string;
  rationale: string;
  engineType: 'PEOPLE_SEARCH' | 'ORGANIZATION_DISCOVERY' | 'SOURCE_DISCOVERY' | 'PUBLIC_CONTACT' | 'VIDEO_SEARCH';
  actionSequence: NextActionType[];
  expectedYield: number;
  confidenceScore: number;
  status: 'PROPOSED' | 'TESTING' | 'ACTIVE' | 'DEPLETED' | 'ABANDONED';
  experimentResults?: {
    sampleTested: number;
    validYield: number;
    successRate: number;
    avgLatencyMs: number;
  };
}

export interface EvidenceRecord {
  evidenceId: string;
  missionId: string;
  subgoalId: string;
  strategyId: string;
  entityKey: string;
  entityType: TargetEntityType;
  evidenceType: 'OBSERVATION' | 'CITATION' | 'AFFILIATION' | 'PUBLIC_REGISTRY' | 'MEDIA_METADATA';
  provenance: {
    sourceId: string;
    sourceUrl?: string;
    observedAt: string;
    rawRecordHash?: string;
  };
  confidence: number;
  verified: boolean;
}

export interface MissionResultItem {
  id: string;
  canonicalKey: string;
  title: string;
  entityType: TargetEntityType;
  primaryDetails: Record<string, any>;
  evidenceBadges: string[];
  evidenceSummary: string;
  specializedEngineOrigin: string;
  missionRelevanceScore: number;
  provenance: Record<string, any>;
}

export interface MissionSuccessEvaluation {
  overallScore: number;
  passed: boolean;
  targetQuantityMet: boolean;
  quantityAchieved: number;
  quantityTarget: number;
  avgRelevance: number;
  avgConfidence: number;
  criteriaScores: Record<string, number>;
  notes: string[];
}

export interface GeneralHeuristic {
  id: string;
  originMissionId: string;
  originMissionClass: ObjectiveType;
  rule: string;
  confidence: number;
  timesApplied: number;
  applicableClasses: ObjectiveType[];
}

export interface MissionExecutionReport {
  missionId: string;
  objectiveType: ObjectiveType;
  rawObjective: string;
  targetQuantity: number;
  initialStrategies: string[];
  strategiesTested: string[];
  observedResultsCount: number;
  replans: number;
  finalStrategy: string;
  missionSuccess: boolean;
  overallScore: number;
  evidenceProvenanceRetained: boolean;
  argentinaLinkageVerified: boolean;
  lessonsLearned: GeneralHeuristic[];
  results: MissionResultItem[];
  evaluation: MissionSuccessEvaluation;
  executionDurationMs: number;
}

