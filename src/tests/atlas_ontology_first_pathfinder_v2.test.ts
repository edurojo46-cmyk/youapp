/**
 * ATLAS — ONTOLOGY-FIRST PATHFINDER V2
 * Internal Development Test Suite (Sections 30, 31, 32, 33, 34, 35)
 * 
 * Verifies that:
 * 1. PLACE objectives resolve to CITY/LOCALITY, never to PERSON.
 * 2. RELATIONSHIP objectives resolve to RELATIONSHIP, never to ORGANIZATION merely because organizations are mentioned.
 * 3. TECHNOLOGY objectives resolve to TECHNOLOGY / TECHNOLOGY_TRANSFER_CASE, never to PERSON.
 * 4. PROJECT objectives resolve to PROJECT / INTERSECTORAL_PROJECT, preserving participating actor types.
 * 5. Multi-entity objectives produce multi-engine sequential plans (>= 3 capabilities).
 * 6. ENTITY_VERIFIED with UNKNOWN mandatory criterion does NOT produce MISSION_QUALIFIED.
 * 7. Structural completeness 100% with qualification completeness 0% is correctly distinguished and reported.
 * 8. Template collapse audit confirms TEMPLATE_COLLAPSE_DETECTED = FALSE across diversity metrics.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  PrimaryUnitResolver,
  MissionOntologyBuilder,
  MandatoryCriterionMapper,
  ComposableSchemaBuilder,
  MissionQualificationEngine,
  MultiEngineMissionPlanner,
  DynamicSchemaDesigner,
  DatabaseCompletenessMap,
  AIPathfinder,
  AtlasOntologyMemory
} from '../lib/atlasPathfinder/index.ts';
import type { DatabaseRecord, MandatoryCriterionMapping } from '../lib/atlasPathfinder/types.ts';

describe('ATLAS — ONTOLOGY-FIRST PATHFINDER V2 ARCHITECTURAL SUITE', () => {
  beforeAll(() => {
    AtlasOntologyMemory.initialize();
  });

  // TEST 1 (Section 31)
  it('TEST 1: objective where primary unit is PLACE must not return PERSON', () => {
    const objective = 'Construir una base de ciudades industriales argentinas con oferta universitaria de ingeniería.';
    const unitResult = PrimaryUnitResolver.resolve(objective);

    expect(unitResult.primaryUnitOfAnalysis).toBe('CITY');
    expect(unitResult.unitCategory).toBe('SPATIAL_JURISDICTION');
    expect(unitResult.primaryUnitOfAnalysis).not.toBe('PERSON');
    expect(unitResult.primaryUnitOfAnalysis).not.toBe('ORGANIZATION');

    const analysis = DynamicSchemaDesigner.designSchema(objective);
    expect(analysis.primaryUnitOfAnalysis).toBe('CITY');
    expect(analysis.schema.targetEntityType).toBe('CITY');
    expect(analysis.schema.schemaName).toContain('CITY');
    expect(analysis.schema.fields.map(f => f.name)).toContain('city_name');
    expect(analysis.schema.fields.map(f => f.name)).toContain('province');
  });

  // TEST 2 (Section 31)
  it('TEST 2: objective where primary unit is RELATIONSHIP must not return ORGANIZATION merely because organizations are mentioned', () => {
    const objective = 'Identificar relaciones bilaterales verificables entre universidades argentinas y empresas privadas en proyectos de energía renovable.';
    const unitResult = PrimaryUnitResolver.resolve(objective);

    expect(unitResult.primaryUnitOfAnalysis).toBe('RELATIONSHIP');
    expect(unitResult.unitCategory).toBe('RELATIONSHIP_LINK');
    expect(unitResult.primaryUnitOfAnalysis).not.toBe('ORGANIZATION');
    expect(unitResult.primaryUnitOfAnalysis).not.toBe('PERSON');

    const analysis = DynamicSchemaDesigner.designSchema(objective);
    expect(analysis.primaryUnitOfAnalysis).toBe('RELATIONSHIP');
    expect(analysis.schema.canonicalRelationField).toBe('canonical_relationship_id');
    expect(analysis.schema.fields.map(f => f.name)).toContain('university_name');
    expect(analysis.schema.fields.map(f => f.name)).toContain('company_name');
    expect(analysis.schema.fields.map(f => f.name)).toContain('relationship_type');
  });

  // TEST 3 (Section 31)
  it('TEST 3: objective where primary unit is TECHNOLOGY must not return PERSON', () => {
    const objective = 'Relevar tecnologías desarrolladas en instituciones científicas argentinas que tengan evidencia de aplicación productiva o clínica fuera del laboratorio.';
    const unitResult = PrimaryUnitResolver.resolve(objective);

    expect(unitResult.primaryUnitOfAnalysis).toBe('TECHNOLOGY_TRANSFER_CASE');
    expect(unitResult.unitCategory).toBe('DEVELOPED_ARTIFACT');
    expect(unitResult.primaryUnitOfAnalysis).not.toBe('PERSON');

    const analysis = DynamicSchemaDesigner.designSchema(objective);
    expect(analysis.primaryUnitOfAnalysis).toBe('TECHNOLOGY_TRANSFER_CASE');
    expect(analysis.schema.fields.map(f => f.name)).toContain('technology_name');
    expect(analysis.schema.fields.map(f => f.name)).toContain('origin_institution');
    expect(analysis.schema.fields.map(f => f.name)).toContain('application_evidence');
  });

  // TEST 4 (Section 31)
  it('TEST 4: objective where primary unit is PROJECT must preserve participating actor types', () => {
    const objective = 'Mapear proyectos de innovación en los que participen simultáneamente un organismo público, una institución científica y una empresa privada con resultados concretos.';
    const unitResult = PrimaryUnitResolver.resolve(objective);

    expect(unitResult.primaryUnitOfAnalysis).toBe('INTERSECTORAL_PROJECT');
    expect(unitResult.unitCategory).toBe('ENDEAVOR_PROJECT');

    const { ontology } = MissionOntologyBuilder.buildOntology(objective);
    const secondaryTypes = ontology.secondaryEntityTypes;

    expect(secondaryTypes).toContain('PUBLIC_AGENCY');
    expect(secondaryTypes).toContain('INSTITUTION');
    expect(secondaryTypes).toContain('COMPANY');

    const analysis = DynamicSchemaDesigner.designSchema(objective);
    const fieldNames = analysis.schema.fields.map(f => f.name);
    expect(fieldNames).toContain('public_actor');
    expect(fieldNames).toContain('academic_actor');
    expect(fieldNames).toContain('private_actor');
    expect(fieldNames).toContain('concrete_result_evidence');
  });

  // TEST 5 (Section 31 & 34)
  it('TEST 5: objective requiring PERSON + ORGANIZATION + RELATION evidence must produce multi-engine plan (>= 3 engines)', () => {
    const objective = 'Construir una red de consorcios tecnológicos donde se verifiquen los investigadores líderes (personas), las universidades de pertenencia y las empresas con convenios vigentes.';
    const analysis = DynamicSchemaDesigner.designSchema(objective);

    expect(analysis.subgoals).toBeDefined();
    expect(analysis.subgoals!.length).toBeGreaterThanOrEqual(3);

    const allEngines = new Set<string>();
    for (const sg of analysis.subgoals!) {
      for (const eng of sg.engines) {
        allEngines.add(eng);
      }
    }

    // Must require 3 or more specialized engines in pipeline (Section 34)
    expect(allEngines.size).toBeGreaterThanOrEqual(3);
    expect(allEngines.has('PEOPLE_SEARCH') || allEngines.has('ORGANIZATION_DISCOVERY')).toBe(true);
    expect(allEngines.has('SOURCE_DISCOVERY')).toBe(true);

    // Multi-hop path verification
    const { paths } = MultiEngineMissionPlanner.planMission(analysis.ontology!, analysis.schema);
    expect(paths.length).toBeGreaterThanOrEqual(1);
    const multiHop = paths.find(p => p.steps && p.steps.length >= 3);
    expect(multiHop).toBeDefined();
    expect(multiHop!.steps!.length).toBeGreaterThanOrEqual(3);
  });

  // TEST 6 (Section 31 & 35)
  it('TEST 6: ENTITY_VERIFIED but one mandatory criterion UNKNOWN must NOT produce MISSION_QUALIFIED', () => {
    const mappings: MandatoryCriterionMapping[] = [
      {
        criterionId: 'CRIT_01',
        rawText: 'Debe ser una empresa argentina con CUIT válido.',
        mappedFields: ['organization_name', 'cuit'],
        mappedRelations: [],
        requiredEvidence: ['cuit_validity'],
        qualificationTest: 'Entity exists and has CUIT.',
        isNegativeConstraint: false
      },
      {
        criterionId: 'CRIT_02',
        rawText: 'Debe existir evidencia verificable de inclusión laboral real de personas con discapacidad.',
        mappedFields: ['disability_employment_evidence'],
        mappedRelations: [],
        requiredEvidence: ['employment_proof'],
        qualificationTest: 'Must prove disability employment in food production.',
        isNegativeConstraint: false
      }
    ];

    // Candidate has verified company identity, but disability employment field is absent (UNKNOWN)
    const candidateRecord: DatabaseRecord = {
      recordId: 'REC_SAMPLE_001',
      canonicalRelationId: '30-71122334-9',
      data: {
        organization_name: 'Panificadora San Martín SRL',
        cuit: '30-71122334-9'
        // disability_employment_evidence is deliberately missing!
      },
      evidenceBadges: ['CUIT Verified'],
      evidenceSummary: 'Empresa constituida y registrada en AFIP.',
      verificationStatus: 'VERIFIED',
      provenance: {
        sourceId: 'AFIP_REGISTRY',
        observedAt: new Date().toISOString(),
        specializedEngine: 'ORGANIZATION_DISCOVERY'
      },
      fieldCompletenessScore: 50
    };

    const evaluated = MissionQualificationEngine.evaluateRecord(candidateRecord, mappings);

    // Assert strict separation: Entity is verified, but NOT mission qualified
    expect(evaluated.verificationStatus).toBe('VERIFIED');
    expect(evaluated.mandatoryCriteriaMatrix!['CRIT_01'].status).toBe('PASS');
    expect(evaluated.mandatoryCriteriaMatrix!['CRIT_02'].status).toBe('UNKNOWN');
    expect(evaluated.lifecycleState).not.toBe('MISSION_QUALIFIED');
    expect(evaluated.lifecycleState).toBe('MISSION_CANDIDATE');
    expect(evaluated.data['mission_qualification_status']).toBe('NOT_QUALIFIED');
  });

  // TEST 7 (Section 31 & 27)
  it('TEST 7: structural completeness 100% with qualification completeness 0% must remain possible and correctly reported', () => {
    const schema = ComposableSchemaBuilder.buildSchema(
      {
        ontologyNodes: [],
        ontologyRelations: [],
        primaryUnitOfAnalysis: 'CITY',
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
      [],
      'Construir base de ciudades'
    );

    // Records populate all fields structurally with non-null strings, but 0 are MISSION_QUALIFIED
    const uncommittedRecords: DatabaseRecord[] = [
      {
        recordId: 'REC_CITY_01',
        canonicalRelationId: 'LOC_01',
        data: {
          city_name: 'Villa Ejemplo',
          province: 'Buenos Aires',
          jurisdiction: 'Partido Ejemplo',
          provenance_sources: ['https://example.com'],
          entity_verification_status: 'ENTITY_VERIFIED',
          mission_qualification_status: 'NOT_QUALIFIED',
          mandatory_criteria_passed: ['NONE_QUALIFIED'],
          confidence: 0.5
        },
        evidenceBadges: [],
        evidenceSummary: 'Datos preliminares sin calificar.',
        verificationStatus: 'VERIFIED',
        lifecycleState: 'MISSION_CANDIDATE',
        provenance: { sourceId: 'SEED', observedAt: new Date().toISOString(), specializedEngine: 'SOURCE' },
        fieldCompletenessScore: 100
      }
    ];

    const completeness = DatabaseCompletenessMap.evaluate(schema, uncommittedRecords, 10);

    // Invariant: Structural completeness is strictly 100% (all schema fields structurally populated)
    expect(completeness.structuralCompleteness).toBe(100);
    // Invariant: If qualifiedRecords === 0, qualificationCompleteness must be strictly 0%
    expect(completeness.qualificationCompleteness).toBe(0);
    expect(completeness.hasQualificationGap).toBe(true);
  });

  // ANTI-TEMPLATE AUDIT (Section 32)
  it('Section 32 Anti-Template Audit: measures diversity across distinct objectives', () => {
    const sampleObjectives = [
      'Construir una base de ciudades industriales con oferta universitaria.',
      'Identificar relaciones de colaboracion bilateral entre universidades y empresas en energias renovables.',
      'Relevar tecnologias desarrolladas en instituciones cientificas aplicadas fuera del laboratorio.',
      'Mapear proyectos de innovacion tripartitos con organismo publico, academia y empresa.',
      'Construir un registro de corredores logisticos con infraestructura y cadena de frio.'
    ];

    const observedUnits = new Set<string>();
    const observedSchemaNames = new Set<string>();
    const observedFieldSets = new Set<string>();

    for (const obj of sampleObjectives) {
      const analysis = DynamicSchemaDesigner.designSchema(obj);
      observedUnits.add(analysis.primaryUnitOfAnalysis!);
      observedSchemaNames.add(analysis.schema.schemaName);
      const fieldSig = analysis.schema.fields.map(f => f.name).sort().join(',');
      observedFieldSets.add(fieldSig);
    }

    // Must observe at least 4 distinct primary units across 5 objectives
    expect(observedUnits.size).toBeGreaterThanOrEqual(4);
    expect(observedSchemaNames.size).toBe(sampleObjectives.length);
    expect(observedFieldSets.size).toBeGreaterThanOrEqual(4);

    // Explicitly verify TEMPLATE_COLLAPSE_DETECTED is false
    const templateCollapseDetected = observedUnits.size <= 2 && observedFieldSets.size <= 2;
    expect(templateCollapseDetected).toBe(false);
  });

  // QUALIFICATION NEGATIVE EXCLUSION TEST (Section 23)
  it('Section 23: negative qualification constraints reject candidates meeting weaker conditions', () => {
    const mappings: MandatoryCriterionMapping[] = [
      {
        criterionId: 'CRIT_NEG_01',
        rawText: 'No se puede calificar una ciudad únicamente por población o tamaño.',
        mappedFields: ['negative_constraint_audit'],
        mappedRelations: [],
        requiredEvidence: ['exclusion_test_passed'],
        qualificationTest: 'Candidate must NOT rely exclusively on population.',
        isNegativeConstraint: true
      }
    ];

    const popOnlyRecord: DatabaseRecord = {
      recordId: 'REC_POP_01',
      canonicalRelationId: 'LOC_POP',
      data: {
        city_name: 'Gran Urbe',
        population: 1500000
        // No industrial_activity_evidence
      },
      evidenceBadges: [],
      evidenceSummary: 'Ciudad populosa.',
      verificationStatus: 'VERIFIED',
      provenance: { sourceId: 'CENSUS', observedAt: new Date().toISOString(), specializedEngine: 'SOURCE' },
      fieldCompletenessScore: 80
    };

    const evaluated = MissionQualificationEngine.evaluateRecord(popOnlyRecord, mappings);
    expect(evaluated.mandatoryCriteriaMatrix!['CRIT_NEG_01'].status).toBe('FAIL');
    expect(evaluated.lifecycleState).toBe('MISSION_REJECTED');
  });

  // FULL PIPELINE EXECUTION TEST (Section 25 & 26)
  it('Full Autonomous Mission Execution V2: achieves MISSION_QUALIFIED database', async () => {
    const pathfinder = AIPathfinder.getInstance();
    const objective = 'Construir una base de ciudades industriales argentinas con oferta tecnica universitaria.';

    const result = await pathfinder.executePathfinderMission(objective, {
      targetQuantity: 4,
      geographyHint: 'Argentina',
      mandatoryCriteria: [
        'Cada registro debe representar una ciudad o localidad argentina identificable.',
        'Cada ciudad debe tener evidencia publica de actividad industrial relevante.',
        'Cada ciudad debe tener evidencia publica de oferta de educacion tecnica o ingenieria.',
        'Las dimensiones de evidencia deben conservar provenance.'
      ]
    });

    expect(result.database).toBeDefined();
    expect(result.database.schema.targetEntityType).toBe('CITY');
    expect(result.database.size()).toBeGreaterThanOrEqual(4);

    const qualifiedRecords = result.database.getQualifiedRecords();
    expect(qualifiedRecords.length).toBeGreaterThanOrEqual(4);

    for (const q of qualifiedRecords) {
      expect(q.lifecycleState).toBe('MISSION_QUALIFIED');
      expect(q.data['mission_qualification_status']).toBe('MISSION_QUALIFIED');
      expect(q.mandatoryCriteriaMatrix).toBeDefined();
    }

    expect(result.postmortem.databaseCreated.schema.targetEntityType).toBe('CITY');
    expect(result.postmortem.metrics.missionQualifiedRecords).toBeGreaterThanOrEqual(4);
    expect(result.postmortem.telemetry).toBeDefined();
    expect(result.postmortem.telemetry!.time_to_ontology).toBeGreaterThanOrEqual(0);
    expect(result.postmortem.telemetry!.time_to_schema).toBeGreaterThanOrEqual(0);
  });

  // MISSION DEFINED ENTITY DYNAMIC AUDIT (User Request Items 2 & 3)
  it('MISSION_DEFINED_ENTITY dynamic generation: unknown abstract concept produces complete schema without source code change', () => {
    const syntheticObjective = 'Construir un registro de biomateriales polimericos degradables con tasa de absorcion verificada y biocompatibilidad demostrada.';
    const unitResult = PrimaryUnitResolver.resolve(syntheticObjective);

    const builtInTypes = [
      'CITY',
      'LOCALITY',
      'RELATIONSHIP',
      'TECHNOLOGY_TRANSFER_CASE',
      'INTERSECTORAL_PROJECT',
      'LOGISTICS_NODE',
      'MEDIA_OUTLET',
      'PERSON',
      'ORGANIZATION'
    ];

    // Must be genuinely dynamic and not coerced into built-in types
    expect(builtInTypes.includes(unitResult.primaryUnitOfAnalysis)).toBe(false);
    expect(unitResult.isMissionDefined).toBe(true);
    expect(unitResult.primaryUnitOfAnalysis).toBe('ENTITY_BIOMATERIALES');
    expect(unitResult.canonicalKeyName).toBe('canonical_biomateriales_id');

    // Dynamic schema design for synthetic unknown concept
    const analysis = DynamicSchemaDesigner.designSchema(syntheticObjective, 5, 'Argentina', [
      'Cada registro debe especificar la composicion quimica del biomaterial.',
      'Debe contar con evidencia documental de tasa de degradacion o absorcion controlada.',
      'Debe demostrarse biocompatibilidad celular en ensayos documentados.'
    ]);

    expect(analysis.primaryUnitOfAnalysis).toBe('ENTITY_BIOMATERIALES');
    expect(analysis.schema.targetEntityType).toBe('ENTITY_BIOMATERIALES');
    expect(analysis.schema.canonicalRelationField).toBe('canonical_entity_biomateriales_id');
    expect(analysis.schema.fields.map(f => f.name)).toContain('entity_name');
    expect(analysis.schema.fields.map(f => f.name)).toContain('provenance_sources');
    expect(analysis.schema.fields.map(f => f.name)).toContain('mission_qualification_status');
    expect(analysis.criterionMappings!.length).toBe(3);

    // Multi-engine subgoals & paths dynamically generated
    expect(analysis.subgoals).toBeDefined();
    expect(analysis.subgoals!.length).toBeGreaterThanOrEqual(2);

    const { paths } = MultiEngineMissionPlanner.planMission(analysis.ontology!, analysis.schema);
    expect(paths.length).toBeGreaterThanOrEqual(1);

    // Dynamic ontology memory candidate lifecycle
    AtlasOntologyMemory.recordMissionObservation(
      analysis.primaryUnitOfAnalysis,
      'SYNTHETIC_MISSION_01',
      analysis.schema.fields.map(f => f.name),
      paths[0].pathId
    );
    const concept = AtlasOntologyMemory.getConcept('ENTITY_BIOMATERIALES');
    expect(concept).toBeDefined();
    expect(concept!.lifecycleState).toBe('ONTOLOGY_CANDIDATE');
    expect(concept!.observationCount).toBe(1);
  });
});

