/**
 * exactWorkSearchGate.ts — Gate de Fidelidad de Obra Exacta para Búsqueda (ExactWorkSearchGate)
 * 
 * Cuando la intención de búsqueda es una obra específica (ej. "Rolling Stones Paint It Black",
 * "Queen Bohemian Rhapsody", "Cerati Crimen"):
 * 1. Exige que cada candidato pertenezca fehacientemente a la obra solicitada (WorkFidelityScore >= 75).
 * 2. Permite múltiples renditions válidas de la misma obra (studio, live, remaster, TV, rehearsal, covers, lyrics).
 * 3. Descarta videos que solo coinciden en el artista pero pertenecen a otra obra.
 * 4. Deduplica únicamente copias físicas idénticas (mismo recording hash / provider ID).
 */

import type { ContentItem, ContentRole, RenditionCategory, ResolvedSearchIntent, RequestedObjectType, SearchConstraint, SearchConstraintType, MandatoryIntentGates, GateResult, MandatoryConstraint } from './types';
export type { ContentRole, RenditionCategory, RequestedObjectType, SearchConstraint, SearchConstraintType, MandatoryIntentGates, GateResult, MandatoryConstraint } from './types';
import type { QueryUnderstanding } from './intentDetector';
import { resolveEntityV2, CANONICAL_ENTITIES_V2, resolveVenueFromEntityGraph, checkEntityRelation } from '../atlasBootstrap/entityResolverV2';
import { lookupCanonicalWork } from './canonicalWorksCatalog';
import { resolveTypos } from './typoResolver';


export type WorkCandidate = {
  text: string;
  sourceSpan: string;
  evidenceType: "QUOTED_SPAN" | "ALBUM_CUE" | "SONG_CUE" | "SINGLE_CUE" | "FILM_CUE" | "SHOW_CUE" | "VIDEO_FOR_CUE" | "EXACT_KNOWN_WORK";
  inferredWorkType: "SONG" | "ALBUM" | "FILM" | "TV_SHOW" | "UNKNOWN";
  contextualRisk: number;
  confidence: number;
};

export interface ExactWorkDetection {
  baseIntent: 'GENERIC' | 'ENTITY' | 'ENTITY_OBJECT';
  isExactWork: boolean;
  isExactEntityTitle?: boolean;
  isEntityTopic?: boolean;
  detectionType: 'GENERIC' | 'EXACT_ENTITY' | 'EXACT_ENTITY_TITLE' | 'EXACT_ENTITY_WORK' | 'ENTITY_TOPIC';
  canonicalEntity?: string;
  canonicalWork?: string;
  residualTitle?: string;
  topic?: string;
  topicCategory?: 'ENTREVISTA' | 'DISCURSO' | 'CONFERENCIA' | 'MISA' | 'DOCUMENTAL' | 'DEBATE' | 'OTHER';
  constraints?: SearchConstraint[];
  venue?: string;
  workConfidence: number;
  entityConfidence?: number;
  workTokens: string[];
  workId?: string; // SÓLO para EXACT_ENTITY_WORK
  provisionalTitleKey?: string; // SÓLO para EXACT_ENTITY_TITLE
  resolvedIntentSource?: 'AUTOCOMPLETE_SELECTION' | 'QUERY_RESOLVER';
  properNameCandidate?: boolean;
  rawProperName?: string;
  corrections?: {
    raw: string;
    canonical: string;
    type: 'ENTITY' | 'WORK';
    confidence: number;
  }[];
}

export const TOPIC_PATTERNS: Array<{
  category: 'ENTREVISTA' | 'DISCURSO' | 'CONFERENCIA' | 'MISA' | 'DOCUMENTAL' | 'DEBATE' | 'OTHER';
  regex: RegExp;
  label: string;
}> = [
  {
    category: 'ENTREVISTA',
    regex: /\b(entrevista|interviews?|reportajes?|conversacion(es)?|conversación(es)?|charla\s+(con|de)?|dialoga\s+con|dialogo\s+con|diálogo\s+con|habla\s+con|mano\s+a\s+mano)\b/i,
    label: 'entrevista'
  },
  {
    category: 'DISCURSO',
    regex: /\b(discurso(s)?|palabras\s+de|alocucion(es)?|alocución(es)?|speech(es)?)\b/i,
    label: 'discurso'
  },
  {
    category: 'CONFERENCIA',
    regex: /\b(conferencia(s)?|rueda\s+de\s+prensa|conferencia\s+de\s+prensa|press\s+conference)\b/i,
    label: 'conferencia de prensa'
  },
  {
    category: 'MISA',
    regex: /\b(misa(s)?|homilia(s)?|homilía(s)?|angelus|ángelus|audiencia\s+general)\b/i,
    label: 'misa'
  },
  {
    category: 'DEBATE',
    regex: /\b(debate(s)?|polemica|polémica|discusion|discusión)\b/i,
    label: 'debate'
  },
  {
    category: 'DOCUMENTAL',
    regex: /\b(documental(es)?|biografia|biografía|vida\s+y\s+obra)\b/i,
    label: 'documental'
  },
  {
    category: 'MAKING_OF' as any,
    regex: /\b(making\s*of|como\s*se\s*hizo|cómo\s*se\s*hizo|detras\s*de\s*escena|detrás\s*de\s*escena|behind\s*the\s*scenes)\b/i,
    label: 'making of'
  }
];

// Catálogo de obras exactas canónicas frecuentes para detección instantánea <1ms en RAM
const KNOWN_EXACT_WORKS: Array<{ entity: string; work: string; aliases: string[]; regex: RegExp }> = [
  { entity: 'The Rolling Stones', work: 'Paint It, Black', aliases: ['paint it black', 'paint it, black', 'paint it'], regex: /paint\s*it\s*,?\s*black/i },
  { entity: 'The Rolling Stones', work: 'Angie', aliases: ['angie'], regex: /\bangie\b/i },
  { entity: 'The Rolling Stones', work: '(I Can\'t Get No) Satisfaction', aliases: ['satisfaction', 'cant get no satisfaction'], regex: /satisfaction/i },
  { entity: 'Queen', work: 'Bohemian Rhapsody', aliases: ['bohemian rhapsody', 'bohemian rapsody'], regex: /bohemian\s*rhaps?ody/i },
  { entity: 'Queen', work: 'Love of My Life', aliases: ['love of my life'], regex: /love\s*of\s*my\s*life/i },
  { entity: 'Michael Jackson', work: 'Thriller', aliases: ['thriller'], regex: /\bthriller\b/i },
  { entity: 'Michael Jackson', work: 'Billie Jean', aliases: ['billie jean'], regex: /billie\s*jean/i },
  { entity: 'Nirvana', work: 'Smells Like Teen Spirit', aliases: ['smells like teen spirit', 'teen spirit'], regex: /smells\s*like\s*teen\s*spirit/i },
  { entity: 'Gustavo Cerati', work: 'Crimen', aliases: ['crimen'], regex: /\bcrimen\b/i },
  { entity: 'Gustavo Cerati', work: 'Puente', aliases: ['puente'], regex: /\bpuente\b/i },
  { entity: 'Soda Stereo', work: 'De Musica Ligera', aliases: ['de musica ligera', 'musica ligera'], regex: /de\s*musica\s*ligera/i },
  { entity: 'Fito Paez', work: 'Mariposa Tecknicolor', aliases: ['mariposa tecknicolor', 'mariposa tecnicolor'], regex: /mariposa\s*teck?nicolor/i },
  { entity: 'Fito Paez', work: 'El Amor Despues del Amor', aliases: ['el amor despues del amor'], regex: /el\s*amor\s*despues\s*del\s*amor/i },
  { entity: 'Charly Garcia', work: 'Demoliendo Hoteles', aliases: ['demoliendo hoteles'], regex: /demoliendo\s*hoteles/i },
  { entity: 'Charly Garcia', work: 'Nos Siguen Pegando Abajo', aliases: ['nos siguen pegando abajo', 'pecado mortal'], regex: /nos\s*siguen\s*pegando\s*abajo/i },
  { entity: 'Luis Alberto Spinetta', work: 'Seguir Viviendo Sin Tu Amor', aliases: ['seguir viviendo sin tu amor'], regex: /seguir\s*viviendo\s*sin\s*tu\s*amor/i },
  { entity: 'Luis Alberto Spinetta', work: 'Muchacha (Ojos de Papel)', aliases: ['muchacha ojos de papel', 'muchacha'], regex: /muchacha\s*\(?ojos\s*de\s*papel\)?/i },
  { entity: 'Mercedes Sosa', work: 'Gracias a la Vida', aliases: ['gracias a la vida'], regex: /gracias\s*a\s*la\s*vida/i },
  { entity: 'Astor Piazzolla', work: 'Adios Nonino', aliases: ['adios nonino'], regex: /adios\s*nonino/i },
  { entity: 'Astor Piazzolla', work: 'Libertango', aliases: ['libertango'], regex: /\blibertango\b/i },
  { entity: 'Divididos', work: 'Ala Delta', aliases: ['ala delta'], regex: /ala\s*delta/i },
  { entity: 'Los Redondos', work: 'Jijiji', aliases: ['jijiji', 'ji ji ji'], regex: /ji\s*ji\s*ji|jijiji/i },
  { entity: 'Calle 13', work: 'La Perla', aliases: ['la perla', 'la perla calle 13'], regex: /\bla\s*perla\b/i },
  { entity: 'Osvaldo Pugliese', work: 'La Yumba', aliases: ['la yumba', 'la yumba pugliese'], regex: /\bla\s*yumba\b/i }
];

const AUDIOVISUAL_MODIFIERS: RegExp[] = [
  /\b(official\s*(music\s*)?video|video\s*oficial|videoclip|mv)\b/gi,
  /\b(official\s*audio|audio\s*oficial)\b/gi,
  /\b(live(\s*in\s*[\w\s]+|\s*at\s*[\w\s]+|\s*\d{4})?|en\s*vivo|en\s*directo|recital|concierto)\b/gi,
  /\b(hd|4k|1080p|720p|high\s*definition|remaster(ed)?|remasterizado|4k\s*remaster)\b/gi,
  /\b(lyrics?|con\s*letra|letra|subtitulado|sub\s*español|karaoke)\b/gi,
  /\b(full\s*album|album\s*completo|disco\s*completo|completo|clip)\b/gi,
  /\b(version\s*extendida|extended|acoustic|acustico|acústico|unplugged)\b/gi,
  /\b(official|oficial|video|audio|cancion|canción|tema|track)\b/gi,
];

const STOP_WORDS = new Set(['de', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'e', 'en', 'a', 'del', 'al', 'o', 'u', 'por', 'con', 'para']);

function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());
}


export function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#160;/g, ' ')
    .replace(/&nbsp;/g, ' ');
}

export function normalizeSemanticInput(raw: string): string {
  let s = decodeHtmlEntities(raw);
  s = s.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
  s = s.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

export function unaccentAndNormalize(str: string): string {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export class ExactWorkSearchGate {
  /**
   * Detecta si la consulta del usuario apunta a una entidad, obra exacta o entidad + título residual
   */
  detectExactWork(query: string, intentData?: QueryUnderstanding): ExactWorkDetection {
    let rawTrimmed = normalizeSemanticInput(query || '');
    
    // -- TYPO RESOLUTION (Fuzzy Candidate Resolution) --
    // Solo aplica correcciones controladas sobre diccionarios existentes.
    const typoCorrection = resolveTypos(rawTrimmed);
    if (typoCorrection) {
      rawTrimmed = typoCorrection.normalizedQuery.trim();
    }

    const norm = unaccentAndNormalize(rawTrimmed);

    const resolvedEntityFirst = resolveEntityV2(rawTrimmed);
    const queryEntity = (resolvedEntityFirst && resolvedEntityFirst.confidence >= 0.85 && resolvedEntityFirst.name && resolvedEntityFirst.entityType !== 'venue') 
      ? resolvedEntityFirst.name 
      : undefined;

    // 1. Detección directa en Catálogo Estático Ontológico (Works Ontology)
    for (const kw of KNOWN_EXACT_WORKS) {
      if (kw.regex.test(norm)) {
        const venueResKw = resolveVenueFromEntityGraph(rawTrimmed);
        const constraints: SearchConstraint[] = [];
        if (venueResKw) {
          constraints.push({
            type: 'VENUE',
            value: venueResKw.matchedText,
            canonicalValue: venueResKw.canonicalVenue,
            confidence: venueResKw.confidence
          });
        }
        return {
          baseIntent: 'ENTITY_OBJECT',
          isExactWork: true,
          isExactEntityTitle: false,
          detectionType: 'EXACT_ENTITY_WORK',
          canonicalEntity: queryEntity ?? kw.entity,
          canonicalWork: kw.work,
          constraints: constraints.length > 0 ? constraints : undefined,
          venue: venueResKw?.canonicalVenue,
          workConfidence: 0.98,
          entityConfidence: 0.98,
          workTokens: kw.work.toLowerCase().replace(/[,;:.()\-]/g, ' ').split(/\s+/).filter(t => t.length > 2),
          corrections: typoCorrection ? typoCorrection.corrections : undefined
        };
      }
    }

    const catalogWork = lookupCanonicalWork(norm);
    if (catalogWork) {
      const venueResCat = resolveVenueFromEntityGraph(rawTrimmed);
      const constraints: SearchConstraint[] = [];
      if (venueResCat) {
        constraints.push({
          type: 'VENUE',
          value: venueResCat.matchedText,
          canonicalValue: venueResCat.canonicalVenue,
          confidence: venueResCat.confidence
        });
      }
      return {
        baseIntent: 'ENTITY_OBJECT',
        isExactWork: true,
        isExactEntityTitle: false,
        detectionType: 'EXACT_ENTITY_WORK',
        canonicalEntity: queryEntity ?? catalogWork.artist,
        canonicalWork: catalogWork.canonicalTitle,
        workId: catalogWork.workId,
        constraints: constraints.length > 0 ? constraints : undefined,
        venue: venueResCat?.canonicalVenue,
        workConfidence: 0.98,
        entityConfidence: 0.98,
        workTokens: catalogWork.canonicalTitle.toLowerCase().replace(/[,;:.()\-]/g, ' ').split(/\s+/).filter(t => t.length > 2),
        corrections: typoCorrection ? typoCorrection.corrections : undefined
      };
    }

    // 2. Resolver Dinámico Universal (EntityResolverV2 / Entity Graph)
    const resolved = resolveEntityV2(rawTrimmed);
    if (resolved && resolved.confidence >= 0.85 && resolved.name && resolved.entityType !== 'venue') {
      const entityName = resolved.name;
      const entityConfidence = resolved.confidence;

      // Extraer span de la entidad del query normalizado
      let residual = norm;

      // Buscar alias o regex de la entidad para removerla limpiamente de la query
      const entityDef = CANONICAL_ENTITIES_V2.find(e => e.id === resolved.id);
      if (entityDef) {
        residual = residual.replace(entityDef.regex, ' ');
        for (const alias of entityDef.aliases) {
          const aliasNorm = alias.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const escaped = aliasNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          residual = residual.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), ' ');
        }
      }
      const entityNorm = entityName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const escapedName = entityNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      residual = residual.replace(new RegExp(`\\b${escapedName}\\b`, 'gi'), ' ');

      // 3. Eliminar modificadores audiovisuales (live, official, video, audio, etc.)
      for (const mod of AUDIOVISUAL_MODIFIERS) {
        residual = residual.replace(mod, ' ');
      }

      // Eliminar conectores y puntuación inicial
      let cleanResidual = residual
        .replace(/[,;:.()\-–—"']/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const constraints: SearchConstraint[] = [];
      let detectedVenue: string | undefined;

      // 4. Extracción de Restricciones (Constraints)
      // PRIMARY: Entity Graph / Atlas place entities / aliases
      // SECONDARY: Static venue ontology fallback
      const venueRes = resolveVenueFromEntityGraph(cleanResidual);
      if (venueRes) {
        constraints.push({
          type: 'VENUE',
          value: venueRes.matchedText,
          canonicalValue: venueRes.canonicalVenue,
          confidence: venueRes.confidence
        });
        detectedVenue = venueRes.canonicalVenue;

        const escapedVenue = venueRes.matchedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        cleanResidual = cleanResidual
          .replace(new RegExp(`\\b(en\\s+el|en\\s+la|en|at|live\\s+at)?\\s*${escapedVenue}\\b`, 'gi'), ' ')
          .replace(new RegExp(`\\b${escapedVenue}\\b`, 'gi'), ' ')
          .replace(/[,;:.()\-–—"']/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      cleanResidual = cleanResidual
        .replace(/^(en\s+el|en\s+la|en|por|by|de|del|con|para|ft|feat|featuring)\s+/i, '')
        .replace(/\s+(en\s+el|en\s+la|en|por|by|de|del|con|para|ft|feat|featuring)$/i, '')
        .trim();

      // Topic / ContentType constraint
      const matchedTopic = TOPIC_PATTERNS.find(tp => tp.regex.test(cleanResidual));
      if (matchedTopic) {
        constraints.push({
          type: 'CONTENT_TYPE',
          value: cleanResidual,
          canonicalValue: matchedTopic.category,
          confidence: 0.95
        });
      }

      // Extraer tokens sustantivos del residual titular
      const substantiveTokens = cleanResidual
        .split(/\s+/)
        .filter(t => t.length >= 2 && !STOP_WORDS.has(t));

      // Caso A: Si no queda núcleo titular sustantivo tras extraer la entidad y constraints
      // (ej. "osvaldo pugliese en el colon", "ricky martin live", "cerati en obras", "charly en ferro")
      if (substantiveTokens.length === 0) {
        return {
          baseIntent: 'ENTITY',
          isExactWork: false,
          isExactEntityTitle: false,
          isEntityTopic: false,
          detectionType: 'EXACT_ENTITY',
          canonicalEntity: entityName,
          constraints: constraints.length > 0 ? constraints : undefined,
          venue: detectedVenue,
          entityConfidence,
          workConfidence: 0.0,
          workTokens: [],
          corrections: typoCorrection ? typoCorrection.corrections : undefined
        };
      }

      // Caso A.2: Si el residual corresponde a un TOPIC / FORMATO / TIPO DE CONTENIDO -> ENTITY_TOPIC
      // (ej. "papa francisco entrevista", "messi conferencia de prensa", "milei discurso", "shakira entrevista")
      if (matchedTopic) {
        return {
          baseIntent: 'ENTITY',
          isExactWork: false,
          isExactEntityTitle: false,
          isEntityTopic: true,
          detectionType: 'ENTITY_TOPIC',
          canonicalEntity: entityName,
          topic: cleanResidual,
          topicCategory: matchedTopic.category,
          constraints: constraints.length > 0 ? constraints : undefined,
          venue: detectedVenue,
          entityConfidence,
          workConfidence: 0.90,
          workTokens: substantiveTokens,
          corrections: typoCorrection ? typoCorrection.corrections : undefined
        };
      }

      // Caso B: Queda un título sustantivo -> Comprobar si existe en Works Ontology
      const potentialWork = lookupCanonicalWork(`${entityName} ${cleanResidual}`) || lookupCanonicalWork(cleanResidual);
      const isKnownWork = KNOWN_EXACT_WORKS.find(kw => 
        (kw.entity.toLowerCase().includes(entityNorm) || entityNorm.includes(kw.entity.toLowerCase())) &&
        (kw.regex.test(cleanResidual) || kw.aliases.some(a => cleanResidual.toLowerCase().includes(a)))
      );
      if ((potentialWork && (potentialWork.artist.toLowerCase().includes(entityNorm) || entityNorm.includes(potentialWork.artist.toLowerCase()))) || isKnownWork) {
        const canWork = potentialWork?.canonicalTitle || isKnownWork?.work || cleanResidual;
        const wId = potentialWork?.workId || isKnownWork?.work.toLowerCase().replace(/[,;:.()\-–—"']/g, '').replace(/\s+/g, '_');
        return {
          baseIntent: 'ENTITY_OBJECT',
          isExactWork: true,
          isExactEntityTitle: false,
          detectionType: 'EXACT_ENTITY_WORK',
          canonicalEntity: entityName,
          canonicalWork: canWork,
          workId: wId,
          constraints: constraints.length > 0 ? constraints : undefined,
          venue: detectedVenue,
          workConfidence: 0.95,
          entityConfidence,
          workTokens: substantiveTokens,
          corrections: typoCorrection ? typoCorrection.corrections : undefined
        };
      }

      
      // Caso C: Fallback residual
      // V2-W1: Bloquear fabricación residual si hay negative cues o si no hay comillas/cues explícitas.
      const negativeCues = ['plays classics', 'reacts to', 'interview with', 'watch', 'trailer', 'bonus performance', 'cover story', 'tour', 'future', 'legacy', 'controversy', 'talks about', 'live at', 'live in'];
      const hasNegativeCue = negativeCues.some(cue => cleanResidual.toLowerCase().includes(cue));
      
      const quotedSpanMatch = rawTrimmed.match(/['"“‘](.*?)['"”’]/);
      let workCand: WorkCandidate | undefined = undefined;
      
      if (!hasNegativeCue && quotedSpanMatch && quotedSpanMatch[1].length > 2) {
          workCand = {
              text: quotedSpanMatch[1],
              sourceSpan: quotedSpanMatch[0],
              evidenceType: 'QUOTED_SPAN',
              inferredWorkType: 'UNKNOWN',
              contextualRisk: 0.2,
              confidence: 0.85
          };
      }
      
      if (workCand) {
          return {
            baseIntent: 'ENTITY_OBJECT',
            isExactWork: false,
            isExactEntityTitle: true,
            detectionType: 'EXACT_ENTITY_TITLE',
            canonicalEntity: entityName,
            residualTitle: workCand.text,
            constraints: constraints.length > 0 ? constraints : undefined,
            venue: detectedVenue,
            entityConfidence,
            workConfidence: workCand.confidence,
            workTokens: substantiveTokens,
            corrections: typoCorrection ? typoCorrection.corrections : undefined
          };
      }
      
      return {
          baseIntent: 'ENTITY',
          isExactWork: false,
          isExactEntityTitle: false,
          detectionType: 'EXACT_ENTITY',
          canonicalEntity: entityName,
          constraints: constraints.length > 0 ? constraints : undefined,
          venue: detectedVenue,
          entityConfidence,
          workConfidence: 0.0,
          workTokens: [],
          corrections: typoCorrection ? typoCorrection.corrections : undefined
      };
    }

    // 4. Fallback: Query Genérica o Ambígua
    const venueOnlyRes = resolveVenueFromEntityGraph(rawTrimmed);
    const fallbackConstraints: SearchConstraint[] = [];
    if (venueOnlyRes) {
      fallbackConstraints.push({
        type: 'VENUE',
        value: venueOnlyRes.matchedText,
        canonicalValue: venueOnlyRes.canonicalVenue,
        confidence: venueOnlyRes.confidence
      });
    }

    // Heurística de Nombre Propio Explícito (cuando no se resolvió la entidad)
    let properNameCandidate = false;
    let rawProperName: string | undefined;

    // Remover action words y ver qué queda
    const actionWords = new Set(['entrevista', 'live', 'vivo', 'recital', 'concierto', 'documental', 'documentary', 'noticias', 'historia', 'biografia', 'curso', 'master', 'clase', 'tutorial']);
    let coreQuery = norm;
    for (const w of actionWords) {
      coreQuery = coreQuery.replace(new RegExp(`\\b${w}\\b`, 'gi'), ' ');
    }
    const coreTokens = coreQuery.split(/\s+/).filter(t => !STOP_WORDS.has(t) && t.length > 1);

    if (coreTokens.length >= 2 && coreTokens.length <= 4 && !venueOnlyRes) {
      properNameCandidate = true;
      rawProperName = coreTokens.join(' ');
    }

    return {
      baseIntent: 'GENERIC',
      isExactWork: false,
      isExactEntityTitle: false,
      detectionType: 'GENERIC',
      constraints: fallbackConstraints.length > 0 ? fallbackConstraints : undefined,
      venue: venueOnlyRes?.canonicalVenue,
      workConfidence: 0.0,
      workTokens: [],
      properNameCandidate,
      rawProperName,
      corrections: typoCorrection ? typoCorrection.corrections : undefined
    };
  }

  /**
   * Calcula el score de fidelidad del artista / intérprete (0 a 100)
   */
  calculateArtistFidelity(candidate: ContentItem, workDetection: ExactWorkDetection): number {
    if (!workDetection.canonicalEntity) return 100;

    const titleNorm = (candidate.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const channelNorm = (candidate.channelTitle || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const descNorm = (candidate.description || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const creatorNorm = ((candidate as any).creator || (candidate as any).creator_name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const entityNorm = workDetection.canonicalEntity.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const isCover = /cover|tribute|tributo|homenaje|versionado por|interpretado por|par\s+|por\s+/i.test(titleNorm);

    const entityDef = CANONICAL_ENTITIES_V2.find(e => 
      e.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === entityNorm ||
      e.id === entityNorm.replace(/\s+/g, '_') ||
      e.aliases.some(a => a.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === entityNorm)
    );

    // Casos especiales para entidades con palabras comunes o polisémicas
    let matchesArtist = false;
    if (entityNorm === 'calle 13') {
      matchesArtist = titleNorm.includes('calle 13') || channelNorm.includes('calle 13') || titleNorm.includes('residente');
    } else if (entityNorm === 'osvaldo pugliese') {
      if (titleNorm.includes('osvaldo pugliese') || channelNorm.includes('osvaldo pugliese') || descNorm.includes('osvaldo pugliese') || creatorNorm.includes('osvaldo pugliese')) {
        matchesArtist = true;
      } else if (/\bpugliese\b/i.test(titleNorm) || /\bpugliese\b/i.test(descNorm)) {
        const isItalianOrOther = /giuseppe pugliese|eccellenza pugliese|regione pugliese|cucina pugliese|focaccia pugliese|olio pugliese/i.test(titleNorm);
        if (!isItalianOrOther) {
          matchesArtist = true;
        }
      }
    } else {

      if (entityDef) {
        matchesArtist = entityDef.regex.test(titleNorm) ||
          entityDef.regex.test(channelNorm) ||
          entityDef.regex.test(descNorm) ||
          entityDef.regex.test(creatorNorm);
      }

      if (!matchesArtist) {
        const entityTokens = entityNorm.split(/\s+/).filter(t => t.length > 3);
        matchesArtist = entityTokens.length > 0 && entityTokens.every(t => titleNorm.includes(t) || channelNorm.includes(t));
      }
    }

    let isIdentity = false;
    let isRelated = false;
    let relationshipType = '';
    let relationshipScore = 0;

    if (matchesArtist) {
      isIdentity = true;
    } else {
      // Check for related entities (Members)
      const relatedEntities = CANONICAL_ENTITIES_V2.filter(e => {
         const relation = checkEntityRelation(e.id, entityDef?.id || '');
         return relation != null;
      });
      for (const relEnt of relatedEntities) {
         const relation = checkEntityRelation(relEnt.id, entityDef?.id || '');
         if (relation && relEnt.regex.test(titleNorm)) {
            isRelated = true;
            relationshipType = relation.type;
            relationshipScore = relation.strength * 100;
            break;
         }
      }
    }

    if (!candidate.semanticMatch) {
       candidate.semanticMatch = {
          isExactEntityWork: false, isExactEntityTitle: false, isOriginalArtist: false,
          artistFidelity: 0, workFidelity: 0
       };
    }

    candidate.semanticMatch.entityIdentityMatch = isIdentity;
    candidate.semanticMatch.relatedEntityMatch = isRelated;
    candidate.semanticMatch.relationshipType = relationshipType;
    candidate.semanticMatch.relationshipScore = relationshipScore;

    // Calculamos explícitamente si el nombre está en el título visible
    const entityName = entityDef?.name || workDetection.canonicalEntity || '';
    if (entityName) {
      const entityNorm = entityName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      let hasExplicitEntity = titleNorm.includes(entityNorm) || 
                                entityNorm.split(/\s+/).some(t => t.length > 3 && titleNorm.includes(t));
      
      if (!hasExplicitEntity && entityDef?.aliases) {
        for (const alias of entityDef.aliases) {
          const aliasNorm = alias.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (titleNorm.includes(aliasNorm) || aliasNorm.split(/\s+/).some(t => t.length > 3 && titleNorm.includes(t))) {
            hasExplicitEntity = true;
            break;
          }
        }
      }

      candidate.semanticMatch.explicitEntityTitleMatch = hasExplicitEntity;
    }

    if (isIdentity && !isCover) return 100;
    if (isRelated && !isCover) return relationshipScore; // Devuelve el score de relación (ej. 75)
    if (isIdentity && isCover) return 60; // Tributo con mención
    return 30; // Intérprete ajeno (Cover)
  }

  /**
   * Clasifica la rendición de la obra con taxonomía completa:
   * 1. ORIGINAL_STUDIO (+30)
   * 2. REMASTER (+25)
   * 3. ORIGINAL_LIVE (+20)
   * 4. TV_PERFORMANCE (+15)
   * 5. ARCHIVE / ACOUSTIC (+15)
   * 6. LYRIC (+10)
   * 7. COVER / TRIBUTE (0 boost, con penalización si la query exigía al artista original)
   */
  classifyRendition(candidate: ContentItem, workDetection: ExactWorkDetection): { category: RenditionCategory; priorityBoost: number } {
    const titleNorm = (candidate.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const channelNorm = (candidate.channelTitle || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const entityNorm = (workDetection.canonicalEntity || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const isOriginalArtist = entityNorm.split(/\s+/).some(t => t.length > 3 && (titleNorm.includes(t) || channelNorm.includes(t)));
    const isCover = /cover|tribute|tributo|homenaje|versionado por|interpretado por|orchestra|symphony|philharmonic|choir/i.test(titleNorm);
    const isTribute = /tribute|tributo|homenaje|tribute concert|symphonic/i.test(titleNorm);
    const isLyric = /lyric|lyrics|letra|subtitulado|karaoke/i.test(titleNorm);
    const isLive = /live|en vivo|en directo|recital|concierto|festival|tokyo dome|hyde park|glastonbury|stadium|ferro|obras|luna park/i.test(titleNorm);
    const isRemaster = /remaster|remastered|4k remaster|50th anniversary|2020 remaster/i.test(titleNorm);
    const isTv = /tv|television|ready steady go|ed sullivan|badia|atc|top of the pops/i.test(titleNorm);
    const isAcoustic = /acustico|acústico|acoustic|unplugged|solo piano|solo guitar/i.test(titleNorm);
    const isArchive = /ensayo|rehearsal|soundcheck|outtake|toma alternativa|inédito|inedito|early version/i.test(titleNorm);
    const isStudio = /official|video oficial|audio oficial|studio version|album version/i.test(titleNorm);

    if (isTribute) {
      return { category: 'TRIBUTE', priorityBoost: isOriginalArtist ? 10 : 0 };
    }
    if (isCover) {
      return { category: 'COVER', priorityBoost: 0 };
    }
    if (isArchive) {
      return { category: 'ARCHIVE', priorityBoost: isOriginalArtist ? 15 : 5 };
    }
    if (isAcoustic) {
      return { category: 'ACOUSTIC', priorityBoost: isOriginalArtist ? 20 : 10 };
    }
    if (isTv) {
      return { category: 'TV_PERFORMANCE', priorityBoost: isOriginalArtist ? 20 : 10 };
    }
    if (isRemaster && !isLive) {
      return { category: 'REMASTER', priorityBoost: isOriginalArtist ? 25 : 15 };
    }
    if (isLive) {
      return { category: 'ORIGINAL_LIVE', priorityBoost: isOriginalArtist ? 20 : 10 };
    }
    if (isLyric) {
      return { category: 'LYRIC', priorityBoost: isOriginalArtist ? 15 : 5 };
    }
    if (isOriginalArtist && isStudio) {
      return { category: 'ORIGINAL_STUDIO', priorityBoost: 30 };
    }
    if (isOriginalArtist) {
      return { category: 'ORIGINAL_STUDIO', priorityBoost: 25 };
    }

    return { category: 'OTHER_RENDITION', priorityBoost: 0 };
  }

  /**
   * Determina la evidencia de que un contenido es una obra primaria
   */
  detectPrimaryWorkEvidence(candidate: ContentItem, workDetection: ExactWorkDetection): import('./types').PrimaryWorkEvidence[] {
    const evidence: import('./types').PrimaryWorkEvidence[] = [];
    const titleNorm = (candidate.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const descNorm = (candidate.description || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const workClean = (workDetection.canonicalWork || workDetection.residualTitle || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[,;:.()\-]/g, ' ').replace(/\s+/g, ' ').trim();
    const titleClean = titleNorm.replace(/[,;:.()\-]/g, ' ').replace(/\s+/g, ' ').trim();
    const descClean = descNorm.replace(/[,;:.()\-]/g, ' ').replace(/\s+/g, ' ').trim();

    if (!workClean) return evidence;

    // 1. TITLE_EXACT
    if (titleClean === workClean || titleClean.startsWith(`${workClean} `) || titleClean.endsWith(` ${workClean}`) || titleClean === `${workDetection.canonicalEntity?.toLowerCase()} ${workClean}`.replace(/\s+/g, ' ')) {
      evidence.push({ type: 'TITLE_EXACT', confidence: 0.95 });
    } else if (titleClean.includes(workClean)) {
      evidence.push({ type: 'TITLE_EXACT', confidence: 0.85 });
    }

    // 2. STRUCTURED_METADATA
    if ((candidate as any).metadata_provenance === 'atlas_gap_repaired' || candidate.enrichment?.succeeded) {
      evidence.push({ type: 'STRUCTURED_METADATA', confidence: 0.90 });
    }

    // 3. DESCRIPTION_EXPLICIT
    if (descClean.includes(workClean)) {
      evidence.push({ type: 'DESCRIPTION_EXPLICIT', confidence: 0.70 });
    }
    
    // 4. INFERRED
    if (evidence.length === 0 && (candidate.relevanceScore || 0) > 40) {
      evidence.push({ type: 'INFERRED', confidence: 0.40 });
    }

    return evidence;
  }

  /**
   * Clasifica el rol semántico del contenido:
   * Renditions directas: PRIMARY_WORK, OFFICIAL_VIDEO, LIVE_PERFORMANCE, REMASTER, LYRIC
   * Interpretaciones ajenas: COVER, TRIBUTE
   * Usos no exactos: CONTEXTUAL_USE (trailers, videojuegos, ost, clips), COMMENTARY (análisis, podcasts), REACTION
   */
  classifyContentRole(candidate: ContentItem, workDetection: ExactWorkDetection): ContentRole {
    const titleNorm = (candidate.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    if (!candidate.semanticMatch) {
      candidate.semanticMatch = { isExactEntityWork: false, isExactEntityTitle: false, isOriginalArtist: false, artistFidelity: 0, workFidelity: 0 };
    }

    // Calcular evidencia de obra primaria
    const evidences = this.detectPrimaryWorkEvidence(candidate, workDetection);
    candidate.semanticMatch.primaryWorkEvidence = evidences;
    
    // Agregación simple de confianza (max)
    let maxConf = 0;
    evidences.forEach(e => { if (e.confidence > maxConf) maxConf = e.confidence; });
    
    // Bonificación si hay múltiples evidencias fuertes
    if (evidences.length > 1 && maxConf >= 0.70) {
      maxConf = Math.min(1.0, maxConf + 0.05 * (evidences.length - 1));
    }
    candidate.semanticMatch.primaryWorkConfidence = maxConf;

    // 1. Reacciones
    if (/\b(reaccion|reacción|reacting|reacts|first\s*time\s*hearing|first\s*reaction|vocal\s*coach\s*reacts)\b/i.test(titleNorm)) {
      return 'REACTION';
    }

    // 2. Album Container (álbumes completos, colecciones en CD/FLAC, discografías)
    if (/\b(album\b|álbum\b|cd\s*flac|full\s*album|disco\s*completo|complete\s*album)\b/i.test(titleNorm)) {
      return 'ALBUM_CONTAINER';
    }

    // 3. Noticias / Lanzamientos / Notas de prensa ("estrenan", "presentan", "noticia", etc.)
    if (/\b(estrenan|estrena|noticia|noticiero|breaking\s*news|lanzamiento|presentan|nota\s*de|informe|cronica|estreno)\b/i.test(titleNorm)) {
      return 'NEWS';
    }

    // 4. Documentales / Series / Episodios ("Pop que estás en los cielos - S01E12", etc.)
    if (/\b(documental|s\d+e\d+|temporada|episodio|capitulo|capítulo|serie\s*de|serie\s*tv|pop\s*que\s*estas\s*en\s*los\s*cielos)\b/i.test(titleNorm)) {
      return 'DOCUMENTARY';
    }

    // 5. Comentario / Análisis / Entrevistas
    if (/\b(analisis|análisis|detras\s*de|detrás\s*de|historia\s*de|secretos\s*de|entrevista|interview|making\s*of|como\s*se\s*hizo|cómo\s*se\s*hizo|review|explained|significado\s*de)\b/i.test(titleNorm)) {
      return 'COMMENTARY';
    }

    // 6. Uso Contextual (videojuegos, trailers, bandas sonoras, escenas)
    if (/\b(trailer|gameplay|soundtrack|ost\b|call\s*of\s*duty|black\s*ops|movie\s*clip|escena|scene|commercial|comercial|teaser|bso\b|opening\s*theme|ending\s*theme|film\s*clip)\b/i.test(titleNorm)) {
      return 'CONTEXTUAL_USE';
    }


    // 0. MULTI_WORK_PERFORMANCE / INTERVIEW_WITH_PERFORMANCE
    let isMultiWork = false;
    let isInterview = false;
    const recognizedWorksMatch = titleNorm.match(/,/g);
    const hasMultipleSongs = (recognizedWorksMatch && recognizedWorksMatch.length >= 2) || /\by\b/.test(titleNorm);
    const hasPresenta = /\b(presenta|escuchamos|entrevista|charla)\b/i.test(titleNorm);
    
    if (hasMultipleSongs && hasPresenta) {
       isInterview = true;
       candidate.semanticMatch.workSpecificity = 30;
       return 'INTERVIEW_WITH_PERFORMANCE';
    } else if (hasMultipleSongs || /\b(medley|enganche|enganchados)\b/i.test(titleNorm)) {
       isMultiWork = true;
       candidate.semanticMatch.workSpecificity = 50;
       return 'MULTI_WORK_PERFORMANCE';
    }

    candidate.semanticMatch.workSpecificity = 100;

    // 1. Uso Contextual Estricto
    if (/\b(sampleado en|sampled in|version original de|mencion en)\b/i.test(titleNorm)) {
      return 'CONTEXTUAL_USE';
    }

    // 8. Covers
    const isCoverTitle = /\b(cover|versionado\s*por|interpretado\s*por|par\s+|versao|versión\s*por|orchestra|symphony|philharmonic|choir)\b/i.test(titleNorm);
    const artistFidelity = this.calculateArtistFidelity(candidate, workDetection);
    if (isCoverTitle || artistFidelity < 70) {
      return 'COVER';
    }

    // 9. Remaster
    if (/\b(remaster|remastered|remasterizado|4k\s*remaster|50th\s*anniversary|hd\s*remaster)\b/i.test(titleNorm)) {
      return 'REMASTER';
    }

    // 10. En vivo / Live
    if (/\b(live|en\s*vivo|en\s*directo|recital|concierto|festival|wembley|estadio|luna\s*park|tokyo\s*dome|hyde\s*park)\b/i.test(titleNorm)) {
      return 'LIVE_PERFORMANCE';
    }

    // 11. TV Performance / Programas musicales
    if (/\b(tv\s*performance|en\s*la\s*tv|programa\s*tv|especial\s*tv|snl|top\s*of\s*the\s*pops|xite)\b/i.test(titleNorm)) {
      return 'TV_PERFORMANCE';
    }

    // 12. Lyrics
    if (/\b(lyric|lyrics|letra|subtitulado|sub\s*espanol|sub\s*español)\b/i.test(titleNorm)) {
      return 'LYRIC';
    }

    // 13. Video Oficial
    if (/\b(official\s*video|video\s*oficial|videoclip|music\s*video|mv)\b/i.test(titleNorm)) {
      return maxConf >= 0.80 ? 'OFFICIAL_VIDEO' : 'OTHER_RENDITION';
    }

    // 14. Obra Primaria / Estudio
    if (maxConf >= 0.80) {
      return 'PRIMARY_WORK';
    } else if (maxConf >= 0.50) {
      return 'CONTEXTUAL_USE'; // Mención débil en título
    }

    return 'COMMENTARY'; // Mención muy débil, probablemente no es la obra
  }

  /**
   * Determina el RequestedObjectType (SONG, ALBUM_CONTAINER, NEWS, DOCUMENTARY, COMMENTARY, OTHER)
   */
  detectObjectType(candidate: ContentItem, role: ContentRole): RequestedObjectType {
    if (role === 'ALBUM_CONTAINER') return 'ALBUM_CONTAINER';
    if (role === 'NEWS') return 'NEWS';
    if (role === 'DOCUMENTARY') return 'DOCUMENTARY';
    if (role === 'COMMENTARY') return 'COMMENTARY';
    if (
      role === 'PRIMARY_WORK' ||
      role === 'OFFICIAL_VIDEO' ||
      role === 'LIVE_PERFORMANCE' ||
      role === 'SOLO_LIVE_PERFORMANCE' ||
      role === 'TV_PERFORMANCE' ||
      role === 'REMASTER' ||
      role === 'LYRIC' ||
      role === 'MULTI_WORK_PERFORMANCE' ||
      role === 'INTERVIEW_WITH_PERFORMANCE'
    ) {
      return 'SONG';
    }
    return 'OTHER';
  }

  /**
   * Verifica si el activo es una interpretación directa de la canción solicitada
   */
  isDirectPerformance(candidate: ContentItem, role: ContentRole): boolean {
    return (
      role === 'PRIMARY_WORK' ||
      role === 'OFFICIAL_VIDEO' ||
      role === 'LIVE_PERFORMANCE' ||
      role === 'SOLO_LIVE_PERFORMANCE' ||
      role === 'TV_PERFORMANCE' ||
      role === 'REMASTER' ||
      role === 'LYRIC' ||
      role === 'MULTI_WORK_PERFORMANCE' ||
      role === 'INTERVIEW_WITH_PERFORMANCE'
    );
  }

  /**
   * Calcula el score de fidelidad al título residual (0 a 100) para búsquedas EXACT_ENTITY_TITLE
   */
  calculateTitleFidelity(candidate: ContentItem, detection: ExactWorkDetection): number {
    if (detection.detectionType !== 'EXACT_ENTITY_TITLE' || !detection.residualTitle) {
      return 100;
    }

    const role = candidate.contentRole || this.classifyContentRole(candidate, detection);
    candidate.contentRole = role;

    // CONTEXTUAL_USE, COMMENTARY, DOCUMENTARY, NEWS, ALBUM_CONTAINER y REACTION quedan estrictamente excluidos (<75)
    if (
      role === 'CONTEXTUAL_USE' ||
      role === 'COMMENTARY' ||
      role === 'DOCUMENTARY' ||
      role === 'NEWS' ||
      role === 'ALBUM_CONTAINER' ||
      role === 'REACTION'
    ) {
      return 40;
    }

    const titleNorm = (candidate.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const titleClean = titleNorm.replace(/[,;:.()\-]/g, ' ').replace(/\s+/g, ' ').trim();
    const residualNorm = detection.residualTitle.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const residualClean = residualNorm.replace(/[,;:.()\-]/g, ' ').replace(/\s+/g, ' ').trim();

    // 1. Coincidencia exacta del título residual en el título del candidato (ej. "a medio vivir")
    if (titleClean.includes(residualClean) || titleNorm.includes(residualNorm)) {
      let score = 90;
      if (/official|video oficial|audio oficial|en vivo|live|recital|concierto|remaster/i.test(titleNorm)) {
        score = 100;
      }
      return score;
    }

    // 2. Coincidencia por cobertura de tokens sustantivos
    if (detection.workTokens && detection.workTokens.length > 0) {
      const matchedTokens = detection.workTokens.filter(t => t.length > 2 && titleClean.includes(t));
      const ratio = matchedTokens.length / Math.max(1, detection.workTokens.length);
      if (ratio >= 0.8) {
        return Math.round(ratio * 80);
      }
      return Math.round(ratio * 40);
    }

    return 0;
  }

  /**
   * Calcula el score de fidelidad a la obra (0 a 100) para un candidato
   */
  calculateWorkFidelity(candidate: ContentItem, workDetection: ExactWorkDetection): number {
    if (!workDetection.isExactWork || !workDetection.canonicalWork) return 100;

    const role = candidate.contentRole || this.classifyContentRole(candidate, workDetection);
    candidate.contentRole = role;

    // CONTEXTUAL_USE, COMMENTARY, DOCUMENTARY, NEWS, ALBUM_CONTAINER y REACTION quedan estrictamente excluidos de ExactWork (<75)
    if (
      role === 'CONTEXTUAL_USE' ||
      role === 'COMMENTARY' ||
      role === 'DOCUMENTARY' ||
      role === 'NEWS' ||
      role === 'ALBUM_CONTAINER' ||
      role === 'REACTION'
    ) {
      return 40;
    }

    const titleNorm = (candidate.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const descNorm = (candidate.description || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const workNorm = workDetection.canonicalWork.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    let score = 0;

    // 1. Coincidencia del título de la obra (peso: 50)
    const workClean = workNorm.replace(/[,;:.()\-]/g, ' ').replace(/\s+/g, ' ').trim();
    const titleClean = titleNorm.replace(/[,;:.()\-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (titleClean.includes(workClean) || titleNorm.includes(workNorm)) {
      score += 50;
    } else {
      const matchedTokens = workDetection.workTokens.filter(t => t.length > 2 && titleClean.includes(t));
      const ratio = matchedTokens.length / Math.max(1, workDetection.workTokens.length);
      score += Math.round(ratio * 40);
    }

    // 2. Coincidencia de la entidad / artista (peso: 25)
    if (workDetection.canonicalEntity) {
      const entityTokens = workDetection.canonicalEntity.toLowerCase().split(/\s+/).filter(t => t.length > 3);
      const matchedEntity = entityTokens.filter(t => titleNorm.includes(t) || (candidate.channelTitle || '').toLowerCase().includes(t));
      if (matchedEntity.length > 0) {
        score += Math.round((matchedEntity.length / Math.max(1, entityTokens.length)) * 25);
      }
    }

    // 3. Reconocimiento de rendición válida (live, studio, remaster, official, tv, cover) (peso: 15)
    if (/live|en vivo|recital|concierto|official|remaster|remastered|tv|acustico|acoustic|cover|version|lyric/i.test(titleNorm)) {
      score += 15;
    }

    // 4. Coincidencia en descripción (peso: 10)
    if (descNorm.includes(workNorm)) {
      score += 10;
    }

    return Math.min(100, score);
  }

  /**
   * Calcula el score de fidelidad temática (0 a 100) para búsquedas ENTITY_TOPIC
   */
  calculateTopicFidelity(candidate: ContentItem, detection: ExactWorkDetection): number {
    if (detection.detectionType !== 'ENTITY_TOPIC' || !detection.topicCategory) {
      return 100;
    }

    const titleNorm = (candidate.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const descNorm = (candidate.description || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    switch (detection.topicCategory) {
      case 'ENTREVISTA': {
        const isInterviewTitle = /\b(entrevista|interviews?|reportajes?|conversacion(es)?|charla\s+con|dialoga\s+con|dialogo\s+con|habla\s+con|mano\s+a\s+mano)\b/i.test(titleNorm);
        const isInterviewDesc = /\b(entrevista|interviews?|reportajes?|conversacion(es)?|charla\s+con|dialoga\s+con|dialogo\s+con)\b/i.test(descNorm);

        // Descalificadores explícitos: si es pura misa, puro discurso, documental o funeral sin ser entrevista
        const isOtherFormat = /\b(misa\s+en|homilia\s+en|angelus|audiencia\s+general|discurso\s+en\s+el\s+congreso|historico\s+discurso|funeral|homenaje|ultimo\s+adios|recuerda\s+al)\b/i.test(titleNorm);
        if (isOtherFormat && !isInterviewTitle) {
          return 10;
        }

        if (isInterviewTitle) return 95;
        if (isInterviewDesc) return 75;
        return 20;
      }

      case 'DISCURSO': {
        if (/\b(discurso|palabras\s+de|alocucion|speech)\b/i.test(titleNorm)) return 95;
        if (/\b(discurso|palabras\s+de|alocucion|speech)\b/i.test(descNorm)) return 75;
        return 20;
      }

      case 'CONFERENCIA': {
        if (/\b(conferencia|rueda\s+de\s+prensa|press\s+conference)\b/i.test(titleNorm)) return 95;
        return 20;
      }

      case 'MISA': {
        if (/\b(misa|homilia|homilía|angelus|ángelus|audiencia)\b/i.test(titleNorm)) return 95;
        return 20;
      }

      default: {
        const topicNorm = (detection.topic || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (titleNorm.includes(topicNorm)) return 90;
        return 30;
      }
    }
  }

  /**
   * Calcula el score de fidelidad de recinto / venue (0 a 100).
   * Exige EVIDENCIA POSITIVA de que el contenido corresponde al recinto solicitado.
   * No inferir Teatro Colón simplemente porque el artista actuó allí en otra ocasión.
   */
  calculateVenueFidelity(candidate: ContentItem, detection: ExactWorkDetection): number {
    const venue = detection.venue || detection.constraints?.find(c => c.type === 'VENUE')?.canonicalValue;
    if (!venue) return 100;

    const titleNorm = (candidate.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const descNorm = (candidate.description || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Caso Especial Reforzado: Teatro Colón
    if (venue.toLowerCase().includes('colon')) {
      const isColonSpecificTitle = /\b(teatro\s+col[oó]n|en\s+el\s+col[oó]n|recital\s+.*col[oó]n|concierto\s+.*col[oó]n|en\s+vivo\s+.*col[oó]n)\b/i.test(titleNorm);
      const titleMentionsOtherPlace = /\b(santa\s+fe|rosario|c[oó]rdoba|mendoza|mar\s+del\s+plata|parakultural|canning|san\s+telmo|barcelona|paris|olympia|ferro|obras|luna\s+park)\b/i.test(titleNorm);
      const isHistoricalBioNote = /\b(posteriormente|a[nñ]os\s+despu[eé]s|m[aá]s\s+tarde|recordando|biograf[ií]a|semblanza|homenaje)\b/i.test(descNorm);

      if (isColonSpecificTitle && !titleMentionsOtherPlace) {
        return 95;
      }
      if ((descNorm.includes('teatro colon') || descNorm.includes('teatro colón')) && !titleMentionsOtherPlace && !isHistoricalBioNote) {
        const isDirectRecording = /\b(grabado\s+en\s+el\s+teatro\s+col[oó]n|concierto\s+en\s+el\s+teatro\s+col[oó]n|en\s+vivo\s+en\s+el\s+teatro\s+col[oó]n|recital\s+en\s+el\s+teatro\s+col[oó]n)\b/i.test(descNorm);
        if (isDirectRecording) {
          return 85;
        }
      }
      return 20; // Rechazado (< 75)
    }

    // Buscar en el Entity Graph de Venues para obtener regex y aliases precisos
    const venueEntity = CANONICAL_ENTITIES_V2.find(e => e.entityType === 'venue' && (
      e.name.toLowerCase() === venue.toLowerCase() ||
      e.id === venue.toLowerCase() ||
      e.aliases.some(a => a.toLowerCase() === venue.toLowerCase())
    ));

    let isTitleMatch = false;
    let isDescMatch = false;

    if (venueEntity) {
      isTitleMatch = venueEntity.regex.test(titleNorm);
      isDescMatch = venueEntity.regex.test(descNorm);
      if (!isTitleMatch && !isDescMatch) {
        for (const alias of venueEntity.aliases) {
          const aNorm = alias.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (titleNorm.includes(aNorm)) {
            isTitleMatch = true;
            break;
          }
          if (descNorm.includes(aNorm)) {
            isDescMatch = true;
            break;
          }
        }
      }
    } else {
      const venueClean = venue.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      isTitleMatch = titleNorm.includes(venueClean);
      isDescMatch = descNorm.includes(venueClean);
    }

    if (isTitleMatch) return 95;
    if (isDescMatch) {
      // Exigir contexto positivo de grabación/recital y que el título no declare otra locación
      const hasLiveContext = /en\s*vivo|concierto|recital|grabado\s*en|actuaci[oó]n\s*en|presentaci[oó]n\s*en/i.test(descNorm);
      const titleMentionsOtherPlace = /\ben\s+(santa\s+fe|rosario|cordoba|c[oó]rdoba|mendoza|mar\s+del\s+plata|madrid|barcelona|paris|londres|tokyo|miami|chile|uruguay)\b/i.test(titleNorm);
      if (hasLiveContext && !titleMentionsOtherPlace) {
        return 85;
      }
      return 20; // Mención biográfica o incidental sin corresponder a actuación en dicho recinto
    }

    // Sin evidencia positiva en metadata -> RECHAZAR (<75)
    return 15;
  }

  /**
   * Calcula el score de fidelidad consolidado para todas las restricciones activas
   */
  calculateConstraintFidelity(candidate: ContentItem, detection: ExactWorkDetection): number {
    let minScore = 100;
    if (detection.venue) {
      const vf = this.calculateVenueFidelity(candidate, detection);
      minScore = Math.min(minScore, vf);
    }
    if (detection.constraints && detection.constraints.length > 0) {
      for (const c of detection.constraints) {
        if (c.type === 'VENUE') {
          const vf = this.calculateVenueFidelity(candidate, detection);
          minScore = Math.min(minScore, vf);
        } else if (c.type === 'CONTENT_TYPE') {
          const tf = this.calculateTopicFidelity(candidate, detection);
          minScore = Math.min(minScore, tf);
        }
      }
    }
    return minScore;
  }

  /**
   * Filtra, clasifica rendiciones y asegura jerarquía y diversidad de versiones
   */
  filterAndDiversifyExactWorkCandidates(
    candidates: ContentItem[],
    workDetection: ExactWorkDetection,
    minFidelityThreshold = 75
  ): ContentItem[] {
    const isEntityWithTitle = workDetection.detectionType === 'EXACT_ENTITY_WORK' || workDetection.detectionType === 'EXACT_ENTITY_TITLE';
    const isEntityTopic = workDetection.detectionType === 'ENTITY_TOPIC';
    const hasConstraints = !!(workDetection.constraints && workDetection.constraints.length > 0) || !!workDetection.venue;
    const isEntitySemanticQuery = isEntityWithTitle || workDetection.isExactWork || isEntityTopic || hasConstraints || !!workDetection.canonicalEntity;
    if (!isEntitySemanticQuery) return candidates;

    // 1. Aplicar gate de fidelidad estricto
    const faithful: Array<ContentItem & { renditionBoost: number }> = [];

    for (const c of candidates) {
      const workFidelity = this.calculateWorkFidelity(c, workDetection);
      const titleFidelity = this.calculateTitleFidelity(c, workDetection);
      const topicFidelity = this.calculateTopicFidelity(c, workDetection);
      const venueFidelity = this.calculateVenueFidelity(c, workDetection);
      const constraintFidelity = this.calculateConstraintFidelity(c, workDetection);
      const artistFidelity = this.calculateArtistFidelity(c, workDetection);
      const role = c.contentRole || this.classifyContentRole(c, workDetection);

      c.workFidelityScore = workFidelity;
      c.titleFidelityScore = titleFidelity;
      c.topicFidelityScore = topicFidelity;
      c.venueFidelityScore = venueFidelity;
      c.constraintFidelityScore = constraintFidelity;
      c.artistFidelityScore = artistFidelity;
      c.contentRole = role;

      const objectType = this.detectObjectType(c, role);
      const directPerformance = this.isDirectPerformance(c, role);
      c.objectType = objectType;
      c.directPerformance = directPerformance;

      const passesRole = (
        role === 'PRIMARY_WORK' ||
        role === 'OFFICIAL_VIDEO' ||
        role === 'LIVE_PERFORMANCE' ||
        role === 'TV_PERFORMANCE' ||
        role === 'REMASTER' ||
        role === 'LYRIC'
      ) && objectType === 'SONG' && directPerformance;

      const isArtistOk = artistFidelity >= (workDetection.canonicalEntity ? 85 : 75);
      const isWorkOk = workFidelity >= minFidelityThreshold;
      const isTitleOk = titleFidelity >= minFidelityThreshold;
      const isTopicOk = isEntityTopic ? topicFidelity >= 75 : true;
      const isVenueOk = hasConstraints && (workDetection.venue || workDetection.constraints?.some(x => x.type === 'VENUE'))
        ? venueFidelity >= 75
        : true;
      const isConstraintOk = constraintFidelity >= 75 && isVenueOk;

      const isExactEntityWork = (
        (workDetection.detectionType === 'EXACT_ENTITY_WORK' || c.semanticMatch?.isExactEntityWork) &&
        passesRole &&
        isArtistOk &&
        isWorkOk &&
        isVenueOk
      );

      const isExactEntityTitle = (
        (workDetection.detectionType === 'EXACT_ENTITY_TITLE' || c.semanticMatch?.isExactEntityTitle) &&
        passesRole &&
        isArtistOk &&
        isTitleOk &&
        isVenueOk
      );

      const isMatchingEntityTopic = (
        isEntityTopic &&
        isArtistOk &&
        isTopicOk
      );

      const isMatchingVenueEntity = (
        workDetection.detectionType === 'EXACT_ENTITY' &&
        hasConstraints &&
        isArtistOk &&
        isVenueOk
      );

      const isMatchingEntityOnly = (
        workDetection.detectionType === 'EXACT_ENTITY' &&
        !hasConstraints &&
        isArtistOk
      );

      const isOriginalArtist = isExactEntityWork || isExactEntityTitle || isMatchingVenueEntity || isMatchingEntityOnly;
      c.isExactEntityWork = isExactEntityWork;
      c.isExactEntityTitle = isExactEntityTitle;
      c.isEntityTopic = isMatchingEntityTopic;
      c.isOriginalArtist = isOriginalArtist;
      c.isVenueMatch = isVenueOk && !!workDetection.venue;
      c.isConstraintMatch = isConstraintOk && hasConstraints && isArtistOk && (!workDetection.canonicalWork || isWorkOk);

      const recordingId = this.extractRecordingId(c);
      c.recordingId = recordingId;

      const { category, priorityBoost } = this.classifyRendition(c, workDetection);
      c.renditionCategory = category;

      // Populate typed semanticMatch contract
      c.semanticMatch = {
        ...c.semanticMatch,
        isExactEntityWork,
        isExactEntityTitle,
        isEntityTopic: isMatchingEntityTopic,
        isVenueMatch: c.isVenueMatch,
        isConstraintMatch: c.isConstraintMatch,
        isOriginalArtist,
        artistFidelity,
        workFidelity,
        titleFidelity,
        topicFidelity,
        venueFidelity,
        constraintFidelity,
        contentRole: role,
        renditionCategory: category,
        recordingId,
        objectType,
        directPerformance
      };

      // Penalización a covers si la query exigía al artista original
      let finalPriority = priorityBoost;
      if (workDetection.canonicalEntity && (category === 'COVER' || category === 'TRIBUTE' || !isOriginalArtist)) {
        finalPriority -= 25;
      }

      c.youScore = ((c.youScore || c.relevanceScore || 50) + finalPriority);

      let qualifies = false;
      if (workDetection.detectionType === 'EXACT_ENTITY_WORK') {
        qualifies = isExactEntityWork;
      } else if (workDetection.detectionType === 'EXACT_ENTITY_TITLE') {
        qualifies = isExactEntityTitle;
      } else if (workDetection.detectionType === 'ENTITY_TOPIC') {
        qualifies = isMatchingEntityTopic;
      } else if (workDetection.detectionType === 'EXACT_ENTITY' && hasConstraints) {
        qualifies = isMatchingVenueEntity;
      } else if (workDetection.detectionType === 'EXACT_ENTITY') {
        qualifies = isArtistOk;
      } else {
        qualifies = workFidelity >= minFidelityThreshold && isVenueOk;
      }

      if (qualifies) {
        faithful.push({
          ...c,
          renditionBoost: finalPriority
        });
      }
    }

    // 2. Ordenar por prioridad jerárquica (Originales primero, luego en vivo/remaster, luego covers)
    faithful.sort((a, b) => ((b.youScore || 0) - (a.youScore || 0)));

    // 3. Deduplicación inteligente: descartar copias físicas idénticas
    const seenPhysicalKeys = new Set<string>();
    const diversified: ContentItem[] = [];

    for (const c of faithful) {
      const physicalKey = `${c.provider || 'unknown'}_${c.id}_${Math.round((c.durationSeconds || 0) / 4)}`;
      if (!seenPhysicalKeys.has(physicalKey)) {
        seenPhysicalKeys.add(physicalKey);
        diversified.push(c);
      }
    }

    return diversified;
  }

  /**
   * Extrae el identificador de la grabación concreta (recordingId) para deduplicación semántica universal
   */
  extractRecordingId(candidate: ContentItem, detection?: ExactWorkDetection): string {
    if (candidate.recordingId) return candidate.recordingId;
    const titleNorm = (candidate.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const durBucket = Math.round((candidate.durationSeconds || 240) / 10);
    
    // Detección de concierto, festival o transmisión en vivo
    const liveYear = titleNorm.match(/\b(19\d\d|20\d\d)\b/);
    const location = titleNorm.match(/\b(tokyo|hyde\s*park|miami|madrid|buenos\s*aires|quilmes|velez|luna\s*park|monumental|olympia|glastonbury|woodstock|vi[nñ]a|grammy|wembley|montreal|estadio|colon)\b/);
    
    if (location || liveYear || /en\s*vivo|live|concierto|recital/i.test(titleNorm)) {
      const locKey = location ? location[1].replace(/\s+/g, '_') : 'concert';
      const yearKey = liveYear ? liveYear[1] : durBucket;
      return `rec_live_${locKey}_${yearKey}`;
    }
    
    if (/acustico|acoustic|unplugged/i.test(titleNorm)) {
      return `rec_unplugged_${durBucket}`;
    }
    
    return `rec_studio_${durBucket}`;
  }

  /**
   * Adapta un ResolvedSearchIntent proveniente del autocomplete o del context a un ExactWorkDetection interno.
   */
  fromResolvedIntent(intent: ResolvedSearchIntent): ExactWorkDetection {
    const isExactWork = intent.object?.type === 'WORK' || intent.type === 'EXACT_ENTITY_WORK';
    const isExactEntityTitle = intent.object?.type === 'TITLE' || intent.type === 'EXACT_ENTITY_TITLE';
    const isEntityTopic = intent.type === 'ENTITY_TOPIC' || intent.constraints?.some(c => c.type === 'CONTENT_TYPE');
    const venueConstraint = intent.constraints?.find(c => c.type === 'VENUE');
    const entityName = intent.entity?.name || intent.entityName;
    const targetTitle = intent.object?.canonicalValue || intent.canonicalTitle || intent.residualTitle || intent.topic || '';
    const tokens = targetTitle
      .toLowerCase()
      .replace(/[,;:.()\-–—"']/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1);

    const titleSlug = targetTitle.toLowerCase().replace(/[,;:.()\-–—"']/g, '').replace(/\s+/g, '_');

    let baseIntent: 'GENERIC' | 'ENTITY' | 'ENTITY_OBJECT' = intent.baseIntent || 'GENERIC';
    if (!intent.baseIntent) {
      if (isExactWork || isExactEntityTitle) {
        baseIntent = 'ENTITY_OBJECT';
      } else if (entityName) {
        baseIntent = 'ENTITY';
      }
    }

    let detectionType = intent.type || 'GENERIC';
    if (!intent.type) {
      if (isExactWork) detectionType = 'EXACT_ENTITY_WORK';
      else if (isExactEntityTitle) detectionType = 'EXACT_ENTITY_TITLE';
      else if (isEntityTopic) detectionType = 'ENTITY_TOPIC';
      else if (entityName) detectionType = 'EXACT_ENTITY';
    }

    return {
      baseIntent,
      isExactWork,
      isExactEntityTitle,
      isEntityTopic,
      detectionType,
      canonicalEntity: entityName,
      canonicalWork: isExactWork ? targetTitle : undefined,
      residualTitle: isExactEntityTitle ? (intent.residualTitle || targetTitle) : undefined,
      topic: isEntityTopic ? (intent.topic || targetTitle) : undefined,
      topicCategory: intent.topicCategory,
      constraints: intent.constraints,
      venue: venueConstraint?.canonicalValue,
      workConfidence: intent.confidence,
      entityConfidence: intent.confidence,
      workTokens: tokens,
      workId: isExactWork ? (intent.workId || intent.object?.id || titleSlug) : undefined,
      provisionalTitleKey: isExactEntityTitle ? (intent.provisionalTitleKey || titleSlug) : undefined,
      resolvedIntentSource: intent.source
    };
  }

  /**
   * Convierte un ExactWorkDetection a ResolvedSearchIntent estructurado.
   */
  toResolvedIntent(detection: ExactWorkDetection, source: 'AUTOCOMPLETE_SELECTION' | 'QUERY_RESOLVER' = 'QUERY_RESOLVER'): ResolvedSearchIntent {
    const isExactWork = detection.detectionType === 'EXACT_ENTITY_WORK' || detection.isExactWork;
    const isExactEntityTitle = detection.detectionType === 'EXACT_ENTITY_TITLE' || detection.isExactEntityTitle;
    const isEntityTopic = detection.detectionType === 'ENTITY_TOPIC' || detection.isEntityTopic;
    const titleSlug = (detection.canonicalWork || detection.residualTitle || detection.topic || '')
      .toLowerCase()
      .replace(/[,;:.()\-–—"']/g, '')
      .replace(/\s+/g, '_');

    let baseIntent: 'GENERIC' | 'ENTITY' | 'ENTITY_OBJECT' = detection.baseIntent || 'GENERIC';
    if (!detection.baseIntent) {
      if (isExactWork || isExactEntityTitle) {
        baseIntent = 'ENTITY_OBJECT';
      } else if (detection.canonicalEntity) {
        baseIntent = 'ENTITY';
      }
    }

    const object = (isExactWork || isExactEntityTitle) ? {
      type: isExactWork ? ('WORK' as const) : ('TITLE' as const),
      canonicalValue: (isExactWork ? detection.canonicalWork : detection.residualTitle) || '',
      id: detection.workId || titleSlug,
      confidence: detection.workConfidence || 0.85
    } : undefined;

    const entity = detection.canonicalEntity ? {
      id: detection.canonicalEntity.toLowerCase().replace(/[,;:.()\-–—"']/g, '').replace(/\s+/g, '_'),
      name: detection.canonicalEntity,
      confidence: detection.entityConfidence || 0.90
    } : undefined;

    return {
      baseIntent,
      entity,
      object,
      constraints: detection.constraints,
      // Backwards-compatibility
      type: detection.detectionType,
      entityId: entity?.id,
      entityName: entity?.name,
      workId: isExactWork ? (detection.workId || titleSlug) : undefined,
      canonicalTitle: isExactWork ? detection.canonicalWork : undefined,
      residualTitle: isExactEntityTitle ? detection.residualTitle : undefined,
      provisionalTitleKey: isExactEntityTitle ? (detection.provisionalTitleKey || titleSlug) : undefined,
      topic: isEntityTopic ? detection.topic : undefined,
      topicCategory: isEntityTopic ? detection.topicCategory : undefined,
      confidence: detection.workConfidence || detection.entityConfidence || 0.85,
      source: detection.resolvedIntentSource || source
    };
  }

  buildMandatoryGates(detection: ExactWorkDetection, resolvedIntent: ResolvedSearchIntent): MandatoryIntentGates {
    const gates: MandatoryIntentGates = {
      constraints: [],
      sourceIntentType: detection.detectionType
    };

    if (detection.canonicalEntity && (detection.entityConfidence || 0) >= 0.85) {
      gates.entity = {
        required: true,
        entityId: resolvedIntent.entity?.id,
        canonicalName: detection.canonicalEntity,
        minIdentityFidelity: 85,
        requireExplicitEntityVisibleMatch: true
      };
    }

    if (detection.detectionType === 'EXACT_ENTITY_WORK' && detection.canonicalWork) {
      gates.object = {
        required: true,
        objectId: resolvedIntent.object?.id,
        canonicalValue: detection.canonicalWork,
        objectType: 'WORK',
        minFidelity: 75
      };
    } else if (detection.detectionType === 'EXACT_ENTITY_TITLE' && detection.residualTitle) {
      gates.object = {
        required: true,
        objectId: resolvedIntent.object?.id,
        canonicalValue: detection.residualTitle,
        objectType: 'TITLE',
        minFidelity: 75
      };
    }

    if (detection.constraints && detection.constraints.length > 0) {
      gates.constraints = detection.constraints.map(c => ({
        type: c.type as any, // Cast to MandatoryConstraintType
        value: c.value,
        required: true,
        minFidelity: 75
      }));
    } else if (detection.venue) {
      gates.constraints.push({
        type: 'VENUE',
        value: detection.venue,
        required: true,
        minFidelity: 75
      });
    }

    if (detection.properNameCandidate && !detection.canonicalEntity && detection.rawProperName) {
      gates.explicitName = {
        required: true,
        normalizedPhrase: unaccentAndNormalize(detection.rawProperName),
        titleOnly: true
      };
    }

    return Object.freeze(gates) as MandatoryIntentGates;
  }

  evaluateMandatoryGates(candidate: ContentItem, gates: MandatoryIntentGates): GateResult {
    const scores: GateResult['scores'] = {};
    
    if (gates.entity?.required) {
      // artistFidelityScore evaluates entityIdentityMatch and gives 100 for identity, <100 for relation.
      // But let's strictly use entityIdentityMatch or ArtistFidelity for it.
      // In classifyRole we called calculateArtistFidelity which sets candidate.artistFidelityScore.
      // Wait, we need to ensure identity, so we must check if entityIdentityMatch is true or if artistFidelity >= minIdentityFidelity and it's an identity match.
      const identityScore = candidate.semanticMatch?.entityIdentityMatch ? (candidate.artistFidelityScore || 100) : 0;
      scores.entityIdentity = identityScore;

      if (identityScore < gates.entity.minIdentityFidelity) {
        return { passed: false, reason: 'wrongEntity', scores };
      }

      if (gates.entity.requireExplicitEntityVisibleMatch) {
        if (!candidate.semanticMatch?.explicitEntityTitleMatch && !candidate.semanticMatch?.isExactEntityWork) {
          scores.entityIdentity = 0; // Fail the gate
          return { passed: false, reason: 'wrongEntity', scores }; // Explicit entity title match strictly required
        }
      }
    }

    if (gates.object?.required) {
      let objectScore = 0;
      if (gates.object.objectType === 'WORK') {
        objectScore = candidate.semanticMatch?.workFidelity || candidate.workFidelityScore || 0;
      } else {
        objectScore = candidate.semanticMatch?.titleFidelity || candidate.titleFidelityScore || 0;
        if (objectScore < gates.object.minFidelity) {
          const wFid = candidate.semanticMatch?.workFidelity || candidate.workFidelityScore || 0;
          if (wFid >= gates.object.minFidelity && (candidate.semanticMatch?.isExactEntityWork || candidate.isExactEntityWork)) {
            objectScore = wFid;
          }
        }
      }
      scores.object = objectScore;

      if (objectScore < gates.object.minFidelity) {
        return { passed: false, reason: 'wrongObject', scores };
      }
    }

    if (gates.constraints && gates.constraints.length > 0) {
      scores.constraints = {};
      for (const c of gates.constraints) {
        let constraintScore = 0;
        if (c.type === 'VENUE') {
          constraintScore = candidate.venueFidelityScore || candidate.semanticMatch?.venueFidelity || 0;
        } else if (c.type === 'TOPIC') {
          constraintScore = candidate.topicFidelityScore || candidate.semanticMatch?.topicFidelity || 0;
        } else {
          // generic constraint score
          constraintScore = candidate.constraintFidelityScore || candidate.semanticMatch?.constraintFidelity || 0;
        }
        
        scores.constraints[c.type] = constraintScore;

        if (constraintScore < c.minFidelity) {
          return { passed: false, reason: 'constraintViolation', failedConstraint: c.type, scores };
        }
      }
    }

    if (gates.explicitName?.required) {
      const titleNorm = unaccentAndNormalize(candidate.title || '');
      if (!titleNorm.includes(gates.explicitName.normalizedPhrase)) {
        return { passed: false, reason: 'explicitNameMissing', scores };
      }
    }

    return { passed: true, scores };
  }

  getRequiredCoverage(gates: MandatoryIntentGates): number {
    switch (gates.sourceIntentType) {
      case 'EXACT_ENTITY_WORK': return 6;
      case 'ENTITY_TOPIC': return 6;
      case 'EXACT_ENTITY_TITLE': return 6;
      case 'EXACT_ENTITY': 
        if (gates.constraints && gates.constraints.length > 0) return 4;
        return 6;
      case 'GENERIC': return 6; // policy propia luego
      default: return 6;
    }
  }
}

export const exactWorkSearchGate = new ExactWorkSearchGate();
