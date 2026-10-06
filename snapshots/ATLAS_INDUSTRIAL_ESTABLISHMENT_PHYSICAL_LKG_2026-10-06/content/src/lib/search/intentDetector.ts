import type { IntentType } from './types';

export interface TemporalUnderstanding {
  intent: 'historical' | 'recent' | 'live' | 'evergreen';
  confidence: number;
  year?: number;
}

export interface EntityMatch {
  name: string;
  type: string;
  confidence: number;
  canonical?: string;
}

export interface QueryUnderstanding {
  primaryIntent: IntentType;
  secondaryIntent?: IntentType;
  topic?: string;
  topics: string[];
  entities: EntityMatch[];
  confidence: number;
  freshness: 'news' | 'live' | 'evergreen' | 'unknown';
  temporal: TemporalUnderstanding;
  subject?: string;              // Sujeto central (ej: "teologia de la liberacion")
  modifiers?: string[];          // Modificadores de formato/intención (ej: ["master"])
  requiredConcepts?: string[];   // Conceptos obligatorios (ej: ["teologia", "liberacion"])
  optionalConcepts?: string[];   // Conceptos accesorios (ej: ["master"])
}

const HISTORY_KEYWORDS = ['historia', 'biografia', 'origen', 'como empezo', 'quien fue', 'major', 'grand final', 'boss guide'];
const NEWS_KEYWORDS = ['noticias', 'hoy', 'novedades', 'ultimas', 'urgente', 'actualidad', 'live stream'];
const MODIFIER_KEYWORDS = ['master', 'máster', 'curso', 'clase', 'clases', 'seminario', 'diplomado', 'taller', 'tutorial', 'estudio', 'leccion', 'charla', 'guia', 'manual', 'documental', 'resumen'];

export function analyzeQuery(rawQuery: string): QueryUnderstanding {
  const normalized = rawQuery.toLowerCase();
  
  let primaryIntent: IntentType = 'UNKNOWN';
  let confidence = 10;
  
  if (HISTORY_KEYWORDS.some(k => normalized.includes(k))) {
    primaryIntent = 'HISTORY';
    confidence = 90;
  } else if (NEWS_KEYWORDS.some(k => normalized.includes(k))) {
    primaryIntent = 'NEWS';
    confidence = 90;
  } else if (MODIFIER_KEYWORDS.some(k => normalized.includes(k))) {
    primaryIntent = 'TUTORIAL';
    confidence = 80;
  }

  // ── Separación de Sujeto Central vs Modificadores ──────────────────────────
  const tokens = normalized
    .replace(/[.,:;!?()"']/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);

  const modifiers: string[] = [];
  const requiredTokens: string[] = [];

  const stopWords = new Set(['de', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'para', 'en', 'con', 'sobre', 'que', 'del', 'al', 'por', 'y', 'e', 'o', 'u']);

  for (const t of tokens) {
    if (MODIFIER_KEYWORDS.includes(t)) {
      modifiers.push(t);
    } else if (!stopWords.has(t) && t.length > 2) {
      requiredTokens.push(t);
    }
  }

  // Si hay modificadores y tokens de sujeto, extraer el sujeto central
  let subject = normalized;
  if (modifiers.length > 0 && requiredTokens.length > 0) {
    const modRegex = new RegExp(`\\b(${modifiers.join('|')})\\b`, 'gi');
    subject = normalized.replace(modRegex, '').replace(/\s+/g, ' ').trim();
  }
  
  return {
    primaryIntent,
    secondaryIntent: undefined,
    topic: undefined,
    topics: primaryIntent === 'HISTORY' ? ['History'] : primaryIntent === 'NEWS' ? ['News'] : [],
    entities: requiredTokens.length > 0 ? [{ name: requiredTokens.join(' '), type: 'concept', confidence: 80, canonical: requiredTokens.join(' ') }] : [],
    confidence,
    freshness: primaryIntent === 'NEWS' ? 'news' : 'evergreen',
    temporal: { intent: primaryIntent === 'NEWS' ? 'recent' : 'evergreen', confidence },
    subject: subject || rawQuery,
    modifiers,
    requiredConcepts: requiredTokens,
    optionalConcepts: modifiers
  };
}
