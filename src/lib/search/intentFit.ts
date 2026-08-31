/**
 * intentFit.ts — Compatibilidad entre content_format e intención del usuario
 *
 * content_format NO afecta Quality Score (calidad intrínseca del contenido).
 * SÍ afecta IntentFit: ¿qué tan compatible es el formato con lo que el usuario pide?
 *
 * Ejemplos:
 *   "Explicame la Revolución Francesa en profundidad"
 *     → longform: +30, lecture: +30, documentary: +30, short: -40
 *
 *   "Explicame esto en un minuto"
 *     → short: +40, clip: +30, longform: -30
 *
 *   "En vivo de la final"
 *     → live: +50, vod: -20
 */

import type { ContentItem, SearchQuery } from './types';
import type { QueryUnderstanding } from './intentDetector';

// ── Tipos ────────────────────────────────────────────────────────────────────

export type ContentFormat = 'short' | 'midform' | 'longform' | 'live' | 'clip';

interface FormatPreference {
  short: number;
  midform: number;
  longform: number;
  live: number;
  clip: number;
}

// ── Preferencias de formato por intent ───────────────────────────────────────

function getFormatPreference(
  query: SearchQuery,
  intent?: QueryUnderstanding
): FormatPreference {
  const q = query.normalizedQuery;
  const primaryIntent = intent?.primaryIntent || 'general';

  // Base neutral
  const prefs: FormatPreference = {
    short: 0, midform: 10, longform: 10, live: 0, clip: 0
  };

  // Live: máxima prioridad si freshness = live
  if (query.freshness === 'live' || primaryIntent === 'LIVE') {
    return { short: -20, midform: -10, longform: -20, live: 50, clip: 0 };
  }

  // News: prefiere midform frescos, no longform
  if (primaryIntent === 'NEWS' || query.freshness === 'news') {
    return { short: 10, midform: 25, longform: -10, live: 20, clip: 15 };
  }

  // Tutorial/educacional: longform y midform
  if (primaryIntent === 'TUTORIAL') {
    return { short: 5, midform: 25, longform: 30, live: 0, clip: -5 };
  }

  // Documental: longform casi exclusivamente
  if (primaryIntent === 'DOCUMENTARY') {
    return { short: -30, midform: 5, longform: 35, live: 0, clip: -10 };
  }

  // Signals de keywords para el caso general
  if (/en profundidad|completo|detallado|explicame bien|todo sobre|historia de/i.test(q)) {
    prefs.longform += 30; prefs.short -= 40; prefs.midform += 10;
  }
  if (/en un minuto|rapido|breve|corto|resumen rapido/i.test(q)) {
    prefs.short += 40; prefs.clip += 30; prefs.longform -= 30;
  }
  if (/documental|completo|largo|toda la pelicula/i.test(q)) {
    prefs.longform += 35; prefs.short -= 30;
  }
  if (/clip|momento|escena|fragmento/i.test(q)) {
    prefs.clip += 35; prefs.short += 20; prefs.longform -= 20;
  }
  if (/en vivo|live|stream|twitch/i.test(q)) {
    prefs.live += 45; prefs.longform -= 10;
  }

  // Clamp a range razonable
  return {
    short: Math.max(-50, Math.min(50, prefs.short)),
    midform: Math.max(-50, Math.min(50, prefs.midform)),
    longform: Math.max(-50, Math.min(50, prefs.longform)),
    live: Math.max(-50, Math.min(50, prefs.live)),
    clip: Math.max(-50, Math.min(50, prefs.clip)),
  };
}

// ── Detectar content_format de un ContentItem ────────────────────────────────
function detectFormat(item: ContentItem): ContentFormat {
  // Si ya viene del DB
  if ((item as any).contentFormat) return (item as any).contentFormat as ContentFormat;

  // Inferir por señales
  if (item.isLive || item.contentState === 'live') return 'live';
  const dur = item.durationSeconds || 0;
  if (dur < 180) return 'short';
  if (dur < 1200) return 'midform';
  return 'longform';
}

// ── API pública ─────────────────────────────────────────────────────────────

/**
 * Calcular IntentFit score (0-100) para un ContentItem dado una query.
 * Se suma al ranking DESPUÉS de YouScore, no lo reemplaza.
 */
export function calculateIntentFit(
  item: ContentItem,
  query: SearchQuery,
  intent?: QueryUnderstanding
): number {
  const format = detectFormat(item);
  const prefs = getFormatPreference(query, intent);

  // Bonus base de compatibilidad (50 = neutro)
  const bonus = 50 + (prefs[format] || 0);
  return Math.max(0, Math.min(100, bonus));
}

/**
 * Aplicar IntentFit a una lista de candidatos.
 * Ajusta `relevanceScore` sumando el componente de formato.
 * Peso: 15% del relevanceScore total.
 */
export function applyIntentFit(
  candidates: ContentItem[],
  query: SearchQuery,
  intent?: QueryUnderstanding
): ContentItem[] {
  const prefs = getFormatPreference(query, intent);
  const hasSignal = Object.values(prefs).some(v => Math.abs(v) > 10);

  // Si no hay preferencia fuerte de formato, no alterar
  if (!hasSignal) return candidates;

  return candidates.map(item => {
    // Los artículos no compiten en formato contra el audiovisual, así que no se penalizan.
    if (item.type === 'article') {
      return item;
    }
    const intentFit = calculateIntentFit(item, query, intent);
    const intentFitDelta = (intentFit - 50) * 0.15;  // -7.5 a +7.5 puntos
    return {
      ...item,
      relevanceScore: Math.max(0, Math.min(100,
        (item.relevanceScore || 50) + intentFitDelta
      ))
    };
  });
}

/**
 * Agrupar candidatos por content_format para la UI de tabs.
 * No afecta el ranking — es puramente para la presentación.
 */
export function groupByFormat(candidates: ContentItem[]): {
  all: ContentItem[];
  short: ContentItem[];   // TikTok, Shorts, Reels
  midform: ContentItem[];
  longform: ContentItem[]; // Documentales, tutoriales
  live: ContentItem[];
  clip: ContentItem[];
} {
  const groups: ReturnType<typeof groupByFormat> = {
    all: candidates,
    short: [], midform: [], longform: [], live: [], clip: []
  };

  for (const item of candidates) {
    const format = detectFormat(item);
    groups[format].push(item);
  }

  return groups;
}
