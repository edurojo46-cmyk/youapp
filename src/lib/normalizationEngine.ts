import { type NormalizedVideo } from './types/normalization';
import { type YTVideoResult } from './youtubeChannelSearch';

/**
 * Normalization Engine (V1)
 * Convierte formatos caóticos del proxy de YouTube a tipos estrictos
 */

// Ej: "1,2 M visualizaciones", "850 mil visualizaciones", "1.2M views", "1.2 M de visualizaciones", "1.200 views"
export function parseViewCount(viewStr: string | undefined): number | undefined {
  if (!viewStr) return undefined;
  let s = viewStr.toLowerCase().replace(/visualizaciones|views|de visualizaciones/g, '').trim();
  s = s.replace(/\s+/g, ''); // "1,2m"
  s = s.replace(/,/g, '.');  // "1.2m"

  if (s.includes('m') || s.includes('millón') || s.includes('millones')) {
    const num = parseFloat(s.replace(/m|millones|millón/g, ''));
    if (!isNaN(num)) return Math.floor(num * 1000000);
  }
  if (s.includes('k') || s.includes('mil')) {
    const num = parseFloat(s.replace(/k|mil/g, ''));
    if (!isNaN(num)) return Math.floor(num * 1000);
  }

  // "1.200" o "1200"
  s = s.replace(/\./g, ''); // Cuidado: esto asume que en español "." es separador de miles. Pero ya reemplazamos "," por "." arriba para decimales...
  // Mejor usar un fallback seguro: si es un número entero simple.
  const parsed = parseInt(s.replace(/\D/g, ''), 10);
  if (!isNaN(parsed) && parsed > 0) return parsed;

  return undefined;
}

// Ej: "12:34", "1:02:03"
export function parseDuration(durationStr: string | undefined): number | undefined {
  if (!durationStr) return undefined;
  const parts = durationStr.split(':').map(Number);
  if (parts.some(isNaN)) return undefined;

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    return parts[0];
  }
  return undefined;
}

// Ej: "hace 2 meses", "hace 3 horas", "hace 1 año"
export function parseRelativeDateToISO(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;
  const s = dateStr.toLowerCase();
  const numMatch = s.match(/\d+/);
  if (!numMatch) return undefined;

  const num = parseInt(numMatch[0], 10);
  if (isNaN(num)) return undefined;

  const now = new Date();
  if (s.includes('año') || s.includes('ano') || s.includes('year')) {
    now.setFullYear(now.getFullYear() - num);
  } else if (s.includes('mes') || s.includes('month')) {
    now.setMonth(now.getMonth() - num);
  } else if (s.includes('semana') || s.includes('week')) {
    now.setDate(now.getDate() - (num * 7));
  } else if (s.includes('día') || s.includes('dia') || s.includes('day')) {
    now.setDate(now.getDate() - num);
  } else if (s.includes('hora') || s.includes('hour')) {
    now.setHours(now.getHours() - num);
  } else if (s.includes('minuto') || s.includes('minute')) {
    now.setMinutes(now.getMinutes() - num);
  } else if (s.includes('segundo') || s.includes('second')) {
    now.setSeconds(now.getSeconds() - num);
  } else {
    return undefined; // No se pudo parsear con confianza
  }

  return now.toISOString();
}

export function normalizeYouTubeCandidate(raw: YTVideoResult): NormalizedVideo {
  let contentState: 'vod' | 'live' | 'upcoming' | 'unknown' = 'unknown';
  if (raw.isLive) {
    contentState = 'live';
  } else if (raw.durationText && raw.durationText.toLowerCase().includes('en directo')) {
    contentState = 'live';
  } else if (raw.durationText && raw.durationText.toLowerCase().includes('próximo estreno')) {
    contentState = 'upcoming';
  } else {
    contentState = 'vod';
  }

  const publishedAt = parseRelativeDateToISO(raw.publishedAt);
  const viewCount = parseViewCount(raw.viewsText);
  // Solo parsear duración si no es un texto raro (como "EN DIRECTO")
  const durationSeconds = (contentState === 'vod') ? parseDuration(raw.durationText) : undefined;

  let metadataCompleteness = 0;
  let count = 0;
  if (publishedAt) count++;
  if (viewCount !== undefined) count++;
  if (durationSeconds !== undefined || contentState === 'live') count++; // Live videos no tienen duracion
  
  // 3 campos importantes
  metadataCompleteness = count / 3;

  return {
    provider: 'youtube',
    providerContentId: raw.videoId,
    title: raw.title || '',
    description: raw.description || '',
    channelId: raw.channelId,
    channelTitle: raw.channelTitle || '',
    thumbnailUrl: raw.thumbnail,
    publishedAt,
    viewCount,
    durationSeconds,
    contentState,
    canonicalUrl: raw.videoUrl || `https://www.youtube.com/watch?v=${raw.videoId}`,
    sourceVerified: raw.isVerified || false,
    metadata: {
      publishedAt: publishedAt ? 'derived' : 'missing',
      viewCount: viewCount !== undefined ? 'derived' : 'missing',
      duration: durationSeconds !== undefined ? 'derived' : 'missing',
    },
    metadataCompleteness
  };
}
