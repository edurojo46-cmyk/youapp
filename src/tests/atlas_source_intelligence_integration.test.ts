/**
 * ATLAS — SOURCE INTELLIGENCE INTEGRATION TEST SUITE
 * Pre-Freeze V3 Architectural Verification (Sections 1 through 10)
 * 
 * Strict Verification Invariants:
 * - NO Blind V2 objectives used (Synthetic domain properties only).
 * - GeneralRetrievalPlanner acts as bridge, NOT parallel source brain.
 * - SourceBrain decides where to search via SourceKnowledgeMap.
 * - Bi-directional learning feeds mission results back to SourceKnowledgeMap.
 * - Ecosystem discovery (One productive page -> Productive source -> Productive family).
 * - Speed loop evaluates qualified yield and manages rotor allocation.
 * - Zero fallback to People Search for mission-defined entities.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AIPathfinder,
  GeneralRetrievalPlanner,
  SourceBrain,
  SourceKnowledgeMap,
  SourceFamilyGapEngine,
  TeslaWheelStream,
  DynamicSchemaDesigner,
  GenericRecordAssembler,
  type EvidenceGoal,
  type SourceClass
} from '../lib/atlasPathfinder/index.ts';

describe('ATLAS — SOURCE INTELLIGENCE INTEGRATION SUITE (PRE-FREEZE V3)', () => {
  beforeEach(() => {
    SourceKnowledgeMap.resetForTest();
    SourceBrain.resetForTest();
    SourceFamilyGapEngine.resetForTest();
  });

  /**
   * TEST 1: Mission-defined entity -> EvidenceGoals -> Source Brain.
   */
  it('TEST 1: Mission-defined entity -> EvidenceGoals -> Source Brain', () => {
    const objective = 'Construir una base de estaciones de telemetria satelital y enlaces terrestres en la Patagonia';
    const analysis = DynamicSchemaDesigner.designSchema(objective, 2, 'Patagonia');

    const generalPlan = GeneralRetrievalPlanner.plan(
      analysis.ontology,
      analysis.criterionMappings || [],
      analysis
    );

    // Verify EvidenceGoals are generated
    expect(generalPlan.evidenceGoals.length).toBeGreaterThan(0);
    expect(generalPlan.primaryUnit).toBe(analysis.primaryUnitOfAnalysis);

    // Verify SourceBrain evaluates goals and produces source decisions
    expect(generalPlan.sourceDecisions).toBeDefined();
    expect(generalPlan.sourceDecisions!.length).toBe(generalPlan.evidenceGoals.length);

    const firstDecision = generalPlan.sourceDecisions![0];
    expect(firstDecision.goalId).toBe(generalPlan.evidenceGoals[0].id);
    expect(['KNOWN_WINNER', 'KNOWN_ALTERNATIVE', 'UNEXPLORED_FAMILY', 'NEW_DISCOVERY_REQUIRED']).toContain(firstDecision.category);
  });

  /**
   * TEST 2: Source Brain consulta Source Knowledge Map antes de discovery externo.
   */
  it('TEST 2: Source Brain consulta Source Knowledge Map antes de discovery externo', () => {
    const brain = SourceBrain.getInstance();
    const map = brain.getKnowledgeMap();

    // Verify foundational sources pre-exist in SourceKnowledgeMap
    const conicet = map.getSource('SRC_OAI_CONICET_DIGITAL');
    expect(conicet).toBeDefined();
    expect(conicet?.qualified_yield).toBeGreaterThan(0.70);

    const goal: EvidenceGoal = {
      id: 'EVID_GOAL_ACADEMIC_01',
      statement_to_prove: 'Registro cientifico y patentes universitarias de investigacion aplicada',
      subject_role: 'PRIMARY_TARGET',
      predicate: 'PRODUCES_SCIENTIFIC_RESEARCH',
      acceptable_evidence_types: ['SCIENTIFIC_REPORT'],
      preferred_source_classes: ['RESEARCH_REPOSITORY', 'UNIVERSITY_REPOSITORY'],
      verification_test: 'Verificable en repositorio cientifico nacional'
    };

    const decision = brain.evaluateGoal(goal, 'Argentina');

    // Must resolve to known winner from map without invoking external discovery
    expect(decision.gapDetected).toBe(false);
    expect(decision.category).toBe('KNOWN_WINNER');
    expect(decision.selectedSourceId).toBe('SRC_OAI_CONICET_DIGITAL');
    expect(decision.recommendedSources.some(s => s.source_id === 'SRC_OAI_CONICET_DIGITAL')).toBe(true);
  });

  /**
   * TEST 3: Known productive source recibe mayor prior que unknown equivalent.
   */
  it('TEST 3: Known productive source recibe mayor prior que unknown equivalent', () => {
    const brain = SourceBrain.getInstance();
    const map = brain.getKnowledgeMap();

    // Known productive winner in official registries
    const boletin = map.getSource('SRC_BOLETIN_OFICIAL_NACION');
    expect(boletin).toBeDefined();
    expect(boletin?.qualified_yield).toBe(0.88);

    const goalWithKnownWinner: EvidenceGoal = {
      id: 'EVID_BOLETIN_01',
      statement_to_prove: 'Inscripcion y designacion societaria oficial en Boletin Oficial',
      subject_role: 'PRIMARY_TARGET',
      predicate: 'PUBLISHED_IN_GAZETTE',
      acceptable_evidence_types: ['OFFICIAL_PUBLICATION'],
      preferred_source_classes: ['OFFICIAL_REGISTRY', 'GOVERNMENT_PORTAL'],
      verification_test: 'Aparicion en Boletin Oficial'
    };

    const goalUnknown: EvidenceGoal = {
      id: 'EVID_UNKNOWN_01',
      statement_to_prove: 'Protocolos criogenicos marinos de alta profundidad en Mar Argentino',
      subject_role: 'PRIMARY_TARGET',
      predicate: 'USES_DEEP_CRYOGENIC_SYSTEMS',
      acceptable_evidence_types: ['SUBSEA_TELEMETRY_LOG'],
      preferred_source_classes: ['STRUCTURED_API'],
      verification_test: 'Log subacuatico verificado'
    };

    const decisionWinner = brain.evaluateGoal(goalWithKnownWinner, 'Argentina');
    const decisionUnknown = brain.evaluateGoal(goalUnknown, 'Argentina');

    expect(decisionWinner.category).toBe('KNOWN_WINNER');
    expect(decisionUnknown.category).toBe('NEW_DISCOVERY_REQUIRED');
    expect(decisionWinner.priorityScore).toBeGreaterThan(decisionUnknown.priorityScore);

    // Verify candidate path scoring reflects the priority advantage
    const paths = GeneralRetrievalPlanner.synthesizeCandidatePaths(
      [goalWithKnownWinner],
      ['OFFICIAL_REGISTRY'],
      [],
      {
        rawObjective: 'test',
        targetQuantity: 2,
        geography: 'Argentina',
        entityType: 'COMPANY',
        domainTopics: ['legal'],
        schema: {
          schemaName: 'test',
          targetEntityType: 'COMPANY',
          primaryKeyField: 'name',
          fields: [],
          mandatoryAttributes: []
        },
        ontology: {
          ontologyNodes: [],
          ontologyRelations: [],
          primaryUnitOfAnalysis: 'COMPANY',
          secondaryEntityTypes: [],
          relationTypes: [],
          attributeTypes: [],
          evidenceTypes: [],
          compositeEntityCandidates: [],
          unknownConcepts: [],
          ontologyConfidence: 0.9,
          missionDefinedEntityCreated: false,
          missionEntityGraph: { nodes: [], edges: [] }
        },
        qualifyingDefinition: 'test'
      },
      [decisionWinner]
    );

    const officialPath = paths.find(p => p.family === 'OFFICIAL_REGISTRY');
    expect(officialPath).toBeDefined();
    expect(officialPath?.calculatedPathScore).toBeGreaterThanOrEqual(0.95);
    expect(officialPath?.expectedYield).toBe(12);
  });

  /**
   * TEST 4: EvidenceGoal no cubierto activa Source Family Gap discovery.
   */
  it('TEST 4: EvidenceGoal no cubierto activa Source Family Gap discovery', async () => {
    const brain = SourceBrain.getInstance();
    const gapEngine = brain.getGapEngine();

    const uncoveredGoal: EvidenceGoal = {
      id: 'EVID_UNCOVERED_01',
      statement_to_prove: 'Capacidad de fabricacion de celdas de combustible de hidrogeno verde',
      subject_role: 'PRIMARY_TARGET',
      predicate: 'MANUFACTURES_HYDROGEN_CELLS',
      acceptable_evidence_types: ['ENERGY_INDUSTRIAL_CERTIFICATE'],
      preferred_source_classes: ['GOVERNMENT_PORTAL', 'PUBLIC_REPORT'],
      verification_test: 'Certificacion industrial de energia'
    };

    const initialDecision = brain.evaluateGoal(uncoveredGoal, 'Argentina');
    expect(initialDecision.gapDetected).toBe(true);

    // Activate ecosystem gap discovery
    const gapResult = await brain.resolveGoalGap(uncoveredGoal, 'Argentina');

    expect(gapResult.canaryPassed).toBe(true);
    expect(gapResult.ecosystem.discovered_endpoints.length).toBeGreaterThanOrEqual(3);
    expect(gapResult.ecosystem.parent_domain).toBeDefined();
    expect(gapResult.sourceCreated.source_id).toContain('SRC_DISC_');
  });

  /**
   * TEST 5: Fuente nueva productiva se registra en Source Knowledge Map.
   */
  it('TEST 5: Fuente nueva productiva se registra en Source Knowledge Map', async () => {
    const brain = SourceBrain.getInstance();
    const map = brain.getKnowledgeMap();

    const initialCount = map.getAllSources().length;

    const goal: EvidenceGoal = {
      id: 'EVID_GOAL_FARMACEUTICA',
      statement_to_prove: 'Lote de vacunas y trazabilidad farmacologica hospitalaria',
      subject_role: 'PRIMARY_TARGET',
      predicate: 'TRACES_VACCINE_BATCH',
      acceptable_evidence_types: ['BATCH_TRACEABILITY_RECORD'],
      preferred_source_classes: ['GOVERNMENT_PORTAL', 'STRUCTURED_API'],
      verification_test: 'Registro oficial de lote'
    };

    const result = await brain.resolveGoalGap(goal, 'Argentina');

    // Verify source is registered into SourceKnowledgeMap
    const finalCount = map.getAllSources().length;
    expect(finalCount).toBe(initialCount + 1);

    const registeredSource = map.getSource(result.sourceCreated.source_id);
    expect(registeredSource).toBeDefined();
    expect(registeredSource?.parent_domain).toBe('anmat.gob.ar');
    expect(registeredSource?.current_status).toBe('CANARY');
    expect(registeredSource?.evidence_goals_solved).toContain(goal.id);
  });

  /**
   * TEST 6: Segunda misión reutiliza conocimiento aprendido por la primera.
   */
  it('TEST 6: Segunda misión reutiliza conocimiento aprendido por la primera', async () => {
    const brain = SourceBrain.getInstance();
    const map = brain.getKnowledgeMap();

    // Mission 1: Discovers and proves a source for lithium and energy storage
    const mission1Goal: EvidenceGoal = {
      id: 'EVID_ENERGY_STORAGE_01',
      statement_to_prove: 'Proyectos de investigacion aplicada en celdas de litio y almacenamiento de energia renovable',
      subject_role: 'PRIMARY_TARGET',
      predicate: 'CONDUCTS_LITHIUM_ENERGY_RESEARCH',
      acceptable_evidence_types: ['TECH_TRANSFER_AGREEMENT'],
      preferred_source_classes: ['RESEARCH_REPOSITORY'],
      verification_test: 'Convenio formal de investigacion en litio'
    };

    const gapResult = await brain.resolveGoalGap(mission1Goal, 'Argentina');
    const newSourceId = gapResult.sourceCreated.source_id;

    // Mission 1 executes and feeds back high qualified yield
    brain.feedbackMissionResult({
      source_id: newSourceId,
      goal_id: mission1Goal.id,
      candidates_found: 10,
      verified: 9,
      qualified: 8,
      latencyMs: 150,
      evidenceCoverage: 1.0,
      novelty: 0.90,
      overlap: 0.10
    });

    // Check that SourceKnowledgeMap updated status to PROMOTED and qualified_yield >= 0.8
    const updatedSource = map.getSource(newSourceId);
    expect(updatedSource?.current_status).toBe('PROMOTED');
    expect(updatedSource?.qualified_yield).toBe(0.80);
    expect(updatedSource?.evidence_goals_solved).toContain(mission1Goal.id);

    // Mission 2: Evaluates goal requiring lithium and energy storage
    const mission2Goal: EvidenceGoal = {
      id: 'EVID_ENERGY_STORAGE_01',
      statement_to_prove: 'Proyectos de investigacion aplicada en celdas de litio y almacenamiento de energia renovable',
      subject_role: 'PRIMARY_TARGET',
      predicate: 'CONDUCTS_LITHIUM_ENERGY_RESEARCH',
      acceptable_evidence_types: ['TECH_TRANSFER_AGREEMENT'],
      preferred_source_classes: ['RESEARCH_REPOSITORY'],
      verification_test: 'Convenio formal de investigacion en litio'
    };

    const mission2Decision = brain.evaluateGoal(mission2Goal, 'Argentina');

    // Mission 2 reuses the learned winner without requiring new discovery
    expect(mission2Decision.gapDetected).toBe(false);
    expect(mission2Decision.category).toBe('KNOWN_WINNER');
    expect(mission2Decision.selectedSourceId).toBe(newSourceId);
  });

  /**
   * TEST 7: Zero-yield source pierde prioridad.
   */
  it('TEST 7: Zero-yield source pierde prioridad', () => {
    const brain = SourceBrain.getInstance();
    const map = brain.getKnowledgeMap();

    const testSourceId = 'SRC_TEST_DEAD_ENDPOINT';
    map.registerSource({
      source_id: testSourceId,
      source_name: 'Dead or Obsolete Public Portal',
      source_family: 'OBSOLETE',
      source_universe: 'UNIVERSE_OBSOLETE',
      canonical_url: 'https://dead.gob.ar',
      parent_domain: 'dead.gob.ar',
      access_method: 'HTML_SCRAPE',
      protocol: 'HTML',
      geography_scope: 'ARGENTINA',
      topics: ['obsoleto'],
      entity_types_observed: [],
      relation_types_observed: [],
      evidence_types_observed: [],
      evidence_goals_solved: [],
      source_class: 'GOVERNMENT_PORTAL',
      volume_estimate: 100,
      realized_yield: 0.1,
      qualified_yield: 0.1,
      qualified_per_second: 0.1,
      novelty: 0.1,
      overlap: 0.9,
      latency_ms: 1000,
      reliability_score: 0.3,
      saturation: 0.9,
      current_status: 'CANARY',
      last_tested: null,
      last_success: null,
      failure_modes: []
    });

    // Canary probe yields 0 candidates and 0 qualified
    const probe = brain.evaluateCanary(testSourceId, 5, 0, 0, 0, 500);

    expect(probe.action).toBe('DEPRIORITIZE_FAST');
    expect(probe.allocatedRotors).toBe(0);

    const sourceAfterCanary = map.getSource(testSourceId);
    expect(sourceAfterCanary?.current_status).toBe('DORMANT');
    expect(sourceAfterCanary?.failure_modes).toContain('CANARY_ZERO_YIELD');
  });

  /**
   * TEST 8: High-qualified-yield source obtiene promoción/escalado.
   */
  it('TEST 8: High-qualified-yield source obtiene promoción/escalado', () => {
    const brain = SourceBrain.getInstance();
    const map = brain.getKnowledgeMap();

    const testSourceId = 'SRC_TEST_HIGH_PERFORMER';
    map.registerSource({
      source_id: testSourceId,
      source_name: 'High Yield Engineering Registry',
      source_family: 'ENGINEERING',
      source_universe: 'UNIVERSE_ENGINEERING',
      canonical_url: 'https://engineering.gob.ar',
      parent_domain: 'engineering.gob.ar',
      access_method: 'REST_API',
      protocol: 'REST_API',
      geography_scope: 'ARGENTINA',
      topics: ['ingenieria'],
      entity_types_observed: [],
      relation_types_observed: [],
      evidence_types_observed: [],
      evidence_goals_solved: [],
      source_class: 'OFFICIAL_REGISTRY',
      volume_estimate: 50000,
      realized_yield: 0.5,
      qualified_yield: 0.5,
      qualified_per_second: 1.0,
      novelty: 0.8,
      overlap: 0.2,
      latency_ms: 80,
      reliability_score: 0.95,
      saturation: 0.1,
      current_status: 'CANARY',
      last_tested: null,
      last_success: null,
      failure_modes: []
    });

    // Canary probe returns 8 qualified out of 10 sampled in 80ms -> 100/sec qualified
    const probe = brain.evaluateCanary(testSourceId, 10, 10, 9, 8, 80);

    expect(probe.action).toBe('PROMOTE');
    expect(probe.allocatedRotors).toBe(8); // Scaled to maximum rotors

    const sourceAfter = map.getSource(testSourceId);
    expect(sourceAfter?.current_status).toBe('PROMOTED');
    expect(sourceAfter?.qualified_yield).toBe(0.80);
  });

  /**
   * TEST 9: GeneralRetrievalPlanner no mantiene memoria paralela de fuentes.
   */
  it('TEST 9: GeneralRetrievalPlanner no mantiene memoria paralela de fuentes', () => {
    const plannerPrototype = GeneralRetrievalPlanner.prototype as any;
    const plannerStatic = GeneralRetrievalPlanner as any;

    // Verify planner does not have private source maps or registries
    expect(plannerPrototype.sources).toBeUndefined();
    expect(plannerPrototype.sourceRegistry).toBeUndefined();
    expect(plannerStatic.sources).toBeUndefined();
    expect(plannerStatic.sourceMemory).toBeUndefined();

    // Verify all source memory queries are handled by SourceKnowledgeMap singleton
    const map = SourceKnowledgeMap.getInstance();
    expect(typeof map.getAllSources).toBe('function');
    expect(typeof map.findSourcesForGoal).toBe('function');
    expect(typeof map.recordMissionObservation).toBe('function');
  });

  /**
   * TEST 10: No existe fallback mission-defined -> People Search.
   */
  it('TEST 10: No existe fallback mission-defined -> People Search', async () => {
    const pathfinder = AIPathfinder.getInstance();

    // Mission with a novel, mission-defined agricultural infrastructure entity
    const objective = 'Mapear silos graneleros agroecologicos con certificacion de almacenamiento sustentable en la region pampeana';

    const result = await pathfinder.executeMission(objective, {
      targetQuantity: 2,
      geographyHint: 'Region Pampeana'
    });

    const db = result.database;
    const records = db.getAllRecords();

    expect(records.length).toBeGreaterThan(0);

    // Primary entity type in database schema MUST NOT be PERSON
    expect(db.schema.targetEntityType).not.toBe('PERSON');
    expect(db.schema.targetEntityType).toContain('SILO');

    // Every record in database MUST NOT have specializedEngine === 'PEOPLE_SEARCH'
    for (const rec of records) {
      expect(rec.provenance.specializedEngine).not.toBe('PEOPLE_SEARCH');
      expect(rec.provenance.sourceId).not.toContain('PEOPLE_SEARCH');
    }

    // Verify mission qualification was evaluated on genuine mission criteria
    const qualified = db.getQualifiedRecords();
    expect(qualified.length).toBeGreaterThan(0);
  });
});
