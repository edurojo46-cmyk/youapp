/**
 * ATLAS GENERAL OBJECTIVE INTELLIGENCE ENGINE V1
 * Module: ExperimentationEngine (Section 11)
 * 
 * Conducts bounded empirical experiments to compare candidate strategies
 * against the Mission Success Function before committing larger execution budgets.
 */

import type { MissionSpecification, StrategyPlan, MissionResultItem } from './types.ts';
import { MissionSuccessFunction } from './MissionSuccessFunction.ts';

export interface ExperimentOutcome {
  strategyId: string;
  sampleTested: number;
  validYield: number;
  successRate: number;
  averageMissionScore: number;
  recommendation: 'PROMOTE_TO_ACTIVE' | 'KEEP_AS_SECONDARY' | 'ABANDON';
}

export class ExperimentationEngine {
  public static async evaluateStrategies(
    mission: MissionSpecification,
    strategies: StrategyPlan[],
    testExecutor: (strat: StrategyPlan, sampleLimit: number) => Promise<MissionResultItem[]>
  ): Promise<{ winner: StrategyPlan; outcomes: ExperimentOutcome[] }> {
    const SAMPLE_LIMIT = 5;
    const outcomes: ExperimentOutcome[] = [];

    console.log(`[ExperimentationEngine] Executing bounded micro-experiments across ${strategies.length} candidate strategies...`);

    for (const strat of strategies) {
      strat.status = 'TESTING';
      const sampleItems = await testExecutor(strat, SAMPLE_LIMIT);

      let totalScore = 0;
      let validCount = 0;

      for (const item of sampleItems) {
        const score = MissionSuccessFunction.evaluateItem(item, mission);
        item.missionRelevanceScore = score;
        totalScore += score;
        if (score >= 0.70) validCount++;
      }

      const count = sampleItems.length;
      const successRate = count > 0 ? parseFloat((validCount / count).toFixed(3)) : 0.0;
      const averageMissionScore = count > 0 ? parseFloat((totalScore / count).toFixed(3)) : 0.0;

      strat.experimentResults = {
        sampleTested: count,
        validYield: validCount,
        successRate,
        avgLatencyMs: 150
      };

      const outcome: ExperimentOutcome = {
        strategyId: strat.strategyId,
        sampleTested: count,
        validYield: validCount,
        successRate,
        averageMissionScore,
        recommendation: successRate >= 0.60 ? 'PROMOTE_TO_ACTIVE' : (successRate >= 0.30 ? 'KEEP_AS_SECONDARY' : 'ABANDON')
      };

      outcomes.push(outcome);
      console.log(`  Strategy [${strat.strategyId}]: Yield ${validCount}/${count} (${(successRate * 100).toFixed(1)}%), Avg Score ${averageMissionScore} -> ${outcome.recommendation}`);
    }

    // Select winner: highest success rate, broken by average mission score
    outcomes.sort((a, b) => b.successRate - a.successRate || b.averageMissionScore - a.averageMissionScore);
    const winningOutcome = outcomes[0];
    const winner = strategies.find(s => s.strategyId === winningOutcome.strategyId)!;
    winner.status = 'ACTIVE';

    for (const s of strategies) {
      if (s.strategyId !== winner.strategyId) {
        const out = outcomes.find(o => o.strategyId === s.strategyId);
        s.status = out?.recommendation === 'ABANDON' ? 'ABANDONED' : 'PROPOSED';
      }
    }

    console.log(`[ExperimentationEngine] Winning strategy promoted: ${winner.name} (${winner.strategyId})\n`);
    return { winner, outcomes };
  }
}
