/**
 * ATLAS — AI PATHFINDER V1
 * Module: PathScorer (Section 7)
 * 
 * Computes multi-criteria score for candidate paths:
 * PATH_VALUE = (EXPECTED_MISSION_PROGRESS × EVIDENCE_STRENGTH × NOVELTY × COVERAGE_GAIN) / EXPECTED_COST
 * adjusted for UNCERTAINTY, FAILURE_RISK, DUPLICATION, SATURATION.
 */

import type { PathPlan, CompletenessMap } from './types.ts';

export interface PathScoringFactors {
  progressMultiplier: number;
  evidenceStrength: number;
  novelty: number;
  coverageGain: number;
  cost: number;
  uncertaintyPenalty: number;
  saturationDiscount: number;
}

export class PathScorer {
  public static scorePath(path: PathPlan, completenessMap: CompletenessMap, targetQuantity: number): number {
    // 1. Mission Progress Multiplier:
    // If the path addresses the current completeness bottleneck (e.g. discovery vs enrichment vs evidence),
    // its progress value is significantly higher.
    let progressMultiplier = 1.0;

    if (completenessMap.recommendedMode === 'DISCOVERY') {
      progressMultiplier = Math.min(2.0, (path.expectedYield / (targetQuantity || 1)) * 1.5);
    } else if (completenessMap.recommendedMode === 'ENRICHMENT') {
      // Prioritize paths with high quality & expansion value over gross volume
      progressMultiplier = (path.expectedQuality * 1.8 + path.expansionValue * 1.2);
    } else if (completenessMap.recommendedMode === 'EVIDENCE_VALIDATION') {
      progressMultiplier = (path.evidenceStrength * 2.2);
    } else if (completenessMap.recommendedMode === 'COVERAGE_EXPANSION') {
      progressMultiplier = (path.expectedNovelty * 1.7 + path.expansionValue * 1.3);
    }

    const evidenceStrength = Math.max(0.1, path.evidenceStrength);
    const novelty = Math.max(0.1, path.expectedNovelty);
    const coverageGain = Math.max(0.1, path.expansionValue);
    const cost = Math.max(1, path.expectedCost);

    // 2. Risk & Saturation adjustments:
    // Higher uncertainty or prior saturation reduces the score.
    const uncertaintyPenalty = 1.0 - (path.uncertainty * 0.35); // 0.65 to 1.0
    const saturationDiscount = path.status === 'DEPLETED' ? 0.1 : 1.0;

    // 3. Core Score Calculation
    const numerator = progressMultiplier * evidenceStrength * novelty * coverageGain * uncertaintyPenalty * saturationDiscount;
    const denominator = cost * 0.4;

    const rawScore = numerator / denominator;
    const boundedScore = parseFloat(Math.max(0.01, Math.min(1.0, rawScore)).toFixed(3));

    path.calculatedPathScore = boundedScore;
    return boundedScore;
  }
}
