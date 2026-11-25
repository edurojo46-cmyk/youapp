/**
 * ATLAS GENERAL OBJECTIVE INTELLIGENCE ENGINE V1
 * Module: MultiStrategyGenerator (Section 9)
 * 
 * Formulates multiple plausible, distinct execution strategies for any given mission.
 */

import type { MissionSpecification, StrategyPlan } from './types.ts';
import { AtlasGeneralMemory } from './AtlasGeneralMemory.ts';

export class MultiStrategyGenerator {
  public static generateStrategies(mission: MissionSpecification): StrategyPlan[] {
    const heuristics = AtlasGeneralMemory.getHeuristicsForMission(mission);
    const plans: StrategyPlan[] = [];

    switch (mission.objectiveType) {
      case 'EXPERT_DISCOVERY':
        plans.push({
          strategyId: 'STRAT_EXP_PEOPLE_SEARCH_DIRECT',
          name: 'Canonical People Search with Domain Filters',
          rationale: 'Direct query to authoritative People Search engine filtering by role, profession, and organization.',
          engineType: 'PEOPLE_SEARCH',
          actionSequence: ['CALL_PEOPLE_SEARCH', 'VERIFY_EVIDENCE', 'COMPLETE_SUBGOAL'],
          expectedYield: 25,
          confidenceScore: 0.90,
          status: 'PROPOSED'
        });

        plans.push({
          strategyId: 'STRAT_EXP_INSTITUTIONAL_FACULTY',
          name: 'Academic & Research Institute Network',
          rationale: 'Consult Living Source Graph for specialized faculties (CONICET, CNEA, UBA, UNC, etc.) and query verified staff.',
          engineType: 'PEOPLE_SEARCH',
          actionSequence: ['EXPAND_SOURCE_GRAPH', 'CALL_PEOPLE_SEARCH', 'VERIFY_ENTITY', 'COMPLETE_SUBGOAL'],
          expectedYield: 40,
          confidenceScore: 0.86,
          status: 'PROPOSED'
        });

        plans.push({
          strategyId: 'STRAT_EXP_PROFESSIONAL_COUNCIL',
          name: 'Professional Collegiate & Engineering Councils',
          rationale: 'Target regulated professional bodies and technical colleges for certified accredited experts.',
          engineType: 'PEOPLE_SEARCH',
          actionSequence: ['SEARCH_ATLAS_MEMORY', 'CALL_PEOPLE_SEARCH', 'COMPLETE_SUBGOAL'],
          expectedYield: 30,
          confidenceScore: 0.82,
          status: 'PROPOSED'
        });
        break;

      case 'ORGANIZATION_DISCOVERY':
        plans.push({
          strategyId: 'STRAT_ORG_MASTER_REGISTRY',
          name: 'Official Corporate & Industrial Registries',
          rationale: 'Query official business and cooperative registers with validated CUIT and activity classification.',
          engineType: 'ORGANIZATION_DISCOVERY',
          actionSequence: ['SEARCH_ORGANIZATIONS', 'VERIFY_ENTITY', 'COMPLETE_SUBGOAL'],
          expectedYield: 35,
          confidenceScore: 0.92,
          status: 'PROPOSED'
        });

        plans.push({
          strategyId: 'STRAT_ORG_INDUSTRIAL_PARK_CLUSTER',
          name: 'Industrial Park Clusters & Sector Chambers',
          rationale: 'Leverage established industrial clusters (RAPI) and regional business chambers (CAME/UIA).',
          engineType: 'ORGANIZATION_DISCOVERY',
          actionSequence: ['SEARCH_ATLAS_MEMORY', 'SEARCH_ORGANIZATIONS', 'COMPLETE_SUBGOAL'],
          expectedYield: 25,
          confidenceScore: 0.85,
          status: 'PROPOSED'
        });

        plans.push({
          strategyId: 'STRAT_ORG_INNOVATION_TECH_PARKS',
          name: 'Technology Parks & Innovation Hubs',
          rationale: 'Target verified technological poles (Rosario, Córdoba, Tandil, Misiones) for specialized firms.',
          engineType: 'ORGANIZATION_DISCOVERY',
          actionSequence: ['DISCOVER_SOURCES', 'SEARCH_ORGANIZATIONS', 'COMPLETE_SUBGOAL'],
          expectedYield: 20,
          confidenceScore: 0.78,
          status: 'PROPOSED'
        });
        break;

      case 'SOURCE_DISCOVERY':
        plans.push({
          strategyId: 'STRAT_SRC_CKAN_CATALOGS',
          name: 'National & Provincial Open Data Catalogs (CKAN)',
          rationale: 'Scan official CKAN endpoints (datos.gob.ar, BA Datos, PBA) for structured datasets matching topic.',
          engineType: 'SOURCE_DISCOVERY',
          actionSequence: ['DISCOVER_SOURCES', 'FETCH_PUBLIC_RESOURCE', 'COMPLETE_SUBGOAL'],
          expectedYield: 20,
          confidenceScore: 0.94,
          status: 'PROPOSED'
        });

        plans.push({
          strategyId: 'STRAT_SRC_LIVING_MAP_ANALOGY',
          name: 'Living Source Graph Analogy Expansion',
          rationale: 'Expand from high-yield known nodes in Atlas Source Graph to thematic sibling entities.',
          engineType: 'SOURCE_DISCOVERY',
          actionSequence: ['SEARCH_ATLAS_MEMORY', 'EXPAND_SOURCE_GRAPH', 'COMPLETE_SUBGOAL'],
          expectedYield: 30,
          confidenceScore: 0.88,
          status: 'PROPOSED'
        });

        plans.push({
          strategyId: 'STRAT_SRC_INSTITUTIONAL_REPOSITORIES',
          name: 'Digital Repositories & Academic Portals',
          rationale: 'Target institutional open repositories (SNRD, university portals) for research data resources.',
          engineType: 'SOURCE_DISCOVERY',
          actionSequence: ['DISCOVER_SOURCES', 'VERIFY_EVIDENCE', 'COMPLETE_SUBGOAL'],
          expectedYield: 15,
          confidenceScore: 0.80,
          status: 'PROPOSED'
        });
        break;

      case 'PUBLIC_CONTACT_DISCOVERY':
        plans.push({
          strategyId: 'STRAT_CNT_OFFICIAL_DIRECTORIES',
          name: 'Public Administration & Institutional Directories',
          rationale: 'Harvest verified public contact channels directly from published official organizational structures.',
          engineType: 'PUBLIC_CONTACT',
          actionSequence: ['FETCH_PUBLIC_RESOURCE', 'VERIFY_EVIDENCE', 'COMPLETE_SUBGOAL'],
          expectedYield: 40,
          confidenceScore: 0.93,
          status: 'PROPOSED'
        });

        plans.push({
          strategyId: 'STRAT_CNT_MUNICIPAL_PORTALS',
          name: 'Municipal & Provincial Transparency Portals',
          rationale: 'Acquire contact channels from municipal registers and legal assistance offices.',
          engineType: 'PUBLIC_CONTACT',
          actionSequence: ['SEARCH_ATLAS_MEMORY', 'FETCH_PUBLIC_RESOURCE', 'COMPLETE_SUBGOAL'],
          expectedYield: 25,
          confidenceScore: 0.85,
          status: 'PROPOSED'
        });

        plans.push({
          strategyId: 'STRAT_CNT_PROFESSIONAL_COLLEGE_CHANNELS',
          name: 'Professional Council Contact Desks',
          rationale: 'Target official secretariat and member assistance channels from professional colleges.',
          engineType: 'PUBLIC_CONTACT',
          actionSequence: ['EXPAND_SOURCE_GRAPH', 'FETCH_PUBLIC_RESOURCE', 'COMPLETE_SUBGOAL'],
          expectedYield: 20,
          confidenceScore: 0.81,
          status: 'PROPOSED'
        });
        break;

      case 'CONTENT_DISCOVERY':
        plans.push({
          strategyId: 'STRAT_VID_NATIVE_SEARCH',
          name: 'Video Search with Entity & Work Disambiguation',
          rationale: 'Execute native query through Video Search engine preserving its internal ranking and media quality.',
          engineType: 'VIDEO_SEARCH',
          actionSequence: ['CALL_VIDEO_SEARCH', 'VERIFY_EVIDENCE', 'COMPLETE_SUBGOAL'],
          expectedYield: 15,
          confidenceScore: 0.95,
          status: 'PROPOSED'
        });

        plans.push({
          strategyId: 'STRAT_VID_EDUCATIONAL_CHANNELS',
          name: 'Verified Educational & Documentary Media Hubs',
          rationale: 'Query institutional broadcasting channels and science outreach portals via Video Search adapter.',
          engineType: 'VIDEO_SEARCH',
          actionSequence: ['CALL_VIDEO_SEARCH', 'VERIFY_EVIDENCE', 'COMPLETE_SUBGOAL'],
          expectedYield: 20,
          confidenceScore: 0.89,
          status: 'PROPOSED'
        });
        break;
    }

    // Rank plans by confidence score descending
    plans.sort((a, b) => b.confidenceScore - a.confidenceScore);
    return plans;
  }
}
