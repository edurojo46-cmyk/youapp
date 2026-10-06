/**
 * ATLAS — AI PATHFINDER V3
 * Module: GeneralRetrievalPlanner (Sections 1, 2, 3, 4, 5, 6, 9)
 * 
 * General Retrieval Layer between Mission Ontology and Physical Retrieval:
 * - NO_ENGINE_MATCH -> GENERAL_RETRIEVAL_PLANNER (Never defaults to People Search).
 * - Derives EvidenceGoal[] from Mandatory Criteria and Ontology relations.
 * - Reasons over 15 SourceClass primitives without hardcoding domain URLs.
 * - Synthesizes generic search probes from ontology roles, relations, and facts.
 * - Executes Parallel Path Racing scored primarily by MISSION_QUALIFIED_PER_SECOND.
 */

import type {
  MissionOntology,
  MandatoryCriterionMapping,
  ObjectiveAnalysis,
  SourceClass,
  EvidenceGoal,
  GeneralRetrievalQuery,
  GeneralRetrievalPlan,
  PathPlan,
  PathStep
} from './types.ts';
import { SourceBrain, type GoalSourceDecision } from './sourceIntelligence/SourceBrain.ts';

export interface PathRaceMetric {
  pathId: string;
  candidatesFound: number;
  verified: number;
  qualified: number;
  evidenceCoverage: number;
  novelty: number;
  latencyMs: number;
  cost: number;
  qualifiedPerSecond: number;
  promoted: boolean;
  abandoned: boolean;
}

export class GeneralRetrievalPlanner {
  private static ALL_SOURCE_CLASSES: SourceClass[] = [
    'OFFICIAL_REGISTRY',
    'GOVERNMENT_PORTAL',
    'PUBLIC_PROCUREMENT',
    'OPEN_DATA',
    'INSTITUTIONAL_SITE',
    'UNIVERSITY_REPOSITORY',
    'RESEARCH_REPOSITORY',
    'COMPANY_PUBLIC_SITE',
    'PUBLIC_REPORT',
    'NEWS_EVIDENCE',
    'PUBLIC_PROGRAM',
    'PUBLIC_CALL',
    'DOCUMENT_REPOSITORY',
    'STRUCTURED_API',
    'SEARCH_ENGINE_DISCOVERY'
  ];

  /**
   * Builds a complete General Retrieval Plan for a mission ontology.
   * Hands over EvidenceGoals to SourceBrain (Section 3 & 4).
   * GeneralRetrievalPlanner retains NO duplicate source memory.
   */
  public static plan(
    ontology: MissionOntology,
    mappings: MandatoryCriterionMapping[],
    analysis: ObjectiveAnalysis,
    sourceBrain?: SourceBrain
  ): GeneralRetrievalPlan {
    const evidenceGoals = this.deriveEvidenceGoals(ontology, mappings, analysis);
    const sourceClasses = this.collectSourceClasses(evidenceGoals);
    const queryStrategies = this.synthesizeQueries(evidenceGoals, ontology, analysis);

    // SourceBrain decides WHERE and HOW to search by consulting SourceKnowledgeMap
    const brain = sourceBrain || SourceBrain.getInstance();
    const sourceDecisions = brain.evaluateGoals(evidenceGoals, analysis.geography);

    const candidatePaths = this.synthesizeCandidatePaths(
      evidenceGoals,
      sourceClasses,
      queryStrategies,
      analysis,
      sourceDecisions
    );

    return {
      planId: `GEN_PLAN_${Date.now()}`,
      primaryUnit: ontology.primaryUnitOfAnalysis,
      evidenceGoals,
      sourceClasses,
      queryStrategies,
      candidatePaths,
      sourceDecisions
    };
  }

  /**
   * 3. EVIDENCE-DRIVEN RETRIEVAL:
   * Each Mandatory Criterion produces one or more EvidenceGoal.
   */
  public static deriveEvidenceGoals(
    ontology: MissionOntology,
    mappings: MandatoryCriterionMapping[],
    analysis: ObjectiveAnalysis
  ): EvidenceGoal[] {
    const goals: EvidenceGoal[] = [];
    const primaryUnit = ontology.primaryUnitOfAnalysis;

    let idx = 1;
    for (const mapping of mappings) {
      if (mapping.isNegativeConstraint) {
        // Negative constraint goal
        goals.push({
          id: `EVID_GOAL_${String(idx).padStart(2, '0')}`,
          statement_to_prove: `Record does NOT violate negative constraint: ${mapping.rawText}`,
          subject_role: 'PRIMARY_TARGET',
          predicate: 'SATISFIES_NEGATIVE_CONSTRAINT',
          acceptable_evidence_types: ['EXCLUSION_AUDIT_PASS'],
          preferred_source_classes: ['OFFICIAL_REGISTRY', 'DOCUMENT_REPOSITORY', 'SEARCH_ENGINE_DISCOVERY'],
          verification_test: mapping.qualificationTest,
          derivedFromCriterionId: mapping.criterionId
        });
      } else {
        const preferredSources = this.reasonSourceClasses(mapping.rawText, mapping.requiredEvidence);
        const predicate = mapping.mappedRelations[0] || 'DEMONSTRATES_CRITERION';

        goals.push({
          id: `EVID_GOAL_${String(idx).padStart(2, '0')}`,
          statement_to_prove: mapping.rawText,
          subject_role: 'PRIMARY_TARGET',
          predicate,
          object_role: mapping.mappedRelations.length > 1 ? mapping.mappedRelations[1] : undefined,
          acceptable_evidence_types: mapping.requiredEvidence.length > 0
            ? mapping.requiredEvidence
            : ['DOCUMENTED_PUBLIC_EVIDENCE'],
          preferred_source_classes: preferredSources,
          verification_test: mapping.qualificationTest,
          derivedFromCriterionId: mapping.criterionId
        });
      }
      idx++;
    }

    // If no goals derived from explicit criteria, derive from ontology relations & nodes
    if (goals.length === 0) {
      goals.push({
        id: 'EVID_GOAL_01',
        statement_to_prove: `Target entity must verify as active instance of ${primaryUnit}`,
        subject_role: 'PRIMARY_TARGET',
        predicate: 'IS_INSTANCE_OF',
        acceptable_evidence_types: ['IDENTITY_VERIFICATION'],
        preferred_source_classes: ['OFFICIAL_REGISTRY', 'INSTITUTIONAL_SITE', 'OPEN_DATA'],
        verification_test: `Entity resolves to verifiable ${primaryUnit}`
      });
      goals.push({
        id: 'EVID_GOAL_02',
        statement_to_prove: `Target must possess documented public provenance in ${analysis.geography}`,
        subject_role: 'PRIMARY_TARGET',
        predicate: 'OBSERVED_IN_TERRITORY',
        acceptable_evidence_types: ['GEOGRAPHIC_PROVENANCE'],
        preferred_source_classes: ['GOVERNMENT_PORTAL', 'PUBLIC_REPORT'],
        verification_test: `Entity evidenced in ${analysis.geography}`
      });
    }

    return goals;
  }

  /**
   * 4. SOURCE CLASS REASONING:
   * Pathfinder selects source classes from generic primitives, never hardcoding specific domains.
   */
  public static reasonSourceClasses(
    statement: string,
    evidenceRequirements: string[] = []
  ): SourceClass[] {
    const norm = (statement + ' ' + evidenceRequirements.join(' '))
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const classes = new Set<SourceClass>();

    if (/\b(registro|cuit|padron|oficial|matricula|personeria|estatuto|inscripcion)\b/i.test(norm)) {
      classes.add('OFFICIAL_REGISTRY');
      classes.add('GOVERNMENT_PORTAL');
    }
    if (/\b(gobierno|portal|municipal|provincial|ministerio|secretaria|boletin oficial|normativa|decreto|ordenanza)\b/i.test(norm)) {
      classes.add('GOVERNMENT_PORTAL');
      classes.add('DOCUMENT_REPOSITORY');
    }
    if (/\b(licitacion(es)?|compras?|contratacion(es)?|adquisicion(es)?|proveedores del estado|pliegos?)\b/i.test(norm)) {
      classes.add('PUBLIC_PROCUREMENT');
      classes.add('PUBLIC_CALL');
    }
    if (/\b(datos abiertos|open data|estadistica(s)?|censo|dataset|indicadores?)\b/i.test(norm)) {
      classes.add('OPEN_DATA');
      classes.add('STRUCTURED_API');
    }
    if (/\b(universidad(es)?|facultad(es)?|academico|carreras?|titulos?|grado|posgrado|repositorio academico)\b/i.test(norm)) {
      classes.add('UNIVERSITY_REPOSITORY');
      classes.add('INSTITUTIONAL_SITE');
    }
    if (/\b(investigacion|cientifico|conicet|paper|publicacion cientifica|patente(s)?|desarrollo cientifico)\b/i.test(norm)) {
      classes.add('RESEARCH_REPOSITORY');
      classes.add('UNIVERSITY_REPOSITORY');
    }
    if (/\b(empresa(s)?|companias?|corporativo|catalogo|fabrica(s)?|capacidad operativa|servicios?)\b/i.test(norm)) {
      classes.add('COMPANY_PUBLIC_SITE');
      classes.add('INSTITUTIONAL_SITE');
    }
    if (/\b(informe(s)?|reporte(s)?|balance|memoria|auditoria|estudio|relevamiento)\b/i.test(norm)) {
      classes.add('PUBLIC_REPORT');
      classes.add('DOCUMENT_REPOSITORY');
    }
    if (/\b(noticia(s)?|periodismo|prensa|articulos?|diarios?|medios?)\b/i.test(norm)) {
      classes.add('NEWS_EVIDENCE');
      classes.add('PUBLIC_REPORT');
    }
    if (/\b(programa publico|subsidio(s)?|financiamiento|convocatoria(s)?|fomento|apoyo publico)\b/i.test(norm)) {
      classes.add('PUBLIC_PROGRAM');
      classes.add('PUBLIC_CALL');
    }

    // Default robust primitives if none matched specifically
    if (classes.size === 0) {
      classes.add('GOVERNMENT_PORTAL');
      classes.add('INSTITUTIONAL_SITE');
      classes.add('OPEN_DATA');
      classes.add('SEARCH_ENGINE_DISCOVERY');
    }

    // Always ensure exploratory discovery is available
    classes.add('SEARCH_ENGINE_DISCOVERY');

    return Array.from(classes);
  }

  /**
   * 5. GENERIC QUERY SYNTHESIS:
   * Creates queries from ontology roles, relations, mandatory criteria, geography, and source classes.
   */
  public static synthesizeQueries(
    evidenceGoals: EvidenceGoal[],
    ontology: MissionOntology,
    analysis: ObjectiveAnalysis
  ): GeneralRetrievalQuery[] {
    const queries: GeneralRetrievalQuery[] = [];
    const primaryUnit = ontology.primaryUnitOfAnalysis.replace(/^ENTITY_/, '').toLowerCase();
    const geo = analysis.geography || 'Argentina';

    let qIdx = 1;
    for (const goal of evidenceGoals) {
      const statementWords = goal.statement_to_prove
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 3 && !['cada', 'todo', 'todos', 'para', 'como', 'debe', 'tener', 'registro'].includes(w))
        .slice(0, 4);

      for (const srcClass of goal.preferred_source_classes.slice(0, 2)) {
        const queryTerm = [
          primaryUnit,
          ...statementWords,
          this.getSourceClassAffinityTerm(srcClass),
          geo
        ].filter(Boolean).join(' ');

        queries.push({
          queryId: `QRY_${String(qIdx).padStart(2, '0')}`,
          queryString: queryTerm,
          goalId: goal.id,
          sourceClass: srcClass,
          expectedFact: goal.statement_to_prove,
          geographyConstraint: geo
        });
        qIdx++;
      }
    }

    return queries;
  }

  /**
   * 6. PARALLEL PATH RACING & CANDIDATE PATH GENERATION:
   * Generates at least 3-4 independent candidate paths from different source class families.
   */
  public static synthesizeCandidatePaths(
    evidenceGoals: EvidenceGoal[],
    sourceClasses: SourceClass[],
    queries: GeneralRetrievalQuery[],
    analysis: ObjectiveAnalysis,
    sourceDecisions?: GoalSourceDecision[]
  ): PathPlan[] {
    const primaryUnit = analysis.primaryUnitOfAnalysis || analysis.entityType;
    const geo = analysis.geography;

    const pathDefinitions: Array<{
      id: string;
      name: string;
      family: PathPlan['family'];
      preferredClasses: SourceClass[];
      cost: number;
      expectedTime: number;
    }> = [
      {
        id: `PATH_GEN_OFFICIAL_REGISTRY_${Date.now()}`,
        name: `Official Registry & Government Portals for [${primaryUnit}]`,
        family: 'OFFICIAL_REGISTRY',
        preferredClasses: ['OFFICIAL_REGISTRY', 'GOVERNMENT_PORTAL', 'DOCUMENT_REPOSITORY'],
        cost: 2,
        expectedTime: 120
      },
      {
        id: `PATH_GEN_INSTITUTIONAL_ACADEMIC_${Date.now()}`,
        name: `Institutional & Academic Repositories for [${primaryUnit}]`,
        family: 'INSTITUTIONAL_DIRECTORIES',
        preferredClasses: ['INSTITUTIONAL_SITE', 'UNIVERSITY_REPOSITORY', 'RESEARCH_REPOSITORY'],
        cost: 3,
        expectedTime: 180
      },
      {
        id: `PATH_GEN_PUBLIC_PROCUREMENT_${Date.now()}`,
        name: `Public Procurement & Programs for [${primaryUnit}]`,
        family: 'OPEN_DATASETS',
        preferredClasses: ['PUBLIC_PROCUREMENT', 'PUBLIC_PROGRAM', 'PUBLIC_CALL'],
        cost: 4,
        expectedTime: 220
      },
      {
        id: `PATH_GEN_DOCUMENTARY_SYNTHESIS_${Date.now()}`,
        name: `Open Data & Multi-Source Documentary Synthesis for [${primaryUnit}]`,
        family: 'MULTI_ENGINE_PIPELINE',
        preferredClasses: ['OPEN_DATA', 'PUBLIC_REPORT', 'SEARCH_ENGINE_DISCOVERY'],
        cost: 3,
        expectedTime: 160
      }
    ];

    return pathDefinitions.map(def => {
      // Find matching source intelligence decision from SourceBrain
      const matchingWinner = sourceDecisions?.find(
        d => d.category === 'KNOWN_WINNER' && d.recommendedSources.some(s => def.preferredClasses.includes(s.source_class))
      );
      const matchingAlternative = sourceDecisions?.find(
        d => d.category === 'KNOWN_ALTERNATIVE' && d.recommendedSources.some(s => def.preferredClasses.includes(s.source_class))
      );
      const matchingGap = sourceDecisions?.find(
        d => (d.category === 'NEW_DISCOVERY_REQUIRED' || d.category === 'UNEXPLORED_FAMILY')
      );

      let pathScore = 0.82;
      let expectedYield = 5;
      let evidenceStrength = 0.88;
      let uncertainty = 0.30;

      if (matchingWinner) {
        // Known winner receives highest priority score (TEST 3)
        pathScore = matchingWinner.priorityScore;
        expectedYield = 12;
        evidenceStrength = 0.98;
        uncertainty = 0.10;
      } else if (matchingAlternative) {
        pathScore = matchingAlternative.priorityScore;
        expectedYield = 7;
        evidenceStrength = 0.90;
        uncertainty = 0.25;
      } else if (matchingGap) {
        // Unexplored family / new discovery required has higher uncertainty and baseline score
        pathScore = matchingGap.priorityScore;
        expectedYield = 4;
        uncertainty = 0.45;
      }

      const steps: PathStep[] = def.preferredClasses.map((cls, idx) => ({
        stepId: `STEP_${idx + 1}_${cls}`,
        action: 'CALL_SOURCE_DISCOVERY',
        engine: 'MULTI_ENGINE',
        inputType: primaryUnit,
        outputType: 'EVIDENCE_FRAGMENT',
        evidenceExpected: `Evidencia documental de clase ${cls}`
      }));

      return {
        pathId: def.id,
        name: def.name,
        family: def.family,
        engineType: 'MULTI_ENGINE',
        expectedYield,
        expectedQuality: matchingWinner ? 0.95 : 0.85,
        expectedNovelty: matchingWinner ? 0.75 : 0.90,
        expectedCost: def.cost,
        expectedTime: def.expectedTime,
        evidenceStrength,
        uncertainty,
        expansionValue: 0.80,
        calculatedPathScore: parseFloat(pathScore.toFixed(2)),
        status: 'PROPOSED',
        actionSequence: ['CALL_SOURCE_DISCOVERY', 'VERIFY_EVIDENCE', 'QUALIFY_MISSION_CANDIDATE'],
        steps
      };
    });
  }

  /**
   * 6. PARALLEL PATH RACING:
   * Probes multiple candidate paths, computes MISSION_QUALIFIED_PER_SECOND,
   * demotes zero-yield paths and promotes highest-yielding path.
   */
  public static async racePaths(
    paths: PathPlan[],
    probeFn: (path: PathPlan) => Promise<{
      candidatesFound: number;
      verified: number;
      qualified: number;
      latencyMs: number;
      cost?: number;
    }>
  ): Promise<{
    winningPath: PathPlan;
    metrics: PathRaceMetric[];
    promotedPaths: PathPlan[];
    abandonedPaths: PathPlan[];
  }> {
    const metrics: PathRaceMetric[] = [];
    const promotedPaths: PathPlan[] = [];
    const abandonedPaths: PathPlan[] = [];

    for (const path of paths) {
      path.status = 'TESTING';
      const result = await probeFn(path);

      const latencySec = Math.max(0.001, result.latencyMs / 1000);
      const qualifiedPerSecond = result.qualified / latencySec;

      const isZeroYield = result.qualified === 0 && result.verified === 0;

      const metric: PathRaceMetric = {
        pathId: path.pathId,
        candidatesFound: result.candidatesFound,
        verified: result.verified,
        qualified: result.qualified,
        evidenceCoverage: result.qualified > 0 ? 1.0 : (result.verified > 0 ? 0.5 : 0),
        novelty: 0.85,
        latencyMs: result.latencyMs,
        cost: result.cost || path.expectedCost,
        qualifiedPerSecond: parseFloat(qualifiedPerSecond.toFixed(2)),
        promoted: false,
        abandoned: isZeroYield
      };

      if (isZeroYield) {
        path.status = 'ABANDONED';
        path.failureReason = 'Zero yield in bounded probe: Produced 0 verified/qualified records.';
        abandonedPaths.push(path);
      } else {
        path.status = 'ACTIVE';
      }

      metrics.push(metric);
    }

    // Sort by MISSION_QUALIFIED_PER_SECOND descending
    metrics.sort((a, b) => b.qualifiedPerSecond - a.qualifiedPerSecond);

    const bestMetric = metrics[0];
    const winningPath = paths.find(p => p.pathId === bestMetric?.pathId) || paths[0];

    winningPath.status = 'PROMOTED';
    bestMetric.promoted = true;
    promotedPaths.push(winningPath);

    return {
      winningPath,
      metrics,
      promotedPaths,
      abandonedPaths
    };
  }

  private static collectSourceClasses(evidenceGoals: EvidenceGoal[]): SourceClass[] {
    const classes = new Set<SourceClass>();
    for (const goal of evidenceGoals) {
      for (const cls of goal.preferred_source_classes) {
        classes.add(cls);
      }
    }
    return Array.from(classes);
  }

  private static getSourceClassAffinityTerm(cls: SourceClass): string {
    switch (cls) {
      case 'OFFICIAL_REGISTRY': return 'registro oficial padron';
      case 'GOVERNMENT_PORTAL': return 'gobierno portal oficial';
      case 'PUBLIC_PROCUREMENT': return 'licitaciones compras publicas';
      case 'OPEN_DATA': return 'datos abiertos catalogo';
      case 'INSTITUTIONAL_SITE': return 'instituto asociacion';
      case 'UNIVERSITY_REPOSITORY': return 'universidad repositorio';
      case 'RESEARCH_REPOSITORY': return 'investigacion conicet';
      case 'COMPANY_PUBLIC_SITE': return 'empresa productos servicios';
      case 'PUBLIC_REPORT': return 'informe reporte balance';
      case 'NEWS_EVIDENCE': return 'noticias articulos prensa';
      case 'PUBLIC_PROGRAM': return 'programa convocatoria';
      case 'PUBLIC_CALL': return 'llamado concurso';
      case 'DOCUMENT_REPOSITORY': return 'documentos normativas';
      case 'STRUCTURED_API': return 'api dataset';
      case 'SEARCH_ENGINE_DISCOVERY':
      default:
        return 'informacion publica';
    }
  }
}
