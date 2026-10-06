/**
 * ATLAS — AI PATHFINDER V2
 * Module: MultiEngineMissionPlanner (Sections 13, 14, 16)
 * 
 * Orchestrates multi-engine missions, ensuring subgoals have distinct engine ownership
 * and generating multi-hop path sequences without single-engine shortcutting.
 * 
 * Invariants:
 * - Engine combinations dynamically planned per subgoal.
 * - Subgoals persist explicit ownership, dependencies, and success conditions.
 * - Multi-hop path steps connect source discovery to entity resolution and relational verification.
 */

import type {
  MissionDatabaseSchema,
  MissionOntology,
  MissionSubgoal,
  PathPlan,
  PathStep
} from './types.ts';

export class MultiEngineMissionPlanner {
  /**
   * Plans the mission subgoals and multi-engine path execution pipelines.
   */
  public static planMission(
    ontology: MissionOntology,
    schema: MissionDatabaseSchema
  ): {
    subgoals: MissionSubgoal[];
    paths: PathPlan[];
  } {
    const subgoals: MissionSubgoal[] = [];
    const primaryUnit = ontology.primaryUnitOfAnalysis;

    // Subgoal 1: Canonical Target Entity / Locality Discovery
    subgoals.push({
      subgoalId: 'SUBGOAL_01_TARGET_DISCOVERY',
      description: `Discover and verify primary instances of ${primaryUnit}`,
      targetOntologyType: primaryUnit,
      requiredFields: [schema.canonicalRelationField],
      requiredRelations: [],
      requiredEvidence: ['authoritative_primary_identity'],
      engines: this.determineEnginesForType(primaryUnit),
      dependencies: [],
      successCondition: `Discovered candidates for ${primaryUnit}`,
      status: 'PENDING'
    });

    // Subgoal 2: Secondary Actor / Contextual Relational Discovery
    if (ontology.secondaryEntityTypes.length > 0) {
      const secTypes = ontology.secondaryEntityTypes.join(', ');
      subgoals.push({
        subgoalId: 'SUBGOAL_02_SECONDARY_ACTOR_DISCOVERY',
        description: `Discover collaborating actors: ${secTypes}`,
        targetOntologyType: secTypes,
        requiredFields: ontology.secondaryEntityTypes.map(t => `${t.toLowerCase()}_name`),
        requiredRelations: ontology.relationTypes,
        requiredEvidence: ontology.evidenceTypes,
        engines: this.determineEnginesForSecondaryActors(ontology.secondaryEntityTypes),
        dependencies: ['SUBGOAL_01_TARGET_DISCOVERY'],
        successCondition: 'Secondary actor entities identified and linked',
        status: 'PENDING'
      });
    }

    // Subgoal 3: Documentary Evidence & Provenance Verification
    subgoals.push({
      subgoalId: 'SUBGOAL_03_DOCUMENTARY_EVIDENCE',
      description: 'Acquire authoritative public evidence, publications, and decrees',
      targetOntologyType: 'PUBLIC_SOURCE',
      requiredFields: ['provenance_sources'],
      requiredRelations: [],
      requiredEvidence: ['authoritative_citation', 'public_evidence'],
      engines: ['SOURCE_DISCOVERY'],
      dependencies: ['SUBGOAL_01_TARGET_DISCOVERY'],
      successCondition: 'All claimed facts corroborated with verifiable source URLs',
      status: 'PENDING'
    });

    // Subgoal 4: Relational & Qualification Verification
    if (ontology.relationTypes.length > 0 || ontology.missionEntityGraph.edges.length > 0) {
      subgoals.push({
        subgoalId: 'SUBGOAL_04_RELATIONSHIP_VERIFICATION',
        description: 'Verify joint context and relational links across participating actors',
        targetOntologyType: 'RELATIONSHIP',
        requiredFields: ['mission_qualification_status', 'mandatory_criteria_passed'],
        requiredRelations: ontology.relationTypes,
        requiredEvidence: ['joint_collaboration_proof'],
        engines: ['ORGANIZATION_DISCOVERY', 'PEOPLE_SEARCH', 'SOURCE_DISCOVERY'],
        dependencies: ['SUBGOAL_02_SECONDARY_ACTOR_DISCOVERY', 'SUBGOAL_03_DOCUMENTARY_EVIDENCE'],
        successCondition: 'Simultaneous participation and mandatory criteria verified',
        status: 'PENDING'
      });
    }

    // Generate Multi-Hop Paths (Section 16)
    const paths = this.composeMultiHopPaths(ontology, schema, subgoals);

    return { subgoals, paths };
  }

  private static determineEnginesForType(entityType: string): string[] {
    switch (entityType) {
      case 'PERSON':
        return ['PEOPLE_SEARCH'];
      case 'ORGANIZATION':
      case 'COMPANY':
      case 'INSTITUTION':
        return ['ORGANIZATION_DISCOVERY'];
      case 'CITY':
      case 'LOCALITY':
      case 'JURISDICTION':
      case 'LOGISTICS_NODE':
      case 'LOGISTICS_CORRIDOR':
        return ['ORGANIZATION_DISCOVERY', 'SOURCE_DISCOVERY'];
      case 'TECHNOLOGY':
      case 'TECHNOLOGY_TRANSFER_CASE':
        return ['SOURCE_DISCOVERY', 'ORGANIZATION_DISCOVERY'];
      case 'INTERSECTORAL_PROJECT':
      case 'PROJECT':
        return ['SOURCE_DISCOVERY', 'ORGANIZATION_DISCOVERY', 'PEOPLE_SEARCH'];
      case 'RELATIONSHIP':
      case 'COLLABORATION':
        return ['ORGANIZATION_DISCOVERY', 'SOURCE_DISCOVERY'];
      case 'MEDIA_OUTLET':
        return ['SOURCE_DISCOVERY', 'PEOPLE_SEARCH'];
      default:
        return ['SOURCE_DISCOVERY', 'ORGANIZATION_DISCOVERY'];
    }
  }

  private static determineEnginesForSecondaryActors(types: string[]): string[] {
    const engines = new Set<string>();
    for (const t of types) {
      if (t === 'PERSON') engines.add('PEOPLE_SEARCH');
      if (t === 'COMPANY' || t === 'INSTITUTION' || t === 'INDUSTRIAL_CLUSTER') engines.add('ORGANIZATION_DISCOVERY');
      if (t === 'PUBLIC_AGENCY') {
        engines.add('ORGANIZATION_DISCOVERY');
        engines.add('SOURCE_DISCOVERY');
      }
    }
    return Array.from(engines);
  }

  /**
   * Composes multi-hop paths matching the ontology and subgoals (Section 16).
   */
  private static composeMultiHopPaths(
    ontology: MissionOntology,
    schema: MissionDatabaseSchema,
    subgoals: MissionSubgoal[]
  ): PathPlan[] {
    const paths: PathPlan[] = [];
    const primaryUnit = ontology.primaryUnitOfAnalysis;

    // Strategy 1: Multi-Engine Cascading Pipeline
    const steps1: PathStep[] = [
      {
        stepId: 'STEP_01',
        action: 'CALL_SOURCE_DISCOVERY',
        engine: 'SOURCE_DISCOVERY',
        inputType: 'OBJECTIVE_CRITERIA',
        outputType: 'DOCUMENTARY_EVIDENCE',
        evidenceExpected: 'Public regulatory records, gazettes, or authoritative reports'
      },
      {
        stepId: 'STEP_02',
        action: 'CALL_ORGANIZATION_DISCOVERY',
        engine: 'ORGANIZATION_DISCOVERY',
        inputType: 'DOCUMENTARY_EVIDENCE',
        outputType: 'VERIFIED_ORGANIZATIONS',
        evidenceExpected: 'Institutional actors and legal CUIT identities'
      },
      {
        stepId: 'STEP_03',
        action: 'CALL_PEOPLE_SEARCH',
        engine: 'PEOPLE_SEARCH',
        inputType: 'VERIFIED_ORGANIZATIONS',
        outputType: 'VERIFIED_PEOPLE',
        evidenceExpected: 'Individual researchers, leads, or directors'
      },
      {
        stepId: 'STEP_04',
        action: 'QUALIFY_MISSION_CANDIDATE',
        engine: 'MISSION_QUALIFICATION_ENGINE',
        inputType: 'MULTI_ACTOR_RECORD',
        outputType: 'MISSION_QUALIFIED_RECORD',
        evidenceExpected: 'Mandatory criteria matrix with all PASS'
      }
    ];

    paths.push({
      pathId: `PATH_${primaryUnit}_MULTI_ENGINE_CASCADE`,
      name: `Multi-Engine Pipeline: Source Discovery → Organizations → Canonical People → Qualification`,
      family: 'MULTI_ENGINE_PIPELINE',
      engineType: 'MULTI_ENGINE',
      expectedYield: 8,
      expectedQuality: 0.95,
      expectedNovelty: 0.90,
      expectedCost: 3,
      expectedTime: 650,
      evidenceStrength: 0.95,
      uncertainty: 0.15,
      expansionValue: 0.90,
      calculatedPathScore: 0.92,
      status: 'PROPOSED',
      actionSequence: [
        'CALL_SOURCE_DISCOVERY',
        'CALL_ORGANIZATION_DISCOVERY',
        'CALL_PEOPLE_SEARCH',
        'QUALIFY_MISSION_CANDIDATE'
      ],
      steps: steps1
    });

    // Strategy 2: Relational Chain Verification Pipeline
    const steps2: PathStep[] = [
      {
        stepId: 'STEP_01',
        action: 'CALL_ORGANIZATION_DISCOVERY',
        engine: 'ORGANIZATION_DISCOVERY',
        inputType: 'SECTOR_TOPIC',
        outputType: 'PRIMARY_ACTORS',
        evidenceExpected: 'Chamber registries or university registries'
      },
      {
        stepId: 'STEP_02',
        action: 'CALL_SOURCE_DISCOVERY',
        engine: 'SOURCE_DISCOVERY',
        inputType: 'PRIMARY_ACTORS',
        outputType: 'BILATERAL_AGREEMENTS',
        evidenceExpected: 'Joint contracts, co-patents, or collaborative programs'
      },
      {
        stepId: 'STEP_03',
        action: 'QUALIFY_MISSION_CANDIDATE',
        engine: 'MISSION_QUALIFICATION_ENGINE',
        inputType: 'BILATERAL_AGREEMENTS',
        outputType: 'MISSION_QUALIFIED_RECORD',
        evidenceExpected: 'Strict same-context verification pass'
      }
    ];

    paths.push({
      pathId: `PATH_${primaryUnit}_RELATIONAL_CHAIN`,
      name: `Relational Chain: Organization Discovery → Joint Agreements → Same-Context Validation`,
      family: 'RELATIONSHIP_CHAIN',
      engineType: 'MULTI_ENGINE',
      expectedYield: 6,
      expectedQuality: 0.92,
      expectedNovelty: 0.85,
      expectedCost: 2,
      expectedTime: 500,
      evidenceStrength: 0.92,
      uncertainty: 0.20,
      expansionValue: 0.85,
      calculatedPathScore: 0.88,
      status: 'PROPOSED',
      actionSequence: [
        'CALL_ORGANIZATION_DISCOVERY',
        'CALL_SOURCE_DISCOVERY',
        'QUALIFY_MISSION_CANDIDATE'
      ],
      steps: steps2
    });

    // Strategy 3: Spatial / Capability Registry Pipeline
    const steps3: PathStep[] = [
      {
        stepId: 'STEP_01',
        action: 'CALL_SOURCE_DISCOVERY',
        engine: 'SOURCE_DISCOVERY',
        inputType: 'GEOGRAPHY_DIRECTORY',
        outputType: 'LOCALITY_NODES',
        evidenceExpected: 'Provincial municipal registries or transport network catalogs'
      },
      {
        stepId: 'STEP_02',
        action: 'CALL_ORGANIZATION_DISCOVERY',
        engine: 'ORGANIZATION_DISCOVERY',
        inputType: 'LOCALITY_NODES',
        outputType: 'LOCAL_FABRIC_EVIDENCE',
        evidenceExpected: 'Industrial park tenants, emergency civil defense bases, or technical schools'
      },
      {
        stepId: 'STEP_03',
        action: 'QUALIFY_MISSION_CANDIDATE',
        engine: 'MISSION_QUALIFICATION_ENGINE',
        inputType: 'LOCAL_FABRIC_EVIDENCE',
        outputType: 'MISSION_QUALIFIED_RECORD',
        evidenceExpected: 'Multi-dimensional capability qualification pass'
      }
    ];

    paths.push({
      pathId: `PATH_${primaryUnit}_LOCATION_CAPABILITY`,
      name: `Spatial Capability Pipeline: Locality Catalogs → Specialized Local Fabric → Qualification`,
      family: 'LOCATION_CAPABILITY_PIPELINE',
      engineType: 'MULTI_ENGINE',
      expectedYield: 8,
      expectedQuality: 0.90,
      expectedNovelty: 0.80,
      expectedCost: 2,
      expectedTime: 480,
      evidenceStrength: 0.90,
      uncertainty: 0.18,
      expansionValue: 0.80,
      calculatedPathScore: 0.86,
      status: 'PROPOSED',
      actionSequence: [
        'CALL_SOURCE_DISCOVERY',
        'CALL_ORGANIZATION_DISCOVERY',
        'QUALIFY_MISSION_CANDIDATE'
      ],
      steps: steps3
    });

    return paths;
  }
}
