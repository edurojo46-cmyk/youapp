/**
 * workResolver.ts — Motor de Descubrimiento y Resolución Automática de Obras Canónicas (Works Graph V2)
 *
 * Transforma un catálogo plano de videos en un Grafo Jerárquico:
 *   ENTITY (Artista) ➔ CANONICAL WORK (Obra / Canción / Sinfonía) ➔ 3D PERFORMANCE (Rendition, Role, Context) ➔ ASSET
 */

import { CANONICAL_WORKS_REGISTRY } from './worksGraphEngine';
import type {
  CanonicalWork,
  AssetWorkRelation,
  RenditionType,
  ContentRole,
  SourceContext
} from './worksGraphTypes';

export interface DiscoveredWorkCluster {
  workId: string;
  canonicalTitle: string;
  normalizedTitle: string;
  primaryEntityId: string;
  primaryEntityName: string;
  assetIds: string[];
  renditionCounts: Record<RenditionType, number>;
  roleCounts: Record<ContentRole, number>;
  contextCounts: Record<SourceContext, number>;
}

export function detectRenditionType(title: string, description = ''): RenditionType {
  const text = `${title} ${description}`.toLowerCase();
  if (/\b(rehearsal|ensayo|soundcheck)\b/i.test(text)) return 'rehearsal';
  if (/\b(demo|early version|home recording)\b/i.test(text)) return 'demo';
  if (/\b(outtake|alternate take|toma alternativa|inédito|inedito)\b/i.test(text)) return 'outtake';
  if (/\b(cover|homenaje|tributo|versionado por|interpretado por)\b/i.test(text)) return 'cover';
  if (/\b(remaster|remastered|2011 remaster|2020 remaster|digitally remastered)\b/i.test(text)) return 'remaster';
  if (/\b(acustico|acústico|acoustic|unplugged|solo piano|solo guitar)\b/i.test(text)) return 'acoustic';
  if (/\b(live|en vivo|en directo|concierto|recital|festival|full concert|stage)\b/i.test(text)) return 'live';
  return 'studio';
}

export function detectContentRole(title: string, description = ''): ContentRole {
  const text = `${title} ${description}`.toLowerCase();
  if (/\b(analisis|análisis|teoria musical|como se compuso|explicacion|how it was made|breakdown|reaction)\b/i.test(text)) return 'analysis';
  if (/\b(documental|documentary|historia de|making of|behind the scenes|biografia)\b/i.test(text)) return 'documentary';
  if (/\b(interview|entrevista|masterclass|clase magistral|dialogo)\b/i.test(text)) return 'interview';
  if (/\b(historico|historical|memoria|archivo historico|196|197)\b/i.test(text)) return 'historical_context';
  return 'performance';
}

export function detectSourceContext(title: string, description = ''): SourceContext {
  const text = `${title} ${description}`.toLowerCase();
  if (/\b(radio session|bbc session|kexp|fm broadcast|peel session|tiny desk)\b/i.test(text)) return 'radio_session';
  if (/\b(festival|woodstock|monterey|montreux|glastonbury|cosquin|rock in rio|isle of wight)\b/i.test(text)) return 'festival';
  if (/\b(tv show|television|tve|bbctv|vpro|rockpalast|old grey whistle test)\b/i.test(text)) return 'television';
  if (/\b(archive|archivo|soundboard|bootleg|unreleased tape|cassette)\b/i.test(text)) return 'archive';
  if (/\b(broadcast|en directo|retransmision)\b/i.test(text)) return 'broadcast';
  return 'official_release';
}

export function extractWorkTitleCandidate(title: string, artistName: string): string | null {
  let clean = title
    .replace(/^\[.*?\]\s*/, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\{.*?\}/g, '')
    .replace(/official\s*(video|audio|hd|4k|lyric video|music video)/gi, '')
    .replace(/live\s*(at|in|festival|concert|wembley|stadium|theatre|colon|19\d\d|20\d\d)?/gi, '')
    .replace(/en vivo\s*(en|estadio|teatro|recital|concierto|19\d\d|20\d\d)?/gi, '')
    .replace(/remaster(ed)?(\s*\d{4})?/gi, '')
    .replace(/concierto completo|full concert|audio original/gi, '')
    .trim();

  // Remover nombre de artista del inicio o fin
  const artistRegex = new RegExp(`^${artistName}\\s*[-–—:|]\\s*`, 'i');
  clean = clean.replace(artistRegex, '').trim();

  const artistEndRegex = new RegExp(`\\s*[-–—:|]\\s*${artistName}$`, 'i');
  clean = clean.replace(artistEndRegex, '').trim();

  // Si contiene un guión restante "Artista - Canción"
  if (clean.includes('-')) {
    const parts = clean.split(/[-–—:]/);
    if (parts.length >= 2) {
      clean = parts[1].trim();
    }
  }

  // Filtrar títulos residuales vacíos o inválidos
  clean = clean.replace(/^[^\w\s]+|[^\w\s]+$/g, '').trim();
  if (clean.length >= 3 && clean.length <= 45 && !/^(official|video|audio|track \d+|cd \d+|disc \d+|session \d+)$/i.test(clean)) {
    return clean;
  }

  return null;
}
