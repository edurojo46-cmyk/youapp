/**
 * mineFingerprint.ts — Clasificación Arquetípica, Similarity Scoring y Modelos Positivos/Negativos (V4)
 */

export interface ProductiveArchetype {
  id: string;
  name: string;
  representativeMines: string[];
  observedDensity: number;
  observedNovelty: number;
  weight: number;
}

export const POSITIVE_SET: ProductiveArchetype[] = [
  {
    id: 'URBANA_ACOUSTIC_STUDIO',
    name: 'Urbana Play / Sesiones Acústicas',
    representativeMines: ['Urbana Play 104.3'],
    observedDensity: 0.928,
    observedNovelty: 0.999,
    weight: 1.0
  },
  {
    id: 'SBT_ENTERTAINMENT_ARCHIVE',
    name: 'SBT Brasil / Archivo Entretenimiento',
    representativeMines: ['SBT Sistema Brasileiro de Televisão'],
    observedDensity: 0.859,
    observedNovelty: 0.997,
    weight: 0.95
  },
  {
    id: 'SARANDI_RADIO_INTERVIEWS',
    name: 'Radio Sarandí Uruguay / Entrevistas en Estudio',
    representativeMines: ['Radio Sarandí 690 AM Uruguay'],
    observedDensity: 0.750,
    observedNovelty: 1.000,
    weight: 0.90
  },
  {
    id: 'EL_DESTAPE_POLITICAL_STREAM',
    name: 'El Destape / Radio Con Vos / Debates Diarios',
    representativeMines: ['El Destape Radio & TV', 'Radio Con Vos 89.9'],
    observedDensity: 0.681,
    observedNovelty: 1.000,
    weight: 0.85
  }
];

export const NEGATIVE_SET = [
  'Caracol Radio (Texto genérico sin video studio, 0.039 n/p)',
  'Futurock (Texto podcast sin video activo, 0.029 n/p)',
  'Súbela Radio (Partición obsoleta, 0.000 n/p)',
  'Portales generalistas de texto sin sección dedicada a YouTube'
];

export interface CandidateDomainFeatures {
  domain: string;
  category: string;
  hasVideoSection: boolean;
  isStreamingOrRadio: boolean;
  isBroadcaster: boolean;
  hasMultiCohortSitemaps: boolean;
  hasDailyLiveCadence: boolean;
  hasStudioInterviews: boolean;
}

/**
 * Calcula el puntaje de similitud frente a los ganadores comprobados (0.0 - 1.0)
 */
export function computeProductiveSimilarity(features: CandidateDomainFeatures): {
  primaryPositiveArchetype: string;
  similarityScore: number;
  expectedDensity: number;
  promotionPriority: 'ultra_high' | 'high' | 'medium' | 'low';
} {
  let urbanaScore = 0.05;
  let sbtScore = 0.05;
  let sarandiScore = 0.05;
  let destapeScore = 0.05;

  if (features.isStreamingOrRadio) {
    urbanaScore += 0.40;
    sarandiScore += 0.45;
    destapeScore += 0.45;
  }

  if (features.hasStudioInterviews) {
    urbanaScore += 0.35;
    sarandiScore += 0.40;
    destapeScore += 0.35;
  }

  if (features.hasDailyLiveCadence) {
    destapeScore += 0.20;
    sarandiScore += 0.15;
    urbanaScore += 0.15;
  }

  if (features.isBroadcaster) {
    sbtScore += 0.55;
  }

  if (features.hasMultiCohortSitemaps) {
    sbtScore += 0.35;
  }

  if (features.category.includes('Música') || features.category.includes('Acústico')) {
    urbanaScore += 0.20;
  }

  // Penalización si es portal generalista sin video
  if (!features.hasVideoSection && !features.isStreamingOrRadio && !features.isBroadcaster) {
    urbanaScore *= 0.2;
    sbtScore *= 0.2;
    sarandiScore *= 0.2;
    destapeScore *= 0.2;
  }

  const scores = [
    { id: 'URBANA_ACOUSTIC_STUDIO', score: Math.min(1.0, urbanaScore), density: 0.90 },
    { id: 'SBT_ENTERTAINMENT_ARCHIVE', score: Math.min(1.0, sbtScore), density: 0.85 },
    { id: 'SARANDI_RADIO_INTERVIEWS', score: Math.min(1.0, sarandiScore), density: 0.75 },
    { id: 'EL_DESTAPE_POLITICAL_STREAM', score: Math.min(1.0, destapeScore), density: 0.70 }
  ];

  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];

  let promotionPriority: 'ultra_high' | 'high' | 'medium' | 'low' = 'low';
  if (best.score >= 0.80) promotionPriority = 'ultra_high';
  else if (best.score >= 0.60) promotionPriority = 'high';
  else if (best.score >= 0.40) promotionPriority = 'medium';

  return {
    primaryPositiveArchetype: best.id,
    similarityScore: +best.score.toFixed(2),
    expectedDensity: best.density,
    promotionPriority
  };
}
