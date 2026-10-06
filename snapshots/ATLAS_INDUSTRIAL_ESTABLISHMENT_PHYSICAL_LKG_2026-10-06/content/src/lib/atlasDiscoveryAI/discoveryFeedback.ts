/**
 * discoveryFeedback.ts — Registro de Feedback y Métricas de Rendimiento de Misiones Discovery
 */

import type { DiscoveryMissionResult } from './types';

export const missionHistory: DiscoveryMissionResult[] = [];

export async function recordDiscoveryFeedback(result: DiscoveryMissionResult): Promise<void> {
  missionHistory.push(result);
  if (missionHistory.length > 500) {
    missionHistory.shift(); // Mantener últimas 500 misiones en memoria
  }
}

export function getMissionHistory(): DiscoveryMissionResult[] {
  return [...missionHistory];
}
