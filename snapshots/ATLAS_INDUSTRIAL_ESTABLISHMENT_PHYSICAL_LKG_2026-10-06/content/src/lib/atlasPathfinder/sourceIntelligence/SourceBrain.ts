/**
 * ATLAS — SOURCE INTELLIGENCE LAYER
 * Module: SourceBrain (Sections 1, 2, 3, 4, 8, 9)
 * 
 * Central Source Reasoning & Tactical Dispatcher:
 * - Bridges GeneralRetrievalPlanner ("WHAT evidence is needed") with physical source execution ("WHERE & HOW to get it").
 * - Evaluates EvidenceGoals against SourceKnowledgeMap.
 * - Categorizes each goal resolution:
 *     1. KNOWN_WINNER: Established high-yield, low-latency, reliable source.
 *     2. KNOWN_ALTERNATIVE: Verified secondary source in known family.
 *     3. UNEXPLORED_FAMILY: Known family/ecosystem without calibrated endpoints.
 *     4. NEW_DISCOVERY_REQUIRED: Complete gap, triggers SourceFamilyGapEngine.
 * - Manages Canary Probing and the Speed Loop:
 *     CANARY -> MEASURE QUALIFIED YIELD -> PROMOTE -> SCALE EXTRACTION.
 *     Zero-yield -> Fast deprioritization / kill.
 *     High qualified/sec -> Allocate more rotor capacity.
 */

import type { EvidenceGoal, SourceClass, PathPlan } from '../types.ts';
import {
  SourceKnowledgeMap,
  type SourceKnowledgeEntry,
  type SourceMissionFeedback,
  type SourceStatus
} from './SourceKnowledgeMap.ts';
import { SourceFamilyGapEngine, type EcosystemDiscoveryResult } from './SourceFamilyGapEngine.ts';

export type SourceDecisionCategory =
  | 'KNOWN_WINNER'
  | 'KNOWN_ALTERNATIVE'
  | 'UNEXPLORED_FAMILY'
  | 'NEW_DISCOVERY_REQUIRED';

export interface GoalSourceDecision {
  goalId: string;
  statementToProve: string;
  category: SourceDecisionCategory;
  recommendedSources: SourceKnowledgeEntry[];
  gapDetected: boolean;
  selectedSourceId?: string;
  priorityScore: number;
  reasoning: string;
}

export interface CanaryProbeResult {
  sourceId: string;
  sampleTested: number;
  candidatesFound: number;
  verified: number;
  qualified: number;
  latencyMs: number;
  qualifiedPerSecond: number;
  action: 'PROMOTE' | 'DEPRIORITIZE_FAST' | 'RETRY';
  allocatedRotors: number;
}

export class SourceBrain {
  private static instance: SourceBrain;
  private knowledgeMapOverride?: SourceKnowledgeMap;
  private gapEngineOverride?: SourceFamilyGapEngine;

  // Active rotor capacity allocation per source
  private rotorAllocations: Map<string, number> = new Map();

  private constructor(knowledgeMap?: SourceKnowledgeMap, gapEngine?: SourceFamilyGapEngine) {
    this.knowledgeMapOverride = knowledgeMap;
    this.gapEngineOverride = gapEngine;
  }

  public static getInstance(): SourceBrain {
    if (!this.instance) {
      this.instance = new SourceBrain();
    }
    return this.instance;
  }

  public static resetForTest(): void {
    this.instance = new SourceBrain();
  }

  public getKnowledgeMap(): SourceKnowledgeMap {
    return this.knowledgeMapOverride || SourceKnowledgeMap.getInstance();
  }

  public getGapEngine(): SourceFamilyGapEngine {
    return this.gapEngineOverride || SourceFamilyGapEngine.getInstance();
  }

  /**
   * 4. SOURCE BRAIN EVALUATION:
   * For each EvidenceGoal, consults SourceKnowledgeMap and classifies into:
   * KNOWN_WINNER, KNOWN_ALTERNATIVE, UNEXPLORED_FAMILY, or NEW_DISCOVERY_REQUIRED.
   */
  public evaluateGoal(goal: EvidenceGoal, geography: string = 'Argentina'): GoalSourceDecision {
    const candidateSources = this.getKnowledgeMap().findSourcesForGoal(goal, geography);

    if (candidateSources.length === 0) {
      // Check if any source shares a related family or parent domain
      const allSources = this.getKnowledgeMap().getAllSources();
      const familyCandidate = allSources.find(s =>
        goal.preferred_source_classes.includes(s.source_class) ||
        s.topics.some(t => goal.statement_to_prove.toLowerCase().includes(t.toLowerCase()))
      );

      if (familyCandidate) {
        return {
          goalId: goal.id,
          statementToProve: goal.statement_to_prove,
          category: 'UNEXPLORED_FAMILY',
          recommendedSources: [familyCandidate],
          gapDetected: true,
          priorityScore: 0.5,
          reasoning: `Family ${familyCandidate.source_family} matches class ${familyCandidate.source_class}, but specific endpoint needs calibration.`
        };
      }

      return {
        goalId: goal.id,
        statementToProve: goal.statement_to_prove,
        category: 'NEW_DISCOVERY_REQUIRED',
        recommendedSources: [],
        gapDetected: true,
        priorityScore: 0.3,
        reasoning: `No sources in SourceKnowledgeMap satisfy criteria or classes [${goal.preferred_source_classes.join(', ')}]. Family gap engine required.`
      };
    }

    // Filter active or promoted candidates
    const winners = candidateSources.filter(s =>
      (s.current_status === 'PROMOTED' || s.current_status === 'ACTIVE' || s.current_status === 'SEMANTIC_MOTOR') &&
      s.qualified_yield >= 0.65 &&
      s.reliability_score >= 0.80 &&
      (s.saturation < 0.85 || s.evidence_goals_solved.includes(goal.id) || s.evidence_goals_solved.includes(goal.statement_to_prove))
    );

    if (winners.length > 0) {
      const topWinner = winners[0];
      return {
        goalId: goal.id,
        statementToProve: goal.statement_to_prove,
        category: 'KNOWN_WINNER',
        recommendedSources: winners,
        gapDetected: false,
        selectedSourceId: topWinner.source_id,
        priorityScore: 0.95 + (topWinner.qualified_yield * 0.05),
        reasoning: `Authoritative winner [${topWinner.source_id}] available with proven qualified yield ${(topWinner.qualified_yield * 100).toFixed(0)}% and ${topWinner.qualified_per_second}/s.`
      };
    }

    // Otherwise, known alternative available
    const topAlternative = candidateSources[0];
    return {
      goalId: goal.id,
      statementToProve: goal.statement_to_prove,
      category: 'KNOWN_ALTERNATIVE',
      recommendedSources: candidateSources,
      gapDetected: false,
      selectedSourceId: topAlternative.source_id,
      priorityScore: 0.70 + (topAlternative.qualified_yield * 0.1),
      reasoning: `Known alternative source [${topAlternative.source_id}] in knowledge map (yield ${(topAlternative.qualified_yield * 100).toFixed(0)}%).`
    };
  }

  /**
   * Evaluates all EvidenceGoals for a mission plan.
   */
  public evaluateGoals(goals: EvidenceGoal[], geography: string = 'Argentina'): GoalSourceDecision[] {
    return goals.map(g => this.evaluateGoal(g, geography));
  }

  /**
   * 7. GAP RESOLUTION & ECOSYSTEM DISCOVERY:
   * When a goal requires new discovery or unexplored family, dispatches to SourceFamilyGapEngine.
   */
  public async resolveGoalGap(
    goal: EvidenceGoal,
    geography: string = 'Argentina',
    seedQuery?: string
  ): Promise<EcosystemDiscoveryResult> {
    const discovery = await this.getGapEngine().discoverEcosystemForGoal(goal, geography, seedQuery);
    return discovery;
  }

  /**
   * 9. SPEED LOOP:
   * Evaluates canary probe results and either rapidly kills/deprioritizes or promotes and scales rotors.
   */
  public evaluateCanary(
    sourceId: string,
    sampleTested: number,
    candidatesFound: number,
    verified: number,
    qualified: number,
    latencyMs: number
  ): CanaryProbeResult {
    const latencySec = Math.max(0.001, latencyMs / 1000);
    const qualifiedPerSec = parseFloat((qualified / latencySec).toFixed(2));
    const qualifiedYield = sampleTested > 0 ? qualified / sampleTested : 0;

    let action: CanaryProbeResult['action'] = 'RETRY';
    let allocatedRotors = 1;

    if (qualified === 0 && verified === 0) {
      // Zero yield in canary -> deprioritize fast
      action = 'DEPRIORITIZE_FAST';
      allocatedRotors = 0;
      this.rotorAllocations.set(sourceId, 0);

      this.getKnowledgeMap().updateSourceMetrics(sourceId, {
        current_status: 'DORMANT',
        failure_modes: ['CANARY_ZERO_YIELD']
      });
    } else if (qualifiedYield >= 0.60 || qualifiedPerSec >= 5.0) {
      // High-yield winner -> promote and scale up extraction rotors
      action = 'PROMOTE';
      allocatedRotors = qualifiedPerSec >= 10.0 ? 8 : 4;
      this.rotorAllocations.set(sourceId, allocatedRotors);

      this.getKnowledgeMap().updateSourceMetrics(sourceId, {
        current_status: 'PROMOTED',
        qualified_yield: parseFloat(qualifiedYield.toFixed(2)),
        qualified_per_second: qualifiedPerSec,
        last_success: new Date().toISOString()
      });
    } else {
      // Moderate yield -> active baseline rotor
      allocatedRotors = 2;
      this.rotorAllocations.set(sourceId, allocatedRotors);
    }

    return {
      sourceId,
      sampleTested,
      candidatesFound,
      verified,
      qualified,
      latencyMs,
      qualifiedPerSecond: qualifiedPerSec,
      action,
      allocatedRotors
    };
  }

  public getAllocatedRotors(sourceId: string): number {
    return this.rotorAllocations.get(sourceId) || 1;
  }

  /**
   * 6. BI-DIRECTIONAL MISSION FEEDBACK:
   * Submits feedback from physical execution back to SourceKnowledgeMap.
   */
  public feedbackMissionResult(feedback: SourceMissionFeedback): void {
    this.getKnowledgeMap().recordMissionObservation(feedback);
  }
}
