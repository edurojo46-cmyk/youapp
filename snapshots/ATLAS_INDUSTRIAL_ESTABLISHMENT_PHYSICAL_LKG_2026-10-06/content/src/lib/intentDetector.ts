import type { Intent, QueryUnderstanding } from './types/normalization';

const INTENT_TERMS: Record<Intent, string[]> = {
  history: [
    'historia',
    'historico',
    'origen',
    'pasado',
    'siglo',
    'republica',
    'antigua',
    'independencia',
    'colonial'
  ],
  tech: [
    'tecnologia',
    'software',
    'inteligencia artificial',
    'machine learning',
    'chatgpt',
    'gemini',
    'openai',
    'anthropic',
    'programacion'
  ],
  news: [
    'noticias',
    'ultima hora',
    'actualidad',
    'hoy',
    'reciente',
    'urgente',
    'ahora',
    'breaking'
  ],
  sports: [
    'deporte',
    'futbol',
    'tenis',
    'basket',
    'resultado',
    'partido',
    'campeonato',
    'torneo'
  ],
  documentary: [
    'documental',
    'documentary',
    'cronica',
    'investigacion',
    'reportaje'
  ],
  tourism: [
    'turismo',
    'viaje',
    'visitar',
    'conocer',
    'lugares',
    'destino'
  ],
  culture: [
    'cultura',
    'arte',
    'musica',
    'folklore',
    'tradicion'
  ],
  nature: [
    'naturaleza',
    'paisaje',
    'rio',
    'flora',
    'fauna'
  ],
  economy: [
    'economia',
    'finanzas',
    'mercado',
    'produccion',
    'inflacion'
  ],
  politics: [
    'politica',
    'gobierno',
    'elecciones',
    'municipio',
    'provincia'
  ],
  general: []
};

// Limpia acentos y convierte a minúsculas
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function extractEntities(query: string): string[] {
  return query.toLowerCase().split(/\s+/)
    .filter(t => t.length >= 4 && !/^(para|como|que|los|las|del|una|con|por|sobre)$/.test(t));
}

export function detectIntent(query: string): QueryUnderstanding {
  const normalized = normalizeText(query);
  const tokens = normalized.split(/\s+/);
  const entities = extractEntities(query);

  const matches: Record<Intent, number> = {
    history: 0, tech: 0, news: 0, sports: 0, documentary: 0,
    tourism: 0, culture: 0, nature: 0, economy: 0, politics: 0, general: 0
  };

  // Buscar tokens directos o frases exactas
  for (const [intentStr, terms] of Object.entries(INTENT_TERMS)) {
    const intent = intentStr as Intent;
    for (const term of terms) {
      const normTerm = normalizeText(term);
      if (normTerm.includes(' ')) {
        // Frase (ej. "inteligencia artificial")
        if (normalized.includes(normTerm)) {
          matches[intent] += 2;
        }
      } else {
        // Token exacto (evita el bug de 'ia' en 'historia')
        if (tokens.includes(normTerm)) {
          matches[intent] += 1;
        }
      }
    }
  }

  // Regla especial para el token 'ia'
  if (tokens.includes('ia')) {
    matches.tech += 1.5; // Señal fuerte pero requiere ser token completo
  }

  // Ordenar intents por puntuación
  const sortedIntents = Object.entries(matches)
    .filter(([_, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);

  let primaryIntent: Intent = 'general';
  let secondaryIntent: Intent | undefined = undefined;
  let confidence = 0.5;

  if (sortedIntents.length > 0) {
    primaryIntent = sortedIntents[0][0] as Intent;
    confidence = Math.min(1.0, 0.5 + (sortedIntents[0][1] * 0.2));
    
    if (sortedIntents.length > 1) {
      secondaryIntent = sortedIntents[1][0] as Intent;
    }
  }

  return {
    primaryIntent,
    secondaryIntent,
    entities,
    confidence
  };
}
