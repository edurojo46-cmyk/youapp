/**
 * ATLAS GENERAL OBJECTIVE INTELLIGENCE ENGINE V1
 * Module: NextBestActionEngine (Section 10)
 * 
 * At every decision point chooses the next optimal reasoning / execution action.
 */

import type { MissionSpecification, SubgoalNode, StrategyPlan, NextActionType } from './types.ts';
import { MissionGraph } from './MissionGraph.ts';

export interface NextActionDecision {
  action: NextActionType;
  targetSubgoalId: string;
  targetStrategyId?: string;
  payload: Record<string, any>;
  rationale: string;
}

export class NextBestActionEngine {
  public static selectNextAction(
    mission: MissionSpecification,
    graph: MissionGraph,
    strategies: StrategyPlan[],
    currentResultsCount: number
  ): NextActionDecision {
    // 1. If target quantity reached, finish mission
    if (currentResultsCount >= mission.targetQuantity) {
      return {
        action: 'FINISH_MISSION',
        targetSubgoalId: 'SUB_MISSION_SYNTHESIS',
        payload: { finalCount: currentResultsCount },
        rationale: `Target quantity ${mission.targetQuantity} reached (${currentResultsCount} validated items). Finalizing mission.`
      };
    }

    // 2. Find next executable subgoal in the DAG
    const nextSubgoal = graph.getNextExecutableSubgoal();
    if (!nextSubgoal) {
      if (graph.isComplete()) {
        return {
          action: 'FINISH_MISSION',
          targetSubgoalId: 'SUB_MISSION_SYNTHESIS',
          payload: { finalCount: currentResultsCount },
          rationale: 'All subgoals in the mission graph are completed.'
        };
      } else {
        return {
          action: 'ABANDON_BRANCH',
          targetSubgoalId: 'UNKNOWN',
          payload: { reason: 'No executable subgoals remaining.' },
          rationale: 'Subgoal execution dependencies blocked.'
        };
      }
    }

    // 3. Match subgoal to active strategy
    const activeStrategy = strategies.find(s => s.status === 'ACTIVE' || s.status === 'TESTING') || strategies[0];

    // Determine appropriate action based on subgoal ID and engine type
    switch (nextSubgoal.id) {
      case 'SUB_DOMAIN_EXPANSION':
      case 'SUB_SECTOR_TAXONOMY':
      case 'SUB_CONTENT_INTENT_ANALYSIS':
        return {
          action: 'SEARCH_ATLAS_MEMORY',
          targetSubgoalId: nextSubgoal.id,
          targetStrategyId: activeStrategy.strategyId,
          payload: { domainTopics: mission.domainTopics },
          rationale: 'Consult problem-solving memory and taxonomy to expand domain boundaries.'
        };

      case 'SUB_SOURCE_IDENTIFICATION':
      case 'SUB_TOPIC_RESERVOIR_SEARCH':
        return {
          action: 'DISCOVER_SOURCES',
          targetSubgoalId: nextSubgoal.id,
          targetStrategyId: activeStrategy.strategyId,
          payload: { domainTopics: mission.domainTopics, geography: mission.geography },
          rationale: 'Identify candidate public source repositories in Atlas Source Graph.'
        };

      case 'SUB_CANDIDATE_ACQUISITION':
        return {
          action: 'CALL_PEOPLE_SEARCH',
          targetSubgoalId: nextSubgoal.id,
          targetStrategyId: activeStrategy.strategyId,
          payload: {
            query: mission.domainTopics.join(' '),
            geography: mission.geography,
            limit: mission.targetQuantity * 2
          },
          rationale: 'Call authoritative People Search specialized adapter without modifying internal indexes or ranking.'
        };

      case 'SUB_REGISTRY_SEARCH':
        return {
          action: 'SEARCH_ORGANIZATIONS',
          targetSubgoalId: nextSubgoal.id,
          targetStrategyId: activeStrategy.strategyId,
          payload: {
            sectorTopics: mission.domainTopics,
            geography: mission.geography
          },
          rationale: 'Query official organization registries via Organization Discovery Adapter.'
        };

      case 'SUB_ACCESSIBILITY_PROBE':
      case 'SUB_PUBLIC_CHANNEL_EXTRACTION':
        return {
          action: 'FETCH_PUBLIC_RESOURCE',
          targetSubgoalId: nextSubgoal.id,
          targetStrategyId: activeStrategy.strategyId,
          payload: { format: 'CSV', publicOnly: true },
          rationale: 'Physically fetch and verify publicly accessible endpoints.'
        };

      case 'SUB_VIDEO_SEARCH_EXECUTION':
        return {
          action: 'CALL_VIDEO_SEARCH',
          targetSubgoalId: nextSubgoal.id,
          targetStrategyId: activeStrategy.strategyId,
          payload: { query: mission.domainTopics.join(' ') },
          rationale: 'Call Video Search adapter preserving native ranking and media scoring.'
        };

      case 'SUB_EXPERTISE_VERIFICATION':
      case 'SUB_ACTIVITY_VERIFICATION':
      case 'SUB_CONTACT_VALIDATION':
      case 'SUB_PLAYABILITY_GATE':
      case 'SUB_YIELD_EVALUATION':
        return {
          action: 'VERIFY_EVIDENCE',
          targetSubgoalId: nextSubgoal.id,
          targetStrategyId: activeStrategy.strategyId,
          payload: { minConfidence: mission.evidenceRequirements.minConfidence },
          rationale: 'Verify physical provenance, institutional links, and absence of synthetic data.'
        };

      case 'SUB_MISSION_SYNTHESIS':
      default:
        return {
          action: 'COMPLETE_SUBGOAL',
          targetSubgoalId: nextSubgoal.id,
          targetStrategyId: activeStrategy.strategyId,
          payload: {},
          rationale: 'Aggregate verified evidence items into final mission results.'
        };
    }
  }
}
