import type { ContentItem } from './types';
import type { ExactWorkDetection } from './exactWorkSearchGate';

// Temporalmente inferimos la calidad en base al provider y heurísticas
// hasta que el extractor de Atlas provea estos valores directamente.
function inferMediaMetrics(item: ContentItem) {
  let resolutionHeight = 480;
  let playableState: 'STREAM' | 'DERIVATIVE_ONLY' | 'BROKEN' | 'UNKNOWN' = 'STREAM';
  let historicalValue: 'HIGH' | 'NORMAL' = 'NORMAL';
  let audioQuality: 'LOW' | 'NORMAL' | 'HIGH' = 'NORMAL';

  if (item.provider === 'youtube' || item.provider === 'vimeo') {
    resolutionHeight = 720;
    if (item.isVerified) resolutionHeight = 1080;
  } else if (item.provider === 'dailymotion') {
    resolutionHeight = 480;
  } else if (item.retrievalSource === 'video-mesh' || item.provider === 'youapp') {
    resolutionHeight = 360; 
  }

  // Si tiene el thumbnail por defecto roto de YT
  if (item.thumbnail && item.thumbnail.includes('hqdefault') && item.thumbnail.includes('404')) {
     playableState = 'BROKEN';
  }
  
  if (item.playbackPolicy === 'external_only') {
     playableState = 'DERIVATIVE_ONLY'; // Solo se puede reproducir fuera de la app o requiere embed con restricciones
  }

  // Detect historical value
  const pubYear = item.publishedAt ? new Date(item.publishedAt).getFullYear() : 2024;
  const titleLower = item.title.toLowerCase();
  const isArchive = item.retrievalSource === 'video-mesh' && titleLower.includes('archive');
  if (pubYear < 2005 || titleLower.includes('historical') || isArchive || item.renditionCategory === 'ARCHIVE') {
    historicalValue = 'HIGH';
  }

  return { resolutionHeight, playableState, historicalValue, audioQuality };
}

export function calculateMediaQualityScore(items: ContentItem[]): ContentItem[] {
  return items.map(item => {
    // Si ya trae métricas reales (futuro), las usamos. Si no, inferimos.
    const metrics = item.mediaMetrics || inferMediaMetrics(item);
    item.playableState = metrics.playableState;
    item.mediaMetrics = metrics;

    let score = 0;
    
    // Resolution Score (0 - 50)
    const res = metrics.resolutionHeight || 360;
    if (res >= 1080) score += 50;
    else if (res >= 720) score += 40;
    else if (res >= 480) score += 25;
    else score += 10;

    // Source Reliability Score (0 - 30)
    let sourceRel = 10; // base
    if (item.provider === 'youtube') sourceRel = 30;
    else if (item.provider === 'vimeo') sourceRel = 25;
    else if (item.provider === 'dailymotion') sourceRel = 15;
    score += sourceRel;

    // Audio Quality (0 - 20)
    if (metrics.audioQuality === 'HIGH') score += 20;
    else if (metrics.audioQuality === 'NORMAL') score += 10;
    
    // Ajuste Histórico: Si es de alto valor histórico, ignoramos la penalización por resolución
    if (metrics.historicalValue === 'HIGH' && res < 720) {
       score += (50 - (score >= 25 ? 25 : 10)); // Le devolvemos los puntos perdidos por resolución
    }

    // Penalización por estado
    if (metrics.playableState === 'BROKEN') {
      score = 0;
    } else if (metrics.playableState === 'DERIVATIVE_ONLY') {
      score = Math.floor(score / 2);
    }

    item.mediaQualityScore = Math.min(100, Math.max(0, score));

    return item;
  });
}

export function sortByMediaQuality(items: ContentItem[], detection: ExactWorkDetection): ContentItem[] {
  return items.sort((a, b) => {
    // 1. Playable obligatorio
    const isABroken = a.playableState === 'BROKEN';
    const isBBroken = b.playableState === 'BROKEN';
    if (isABroken && !isBBroken) return 1;
    if (!isABroken && isBBroken) return -1;

    const isAStream = a.playableState === 'STREAM' || a.playableState === 'UNKNOWN';
    const isBStream = b.playableState === 'STREAM' || b.playableState === 'UNKNOWN';
    if (isAStream && !isBStream) return -1;
    if (!isAStream && isBStream) return 1;

    // 2. MediaQuality desc
    const mqA = a.mediaQualityScore || 0;
    const mqB = b.mediaQualityScore || 0;
    
    if (Math.abs(mqA - mqB) > 10) {
      return mqB - mqA;
    }

    // 3. RenditionPreference
    // Preferencia básica: ORIGINAL_STUDIO > LIVE > OTHERS (A menos que haya constraints, que ya se filtran antes)
    const getRenditionRank = (item: ContentItem) => {
       const role = item.semanticMatch?.renditionCategory || item.renditionCategory;
       if (role === 'ORIGINAL_STUDIO' || role === 'REMASTER') return 3;
       if (role === 'ORIGINAL_LIVE' || role === 'TV_PERFORMANCE') return 2;
       return 1;
    };

    const rankA = getRenditionRank(a);
    const rankB = getRenditionRank(b);
    if (rankA !== rankB) {
       return rankB - rankA; // Mayor rank primero
    }

    // 4. SourceReliability (implícito en mediaQualityScore o verificados)
    if (a.isVerified && !b.isVerified) return -1;
    if (!a.isVerified && b.isVerified) return 1;

    // 5. Popularity / Freshness (Fall back to semantic/youScore)
    return (b.youScore || 0) - (a.youScore || 0);
  });
}
