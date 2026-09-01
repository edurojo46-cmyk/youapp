import type { ContentItem, NormalizedVideo } from './types';

export function normalizeItems(items: ContentItem[]): ContentItem[] {
  return items.map(v => {
    let finalUrl = v.videoUrl;
    
    // Normalizar URLs embebidas
    if (v.provider === 'tiktok' && finalUrl.includes('/video/')) {
      const videoIdMatch = finalUrl.match(/\/video\/(\d+)/);
      if (videoIdMatch && videoIdMatch[1]) {
        finalUrl = `https://www.tiktok.com/embed/v2/${videoIdMatch[1]}`;
      }
    } else if (v.provider === 'instagram' && finalUrl.includes('/reel/')) {
      if (!finalUrl.endsWith('/embed/')) {
        const cleanUrl = finalUrl.split('?')[0];
        finalUrl = cleanUrl.endsWith('/') ? `${cleanUrl}embed/` : `${cleanUrl}/embed/`;
      }
    } else if (v.provider === 'vimeo' && !finalUrl.includes('player.vimeo.com')) {
      const vimeoMatch = finalUrl.match(/vimeo\.com\/(\d+)/);
      if (vimeoMatch && vimeoMatch[1]) {
        finalUrl = `https://player.vimeo.com/video/${vimeoMatch[1]}`;
      }
    }

    // Aplicar normalización canónica a metadatos
    const canonical = normalizeRawVideoToCanonical(v);

    return {
      ...v,
      providerId: canonical.providerContentId,
      provider: canonical.provider,
      videoUrl: finalUrl,
      publishedAt: canonical.publishedAt || v.publishedAt,
      viewCount: canonical.viewCount !== undefined ? canonical.viewCount : v.viewCount,
      durationSeconds: canonical.durationSeconds !== undefined ? canonical.durationSeconds : v.durationSeconds,
      contentState: canonical.contentState,
      isLive: canonical.contentState === 'live', // Mantener retrocompatibilidad
      metadata: canonical.metadata,
      metadataCompleteness: canonical.metadataCompleteness,
      metadataReadiness: canonical.metadataReadiness
    } as ContentItem;
  });
}

export function parseViews(viewsStr?: string | null): number | undefined {
  if (!viewsStr) return undefined;
  const s = viewsStr.toLowerCase().replace(/[^0-9km.,\s]/g, '').trim();
  if (!s) return undefined;
  
  let num = parseFloat(s.replace(/,/g, '.'));
  if (isNaN(num)) return undefined;
  
  if (viewsStr.toLowerCase().includes('m') || viewsStr.toLowerCase().includes('mill')) {
    num *= 1000000;
  } else if (viewsStr.toLowerCase().includes('k') || viewsStr.toLowerCase().includes('mil')) {
    num *= 1000;
  }
  return Math.floor(num);
}

export function parseDuration(durationStr?: string | null): number | undefined {
  if (!durationStr) return undefined;
  const parts = durationStr.split(':').map(p => parseInt(p, 10));
  if (parts.some(isNaN)) return undefined;
  
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return undefined;
}

export function parseRelativeDate(dateStr?: string | null): { dateStr: string; precision: 'exact' | 'day' | 'month' | 'relative' | 'unknown' } | undefined {
  if (!dateStr) return undefined;
  const s = dateStr.toLowerCase();
  const now = new Date(); // Ideally use passed-in current time for testing, but Date.now is fine
  
  let daysToSubtract = 0;
  let precision: 'exact' | 'day' | 'month' | 'relative' | 'unknown' = 'relative';

  if (s.includes('hora') || s.includes('minuto') || s.includes('segundo') || s.includes('hoy')) {
      daysToSubtract = 0;
      precision = 'day';
  } else if (s.includes('ayer')) {
      daysToSubtract = 1;
      precision = 'day';
  } else if (s.match(/(\d+)\s+día/)) {
      daysToSubtract = parseInt(s.match(/(\d+)\s+día/)?.[1] || '0', 10);
      precision = 'day';
  } else if (s.match(/(\d+)\s+semana/)) {
      daysToSubtract = parseInt(s.match(/(\d+)\s+semana/)?.[1] || '0', 10) * 7;
      precision = 'relative';
  } else if (s.match(/(\d+)\s+mes/)) {
      daysToSubtract = parseInt(s.match(/(\d+)\s+mes/)?.[1] || '0', 10) * 30;
      precision = 'month';
  } else if (s.match(/(\d+)\s+año/)) {
      daysToSubtract = parseInt(s.match(/(\d+)\s+año/)?.[1] || '0', 10) * 365;
      precision = 'relative';
  } else {
      return undefined;
  }
  
  now.setDate(now.getDate() - daysToSubtract);
  return { dateStr: now.toISOString(), precision };
}

export function normalizeRawVideoToCanonical(raw: any, primaryIntent: string = 'UNKNOWN'): NormalizedVideo {
  let publishedAt = raw.publishedAt;
  let precision: 'exact' | 'day' | 'month' | 'relative' | 'unknown' = 'unknown';

  if (raw.publishedAt) {
      precision = 'exact';
  } else {
      const parsedDate = parseRelativeDate(raw.publishedText);
      if (parsedDate) {
          publishedAt = parsedDate.dateStr;
          precision = parsedDate.precision;
      }
  }

  const viewCount = raw.viewCount ?? parseViews(raw.viewsText);
  const durationSeconds = raw.durationSeconds ?? parseDuration(raw.durationText);
  
  let contentState: 'vod' | 'live' | 'upcoming' | 'unknown' = 'vod';
  if (raw.isLive || (raw.title && raw.title.toUpperCase().includes('EN DIRECTO'))) contentState = 'live';
  if (raw.title && raw.title.toUpperCase().includes('PRÓXIMO ESTRENO')) contentState = 'upcoming';

  const video: NormalizedVideo = {
    provider: raw.provider || 'youtube',
    providerContentId: raw.providerContentId || raw.videoId || raw.id,
    title: raw.title || '',
    description: raw.description || '',
    channelId: raw.channelId,
    channelTitle: raw.channelTitle || '',
    publishedAt,
    publishedAtPrecision: precision,
    viewCount,
    durationSeconds,
    contentState,
    canonicalUrl: raw.canonicalUrl,
    sourceVerified: raw.isVerified || false,
    metadata: {
      publishedAt: publishedAt ? (raw.publishedAt ? 'real' : 'derived') : 'missing',
      viewCount: viewCount !== undefined ? (raw.viewCount !== undefined ? 'real' : 'derived') : 'missing',
      duration: durationSeconds !== undefined ? (raw.durationSeconds !== undefined ? 'real' : 'derived') : 'missing'
    },
    metadataCompleteness: 0,
    metadataReadiness: 0
  };

  let points = 0;
  let total = 3;
  if (video.metadata.publishedAt !== 'missing') points++;
  if (video.metadata.viewCount !== 'missing') points++;
  if (video.metadata.duration !== 'missing') points++;
  
  video.metadataCompleteness = Math.round((points / total) * 100);

  // Readiness Calculation
  if (primaryIntent === 'NEWS') {
      // News needs publishedAt desperately
      let readinessPoints = 0;
      if (video.metadata.publishedAt !== 'missing') readinessPoints += 60;
      if (video.metadata.viewCount !== 'missing') readinessPoints += 20;
      if (video.metadata.duration !== 'missing') readinessPoints += 20;
      video.metadataReadiness = readinessPoints;
  } else if (primaryIntent === 'HISTORY') {
       // History needs duration/views more than specific exact date
      let readinessPoints = 0;
      if (video.metadata.publishedAt !== 'missing') readinessPoints += 10;
      if (video.metadata.viewCount !== 'missing') readinessPoints += 45;
      if (video.metadata.duration !== 'missing') readinessPoints += 45;
      video.metadataReadiness = readinessPoints;
  } else {
       video.metadataReadiness = video.metadataCompleteness;
  }

  return video;
}
