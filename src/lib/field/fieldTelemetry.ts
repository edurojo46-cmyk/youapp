/**
 * fieldTelemetry.ts
 *
 * Calcula métricas de calidad de la experiencia del YOU FIELD ENGINE:
 * - Field Satisfaction Score
 * - Redundancy Rate
 * - Knowledge Progression Rate
 */

import type { FieldSessionEvent, FieldSatisfactionMetrics, FieldPlan } from './fieldTypes';

export function calculateFieldSatisfaction(events: FieldSessionEvent[], plan: FieldPlan): FieldSatisfactionMetrics {
  if (events.length === 0) {
    return {
      completionRate: 0,
      valueScore: 0,
      redundancyRate: 0,
      knowledgeProgressionRate: 100,
      overallSatisfaction: 50
    };
  }

  // 1. Completion Rate (% promedio de visualización de los bloques planificados)
  const avgWatchPct = events.reduce((acc, e) => acc + (e.watchPercentage || 0), 0) / events.length;
  const completionRate = Math.min(100, Math.round(avgWatchPct * 100));

  // 2. Value Score (Basado en likes y momentos guardados)
  const likedCount = events.filter(e => e.liked).length;
  const savedCount = events.filter(e => e.saved).length;
  const skippedCount = events.filter(e => e.skipped).length;
  const valueScore = Math.max(0, Math.min(100, Math.round((likedCount * 25 + savedCount * 35 - skippedCount * 15) + 50)));

  // 3. Redundancy Rate (Estimación de repetición vs diversidad)
  const uniqueRoles = new Set(events.map(e => e.role)).size;
  const expectedRoles = Math.min(events.length, 4);
  const redundancyRate = Math.max(0, Math.round((1 - (uniqueRoles / Math.max(1, expectedRoles))) * 100));

  // 4. Knowledge Progression Rate (Secuencia respetada de básico → profundo → contraste)
  let progressionMatches = 0;
  for (let i = 0; i < events.length; i++) {
    if (plan.blocks[i] && events[i].role === plan.blocks[i].role) {
      progressionMatches++;
    }
  }
  const knowledgeProgressionRate = Math.round((progressionMatches / Math.max(1, events.length)) * 100);

  // 5. Overall Satisfaction
  const overallSatisfaction = Math.round(
    completionRate * 0.40 +
    valueScore * 0.30 +
    knowledgeProgressionRate * 0.20 +
    (100 - redundancyRate) * 0.10
  );

  return {
    completionRate,
    valueScore,
    redundancyRate,
    knowledgeProgressionRate,
    overallSatisfaction
  };
}
