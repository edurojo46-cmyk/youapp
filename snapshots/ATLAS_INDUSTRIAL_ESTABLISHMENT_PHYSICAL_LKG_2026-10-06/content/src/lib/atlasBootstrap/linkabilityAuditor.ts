/**
 * linkabilityAuditor.ts — Clasificador y Auditor de Linkabilidad de Assets No Vinculados
 */

import type { UnlinkedCategoryReport } from './worksGraphTypes';

export type UnlinkedBucket =
  | 'linkable_explicit'
  | 'linkable_inferible'
  | 'work_known_performer_ambiguous'
  | 'traditional_anonymous'
  | 'compilation_generic'
  | 'title_without_artist'
  | 'insufficient_metadata'
  | 'unresolvable';

export interface UnlinkedItemDiagnosis {
  bucket: UnlinkedBucket;
  reason: string;
  extractedCandidate?: string;
}

export function diagnoseUnlinkedItem(title: string, description = '', creator = ''): UnlinkedItemDiagnosis {
  const text = `${title} ${description} ${creator}`.toLowerCase();
  const cleanTitle = title
    .replace(/^\[.*?\]\s*/, '')
    .replace(/\s*\(Official.*?\)/i, '')
    .replace(/\s*\(Live.*?\)/i, '')
    .replace(/\s*\(HD.*?\)/i, '');

  // 1. Compilaciones y Mixes Genéricos
  if (/\b(top\s*\d+|best\s*of|greatest\s*hits|mix\s*\d+|lofi\s*beats|chill\s*mix|compilado|recopilacion|playlist|various\s*artists|lo-fi|relaxing\s*music)\b/i.test(text)) {
    return {
      bucket: 'compilation_generic',
      reason: 'Compilación, playlist o mix de múltiples intérpretes'
    };
  }

  // 2. Música Tradicional, Anónima o Ritual
  if (/\b(traditional|folklore\s*tradicional|musica\s*andina|persian\s*classical|shakuhachi\s*solo|meditation|gregorian\s*chant|canto\s*gregoriano|gnawa\s*trance|canto\s*popular\s*anonimo)\b/i.test(text)) {
    return {
      bucket: 'traditional_anonymous',
      reason: 'Música folclórica tradicional, canto gregoriano o ritual sin autor individual estricto'
    };
  }

  // 3. Obra Clásica Conocida pero Intérprete/Orquesta Ambiguo
  if (/\b(symphony\s*no|sinfonia\s*no|concerto\s*in|sonata\s*in|suite\s*no|nocturne\s*op|prelude\s*in|fantasie\s*in|requiem|ave\s*maria|canon\s*in\s*d|four\s*seasons|cuatro\s*estaciones)\b/i.test(text)) {
    return {
      bucket: 'work_known_performer_ambiguous',
      reason: 'Composición clásica identificada pero solista u orquesta no especificada'
    };
  }

  // 4. Sintaxis Explícita "Artista - Título" o "Título by Artista" (Linkable Explicit)
  const explicitDashMatch = cleanTitle.match(/^([A-Z\u00C0-\u017E0-9\s&'.]{3,35})\s*[-–—:]\s*(.+)$/);
  if (explicitDashMatch && explicitDashMatch[1]) {
    const rawCandidate = explicitDashMatch[1].trim();
    if (!/^(official|video|audio|full|live|recital|concierto|festival|documental|session|hd|4k|album|cancion|tema|obra|musica)\b/i.test(rawCandidate)) {
      return {
        bucket: 'linkable_explicit',
        reason: 'Sintaxis limpia de artista en el título susceptible de resolución automática',
        extractedCandidate: rawCandidate
      };
    }
  }

  const explicitByMatch = cleanTitle.match(/(.+)\s+(?:by|por|interpretado\s*por)\s+([A-Z\u00C0-\u017E0-9\s&'.]{3,35})/i);
  if (explicitByMatch && explicitByMatch[2]) {
    return {
      bucket: 'linkable_explicit',
      reason: 'Patrón "Título by Artista" detectado en el título',
      extractedCandidate: explicitByMatch[2].trim()
    };
  }

  // 5. Canal del Creador Válido (Linkable Inferible)
  if (creator && creator.length >= 3 && creator.length <= 35) {
    if (!/^(vevo|records|music|official|canal|tv|radio|archivo|sound|audio|news|noticias|creation|people)\b/i.test(creator)) {
      return {
        bucket: 'linkable_inferible',
        reason: 'Canal de artista o conjunto inferible a través del creador',
        extractedCandidate: creator
      };
    }
  }

  // 6. Metadata Insuficiente o Título Aislado
  if (cleanTitle.length < 10 || cleanTitle.split(/\s+/).length < 2) {
    return {
      bucket: 'insufficient_metadata',
      reason: 'Título excesivamente corto o carente de contexto descriptivo'
    };
  }

  // 7. Título sin Artista
  if (/^[a-zA-Z0-9\s,'.]{3,50}$/.test(cleanTitle) && !cleanTitle.includes('-')) {
    return {
      bucket: 'title_without_artist',
      reason: 'Título de pista o melodía sin nombre de artista asociado'
    };
  }

  return {
    bucket: 'unresolvable',
    reason: 'Audio ambiental, loop o registro no atribuible'
  };
}
