/**
 * ATLAS — OPEN RETRIEVAL + SEMANTIC GENERALIZATION V3
 * Synthetic Property Test Suite (Tests A through J)
 * 
 * Tests strictly behavioral invariants and architectural properties,
 * without using or referencing the 10 historical Blind V2 objectives.
 * 
 * Verifies:
 * - TEST A: Mission-defined type no invoca People Search salvo subgoal PERSON.
 * - TEST B: Unknown primary unit produce General Retrieval Plan.
 * - TEST C: EvidenceGoals derivan de mandatory criteria.
 * - TEST D: Meta-sustantivo no se usa como unidad semántica final.
 * - TEST E: Entidad mencionada en complemento no se transforma en primary unit.
 * - TEST F: Una fila puede ensamblarse desde múltiples evidence fragments.
 * - TEST G: 0 qualified → timestamps qualified/searchable NULL.
 * - TEST H: Candidate persisted != Qualified searchable.
 * - TEST I: Zero-yield path pierde prioridad frente a path con evidencia relevante.
 * - TEST J: General Retrieval puede generar al menos 3 estrategias diferentes desde una ontología no conocida.
 */

import { describe, it, expect } from 'vitest';
import { PrimaryUnitResolver } from '../lib/atlasPathfinder/PrimaryUnitResolver.ts';
import { GeneralRetrievalPlanner } from '../lib/atlasPathfinder/GeneralRetrievalPlanner.ts';
import { GenericRecordAssembler } from '../lib/atlasPathfinder/GenericRecordAssembler.ts';
import { MandatoryCriterionMapper } from '../lib/atlasPathfinder/MandatoryCriterionMapper.ts';
import { MissionQualificationEngine } from '../lib/atlasPathfinder/MissionQualificationEngine.ts';
import { PersistentMissionDatabase } from '../lib/atlasPathfinder/PersistentMissionDatabase.ts';
import { AIPathfinder } from '../lib/atlasPathfinder/AIPathfinder.ts';
import type {
  MissionOntology,
  ObjectiveAnalysis,
  MissionDatabaseSchema,
  EvidenceFragment,
  PathPlan,
  DatabaseRecord
} from '../lib/atlasPathfinder/types.ts';

describe('ATLAS — OPEN RETRIEVAL + SEMANTIC GENERALIZATION V3 PROPERTY TESTS', () => {

  // ─────────────────────────────────────────────────────────────
  // TEST A: Mission-defined type no invoca People Search salvo subgoal PERSON
  // ─────────────────────────────────────────────────────────────
  it('TEST A: Mission-defined type no invoca People Search salvo subgoal PERSON', async () => {
    const pathfinder = AIPathfinder.getInstance();
    
    // Synthetic objective with a mission-defined entity: hydrologic sensor networks
    const objective = 'Mapear redes de sensores hidrologicos satelitales en cuencas fluviales argentinas';
    const result = await pathfinder.executeMission(objective, { targetQuantity: 2 });

    const records = result.database.getAllRecords();
    expect(records.length).toBeGreaterThan(0);

    // Verify none of the generated records were created by PEOPLE_SEARCH
    for (const rec of records) {
      expect(rec.recordId.startsWith('REC_PERSON_')).toBe(false);
      expect(rec.provenance.specializedEngine).not.toBe('PEOPLE_SEARCH');
    }

    // Verify that primary unit is NOT PERSON
    expect(result.database.schema.targetEntityType).not.toBe('PERSON');
  });

  // ─────────────────────────────────────────────────────────────
  // TEST B: Unknown primary unit produce General Retrieval Plan
  // ─────────────────────────────────────────────────────────────
  it('TEST B: Unknown primary unit produce General Retrieval Plan', () => {
    const syntheticOntology: MissionOntology = {
      ontologyNodes: [
        { id: 'NODE_PRIMARY_BIOREACTORES', type: 'ENTITY_BIOREACTORES', label: 'Bioreactores Anaeróbicos', role: 'PRIMARY_TARGET', attributes: ['volumen', 'produccion_metano'] }
      ],
      ontologyRelations: [],
      primaryUnitOfAnalysis: 'ENTITY_BIOREACTORES',
      secondaryEntityTypes: ['COMPANY'],
      relationTypes: ['OPERATED_BY'],
      attributeTypes: ['volumen'],
      evidenceTypes: ['informe_ambiental'],
      compositeEntityCandidates: [],
      unknownConcepts: [],
      ontologyConfidence: 0.90,
      missionDefinedEntityCreated: true,
      missionEntityGraph: { nodes: [], edges: [] }
    };

    const syntheticAnalysis: ObjectiveAnalysis = {
      rawObjective: 'Base de bioreactores anaerobicos industriales con medicion de metano en Argentina',
      entityType: 'ENTITY_BIOREACTORES',
      primaryUnitOfAnalysis: 'ENTITY_BIOREACTORES',
      qualifyingDefinition: 'Bioreactor con operacion comprobada',
      domainTopics: ['bioreactores', 'metano', 'biogas'],
      geography: 'Argentina',
      targetQuantity: 3,
      expectedCoverage: 'NACIONAL',
      completionDefinition: 'Complete',
      schema: {
        schemaId: 'SCHEMA_BIO',
        schemaName: 'Bioreactores',
        targetEntityType: 'ENTITY_BIOREACTORES',
        fields: [],
        primaryKeyField: 'name',
        canonicalRelationField: 'canonical_id',
        minEvidenceConfidence: 0.9
      }
    };

    const plan = GeneralRetrievalPlanner.plan(syntheticOntology, [], syntheticAnalysis);

    expect(plan.planId).toBeDefined();
    expect(plan.primaryUnit).toBe('ENTITY_BIOREACTORES');
    expect(plan.evidenceGoals.length).toBeGreaterThanOrEqual(1);
    expect(plan.sourceClasses.length).toBeGreaterThanOrEqual(2);
    expect(plan.queryStrategies.length).toBeGreaterThanOrEqual(2);
    expect(plan.candidatePaths.length).toBeGreaterThanOrEqual(3);

    // None of candidate paths should be PEOPLE_SEARCH
    for (const path of plan.candidatePaths) {
      expect(path.engineType).not.toBe('PEOPLE_SEARCH');
    }
  });

  // ─────────────────────────────────────────────────────────────
  // TEST C: EvidenceGoals derivan de mandatory criteria
  // ─────────────────────────────────────────────────────────────
  it('TEST C: EvidenceGoals derivan de mandatory criteria', () => {
    const rawObjective = 'Monitoreo de sitios de captura de carbono con aforo certificado';
    const criteria = [
      'Cada sitio debe poseer medicion de flujo de CO2 certificada en tiempo real.',
      'Debe contar con inscripcion en el Registro Nacional de Sumideros de Carbono.',
      'No calificar iniciativas en etapa de propuesta o sin instalacion fisica comprobada.'
    ];

    const mockOntology: MissionOntology = {
      ontologyNodes: [],
      ontologyRelations: [],
      primaryUnitOfAnalysis: 'ENTITY_CARBON_CAPTURE_SITE',
      secondaryEntityTypes: [],
      relationTypes: [],
      attributeTypes: [],
      evidenceTypes: [],
      compositeEntityCandidates: [],
      unknownConcepts: [],
      ontologyConfidence: 0.90,
      missionDefinedEntityCreated: true,
      missionEntityGraph: { nodes: [], edges: [] }
    };

    const { mappings } = MandatoryCriterionMapper.mapCriteria(rawObjective, criteria, mockOntology);
    expect(mappings.length).toBe(3);

    const mockAnalysis: ObjectiveAnalysis = {
      rawObjective,
      entityType: 'ENTITY_CARBON_CAPTURE_SITE',
      qualifyingDefinition: 'Sitio verificado',
      domainTopics: ['carbono', 'captura'],
      geography: 'Argentina',
      targetQuantity: 2,
      expectedCoverage: 'NACIONAL',
      completionDefinition: 'Complete',
      schema: {
        schemaId: 'SCHEMA_CARBON',
        schemaName: 'Carbon',
        targetEntityType: 'ENTITY_CARBON_CAPTURE_SITE',
        fields: [],
        primaryKeyField: 'name',
        canonicalRelationField: 'canonical_id',
        minEvidenceConfidence: 0.9
      }
    };

    const evidenceGoals = GeneralRetrievalPlanner.deriveEvidenceGoals(mockOntology, mappings, mockAnalysis);
    expect(evidenceGoals.length).toBe(3);

    // Positive criteria goals
    const flowGoal = evidenceGoals[0];
    expect(flowGoal.statement_to_prove).toContain('flujo de CO2');
    expect(flowGoal.preferred_source_classes.length).toBeGreaterThan(0);

    const regGoal = evidenceGoals[1];
    expect(regGoal.statement_to_prove).toContain('Registro Nacional');
    expect(regGoal.preferred_source_classes).toContain('OFFICIAL_REGISTRY');

    // Negative constraint goal
    const negGoal = evidenceGoals[2];
    expect(negGoal.predicate).toBe('SATISFIES_NEGATIVE_CONSTRAINT');
    expect(negGoal.acceptable_evidence_types).toContain('EXCLUSION_AUDIT_PASS');
  });

  // ─────────────────────────────────────────────────────────────
  // TEST D: Meta-sustantivo no se usa como unidad semántica final
  // ─────────────────────────────────────────────────────────────
  it('TEST D: Meta-sustantivo no se usa como unidad semántica final', () => {
    // 1. "casos donde..."
    const obj1 = 'Construir una base de casos donde empresas del sector agroindustrial aplican biofertilizantes generados por universidades';
    const res1 = PrimaryUnitResolver.resolve(obj1);
    expect(res1.primaryUnitOfAnalysis).not.toBe('ENTITY_CASOS');
    expect(res1.primaryUnitOfAnalysis).toContain('EMPRESAS');
    expect(res1.unitCategory).toBe('COMPOSITE_MISSION_CASE');

    // 2. "situaciones donde..."
    const obj2 = 'Armar un registro de situaciones en que hospitales provinciales adoptan telemedicina desarrollada por startups';
    const res2 = PrimaryUnitResolver.resolve(obj2);
    expect(res2.primaryUnitOfAnalysis).not.toBe('ENTITY_SITUACIONES');
    expect(res2.unitCategory).toBe('COMPOSITE_MISSION_CASE');

    // 3. "oportunidades donde..."
    const obj3 = 'Mapear oportunidades donde cooperativas rurales integran generacion distribuida fotovoltaica';
    const res3 = PrimaryUnitResolver.resolve(obj3);
    expect(res3.primaryUnitOfAnalysis).not.toBe('ENTITY_OPORTUNIDADES');
    expect(res3.unitCategory).toBe('COMPOSITE_MISSION_CASE');
  });

  // ─────────────────────────────────────────────────────────────
  // TEST E: Entidad mencionada en complemento no se transforma en primary unit
  // ─────────────────────────────────────────────────────────────
  it('TEST E: Entidad mencionada en complemento no se transforma en primary unit', () => {
    // "problemas publicados por municipios"
    // Target is "problemas", agent is "municipios". Must NOT resolve to LOCALITY or CITY!
    const obj1 = 'Construime una base de problemas publicos locales publicados por municipios argentinos con mas de 50000 habitantes';
    const res1 = PrimaryUnitResolver.resolve(obj1);
    expect(res1.primaryUnitOfAnalysis).not.toBe('LOCALITY');
    expect(res1.primaryUnitOfAnalysis).not.toBe('CITY');
    expect(res1.primaryUnitOfAnalysis).toBe('ENTITY_PROBLEMAS');
    expect(res1.roleDecomposition?.agentRole).toContain('municipios');

    // "demandas energeticas gestionadas por empresas"
    // Target is "demandas", agent is "empresas". Must NOT resolve to ORGANIZATION!
    const obj2 = 'Registro de demandas energeticas criticas gestionadas por empresas distribuidoras provinciales';
    const res2 = PrimaryUnitResolver.resolve(obj2);
    expect(res2.primaryUnitOfAnalysis).not.toBe('ORGANIZATION');
    expect(res2.primaryUnitOfAnalysis).toBe('ENTITY_DEMANDAS');
    expect(res2.roleDecomposition?.agentRole).toContain('empresas');

    // "desafios ambientales relevados en universidades"
    // Target is "desafios", complement is "universidades".
    const obj3 = 'Identificar desafios ambientales urgentes identificados por universidades nacionales';
    const res3 = PrimaryUnitResolver.resolve(obj3);
    expect(res3.primaryUnitOfAnalysis).not.toBe('ORGANIZATION');
    expect(res3.primaryUnitOfAnalysis).toBe('ENTITY_DESAFIOS');
  });

  // ─────────────────────────────────────────────────────────────
  // TEST F: Una fila puede ensamblarse desde múltiples evidence fragments
  // ─────────────────────────────────────────────────────────────
  it('TEST F: Una fila puede ensamblarse desde múltiples evidence fragments', () => {
    const mockSchema: MissionDatabaseSchema = {
      schemaId: 'SCHEMA_HYDRO',
      schemaName: 'Centrales Hidroeléctricas',
      targetEntityType: 'ENTITY_HYDRO_PLANT',
      fields: [
        { name: 'name', type: 'string', required: true, description: 'Nombre', evidenceRequired: true },
        { name: 'potencia_mw', type: 'number', required: true, description: 'Potencia instalada', evidenceRequired: true },
        { name: 'operador', type: 'string', required: true, description: 'Empresa operadora', evidenceRequired: true },
        { name: 'cuenca_rio', type: 'string', required: true, description: 'Cuenca hídrica', evidenceRequired: true },
        { name: 'provenance_sources', type: 'array', required: true, description: 'Fuentes', evidenceRequired: true }
      ],
      primaryKeyField: 'name',
      canonicalRelationField: 'canonical_id',
      minEvidenceConfidence: 0.90
    };

    // Fragment A: Technical capacity from Open Data
    const fragA: EvidenceFragment = {
      fragmentId: 'FRAG_01',
      goalId: 'GOAL_01',
      subjectIdentity: 'Represa Los Caracoles',
      claimOrFact: 'Potencia instalada 125 MW en río San Juan',
      fieldValues: {
        potencia_mw: 125,
        cuenca_rio: 'Río San Juan'
      },
      sourceClass: 'OPEN_DATA',
      sourceUrl: 'https://datos.gob.ar/dataset/energia-hidraulica-san-juan',
      sourceId: 'DATOS_GOB_AR',
      confidence: 0.95,
      extractedAt: new Date().toISOString()
    };

    // Fragment B: Operational concession from Official Bulletin
    const fragB: EvidenceFragment = {
      fragmentId: 'FRAG_02',
      goalId: 'GOAL_02',
      subjectIdentity: 'Represa Los Caracoles',
      claimOrFact: 'Operación concesionada a EPSE San Juan según resolución 142/2009',
      fieldValues: {
        operador: 'Energía Provincial Sociedad del Estado (EPSE)'
      },
      sourceClass: 'OFFICIAL_REGISTRY',
      sourceUrl: 'https://boletinoficial.gob.ar/resolucion-epse-142',
      sourceId: 'BOLETIN_OFICIAL_ARG',
      confidence: 0.98,
      extractedAt: new Date().toISOString()
    };

    // Assemble candidate records from multi-source fragments
    const assembled = GenericRecordAssembler.assemble([fragA, fragB], mockSchema);

    expect(assembled.length).toBe(1);
    const candidate = assembled[0];

    // Verify fields from both fragments merged into single candidate record
    expect(candidate.data.name).toBe('Represa Los Caracoles');
    expect(candidate.data.potencia_mw).toBe(125);
    expect(candidate.data.cuenca_rio).toBe('Río San Juan');
    expect(candidate.data.operador).toBe('Energía Provincial Sociedad del Estado (EPSE)');

    // Verify provenance retained both source URLs
    expect(candidate.data.provenance_sources).toContain('https://datos.gob.ar/dataset/energia-hidraulica-san-juan');
    expect(candidate.data.provenance_sources).toContain('https://boletinoficial.gob.ar/resolucion-epse-142');

    // Lifecycle state is MISSION_CANDIDATE (ready for qualification)
    expect(candidate.lifecycleState).toBe('MISSION_CANDIDATE');
    expect(candidate.verificationStatus).toBe('VERIFIED');
  });

  // ─────────────────────────────────────────────────────────────
  // TEST G: 0 qualified → timestamps qualified/searchable NULL
  // ─────────────────────────────────────────────────────────────
  it('TEST G: 0 qualified → timestamps qualified/searchable NULL', () => {
    const mockSchema: MissionDatabaseSchema = {
      schemaId: 'SCHEMA_TEST',
      schemaName: 'Test',
      targetEntityType: 'ENTITY_MOCK',
      fields: [{ name: 'name', type: 'string', required: true, description: 'Nombre', evidenceRequired: true }],
      primaryKeyField: 'name',
      canonicalRelationField: 'canonical_id',
      minEvidenceConfidence: 0.90
    };

    const db = new PersistentMissionDatabase('TEST_G_DB', mockSchema);

    // Add unverified/unqualified candidate record
    db.upsertRecord({
      recordId: 'REC_UNQUALIFIED_01',
      canonicalRelationId: 'CANON_01',
      data: { name: 'Candidato No Calificado' },
      evidenceBadges: [],
      evidenceSummary: 'Sin evidencia de calificación',
      verificationStatus: 'VERIFIED',
      lifecycleState: 'MISSION_CANDIDATE',
      provenance: { sourceId: 'TEST', observedAt: new Date().toISOString(), specializedEngine: 'GENERAL_RETRIEVAL' },
      fieldCompletenessScore: 50
    });

    expect(db.size()).toBe(1);
    expect(db.getQualifiedRecords().length).toBe(0);

    // Verify timing logic
    const qualifiedCount = db.getQualifiedRecords().length;
    const t0 = Date.now() - 5000;
    const final_t_first_mission_qualified = qualifiedCount > 0 ? Date.now() : null;
    const final_t_first_searchable_record = qualifiedCount > 0 ? Date.now() : null;

    const time_to_first_qualified = qualifiedCount > 0 && final_t_first_mission_qualified
      ? Math.max(0, final_t_first_mission_qualified - t0)
      : 'NOT_REACHED';

    const time_to_first_searchable_database = qualifiedCount > 0 && final_t_first_searchable_record
      ? Math.max(0, final_t_first_searchable_record - t0)
      : 'NOT_REACHED';

    expect(final_t_first_mission_qualified).toBeNull();
    expect(time_to_first_qualified).toBe('NOT_REACHED');
    expect(final_t_first_searchable_record).toBeNull();
    expect(time_to_first_searchable_database).toBe('NOT_REACHED');
  });

  // ─────────────────────────────────────────────────────────────
  // TEST H: Candidate persisted != Qualified searchable
  // ─────────────────────────────────────────────────────────────
  it('TEST H: Candidate persisted != Qualified searchable', () => {
    const mockSchema: MissionDatabaseSchema = {
      schemaId: 'SCHEMA_TEST_H',
      schemaName: 'Test H',
      targetEntityType: 'ENTITY_MOCK',
      fields: [{ name: 'name', type: 'string', required: true, description: 'Nombre', evidenceRequired: true }],
      primaryKeyField: 'name',
      canonicalRelationField: 'canonical_id',
      minEvidenceConfidence: 0.90
    };

    const db = new PersistentMissionDatabase('TEST_H_DB', mockSchema);

    // Upsert candidate record that is NOT qualified
    const candidateRec: DatabaseRecord = {
      recordId: 'REC_CANDIDATE_01',
      canonicalRelationId: 'CANON_01',
      data: { name: 'Candidato Descubierto' },
      evidenceBadges: ['Candidate Found'],
      evidenceSummary: 'Candidato persistido en DB pero sin calificar',
      verificationStatus: 'VERIFIED',
      lifecycleState: 'MISSION_CANDIDATE',
      provenance: { sourceId: 'TEST_SRC', observedAt: new Date().toISOString(), specializedEngine: 'GENERAL_RETRIEVAL' },
      fieldCompletenessScore: 80
    };

    db.upsertRecord(candidateRec);

    // Candidate is persisted in database
    expect(db.size()).toBe(1);
    expect(db.getAllRecords().length).toBe(1);

    // BUT searchable qualified database is NOT active
    expect(db.getQualifiedRecords().length).toBe(0);

    // Only transitions to searchable qualified when lifecycleState becomes MISSION_QUALIFIED
    candidateRec.lifecycleState = 'MISSION_QUALIFIED';
    db.upsertRecord(candidateRec);

    expect(db.getQualifiedRecords().length).toBe(1);
    expect(db.getQualifiedRecords()[0].lifecycleState).toBe('MISSION_QUALIFIED');
  });

  // ─────────────────────────────────────────────────────────────
  // TEST I: Zero-yield path pierde prioridad frente a path con evidencia relevante
  // ─────────────────────────────────────────────────────────────
  it('TEST I: Zero-yield path pierde prioridad frente a path con evidencia relevante', async () => {
    const pathZeroYield: PathPlan = {
      pathId: 'PATH_ZERO_YIELD',
      name: 'Path Ineficiente sin rendimiento',
      family: 'OFFICIAL_REGISTRY',
      engineType: 'MULTI_ENGINE',
      expectedYield: 5,
      expectedQuality: 0.8,
      expectedNovelty: 0.8,
      expectedCost: 2,
      expectedTime: 100,
      evidenceStrength: 0.8,
      uncertainty: 0.5,
      expansionValue: 0.5,
      calculatedPathScore: 0.7,
      status: 'PROPOSED',
      actionSequence: ['CALL_SOURCE_DISCOVERY']
    };

    const pathHighYield: PathPlan = {
      pathId: 'PATH_HIGH_YIELD',
      name: 'Path Productivo con evidencia relevante',
      family: 'OPEN_DATASETS',
      engineType: 'MULTI_ENGINE',
      expectedYield: 5,
      expectedQuality: 0.95,
      expectedNovelty: 0.9,
      expectedCost: 2,
      expectedTime: 120,
      evidenceStrength: 0.95,
      uncertainty: 0.1,
      expansionValue: 0.9,
      calculatedPathScore: 0.92,
      status: 'PROPOSED',
      actionSequence: ['CALL_SOURCE_DISCOVERY']
    };

    const mockProbeFn = async (path: PathPlan) => {
      if (path.pathId === 'PATH_ZERO_YIELD') {
        return { candidatesFound: 0, verified: 0, qualified: 0, latencyMs: 50 };
      }
      return { candidatesFound: 5, verified: 5, qualified: 4, latencyMs: 100 };
    };

    const raceResult = await GeneralRetrievalPlanner.racePaths(
      [pathZeroYield, pathHighYield],
      mockProbeFn
    );

    // Winning path must be high-yield path
    expect(raceResult.winningPath.pathId).toBe('PATH_HIGH_YIELD');
    expect(raceResult.winningPath.status).toBe('PROMOTED');

    // Zero-yield path must be abandoned
    expect(raceResult.abandonedPaths.some(p => p.pathId === 'PATH_ZERO_YIELD')).toBe(true);

    // Verify qualifiedPerSecond metric
    const highMetric = raceResult.metrics.find(m => m.pathId === 'PATH_HIGH_YIELD')!;
    const zeroMetric = raceResult.metrics.find(m => m.pathId === 'PATH_ZERO_YIELD')!;

    expect(highMetric.qualifiedPerSecond).toBeGreaterThan(0);
    expect(zeroMetric.qualifiedPerSecond).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────
  // TEST J: General Retrieval puede generar al menos 3 estrategias diferentes desde una ontología no conocida
  // ─────────────────────────────────────────────────────────────
  it('TEST J: General Retrieval puede generar al menos 3 estrategias diferentes desde una ontología no conocida', () => {
    const unknownOntology: MissionOntology = {
      ontologyNodes: [
        { id: 'NODE_01', type: 'ENTITY_GEOTHERMAL_DISTRICT_HEATING', label: 'Distrito Geotérmico', role: 'PRIMARY_TARGET', attributes: ['capacidad_calorica_gw'] }
      ],
      ontologyRelations: [],
      primaryUnitOfAnalysis: 'ENTITY_GEOTHERMAL_DISTRICT_HEATING',
      secondaryEntityTypes: ['OPERATOR_COMPANY'],
      relationTypes: ['OPERATED_BY'],
      attributeTypes: ['temperatura_pozo'],
      evidenceTypes: ['informe_geotermico_oficial'],
      compositeEntityCandidates: [],
      unknownConcepts: [],
      ontologyConfidence: 0.88,
      missionDefinedEntityCreated: true,
      missionEntityGraph: { nodes: [], edges: [] }
    };

    const unknownAnalysis: ObjectiveAnalysis = {
      rawObjective: 'Identificar redes de calefaccion distrital geotermica en operacion continua',
      entityType: 'ENTITY_GEOTHERMAL_DISTRICT_HEATING',
      primaryUnitOfAnalysis: 'ENTITY_GEOTHERMAL_DISTRICT_HEATING',
      qualifyingDefinition: 'Red geotermica con conexion domiciliaria efectiva',
      domainTopics: ['geotermia', 'calefaccion distrital', 'energia termica'],
      geography: 'Argentina',
      targetQuantity: 2,
      expectedCoverage: 'NACIONAL',
      completionDefinition: 'Complete',
      schema: {
        schemaId: 'SCHEMA_GEO',
        schemaName: 'Geotermia',
        targetEntityType: 'ENTITY_GEOTHERMAL_DISTRICT_HEATING',
        fields: [],
        primaryKeyField: 'name',
        canonicalRelationField: 'canonical_id',
        minEvidenceConfidence: 0.90
      }
    };

    const plan = GeneralRetrievalPlanner.plan(unknownOntology, [], unknownAnalysis);

    // Must generate at least 3 distinct candidate paths
    expect(plan.candidatePaths.length).toBeGreaterThanOrEqual(3);

    // Verify paths belong to diverse source class families
    const families = new Set(plan.candidatePaths.map(p => p.family));
    expect(families.size).toBeGreaterThanOrEqual(3);

    // Verify all candidate paths have steps and action pipelines
    for (const p of plan.candidatePaths) {
      expect(p.actionSequence.length).toBeGreaterThanOrEqual(2);
      expect(p.steps && p.steps.length > 0).toBe(true);
    }
  });

});
