/**
 * ATLAS GENERAL OBJECTIVE INTELLIGENCE ENGINE V1
 * Module: AdaptiveReplanner (Section 13)
 * 
 * Manages wave-based execution and adaptive strategy shifts when
 * bottlenecks, zero-yield branches, or failures are detected.
 */

import type { MissionSpecification, StrategyPlan, MissionResultItem } from './types.ts';
import { MissionGraph } from './MissionGraph.ts';

export interface ReplanDecision {
  triggered: boolean;
  reason?: string;
  previousStrategyId?: string;
  newStrategyId?: string;
  replanCount: number;
}

export class AdaptiveReplanner {
  private replanCount: number = 0;

  public evaluateReplan(
    mission: MissionSpecification,
    graph: MissionGraph,
    strategies: StrategyPlan[],
    accumulatedItems: MissionResultItem[],
    waveIndex: number
  ): ReplanDecision {
    const activeStrat = strategies.find(s => s.status === 'ACTIVE') || strategies[0];
    const target = mission.targetQuantity;
    const current = accumulatedItems.length;

    // Check if progress is stalled after wave execution
    const isStalled = waveIndex >= 2 && current === 0;
    const isUnderperforming = waveIndex >= 3 && (current / target) < 0.30;

    if (isStalled || isUnderperforming) {
      this.replanCount++;
      activeStrat.status = 'DEPLETED';

      // Find next viable proposed strategy
      const nextCandidate = strategies.find(s => s.status === 'PROPOSED');
      if (nextCandidate) {
        nextCandidate.status = 'ACTIVE';
        console.log(`[AdaptiveReplanner] REPLAN TRIGGERED (Wave ${waveIndex}): Strategy [${activeStrat.strategyId}] underperformed (${current}/${target}). Switching to [${nextCandidate.strategyId}].`);

        return {
          triggered: true,
          reason: `Strategy [${activeStrat.strategyId}] yielded ${current}/${target} items after wave ${waveIndex}. Shifted to [${nextCandidate.strategyId}].`,
          previousStrategyId: activeStrat.strategyId,
          newStrategyId: nextCandidate.strategyId,
          replanCount: this.replanCount
        };
      }
    }

    return {
      triggered: false,
      replanCount: this.replanCount
    };
  }

  public getReplanCount(): number {
    return this.replanCount;
  }
}
