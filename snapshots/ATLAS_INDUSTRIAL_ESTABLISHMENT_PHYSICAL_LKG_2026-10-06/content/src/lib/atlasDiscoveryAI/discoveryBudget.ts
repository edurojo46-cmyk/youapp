/**
 * discoveryBudget.ts — Presupuesto y Límites Inviolables de Atlas Discovery AI V1
 */

export const DEFAULT_DISCOVERY_BUDGET = {
  maxPlannerCalls: 1,
  maxSources: 8,
  maxPagesPerSource: 100,
  maxMissionDurationMs: 120_000,
  maxConcurrentSources: 3,
  youtubeSearchBudget: 0, // Inviolable: 0 llamadas a YouTube Search.list
  minimumNoveltyRate: 0.30,
  minimumNetNewPerPage: 0.10,
  maxDailyMissions: 500,
  maxDailyCostUsd: 5.0
} as const;

export function isDiscoveryAiEnabled(): boolean {
  if (typeof process !== 'undefined' && process.env?.VITE_ATLAS_DISCOVERY_AI === 'false') {
    return false;
  }
  return true;
}
