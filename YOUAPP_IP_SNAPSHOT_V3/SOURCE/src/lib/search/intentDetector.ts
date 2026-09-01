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
}

const HISTORY_KEYWORDS = ['historia', 'biografia', 'origen', 'como empezo', 'quien fue', 'major', 'grand final', 'boss guide'];
const NEWS_KEYWORDS = ['noticias', 'hoy', 'novedades', 'ultimas', 'urgente', 'actualidad', 'live stream'];

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
  }
  
  return {
    primaryIntent,
    secondaryIntent: undefined,
    topic: undefined,
    topics: [],
    entities: [],
    confidence,
    freshness: primaryIntent === 'NEWS' ? 'news' : 'evergreen',
    temporal: { intent: primaryIntent === 'NEWS' ? 'recent' : 'evergreen', confidence }
  };
}
