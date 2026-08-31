import type { SignalRequest, BlockRole } from './signalTypes';
import type { IntentType } from '../search/types';

const DURATION_PATTERNS = [
  { regex: /media hora/i, min: 30 },
  { regex: /una hora/i, min: 60 },
  { regex: /(\d+)\s*(minutos|min)\b/i, extract: true },
  { regex: /(\d+)\s*(horas|hora|hs|h)\b/i, extract: true, multiplier: 60 }
];

const FRESHNESS_KEYWORDS = ['hoy', 'reciente', 'recientes', 'últimas', 'ultimas', 'noticias', 'novedades', 'actualidad'];
const HISTORY_KEYWORDS = ['historia', 'imperio', 'antigua', 'roma', 'origen', 'pasado', 'arqueología', 'arqueologia'];

export function parseSignalPrompt(prompt: string): SignalRequest {
  const normalized = prompt.toLowerCase();
  
  let durationTargetMin = 60; // Default 1 hr
  let normalizedNoDuration = normalized;
  for (const pattern of DURATION_PATTERNS) {
    const match = normalized.match(pattern.regex);
    if (match) {
      if (pattern.extract && match[1]) {
        durationTargetMin = parseInt(match[1], 10) * (pattern.multiplier || 1);
      } else if (pattern.min) {
        durationTargetMin = pattern.min;
      }
      normalizedNoDuration = normalized.replace(pattern.regex, '');
      break;
    }
  }

  const isFresh = FRESHNESS_KEYWORDS.some(k => normalizedNoDuration.includes(k));
  const isHistory = HISTORY_KEYWORDS.some(k => normalizedNoDuration.includes(k));

  let cleanPrompt = normalizedNoDuration
    .replace(/(quiero|tengo|ver|una|un|hora|media|sobre|algo|de|minutos|min|haceme|armame|mostrame|programame|para|entender|aprender|desde|cero|con|las|los|la|el|noticias|más|mas|importantes|hoy|sorprendeme|que|probablemente|no|conozca|en|vivo)\b/ig, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[:]/g, '')
    .trim();
    
  const parts = cleanPrompt.split(/[,]| y | e /).map(p => p.trim()).filter(p => p.length > 3);
  
  let mainTopic = parts.length > 0 ? parts[0] : 'general';

  // Entity Resolution (Mocking an Entity Resolver)
  let entities = undefined;
  let isAmbiguous = false;
  
  if (mainTopic.toLowerCase().includes('jaguar')) {
    // Mock ambiguity for 'jaguar'
    const candidates = [
      { type: 'animal', confidence: 0.39 },
      { type: 'automóvil', confidence: 0.35 },
      { type: 'equipo', confidence: 0.18 }
    ];
    
    // Si la confianza del top candidate es baja (< 0.50) y el gap entre #1 y #2 es pequeño (< 0.15)
    if (candidates[0].confidence < 0.50 && (candidates[0].confidence - candidates[1].confidence) < 0.15) {
      // Check if context helps
      if (!cleanPrompt.includes('selva') && !cleanPrompt.includes('animal') && !cleanPrompt.includes('auto') && !cleanPrompt.includes('motor')) {
        isAmbiguous = true;
      } else {
        entities = [{ canonical: "Jaguar", aliases: ["panthera onca", "yaguareté"] }];
      }
    }
  } else if (mainTopic.toLowerCase().includes('roma') || mainTopic.toLowerCase().includes('imperio')) {
    entities = [{
      canonical: "Ancient Rome",
      aliases: ["Roma antigua", "Imperio Romano", "Roman Empire", "romano", "romana", "roma"]
    }];
    mainTopic = "Roma antigua"; // Normalize parent context
  }

  if (isAmbiguous) {
    throw new Error('AMBIGUOUS_PROMPT: Multiple plausible interpretations with low context.');
  }

  // Subquery Generation Heuristics
  const subQueries: SignalRequest['subQueries'] = [];

  // Core block
  subQueries.push({
    id: `sq-${Date.now()}-1`,
    query: isHistory ? `historia de ${mainTopic} documental` : `${mainTopic} documental explicacion`,
    role: "opening",
    intentHint: isHistory ? "HISTORY" : "UNKNOWN",
    needsDocumentary: true,
    parentContext: mainTopic,
    entities,
    freshness: "evergreen"
  });

  // Determine if this is a deep dive (sobre) or multitematic (con)
  const isDeepDive = normalized.includes('sobre');

  // Deep dive blocks based on other parts
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const isPartFresh = FRESHNESS_KEYWORDS.some(k => part.includes(k));
    
    let subQueryText = part;
    if (isDeepDive) {
      subQueryText = isPartFresh ? `noticias recientes sobre ${mainTopic}` : `${part} de ${mainTopic}`;
    } else {
      subQueryText = isPartFresh ? `noticias recientes sobre ${part}` : part;
    }
    
    subQueries.push({
      id: `sq-${Date.now()}-${i + 1}`,
      query: subQueryText,
      role: isPartFresh ? "news" : "deep_dive",
      intentHint: isPartFresh ? "NEWS" : (isHistory ? "HISTORY" : "UNKNOWN"),
      parentContext: mainTopic,
      entities,
      freshness: isPartFresh ? "news" : "evergreen"
    });
  }
  
  // If no additional parts but user asked for freshness
  if (parts.length === 1 && isFresh) {
    subQueries.push({
      id: `sq-${Date.now()}-news`,
      query: `noticias recientes ${mainTopic}`,
      role: "news",
      intentHint: "NEWS",
      parentContext: mainTopic,
      entities,
      freshness: "news"
    });
  }

  // Add a discovery/closing block
  subQueries.push({
    id: `sq-${Date.now()}-closing`,
    query: isHistory 
      ? (isFresh ? `últimos descubrimientos arqueológicos de ${mainTopic}` : `descubrimientos arqueológicos de ${mainTopic}`) 
      : `curiosidades de ${mainTopic}`,
    role: "discovery",
    intentHint: isHistory ? "HISTORY" : "UNKNOWN",
    parentContext: mainTopic,
    entities,
    freshness: isFresh ? "recent" : "evergreen"
  });

  return {
    originalPrompt: prompt,
    mainTopic,
    durationTargetMin,
    subQueries,
    mode: 'balanced'
  };
}
