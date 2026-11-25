/**
 * ATLAS — AI PATHFINDER V2
 * Module: AtlasOntologyMemory (Sections 17, 18, 19, 36)
 * 
 * Persistent Ontology Memory & Lifecycle Management for Extensible Concepts.
 * 
 * Invariants:
 * - MEMORY_CAN_OVERRIDE_OBJECTIVE_SEMANTICS = FALSE
 * - Lifecycle: ONTOLOGY_CANDIDATE → OBSERVED → VALIDATED → REUSABLE
 * - Promotion requires multiple observed instances and stable field structures.
 */

export interface StoredOntologyConcept {
  ontologyType: string;
  definition: string;
  knownAliases: string[];
  typicalAttributes: string[];
  typicalRelations: string[];
  successfulDiscoveryPaths: string[];
  evidencePatterns: string[];
  failurePatterns: string[];
  missionsWhereUsed: string[];
  observationCount: number;
  lifecycleState: 'ONTOLOGY_CANDIDATE' | 'OBSERVED' | 'VALIDATED' | 'REUSABLE';
  lastUpdated: string;
}

export class AtlasOntologyMemory {
  private static concepts: Map<string, StoredOntologyConcept> = new Map();
  private static initialized: boolean = false;

  public static initialize(): void {
    if (this.initialized) return;

    // Seed core established reusable ontology concepts
    this.registerCoreConcept({
      ontologyType: 'PERSON',
      definition: 'Individual human entity canonically resolved through People Search.',
      knownAliases: ['referente', 'especialista', 'investigador', 'experto', 'profesional', 'autor', 'periodista'],
      typicalAttributes: ['name', 'organization', 'role', 'geography', 'sector_topic', 'public_contact'],
      typicalRelations: ['AFFILIATED_WITH', 'AUTHORED', 'LEADS', 'RESEARCHES'],
      successfulDiscoveryPaths: ['PATH_PERSON_EVENT_SPEAKERS', 'PATH_PERSON_PUBLICATIONS'],
      evidencePatterns: ['academic_publication', 'institutional_page', 'conference_speaker_list'],
      failurePatterns: ['coerced_non_person_concept', 'unconstrained_web_crawler_noise'],
      missionsWhereUsed: ['CORE'],
      observationCount: 50,
      lifecycleState: 'REUSABLE',
      lastUpdated: new Date().toISOString()
    });

    this.registerCoreConcept({
      ontologyType: 'ORGANIZATION',
      definition: 'Legal, business, or civic organization with formal registration.',
      knownAliases: ['empresa', 'institucion', 'cooperativa', 'camara', 'fundacion', 'asociacion'],
      typicalAttributes: ['organization_name', 'cuit', 'sector', 'activity_description', 'jurisdiction', 'source_registry'],
      typicalRelations: ['OPERATES_IN', 'COLLABORATES_WITH', 'PARTNERS_WITH', 'DEVELOPS'],
      successfulDiscoveryPaths: ['PATH_ORG_TECH_PARKS', 'PATH_ORG_MASTER_REGISTRY'],
      evidencePatterns: ['official_gazette', 'cuit_registry', 'chamber_directory'],
      failurePatterns: ['unverified_dba_name'],
      missionsWhereUsed: ['CORE'],
      observationCount: 30,
      lifecycleState: 'REUSABLE',
      lastUpdated: new Date().toISOString()
    });

    this.registerCoreConcept({
      ontologyType: 'CITY',
      definition: 'Urban jurisdictional center or municipality with identifiable governance and public statistics.',
      knownAliases: ['ciudad', 'localidad', 'municipio', 'distrito_urbano'],
      typicalAttributes: ['city_name', 'province', 'jurisdiction', 'industrial_activity_evidence', 'technical_education_offer'],
      typicalRelations: ['HOSTS_CLUSTER', 'CONTAINS_PARK', 'PROVIDES_TRAINING'],
      successfulDiscoveryPaths: ['PATH_CITY_INDUSTRIAL_REGISTRY', 'PATH_LOCALITY_CENSUS_DIRECTORY'],
      evidencePatterns: ['provincial_industrial_survey', 'municipal_gazette', 'technical_school_registry'],
      failurePatterns: ['population_only_qualification_rejection'],
      missionsWhereUsed: ['CORE'],
      observationCount: 15,
      lifecycleState: 'REUSABLE',
      lastUpdated: new Date().toISOString()
    });

    this.registerCoreConcept({
      ontologyType: 'RELATIONSHIP',
      definition: 'First-class bilateral or multilateral link connecting two or more verified entities.',
      knownAliases: ['colaboracion', 'vinculo', 'convenio', 'alianza', 'articulacion'],
      typicalAttributes: ['subject_entity', 'predicate', 'object_entity', 'project_type', 'collaboration_evidence', 'agreement_date'],
      typicalRelations: ['PARTNERS_WITH', 'TRANSFERS_TO', 'CONTRACTED_BY'],
      successfulDiscoveryPaths: ['PATH_BILATERAL_AGREEMENT_REGISTRY', 'PATH_JOINT_RND_PUBLICATIONS'],
      evidencePatterns: ['joint_press_release', 'official_agreement_bulletin', 'co_authored_patent'],
      failurePatterns: ['co_occurrence_without_collaboration_proof'],
      missionsWhereUsed: ['CORE'],
      observationCount: 12,
      lifecycleState: 'REUSABLE',
      lastUpdated: new Date().toISOString()
    });

    this.registerCoreConcept({
      ontologyType: 'TECHNOLOGY_TRANSFER_CASE',
      definition: 'Scientific or academic technological development verified in practical/commercial application.',
      knownAliases: ['tecnologia_transferida', 'desarrollo_productivo', 'licencia_comercial', 'spin_off'],
      typicalAttributes: ['technology_name', 'origin_institution', 'application_evidence', 'transfer_type', 'recipient_entity'],
      typicalRelations: ['ORIGINATED_AT', 'LICENSED_TO', 'APPLIED_IN'],
      successfulDiscoveryPaths: ['PATH_TECH_TRANSFER_OFFICES', 'PATH_PATENT_LICENSING_BULLETINS'],
      evidencePatterns: ['technology_licensing_agreement', 'clinical_trial_authorization', 'commercial_adoption_proof'],
      failurePatterns: ['pure_academic_paper_without_application'],
      missionsWhereUsed: ['CORE'],
      observationCount: 10,
      lifecycleState: 'REUSABLE',
      lastUpdated: new Date().toISOString()
    });

    this.registerCoreConcept({
      ontologyType: 'INTERSECTORAL_PROJECT',
      definition: 'Joint initiative requiring simultaneous participation of public, academic, and private/social actors.',
      knownAliases: ['proyecto_tripartito', 'iniciativa_multiactor', 'consorcio_publico_privado'],
      typicalAttributes: ['project_name', 'public_actor', 'academic_actor', 'private_actor', 'concrete_result_evidence'],
      typicalRelations: ['INCLUDES_PUBLIC_ACTOR', 'INCLUDES_ACADEMIC_ACTOR', 'INCLUDES_PRIVATE_ACTOR', 'PRODUCES_RESULT'],
      successfulDiscoveryPaths: ['PATH_PUBLIC_PRIVATE_INNOVATION_FUNDS', 'PATH_MULTI_ACTOR_PROJECT_RECORDS'],
      evidencePatterns: ['tripartite_contract', 'joint_implementation_report', 'demonstrated_field_result'],
      failurePatterns: ['isolated_actor_conflation', 'joint_protocol_event_without_activity'],
      missionsWhereUsed: ['CORE'],
      observationCount: 8,
      lifecycleState: 'REUSABLE',
      lastUpdated: new Date().toISOString()
    });

    this.initialized = true;
  }

  private static registerCoreConcept(concept: StoredOntologyConcept): void {
    this.concepts.set(concept.ontologyType.toUpperCase(), concept);
  }

  /**
   * Section 36: Memory consultation provides prior strategy hints, but NEVER overrides objective semantics.
   */
  public static getConcept(ontologyType: string): StoredOntologyConcept | undefined {
    this.initialize();
    return this.concepts.get(ontologyType.toUpperCase());
  }

  public static recordMissionObservation(
    ontologyType: string,
    missionId: string,
    observedAttributes: string[],
    successfulPath?: string
  ): void {
    this.initialize();
    const key = ontologyType.toUpperCase();
    const existing = this.concepts.get(key);

    if (existing) {
      existing.observationCount++;
      if (!existing.missionsWhereUsed.includes(missionId)) {
        existing.missionsWhereUsed.push(missionId);
      }
      for (const attr of observedAttributes) {
        if (!existing.typicalAttributes.includes(attr)) existing.typicalAttributes.push(attr);
      }
      if (successfulPath && !existing.successfulDiscoveryPaths.includes(successfulPath)) {
        existing.successfulDiscoveryPaths.push(successfulPath);
      }
      existing.lastUpdated = new Date().toISOString();

      // Section 18: Promotion Lifecycle logic
      if (existing.lifecycleState === 'ONTOLOGY_CANDIDATE' && existing.observationCount >= 2) {
        existing.lifecycleState = 'OBSERVED';
      } else if (existing.lifecycleState === 'OBSERVED' && existing.observationCount >= 4) {
        existing.lifecycleState = 'VALIDATED';
      } else if (existing.lifecycleState === 'VALIDATED' && existing.observationCount >= 7) {
        existing.lifecycleState = 'REUSABLE';
      }
    } else {
      // New candidate discovered
      this.concepts.set(key, {
        ontologyType: key,
        definition: `Dynamically discovered ontology concept [${key}] observed in mission ${missionId}.`,
        knownAliases: [],
        typicalAttributes: [...observedAttributes],
        typicalRelations: [],
        successfulDiscoveryPaths: successfulPath ? [successfulPath] : [],
        evidencePatterns: [],
        failurePatterns: [],
        missionsWhereUsed: [missionId],
        observationCount: 1,
        lifecycleState: 'ONTOLOGY_CANDIDATE',
        lastUpdated: new Date().toISOString()
      });
    }
  }

  public static getAllConcepts(): StoredOntologyConcept[] {
    this.initialize();
    return Array.from(this.concepts.values());
  }
}
