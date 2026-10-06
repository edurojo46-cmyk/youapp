import type { ContentItem } from '../types';

/**
 * freeDiscoveryCoverage.ts
 *
 * Evaluación de Cobertura para Free Discovery Stage.
 *
 * INVARIANTE ESTRICTO DEL CORE:
 * - Calidad requerida: QualityScore >= 60
 * - Relevancia requerida: RelevanceScore >= 40
 * - NUNCA bajar los umbrales a 50/35 para evitar falsamente YouTube Radar.
 */

export interface FreeDiscoveryCoverageEvaluation {
  passed: boolean;
  totalCandidates: number;
  qualifiedCount: number;
  top5Consistent: boolean;
  reason: string;
}

export function evaluateFreeDiscoveryCoverage(candidates: ContentItem[]): FreeDiscoveryCoverageEvaluation {
  if (!candidates || candidates.length === 0) {
    return {
      passed: false,
      totalCandidates: 0,
      qualifiedCount: 0,
      top5Consistent: false,
      reason: 'zero_candidates'
    };
  }

  // Provisional sorting by youScore to check Top 5 guardrail
  const provisionalTop = [...candidates].sort((a, b) => (b.youScore || 0) - (a.youScore || 0));
  const top5 = provisionalTop.slice(0, 5);

  // Top 5 debe tener alta relevancia (mínimo 40)
  const top5Consistent = top5.length >= 1 && top5.every(c => (c.relevanceScore || 0) >= 40);

  // Candidatos rigurosamente cualificados (Quality >= 60 && Relevance >= 40)
  const qualifiedCandidates = candidates.filter(
    c => (c.qualityScore || 0) >= 60 && (c.relevanceScore || 0) >= 40
  );

  // Requiere mínimo 8 candidatos calificados y Top 5 consistente
  const hasEnoughVolume = candidates.length >= 8;
  const hasEnoughQualified = qualifiedCandidates.length >= 8;

  const passed = hasEnoughVolume && hasEnoughQualified && top5Consistent;

  let reason = 'coverage_passed';
  if (!hasEnoughVolume) reason = `insufficient_volume (${candidates.length} < 8)`;
  else if (!hasEnoughQualified) reason = `insufficient_qualified (${qualifiedCandidates.length} < 8 with Q>=60, R>=40)`;
  else if (!top5Consistent) reason = 'top5_low_relevance';

  return {
    passed,
    totalCandidates: candidates.length,
    qualifiedCount: qualifiedCandidates.length,
    top5Consistent,
    reason
  };
}
