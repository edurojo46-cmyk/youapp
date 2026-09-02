/**
 * marginalValueScorer.ts — Motor de Evaluación de Valor Marginal para el Bootstrap de Atlas 50K
 */

import type { AtlasEnrichedItem } from './bootstrapTypes';

export interface MarginalValueEvaluation {
  atlasValue: number;          // Puntuación 0 a 100
  breakdown: {
    coverageGain: number;      // 0 a 25 (si resuelve un tópico con déficit o gap)
    entityGain: number;        // 0 a 20 (si ancla una entidad canónica individual)
    diversityGain: number;     // 0 a 15 (si proviene de un proveedor no saturado como archive/peertube/vimeo)
    formatGain: number;        // 0 a 15 (concierto, sesión acústica, documental vs simple clip)
    narrativeGain: number;     // 0 a 15 (versatilidad para el Director de Onda)
    rarityGain: number;        // 0 a 25 (priorización activa de Deep Cuts, tomas inéditas y ensayos)
    saturationPenalty: number; // 0 a 30 (penalización fuerte a artistas saturados con >300 videos)
    duplicateRisk: number;     // 0 a 15 (riesgo de redundancia semántica)
  };
  recommendation: 'high_priority' | 'acceptable' | 'discard_saturated';
}

export function evaluateMarginalValue(
  candidate: AtlasEnrichedItem,
  stats: {
    providerFractions: Record<string, number>;
    entityFrequencies: Record<string, number>;
  }
): MarginalValueEvaluation {
  let coverageGain = 10;
  let entityGain = candidate.isMusicDomain && candidate.musicArtistId ? 20 : 5;
  
  // Diversity Gain: premia proveedores minoritarios (peertube, archive, vimeo) para desconcentrar
  const provFrac = stats.providerFractions[candidate.provider] || 0;
  let diversityGain = provFrac < 0.15 ? 15 : (provFrac < 0.50 ? 10 : 2);

  // Format Gain
  let formatGain = 5;
  if (candidate.musicFormat === 'concert' || candidate.musicFormat === 'session' || candidate.musicFormat === 'acoustic_unplugged') {
    formatGain = 15;
  } else if (candidate.musicFormat === 'documentary' || candidate.musicFormat === 'interview_masterclass') {
    formatGain = 14;
  }

  // Narrative Gain
  let narrativeGain = candidate.isQualityReady ? 12 : 6;

  // Rarity Gain reforzado: premia activamente rarezas, tomas de archivo, demos y grabaciones de época
  let rarityGain = 5;
  if (/\b(unreleased|bootleg|demo|rare|inedito|inédito|ensayo|rehearsal|soundboard|tv archive|masterclass|195|196|197)\b/i.test(candidate.title)) {
    rarityGain = 25; // Impulso masivo a Deep Cuts para Onda
  } else if (/\b(198|199|historico|legendario)\b/i.test(candidate.title)) {
    rarityGain = 15;
  }

  // Saturation Penalty: si un artista ya tiene más de 300 videos en Atlas (ej. Pink Floyd)
  let saturationPenalty = 0;
  if (candidate.musicArtistId) {
    const artistCount = stats.entityFrequencies[candidate.musicArtistId] || 0;
    if (artistCount > 500) saturationPenalty = 30;
    else if (artistCount > 250) saturationPenalty = 20;
    else if (artistCount > 100) saturationPenalty = 8;
  }

  let duplicateRisk = candidate.isDuplicateSuspect ? 15 : 0;

  const rawValue = (coverageGain + entityGain + diversityGain + formatGain + narrativeGain + rarityGain) - (saturationPenalty + duplicateRisk);
  const atlasValue = Math.min(100, Math.max(0, Math.round(rawValue)));

  const recommendation = atlasValue >= 60 ? 'high_priority' : (atlasValue >= 35 ? 'acceptable' : 'discard_saturated');

  return {
    atlasValue,
    breakdown: {
      coverageGain,
      entityGain,
      diversityGain,
      formatGain,
      narrativeGain,
      rarityGain,
      saturationPenalty,
      duplicateRisk
    },
    recommendation
  };
}
