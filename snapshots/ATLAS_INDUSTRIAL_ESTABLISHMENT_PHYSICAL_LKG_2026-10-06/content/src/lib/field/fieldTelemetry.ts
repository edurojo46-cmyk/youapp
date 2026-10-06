/**
 * fieldTelemetry.ts
 *
 * Calcula métricas de calidad de la experiencia del YOU FIELD ENGINE:
 * - Field Satisfaction Score
 * - Redundancy Rate
 * - Knowledge Progression Rate
 * - Field Coherence Score (Continuidad de entidad + afinidad temática)
 * - Duration Adherence Rate (Tolerancia temporal unificada: Soft ±15%, Hard ±20%)
 */

import type { FieldSessionEvent, FieldSatisfactionMetrics, FieldPlan, DurationAdherenceStatus } from './fieldTypes';

export function calculateFieldSatisfaction(
  events: FieldSessionEvent[],
  plan: FieldPlan,
  totalActualMinutes?: number
): FieldSatisfactionMetrics {
  const targetMinutes = plan.totalTargetMinutes || 45;
  const actualMinutes = totalActualMinutes || targetMinutes;
  const deviation = Math.abs(actualMinutes - targetMinutes) / targetMinutes;
  const deviationPct = Math.round(deviation * 1000) / 10; // ej: 15.6%

  let durationStatus: DurationAdherenceStatus = 'OPTIMAL_SOFT_WINDOW';
  if (deviationPct <= 15.0) {
    durationStatus = 'OPTIMAL_SOFT_WINDOW';
  } else if (deviationPct <= 20.0) {
    durationStatus = 'ACCEPTABLE_WITHIN_HARD_LIMIT';
  } else {
    durationStatus = 'OUT_OF_BOUNDS';
  }

  if (events.length === 0) {
    return {
      completionRate: 0,
      valueScore: 0,
      redundancyRate: 0,
      knowledgeProgressionRate: 100,
      fieldCoherenceScore: 90,
      durationAdherenceRate: 100,
      durationDeviationPercentage: deviationPct,
      durationStatus,
      overallSatisfaction: 50
    };
  }

  // 1. Completion Rate (% promedio de visualización de los bloques)
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

  // 5. Duration Adherence Rate (%)
  // Fórmula Exacta y Auditable:
  //   deviation = |actualMinutes - targetMinutes| / targetMinutes
  //   durationAdherenceRate = max(0, min(100, round((1 - deviation) * 100)))
  //   Ejemplo: Para target = 45m y actual = 52m (desviación = 15.56%), adherence = 84.44% ≈ 84%
  const durationAdherenceRate = Math.max(0, Math.min(100, Math.round((1 - deviation) * 100)));

  // 6. Field Coherence Score (Continuidad de entidad y compatibilidad temática)
  let coherencePoints = 0;
  for (const block of plan.blocks) {
    if (block.allocatedCandidate) {
      const text = `${block.allocatedCandidate.title} ${block.allocatedCandidate.description || ''}`.toLowerCase();
      const hasEntity = plan.primaryEntity.aliases.some(a => text.includes(a));
      if (hasEntity) coherencePoints += 20;
    } else {
      coherencePoints += 15;
    }
  }
  const fieldCoherenceScore = Math.min(100, Math.round((coherencePoints / Math.max(1, plan.blocks.length * 20)) * 100));

  // 7. Overall Satisfaction Ponderada
  const overallSatisfaction = Math.round(
    completionRate * 0.25 +
    valueScore * 0.20 +
    fieldCoherenceScore * 0.25 +
    knowledgeProgressionRate * 0.15 +
    durationAdherenceRate * 0.10 +
    (100 - redundancyRate) * 0.05
  );

  return {
    completionRate,
    valueScore,
    redundancyRate,
    knowledgeProgressionRate,
    fieldCoherenceScore,
    durationAdherenceRate,
    durationDeviationPercentage: deviationPct,
    durationStatus,
    overallSatisfaction
  };
}
