/**
 * discoveryBrain.ts — Cerebro Coordinador de Atlas Discovery AI V1
 */

import { planDiscovery } from './discoveryPlanner';
import { executeDiscoveryPlan } from './discoveryExecutor';
import { recordDiscoveryFeedback } from './discoveryFeedback';
import { isDiscoveryAiEnabled } from './discoveryBudget';
import type { DiscoveryRequest, DiscoveryMissionResult } from './types';
import type { HarvestDedupeIndex } from '../atlasHarvester/harvestDedupeIndex';

export async function runDiscoveryMission(
  request: DiscoveryRequest,
  dedupeIndex?: HarvestDedupeIndex
): Promise<DiscoveryMissionResult | null> {
  if (!isDiscoveryAiEnabled()) {
    return null;
  }

  if (request.gaps.length === 0 || request.coverageScore >= 0.80) {
    return null;
  }

  const started = Date.now();
  const plan = await planDiscovery(request);

  if (!plan.shouldDiscover || plan.confidence < 0.55) {
    return null;
  }

  const result = await executeDiscoveryPlan(request, plan, dedupeIndex);

  const finalResult: DiscoveryMissionResult = {
    ...result,
    durationMs: Date.now() - started
  };

  await recordDiscoveryFeedback(finalResult);
  return finalResult;
}
