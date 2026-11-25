/**
 * ATLAS — AI PATHFINDER V2
 * Core Types & Contracts (Objective → Mission Ontology → Composable Schema → Multi-Engine Plan → Mission-Qualified Database)
 * 
 * Strict Engine Isolation Invariants:
 * - PEOPLE_SEARCH_ISOLATED = TRUE
 * - VIDEO_SEARCH_ISOLATED = TRUE
 * - DUPLICATE_PERSON_AUTHORITY_CREATED = FALSE
 * - NO_SHARED_SPECIALIZED_RANKING = TRUE
 * - NO_SHARED_SPECIALIZED_INDEX = TRUE
 */

export type PathfinderEntityType =
  | 'PERSON'
  | 'ORGANIZATION'
  | 'COMPANY'
  | 'INSTITUTION'
  | 'CITY'
  | 'LOCALITY'
  | 'JURISDICTION'
  | 'REGION'
  | 'PLACE'
  | 'TECHNOLOGY'
  | 'PRODUCT'
  | 'PROJECT'
  | 'PROGRAM'
  | 'INITIATIVE'
  | 'RELATIONSHIP'
  | 'COLLABORATION'
  | 'EVENT'
  | 'PUBLICATION'
  | 'MEDIA_OUTLET'
  | 'CONTENT_ITEM'
  | 'INFRASTRUCTURE'
  | 'LOGISTICS_NODE'
  | 'CORRIDOR'
  | 'FACILITY'
  | 'CAPABILITY'
  | 'RISK'
  | 'SERVICE'
  | 'CONTACT_CHANNEL'
  | 'DATASET'
  | 'PUBLIC_SOURCE'
  | 'VIDEO_CONTENT'
  | (string & {});

export type PrimaryUnitOfAnalysis = string;

export type RecordLifecycleState =
  | 'ENTITY_DISCOVERED'
  | 'ENTITY_VERIFIED'
  | 'MISSION_CANDIDATE'
  | 'MISSION_QUALIFIED'
  | 'MISSION_REJECTED';

export type CriterionEvaluationStatus = 'PASS' | 'FAIL' | 'UNKNOWN';

export interface CriterionEvaluationResult {
  status: CriterionEvaluationStatus;
  reason?: string;
  evidenceRefs: string[];
}

export type MandatoryCriteriaMatrix = Record<string, CriterionEvaluationResult>;

export interface RelationshipRecord {
  subject: { id: string; type: string; name: string };
  predicate: string;
  object: { id: string; type: string; name: string };
  evidence: string;
  provenance: {
    sourceId: string;
    sourceUrl?: string;
    observedAt: string;
    specializedEngine?: string;
  };
  confidence: number;
  validity: CriterionEvaluationStatus;
}

export interface OntologyNode {
  id: string;
  type: string;
  label: string;
  role: 'PRIMARY_TARGET' | 'SECONDARY_ACTOR' | 'CONTEXT' | 'OUTCOME' | 'RELATION_ENDPOINT';
  attributes: string[];
}

export interface OntologyRelation {
  sourceNodeId: string;
  predicate: string;
  targetNodeId: string;
  isMandatory: boolean;
  sameContextRequired: boolean;
  description: string;
}

export interface MissionOntology {
  ontologyNodes: OntologyNode[];
  ontologyRelations: OntologyRelation[];
  primaryUnitOfAnalysis: PrimaryUnitOfAnalysis;
  secondaryEntityTypes: string[];
  relationTypes: string[];
  attributeTypes: string[];
  evidenceTypes: string[];
  compositeEntityCandidates: string[];
  unknownConcepts: string[];
  ontologyConfidence: number;
  missionDefinedEntityCreated: boolean;
  missionEntityGraph: {
    nodes: OntologyNode[];
    edges: OntologyRelation[];
  };
}

export interface ObjectiveSemanticDecomposition {
  actionRequested: string;
  targetUnit: string;
  qualifyingConditions: string[];
  relationConditions: string[];
  geographicConditions: string[];
  temporalConditions: string[];
  quantity: number;
  evidenceRequirements: string[];
  comparisonDimensions: Array<{ dimensionA: string; dimensionB: string; description: string }>;
  negativeConstraints: string[];
  optionalEnrichment: string[];
}

export interface MandatoryCriterionMapping {
  criterionId: string;
  rawText: string;
  mappedFields: string[];
  mappedRelations: string[];
  requiredEvidence: string[];
  qualificationTest: string;
  isNegativeConstraint: boolean;
}

export interface FourTierCompleteness {
  structuralCompleteness: number; // % of required schema fields populated
  semanticCompleteness: number;   // % of fields with meaningful domain content
  evidenceCompleteness: number;   // % of fields/criteria backed by verifiable provenance
  qualificationCompleteness: number; // % of mandatory criteria evaluating to PASS
}

export type PathfinderAction =
  | 'SEARCH_ATLAS_MEMORY'
  | 'CALL_PEOPLE_SEARCH'
  | 'CALL_VIDEO_SEARCH'
  | 'CALL_ORGANIZATION_DISCOVERY'
  | 'CALL_SOURCE_DISCOVERY'
  | 'CALL_PUBLIC_CONTACT_DISCOVERY'
  | 'CALL_RELATIONSHIP_VERIFICATION'
  | 'EXPAND_GRAPH'
  | 'VERIFY_ENTITY'
  | 'VERIFY_EVIDENCE'
  | 'QUALIFY_MISSION_CANDIDATE'
  | 'ENRICH_RECORD'
  | 'TEST_PATH'
  | 'COMPARE_PATHS'
  | 'EXPAND_WINNER'
  | 'ABANDON_PATH'
  | 'SEARCH_COVERAGE_GAP'
  | 'FINISH_MISSION';

export interface DatabaseFieldDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description: string;
  evidenceRequired: boolean;
  enrichmentAction?: PathfinderAction;
  category?:
    | 'IDENTITY'
    | 'RELATIONSHIP'
    | 'CAPABILITY'
    | 'LOCATION'
    | 'EVIDENCE'
    | 'COMPARISON'
    | 'TIME'
    | 'STATUS'
    | 'PROVENANCE';
  derivedFromCriterion?: string;
}

export interface MissionDatabaseSchema {
  schemaId: string;
  schemaName: string;
  targetEntityType: PathfinderEntityType;
  primaryUnitOfAnalysis?: PrimaryUnitOfAnalysis;
  fields: DatabaseFieldDefinition[];
  primaryKeyField: string;
  canonicalRelationField: string; // e.g. canonical_person_id, cuit, source_id, composite_key
  minEvidenceConfidence: number;
}

export interface MissionSubgoal {
  subgoalId: string;
  description: string;
  targetOntologyType: string;
  requiredFields: string[];
  requiredRelations: string[];
  requiredEvidence: string[];
  engines: string[];
  dependencies: string[];
  successCondition: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED';
}

export interface PathStep {
  stepId: string;
  action: PathfinderAction;
  engine: string;
  inputType: string;
  outputType: string;
  evidenceExpected: string;
}

export interface ObjectiveAnalysis {
  rawObjective: string;
  entityType: PathfinderEntityType;
  primaryUnitOfAnalysis?: PrimaryUnitOfAnalysis;
  qualifyingDefinition: string;
  domainTopics: string[];
  geography: string;
  targetQuantity: number;
  expectedCoverage: string;
  completionDefinition: string;
  schema: MissionDatabaseSchema;
  ontology?: MissionOntology;
  decomposition?: ObjectiveSemanticDecomposition;
  criterionMappings?: MandatoryCriterionMapping[];
  subgoals?: MissionSubgoal[];
}

export interface CompletenessMap {
  fieldCompleteness: Record<string, number>; // field -> percentage (0 - 100)
  overallCompleteness: number; // 0 - 100
  structuralCompleteness: number;
  semanticCompleteness: number;
  evidenceCompleteness: number;
  qualificationCompleteness: number;
  hasDiscoveryGap: boolean;
  hasEnrichmentGap: boolean;
  hasEvidenceGap: boolean;
  hasCoverageGap: boolean;
  hasQualificationGap?: boolean;
  recommendedMode: 'DISCOVERY' | 'ENRICHMENT' | 'EVIDENCE_VALIDATION' | 'COVERAGE_EXPANSION' | 'COMPLETED';
  weakestFields: string[];
}

export interface PathPlan {
  pathId: string;
  name: string;
  family:
    | 'OFFICIAL_REGISTRY'
    | 'PUBLICATIONS'
    | 'EVENTS'
    | 'PROFESSIONAL_COUNCILS'
    | 'OPEN_DATASETS'
    | 'MEDIA'
    | 'INSTITUTIONAL_DIRECTORIES'
    | 'CANONICAL_PEOPLE_SEARCH'
    | 'VIDEO_SEARCH'
    | 'MULTI_ENGINE_PIPELINE'
    | 'RELATIONSHIP_CHAIN'
    | 'LOCATION_CAPABILITY_PIPELINE';
  engineType:
    | 'PEOPLE_SEARCH'
    | 'ORGANIZATION_DISCOVERY'
    | 'SOURCE_DISCOVERY'
    | 'PUBLIC_CONTACT'
    | 'VIDEO_SEARCH'
    | 'MULTI_ENGINE';
  expectedYield: number;
  expectedQuality: number; // 0.0 - 1.0
  expectedNovelty: number; // 0.0 - 1.0
  expectedCost: number; // abstract effort units (1 - 10)
  expectedTime: number; // ms estimate
  evidenceStrength: number; // 0.0 - 1.0
  uncertainty: number; // 0.0 - 1.0
  expansionValue: number; // 0.0 - 1.0
  calculatedPathScore: number;
  status: 'PROPOSED' | 'TESTING' | 'ACTIVE' | 'PROMOTED' | 'DEPLETED' | 'ABANDONED';
  failureReason?: string;
  actionSequence: PathfinderAction[];
  steps?: PathStep[];
  experimentMetrics?: {
    testedSample: number;
    actualYield: number;
    yieldRate: number;
    avgScore: number;
  };
}

export interface PathMarkerState {
  whereAmI: string;
  whatHaveIAlreadySolved: string[];
  whatIsStillMissing: string[];
  whatPathAmIFollowing: string;
  whyAmIFollowingIt: string;
  whatWouldMakeMeAbandonIt: string;
  whatIsTheNextAction: PathfinderAction;
}

export interface DatabaseRecord {
  recordId: string;
  canonicalRelationId: string; // points to specialized engine identity
  data: Record<string, any>;
  evidenceBadges: string[];
  evidenceSummary: string;
  verificationStatus: 'UNVERIFIED' | 'VERIFIED' | 'REJECTED';
  lifecycleState?: RecordLifecycleState;
  mandatoryCriteriaMatrix?: MandatoryCriteriaMatrix;
  relationshipData?: RelationshipRecord[];
  provenance: {
    sourceId: string;
    sourceUrl?: string;
    observedAt: string;
    specializedEngine: string;
  };
  fieldCompletenessScore: number;
  structuralCompletenessScore?: number;
  semanticCompletenessScore?: number;
  evidenceCompletenessScore?: number;
  qualificationCompletenessScore?: number;
}

export interface MissionState {
  missionId: string;
  missionObjective: string;
  targetSchema: MissionDatabaseSchema;
  currentDatabaseSize: number;
  verifiedRecords: number;
  qualifiedRecords?: number;
  unverifiedRecords: number;
  fieldCompleteness: Record<string, number>;
  completenessMap: CompletenessMap;
  coverageGaps: string[];
  evidenceGaps: string[];
  targetRemaining: number;
  activeStrategies: string[];
  failedStrategies: string[];
  nextBestAction: PathfinderAction;
  currentPath: string;
  pathMarker: PathMarkerState;
}

export interface OntologyCandidate {
  id: string;
  className: string;
  parentClass: string;
  definingAttributes: string[];
  evidenceFrequency: number;
  observedInMissions: string[];
  status: 'PROPOSED' | 'VALIDATED' | 'PROMOTED';
}

export interface PathfinderPostmortem {
  missionId: string;
  initialObjective: string;
  databaseCreated: {
    databaseId: string;
    totalRecords: number;
    verifiedRecords: number;
    qualifiedRecords?: number;
    overallCompleteness: number;
    structuralCompleteness?: number;
    semanticCompleteness?: number;
    evidenceCompleteness?: number;
    qualificationCompleteness?: number;
    schema: MissionDatabaseSchema;
    storagePath?: string;
  };
  initialPaths: string[];
  pathsTested: string[];
  winningPaths: string[];
  failedPaths: { pathId: string; reason: string }[];
  status?: 'PASS' | 'PARTIAL' | 'INSUFFICIENT_EVIDENCE' | 'FRONTIER_EXHAUSTED' | 'EXECUTION_NOT_DEMONSTRATED' | 'FAIL';
  replans: number;
  whatAtlasLearned: string[];
  generalLessons: any[];
  targetSpecificLessons: any[];
  crossMissionLessons: any[];
  metrics: {
    pathsGenerated: number;
    pathsPhysicallyTested: number;
    pathsAbandoned: number;
    pathsPromoted: number;
    replans: number;
    nextBestActionDecisions: number;
    memoryReuseEvents: number;
    missionProgressPerAction: number;
    durationMs: number;
    entitiesDiscovered?: number;
    entitiesVerified?: number;
    missionCandidates?: number;
    missionQualifiedRecords?: number;
    missionRejectedRecords?: number;
  };
  telemetry?: MissionTimingTelemetry;
}

export interface MissionTimingTelemetry {
  t0_objective_received: number;
  t_ontology_ready: number;
  t_schema_ready: number;
  t_first_path_started: number;
  t_first_real_candidate: number;
  t_first_entity_verified: number;
  t_first_mission_qualified: number | null;
  t_first_searchable_record: number | null;
  t_target_reached: number;
  time_to_ontology: number;
  time_to_schema: number;
  time_to_first_qualified: number | 'NOT_REACHED';
  time_to_first_searchable_database: number | 'NOT_REACHED';
  time_to_target_qualified: number | 'NOT_REACHED';
}

// ─────────────────────────────────────────────────────────────
// OPEN RETRIEVAL & EVIDENCE-DRIVEN RETRIEVAL PRIMITIVES (V3)
// ─────────────────────────────────────────────────────────────

export type SourceClass =
  | 'OFFICIAL_REGISTRY'
  | 'GOVERNMENT_PORTAL'
  | 'PUBLIC_PROCUREMENT'
  | 'OPEN_DATA'
  | 'INSTITUTIONAL_SITE'
  | 'UNIVERSITY_REPOSITORY'
  | 'RESEARCH_REPOSITORY'
  | 'COMPANY_PUBLIC_SITE'
  | 'PUBLIC_REPORT'
  | 'NEWS_EVIDENCE'
  | 'PUBLIC_PROGRAM'
  | 'PUBLIC_CALL'
  | 'DOCUMENT_REPOSITORY'
  | 'STRUCTURED_API'
  | 'SEARCH_ENGINE_DISCOVERY';

export interface EvidenceGoal {
  id: string;
  statement_to_prove: string;
  subject_role: string;
  predicate: string;
  object_role?: string;
  acceptable_evidence_types: string[];
  preferred_source_classes: SourceClass[];
  verification_test: string;
  derivedFromCriterionId?: string;
}

export interface EvidenceFragment {
  fragmentId: string;
  goalId: string;
  subjectIdentity: string;
  claimOrFact: string;
  fieldValues: Record<string, any>;
  sourceClass: SourceClass;
  sourceUrl?: string;
  sourceId: string;
  confidence: number;
  extractedAt: string;
}

export interface GeneralRetrievalQuery {
  queryId: string;
  queryString: string;
  goalId: string;
  sourceClass: SourceClass;
  expectedFact: string;
  geographyConstraint?: string;
}

export interface GeneralRetrievalPlan {
  planId: string;
  primaryUnit: string;
  evidenceGoals: EvidenceGoal[];
  sourceClasses: SourceClass[];
  queryStrategies: GeneralRetrievalQuery[];
  candidatePaths: PathPlan[];
  sourceDecisions?: any[];
}

