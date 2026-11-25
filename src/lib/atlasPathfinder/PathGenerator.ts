/**
 * ATLAS — AI PATHFINDER V2
 * Module: PathGenerator (Sections 13, 15, 16)
 * 
 * Generates strategic candidate paths derived directly from the Mission Ontology,
 * Subgoals, and Mandatory Criterion evidence needs — eliminating template collapse.
 */

import type { ObjectiveAnalysis, PathPlan } from './types.ts';
import { MultiEngineMissionPlanner } from './MultiEngineMissionPlanner.ts';
import { GeneralRetrievalPlanner } from './GeneralRetrievalPlanner.ts';

export class PathGenerator {
  public static generateInitialPaths(analysis: ObjectiveAnalysis): PathPlan[] {
    // If multi-engine planner has already planned paths for ontology, use them
    if (analysis.ontology && analysis.schema) {
      const plan = MultiEngineMissionPlanner.planMission(analysis.ontology, analysis.schema);
      if (plan.paths.length > 0) {
        return plan.paths;
      }
    }

    const primaryUnit = (analysis.primaryUnitOfAnalysis || analysis.entityType || 'PERSON').toUpperCase();
    const paths: PathPlan[] = [];

    if (primaryUnit === 'CITY' || primaryUnit === 'LOCALITY' || primaryUnit === 'JURISDICTION') {
      paths.push({
        pathId: `PATH_${primaryUnit}_INDUSTRIAL_EDUCATION`,
        name: 'Provincial Industrial Surveys → Municipal Technical Schools → Local Automation Fabric',
        family: 'LOCATION_CAPABILITY_PIPELINE',
        engineType: 'MULTI_ENGINE',
        expectedYield: Math.min(20, analysis.targetQuantity * 2),
        expectedQuality: 0.95,
        expectedNovelty: 0.88,
        expectedCost: 3,
        expectedTime: 450,
        evidenceStrength: 0.95,
        uncertainty: 0.15,
        expansionValue: 0.90,
        calculatedPathScore: 0.91,
        status: 'PROPOSED',
        actionSequence: ['CALL_SOURCE_DISCOVERY', 'CALL_ORGANIZATION_DISCOVERY', 'QUALIFY_MISSION_CANDIDATE']
      });

      paths.push({
        pathId: `PATH_${primaryUnit}_CHAMBER_CLUSTERS`,
        name: 'Regional Industrial Parks (RAPI) & Technology Poles → Locality Capability Mapping',
        family: 'LOCATION_CAPABILITY_PIPELINE',
        engineType: 'ORGANIZATION_DISCOVERY',
        expectedYield: Math.min(25, analysis.targetQuantity * 2),
        expectedQuality: 0.92,
        expectedNovelty: 0.80,
        expectedCost: 2,
        expectedTime: 380,
        evidenceStrength: 0.92,
        uncertainty: 0.18,
        expansionValue: 0.85,
        calculatedPathScore: 0.88,
        status: 'PROPOSED',
        actionSequence: ['CALL_ORGANIZATION_DISCOVERY', 'QUALIFY_MISSION_CANDIDATE']
      });
    } else if (primaryUnit === 'RELATIONSHIP' || primaryUnit === 'COLLABORATION') {
      paths.push({
        pathId: 'PATH_RELATIONSHIP_BILATERAL_AGREEMENTS',
        name: 'University-Industry Technology Transfer Bulletins → Joint Renewable Energy Projects',
        family: 'RELATIONSHIP_CHAIN',
        engineType: 'MULTI_ENGINE',
        expectedYield: Math.min(15, analysis.targetQuantity * 2),
        expectedQuality: 0.96,
        expectedNovelty: 0.90,
        expectedCost: 3,
        expectedTime: 500,
        evidenceStrength: 0.96,
        uncertainty: 0.15,
        expansionValue: 0.92,
        calculatedPathScore: 0.93,
        status: 'PROPOSED',
        actionSequence: ['CALL_ORGANIZATION_DISCOVERY', 'CALL_SOURCE_DISCOVERY', 'QUALIFY_MISSION_CANDIDATE']
      });

      paths.push({
        pathId: 'PATH_RELATIONSHIP_APPLIED_CO_PATENTS',
        name: 'Joint R&D Consortia & Applied Patents → Bilateral Corporate Collaboration Proof',
        family: 'RELATIONSHIP_CHAIN',
        engineType: 'SOURCE_DISCOVERY',
        expectedYield: Math.min(12, analysis.targetQuantity * 2),
        expectedQuality: 0.93,
        expectedNovelty: 0.85,
        expectedCost: 2,
        expectedTime: 420,
        evidenceStrength: 0.93,
        uncertainty: 0.20,
        expansionValue: 0.88,
        calculatedPathScore: 0.89,
        status: 'PROPOSED',
        actionSequence: ['CALL_SOURCE_DISCOVERY', 'QUALIFY_MISSION_CANDIDATE']
      });
    } else if (primaryUnit === 'TECHNOLOGY' || primaryUnit === 'TECHNOLOGY_TRANSFER_CASE') {
      paths.push({
        pathId: 'PATH_TECH_TRANSFER_CASES',
        name: 'Academic Tech-Transfer Offices (OTCs) → Commercial Adoption & Clinical Approvals',
        family: 'MULTI_ENGINE_PIPELINE',
        engineType: 'MULTI_ENGINE',
        expectedYield: Math.min(15, analysis.targetQuantity * 2),
        expectedQuality: 0.95,
        expectedNovelty: 0.92,
        expectedCost: 3,
        expectedTime: 520,
        evidenceStrength: 0.95,
        uncertainty: 0.16,
        expansionValue: 0.91,
        calculatedPathScore: 0.92,
        status: 'PROPOSED',
        actionSequence: ['CALL_SOURCE_DISCOVERY', 'CALL_ORGANIZATION_DISCOVERY', 'QUALIFY_MISSION_CANDIDATE']
      });
    } else if (primaryUnit === 'INTERSECTORAL_PROJECT' || primaryUnit === 'PROJECT') {
      paths.push({
        pathId: 'PATH_INTERSECTORAL_PROJECTS',
        name: 'Public Innovation Funds (FONARSEC/MINCYT) → Tripartite Actor Verification & Concrete Outputs',
        family: 'MULTI_ENGINE_PIPELINE',
        engineType: 'MULTI_ENGINE',
        expectedYield: Math.min(15, analysis.targetQuantity * 2),
        expectedQuality: 0.96,
        expectedNovelty: 0.92,
        expectedCost: 4,
        expectedTime: 580,
        evidenceStrength: 0.96,
        uncertainty: 0.15,
        expansionValue: 0.93,
        calculatedPathScore: 0.93,
        status: 'PROPOSED',
        actionSequence: ['CALL_SOURCE_DISCOVERY', 'CALL_ORGANIZATION_DISCOVERY', 'CALL_PEOPLE_SEARCH', 'QUALIFY_MISSION_CANDIDATE']
      });
    } else if (primaryUnit === 'LOGISTICS_NODE' || primaryUnit === 'LOGISTICS_CORRIDOR') {
      paths.push({
        pathId: 'PATH_LOGISTICS_COLD_CHAIN',
        name: 'Multimodal Transport Network → Cold Storage Terminals & Perishable Wholesale Markets',
        family: 'LOCATION_CAPABILITY_PIPELINE',
        engineType: 'MULTI_ENGINE',
        expectedYield: Math.min(15, analysis.targetQuantity * 2),
        expectedQuality: 0.94,
        expectedNovelty: 0.88,
        expectedCost: 3,
        expectedTime: 490,
        evidenceStrength: 0.94,
        uncertainty: 0.18,
        expansionValue: 0.89,
        calculatedPathScore: 0.90,
        status: 'PROPOSED',
        actionSequence: ['CALL_SOURCE_DISCOVERY', 'CALL_ORGANIZATION_DISCOVERY', 'QUALIFY_MISSION_CANDIDATE']
      });
    } else if (primaryUnit === 'MEDIA_OUTLET') {
      paths.push({
        pathId: 'PATH_MEDIA_EDITORIAL_SCIENCE',
        name: 'Scientific Journalism Portals & Magazines → Mastheads → Verified Author Bylines',
        family: 'MULTI_ENGINE_PIPELINE',
        engineType: 'MULTI_ENGINE',
        expectedYield: Math.min(15, analysis.targetQuantity * 2),
        expectedQuality: 0.93,
        expectedNovelty: 0.85,
        expectedCost: 2,
        expectedTime: 420,
        evidenceStrength: 0.93,
        uncertainty: 0.19,
        expansionValue: 0.87,
        calculatedPathScore: 0.89,
        status: 'PROPOSED',
        actionSequence: ['CALL_SOURCE_DISCOVERY', 'CALL_PEOPLE_SEARCH', 'QUALIFY_MISSION_CANDIDATE']
      });
    } else if (primaryUnit === 'ORGANIZATION') {
      paths.push({
        pathId: 'PATH_ORG_SPECIALIZED_REGISTRY',
        name: 'Targeted Institutional Registries & Certified Operational Capacity',
        family: 'OFFICIAL_REGISTRY',
        engineType: 'ORGANIZATION_DISCOVERY',
        expectedYield: Math.min(25, analysis.targetQuantity * 2),
        expectedQuality: 0.94,
        expectedNovelty: 0.82,
        expectedCost: 2,
        expectedTime: 360,
        evidenceStrength: 0.94,
        uncertainty: 0.15,
        expansionValue: 0.86,
        calculatedPathScore: 0.90,
        status: 'PROPOSED',
        actionSequence: ['CALL_ORGANIZATION_DISCOVERY', 'QUALIFY_MISSION_CANDIDATE']
      });
    } else if (primaryUnit === 'PERSON') {
      paths.push({
        pathId: 'PATH_PERSON_TECHNICAL_CREDENTIALS',
        name: 'Verified Technical Projects & Operations → Canonical People Search Resolution',
        family: 'CANONICAL_PEOPLE_SEARCH',
        engineType: 'PEOPLE_SEARCH',
        expectedYield: Math.min(20, analysis.targetQuantity * 2),
        expectedQuality: 0.95,
        expectedNovelty: 0.88,
        expectedCost: 3,
        expectedTime: 410,
        evidenceStrength: 0.95,
        uncertainty: 0.15,
        expansionValue: 0.90,
        calculatedPathScore: 0.92,
        status: 'PROPOSED',
        actionSequence: ['CALL_PEOPLE_SEARCH', 'QUALIFY_MISSION_CANDIDATE']
      });
    } else {
      // ─────────────────────────────────────────────────────────────
      // UNKNOWN / MISSION DEFINED ENTITY → GENERAL RETRIEVAL PLANNER
      // Never default unknown type to PEOPLE_SEARCH!
      // ─────────────────────────────────────────────────────────────
      const generalPlan = GeneralRetrievalPlanner.plan(
        analysis.ontology || {
          ontologyNodes: [],
          ontologyRelations: [],
          primaryUnitOfAnalysis: primaryUnit,
          secondaryEntityTypes: [],
          relationTypes: [],
          attributeTypes: [],
          evidenceTypes: [],
          compositeEntityCandidates: [],
          unknownConcepts: [],
          ontologyConfidence: 0.85,
          missionDefinedEntityCreated: true,
          missionEntityGraph: { nodes: [], edges: [] }
        },
        analysis.criterionMappings || [],
        analysis
      );
      paths.push(...generalPlan.candidatePaths);
    }

    return paths;
  }

  public static discoverAlternativePaths(analysis: ObjectiveAnalysis, excludedFamilies: string[]): PathPlan[] {
    const allPaths = this.generateInitialPaths(analysis);
    const filtered = allPaths.filter(p => !excludedFamilies.includes(p.family));
    if (filtered.length > 0) return filtered;

    // Fallback alternative path
    return [
      {
        pathId: `PATH_${analysis.entityType}_CROSS_SOURCE_DISCOVERY`,
        name: `Cross-Source Discovery: Public Repositories & Regulatory Bulletins`,
        family: 'OPEN_DATASETS',
        engineType: 'SOURCE_DISCOVERY',
        expectedYield: 10,
        expectedQuality: 0.90,
        expectedNovelty: 0.95,
        expectedCost: 3,
        expectedTime: 400,
        evidenceStrength: 0.90,
        uncertainty: 0.20,
        expansionValue: 0.90,
        calculatedPathScore: 0.88,
        status: 'PROPOSED',
        actionSequence: ['CALL_SOURCE_DISCOVERY', 'QUALIFY_MISSION_CANDIDATE']
      }
    ];
  }
}
