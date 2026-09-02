/**
 * residualAdaptiveRanker.ts — Ranker Adaptativo Multiseñal para Atlas V3
 * 
 * Re-ordena candidatos ya existentes en Atlas cuando la relevancia semántica / léxica
 * simple no los ubica en el top-8.
 */

import type { MultiSignalRankerInput } from './typesV3';

export class ResidualAdaptiveRanker {
  /**
   * Calcula el score compuesto multiseñal para un candidato en Atlas
   */
  computeCompositeScore(signals: MultiSignalRankerInput): number {
    const score = 
      (signals.lexicalScore * 0.20) +
      (signals.semanticSimilarity * 0.25) +
      (signals.entityMatchScore * 0.18) +
      (signals.workMatchScore * 0.15) +
      (signals.exactIntentMatch * 0.10) +
      (signals.qualityScore * 0.05) +
      (signals.playabilityScore * 0.04) +
      (signals.freshnessScore * 0.03) +
      (signals.sourceConfidence * 0.05) -
      (signals.ambiguityPenalty * 0.15);

    return Math.max(0, Math.min(1.0, +score.toFixed(4)));
  }

  /**
   * Evalúa si un gap clasificado como ranking_failure puede ser rescatado
   */
  canRecoverRankingGap(candidateCount: number, bestScore: number): boolean {
    // Si Atlas ya tiene 3 o más candidatos y el mejor candidato supera 0.40,
    // el ranker adaptativo lo promueve directamente al top-8 (Fast Path)
    return candidateCount >= 3 && bestScore >= 0.40;
  }
}

export const residualAdaptiveRanker = new ResidualAdaptiveRanker();
