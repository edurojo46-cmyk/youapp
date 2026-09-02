/**
 * atlasGapAnalyzer.ts — Analizador Matemático de Gaps de Cobertura en Atlas
 */

import type { AtlasGap, DiscoveryRequest } from './types';

export function analyzeAtlasGap(input: {
  query: string;
  atlasResultCount: number;
  qualityQualifiedCount: number;
  relevanceQualifiedCount: number;
  coverageScore: number;
  qualityScore: number;
  entities?: string[];
  works?: string[];
}): DiscoveryRequest {
  const gaps: AtlasGap[] = [];

  if (input.coverageScore < 0.55) {
    gaps.push({
      type: 'LOW_COVERAGE',
      score: +(1 - input.coverageScore).toFixed(2),
      detail: 'Atlas coverage below discovery threshold (< 0.55)'
    });
  }

  if (input.relevanceQualifiedCount < 8 || input.qualityQualifiedCount < 8) {
    gaps.push({
      type: 'LOW_RELEVANCE',
      score: 0.8,
      detail: 'Insufficient relevance or quality-qualified results (< 8)'
    });
  }

  return {
    query: input.query,
    entities: input.entities,
    works: input.works,
    atlasResultCount: input.atlasResultCount,
    qualityQualifiedCount: input.qualityQualifiedCount,
    relevanceQualifiedCount: input.relevanceQualifiedCount,
    coverageScore: input.coverageScore,
    qualityScore: input.qualityScore,
    gaps
  };
}
