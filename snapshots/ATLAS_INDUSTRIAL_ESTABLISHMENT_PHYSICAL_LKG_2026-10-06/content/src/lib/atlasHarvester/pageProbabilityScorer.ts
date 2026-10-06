/**
 * pageProbabilityScorer.ts — Evaluador de Novedad Verdadera y Probabilidad de Partición (Harvester V4)
 */

import { extractDateCohortAndPrefix } from './partitionIntelligence';

export function calculatePageYouTubeProbability(url: string): number {
  let score = 0.30;
  const lowerUrl = url.toLowerCase();

  // 1. Señales Fuertes de Video / Música (+0.40 a +0.20)
  if (/\/(?:videos?|clip|watch)\//i.test(lowerUrl)) score += 0.40;
  if (/\/(?:music|musica|canciones|temas|directo|recital)\//i.test(lowerUrl)) score += 0.30;
  if (/\b(?:live|concert|session|performance|recital|festival|acustico|unplugged|estreno|premiere)\b/i.test(lowerUrl)) score += 0.25;
  if (/\/(?:entrevista|interview|cultura|espectaculos)\//i.test(lowerUrl)) score += 0.15;

  // 2. Señales Negativas (-0.30 a -0.40)
  if (/\/(?:apps?|software|windows|android|ios|smartphones?|gadgets?|hardware)\//i.test(lowerUrl)) score -= 0.35;
  if (/\/(?:shopping|ofertas|descuentos|compras|reviews?|guia-de-compra)\//i.test(lowerUrl)) score -= 0.35;
  if (/\/(?:economia|finanzas|mercados|dolar|inflacion|bancos|politica-local)\//i.test(lowerUrl)) score -= 0.30;
  if (/\/(?:tag|categoria|author|page\/\d+|privacy|terminos)\//i.test(lowerUrl)) score -= 0.25;

  return Math.max(0.01, Math.min(1.0, score));
}

export function calculateDateFreshnessFactor(url: string): number {
  const { dateCohort } = extractDateCohortAndPrefix(url);
  switch (dateCohort) {
    case '2026': return 1.00;
    case '2025': return 0.90;
    case '2024': return 0.75;
    case '2023': return 0.50;
    case '2022': return 0.35;
    case '2021': return 0.20;
    case '2020': return 0.10;
    default: return 0.60;
  }
}

export function calculateExpectedNetNewScore(
  url: string,
  partitionWeightedNovelty: number,
  sourceScore: number
): number {
  const videoProb = calculatePageYouTubeProbability(url);
  const freshness = calculateDateFreshnessFactor(url);
  const novelty = Math.max(0.02, partitionWeightedNovelty);
  const srcScore = Math.max(0.1, sourceScore);

  // ExpectedNewReference = VideoProbability × PartitionWeightedNovelty × FreshnessFactor × SourceScore
  return +(videoProb * novelty * freshness * srcScore).toFixed(4);
}
