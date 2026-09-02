/**
 * discoveryPlannerV2.ts — Planificador de Misiones Discovery V2 (Graph + Cluster Memory + Source Intelligence)
 */

import { DEFAULT_DISCOVERY_BUDGET } from '../discoveryBudget';
import type { DiscoveryRequest, DiscoveryChannel } from '../types';
import type { DiscoveryPlanV2 } from './typesV2';
import { searchClusterMemory } from './searchClusterMemory';
import { sourcePerformanceMemory } from './sourcePerformanceMemory';
import { planDiscovery as planDiscoveryV1 } from '../discoveryPlanner';

export async function planDiscoveryV2(
  request: DiscoveryRequest,
  options?: { isGraphGap?: boolean }
): Promise<DiscoveryPlanV2> {
  // 1. Registrar query en el Clúster Semántico
  const cluster = searchClusterMemory.registerQueryInCluster(request);

  // 2. Obtener ponderaciones empíricas de fuentes
  const empiricalWeights = sourcePerformanceMemory.getEmpiricalSourceWeights();

  // 3. Obtener plan base de Gemini
  const v1Plan = await planDiscoveryV1(request);

  // 4. Re-ordenar canales sugeridos utilizando la memoria de rendimiento empírico de YouAppTV
  const scoredChannels = v1Plan.preferredChannels
    .map(channel => ({
      channel,
      empiricalScore: empiricalWeights[channel] || 0.70
    }))
    .sort((a, b) => b.empiricalScore - a.empiricalScore);

  const optimizedChannels = scoredChannels.map(sc => sc.channel);

  return {
    ...v1Plan,
    version: 'v2',
    clusterId: cluster.clusterId,
    clusterQueriesAffected: Math.max(1, cluster.relatedQueries.length),
    graphGapOrigin: Boolean(options?.isGraphGap),
    preferredChannels: optimizedChannels.slice(0, DEFAULT_DISCOVERY_BUDGET.maxSources),
    sourceEmpiricalWeights: empiricalWeights as Record<string, number>,
    confidence: Math.min(0.99, +(v1Plan.confidence * 1.1).toFixed(2)) // Mayor confianza por memoria histórica
  };
}
