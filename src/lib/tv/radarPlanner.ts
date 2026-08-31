import type { SignalRequest } from './signalTypes';
import type { ContentItem } from '../search/types';

export interface CoverageAnalysis {
  semanticCoverage: number; // 0-100
  durationCoverage: number; // 0-100
  missingConcepts: string[];
  mainTopicCovered: boolean;
  missingDurationSec: number;
}

export function evaluateCoverage(request: SignalRequest, meshCandidates: ContentItem[]): CoverageAnalysis {
  let mainTopicCovered = false;
  const coveredConcepts = new Set<string>();
  let totalDurationSec = 0;

  const expectedConcepts = request.subQueries.map(sq => sq.query);

  const fullTitles = meshCandidates.map(c => c.title.toLowerCase()).join(' ');

  if (fullTitles.includes(request.mainTopic.toLowerCase())) {
    mainTopicCovered = true;
  }

  for (const concept of expectedConcepts) {
    if (fullTitles.includes(concept.toLowerCase())) {
      coveredConcepts.add(concept);
    }
  }

  for (const c of meshCandidates) {
    totalDurationSec += c.durationSec || 0;
  }

  const targetDurationSec = (request.durationTargetMin || 60) * 60;
  
  const semanticCoverage = expectedConcepts.length === 0 ? 100 : (coveredConcepts.size / expectedConcepts.length) * 100;
  const durationCoverage = Math.min(100, (totalDurationSec / targetDurationSec) * 100);

  const missingConcepts = expectedConcepts.filter(c => !coveredConcepts.has(c));
  const missingDurationSec = Math.max(0, targetDurationSec - totalDurationSec);

  return {
    semanticCoverage,
    durationCoverage,
    missingConcepts,
    mainTopicCovered,
    missingDurationSec
  };
}

export function chooseRadarQuery(request: SignalRequest, coverage: CoverageAnalysis): { query: string; reason: string; missingConcepts: string[] } {
  // Prioritize missing concepts
  // 1. mainTopic sin cobertura
  // 2. concepto explícitamente pedido sin cobertura
  // 3. freshness crítica sin cobertura (simplificado)
  // 4. déficit importante de duración
  // 5. discovery

  let queryTokens = [];
  let reason = '';
  
  if (!coverage.mainTopicCovered) {
    queryTokens.push(request.mainTopic);
    reason = 'main_topic_missing';
  }

  if (coverage.missingConcepts.length > 0) {
    queryTokens.push(...coverage.missingConcepts);
    if (!reason) reason = 'subconcepts_missing';
  }

  if (queryTokens.length === 0 && coverage.missingDurationSec > 600) {
    queryTokens.push(request.mainTopic, 'documental', 'historia'); // generic expansion
    reason = 'duration_gap';
  }
  
  if (queryTokens.length === 0) {
    queryTokens.push(request.mainTopic, 'descubrimientos', 'novedades');
    reason = 'discovery';
  }

  // Deduplicate and join
  const query = Array.from(new Set(queryTokens)).join(' ').trim();

  return {
    query,
    reason,
    missingConcepts: coverage.missingConcepts
  };
}
