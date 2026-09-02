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

import type { ContentItem } from './types';
import type { QueryUnderstanding } from './intentDetector';

export interface ExactWorkDetection {
  isExactWork: boolean;
  canonicalEntity?: string;
  canonicalWork?: string;
  workConfidence: number;
  workTokens: string[];
}

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
  { entity: 'Calle 13', work: 'La Perla', aliases: ['la perla', 'la perla calle 13'], regex: /\bla\s*perla\b/i }
];

export type ContentRole =
  | 'PRIMARY_WORK'
  | 'OFFICIAL_VIDEO'
  | 'LIVE_PERFORMANCE'
  | 'REMASTER'
  | 'LYRIC'
  | 'COVER'
  | 'TRIBUTE'
  | 'CONTEXTUAL_USE'
  | 'COMMENTARY'
  | 'REACTION';

export type RenditionCategory =
  | 'ORIGINAL_STUDIO'
  | 'REMASTER'
  | 'ORIGINAL_LIVE'
  | 'TV_PERFORMANCE'
  | 'ARCHIVE'
  | 'ACOUSTIC'
  | 'LYRIC'
  | 'COVER'
  | 'TRIBUTE'
  | 'OTHER_RENDITION';

export class ExactWorkSearchGate {
  /**
   * Detecta si la consulta del usuario apunta a una obra musical / artística específica
   */
  detectExactWork(query: string, intentData?: QueryUnderstanding): ExactWorkDetection {
    const norm = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    for (const kw of KNOWN_EXACT_WORKS) {
      if (kw.regex.test(norm)) {
        return {
          isExactWork: true,
          canonicalEntity: kw.entity,
          canonicalWork: kw.work,
          workConfidence: 0.98,
          workTokens: kw.work.toLowerCase().replace(/[,;:.()\-]/g, ' ').split(/\s+/).filter(t => t.length > 2)
        };
      }
    }

    // Heurística de fallback
    if (intentData?.concepts && intentData.concepts.length > 0 && intentData.entities && intentData.entities.length > 0) {
      return {
        isExactWork: true,
        canonicalEntity: intentData.entities[0],
        canonicalWork: intentData.concepts[0],
        workConfidence: 0.85,
        workTokens: intentData.concepts[0].toLowerCase().replace(/[,;:.()\-]/g, ' ').split(/\s+/).filter(t => t.length > 2)
      };
    }

    return {
      isExactWork: false,
      workConfidence: 0.0,
      workTokens: []
    };
  }

  /**
   * Calcula el score de fidelidad del artista / intérprete (0 a 100)
   */
  calculateArtistFidelity(candidate: ContentItem, workDetection: ExactWorkDetection): number {
    if (!workDetection.canonicalEntity) return 100;

    const titleNorm = (candidate.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const channelNorm = (candidate.channelTitle || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const entityNorm = workDetection.canonicalEntity.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const isCover = /cover|tribute|tributo|homenaje|versionado por|interpretado por|par\s+|por\s+/i.test(titleNorm);

    // Caso especial para entidades con palabras comunes en español (ej. "Calle 13")
    // Se exige la frase completa o alias formal (ej. "calle 13" o "residente"), NUNCA "calle" suelta.
    let matchesArtist = false;
    if (entityNorm === 'calle 13') {
      matchesArtist = titleNorm.includes('calle 13') || channelNorm.includes('calle 13') || titleNorm.includes('residente');
    } else {
      matchesArtist = titleNorm.includes(entityNorm) || channelNorm.includes(entityNorm);
      if (!matchesArtist) {
        const entityTokens = entityNorm.split(/\s+/).filter(t => t.length > 3);
        matchesArtist = entityTokens.length > 0 && entityTokens.every(t => titleNorm.includes(t) || channelNorm.includes(t));
      }
    }

    if (matchesArtist && !isCover) return 100;
    if (matchesArtist && isCover) return 60; // Tributo con mención
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
   * Clasifica el rol semántico del contenido:
   * Renditions directas: PRIMARY_WORK, OFFICIAL_VIDEO, LIVE_PERFORMANCE, REMASTER, LYRIC
   * Interpretaciones ajenas: COVER, TRIBUTE
   * Usos no exactos: CONTEXTUAL_USE (trailers, videojuegos, ost, clips), COMMENTARY (análisis, podcasts), REACTION
   */
  classifyContentRole(candidate: ContentItem, workDetection: ExactWorkDetection): ContentRole {
    const titleNorm = (candidate.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // 1. Reacciones
    if (/\b(reaccion|reacción|reacting|reacts|first\s*time\s*hearing|first\s*reaction|vocal\s*coach\s*reacts)\b/i.test(titleNorm)) {
      return 'REACTION';
    }

    // 2. Comentario / Análisis / Documentales
    if (/\b(analisis|análisis|detras\s*de|detrás\s*de|historia\s*de|secretos\s*de|documental|entrevista|interview|making\s*of|como\s*se\s*hizo|cómo\s*se\s*hizo|review|explained|significado\s*de)\b/i.test(titleNorm)) {
      return 'COMMENTARY';
    }

    // 3. Uso Contextual (videojuegos, trailers, bandas sonoras, escenas)
    // Audita e intercepta casos como "Call of Duty: Black Ops III (Paint It Black)"
    if (/\b(trailer|gameplay|soundtrack|ost\b|call\s*of\s*duty|black\s*ops|movie\s*clip|escena|scene|commercial|comercial|teaser|bso\b|opening\s*theme|ending\s*theme|film\s*clip)\b/i.test(titleNorm)) {
      return 'CONTEXTUAL_USE';
    }

    // 4. Tributos
    if (/\b(tribute|tributo|homenaje)\b/i.test(titleNorm)) {
      return 'TRIBUTE';
    }

    // 5. Covers
    const isCoverTitle = /\b(cover|versionado\s*por|interpretado\s*por|par\s+|versao|versión\s*por|orchestra|symphony|philharmonic|choir)\b/i.test(titleNorm);
    const artistFidelity = this.calculateArtistFidelity(candidate, workDetection);
    if (isCoverTitle || artistFidelity < 70) {
      return 'COVER';
    }

    // 6. Remaster
    if (/\b(remaster|remastered|remasterizado|4k\s*remaster|50th\s*anniversary|hd\s*remaster)\b/i.test(titleNorm)) {
      return 'REMASTER';
    }

    // 7. En vivo / Live
    if (/\b(live|en\s*vivo|en\s*directo|recital|concierto|festival|wembley|estadio|luna\s*park|tokyo\s*dome|hyde\s*park)\b/i.test(titleNorm)) {
      return 'LIVE_PERFORMANCE';
    }

    // 8. Lyrics
    if (/\b(lyric|lyrics|letra|subtitulado|sub\s*espanol|sub\s*español)\b/i.test(titleNorm)) {
      return 'LYRIC';
    }

    // 9. Video Oficial
    if (/\b(official\s*video|video\s*oficial|videoclip|music\s*video|mv)\b/i.test(titleNorm)) {
      return 'OFFICIAL_VIDEO';
    }

    // 10. Obra Primaria / Estudio
    return 'PRIMARY_WORK';
  }

  /**
   * Calcula el score de fidelidad a la obra (0 a 100) para un candidato
   */
  calculateWorkFidelity(candidate: ContentItem, workDetection: ExactWorkDetection): number {
    if (!workDetection.isExactWork || !workDetection.canonicalWork) return 100;

    const role = this.classifyContentRole(candidate, workDetection);
    (candidate as any).contentRole = role;

    // CONTEXTUAL_USE, COMMENTARY y REACTION quedan estrictamente excluidos de ExactWork (<75)
    if (role === 'CONTEXTUAL_USE' || role === 'COMMENTARY' || role === 'REACTION') {
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
   * Filtra, clasifica rendiciones y asegura jerarquía y diversidad de versiones
   */
  filterAndDiversifyExactWorkCandidates(
    candidates: ContentItem[],
    workDetection: ExactWorkDetection,
    minFidelityThreshold = 75
  ): ContentItem[] {
    if (!workDetection.isExactWork) return candidates;

    // 1. Aplicar gate de fidelidad estricto (WorkFidelity >= 75)
    const faithful: Array<ContentItem & { renditionBoost: number }> = [];

    for (const c of candidates) {
      const workFidelity = this.calculateWorkFidelity(c, workDetection);
      const artistFidelity = this.calculateArtistFidelity(c, workDetection);
      const role = (c as any).contentRole || this.classifyContentRole(c, workDetection);

      (c as any).workFidelityScore = workFidelity;
      (c as any).artistFidelityScore = artistFidelity;
      (c as any).contentRole = role;

      const isExactEntityWork = (
        role !== 'COVER' &&
        role !== 'TRIBUTE' &&
        role !== 'CONTEXTUAL_USE' &&
        role !== 'COMMENTARY' &&
        role !== 'REACTION' &&
        artistFidelity >= (workDetection.canonicalEntity ? 85 : 75)
      );
      (c as any).isExactEntityWork = isExactEntityWork;
      (c as any).isOriginalArtist = isExactEntityWork;

      const recordingId = this.extractRecordingId(c);
      (c as any).recordingId = recordingId;

      if (workFidelity >= minFidelityThreshold) {
        const { category, priorityBoost } = this.classifyRendition(c, workDetection);
        (c as any).renditionCategory = category;

        // Penalización a covers si la query exigía al artista original
        let finalPriority = priorityBoost;
        if (workDetection.canonicalEntity && (category === 'COVER' || category === 'TRIBUTE' || !isExactEntityWork)) {
          finalPriority -= 25; // Relegar covers detrás de cualquier grabación original
        }

        (c as any).youScore = ((c.youScore || c.relevanceScore || 50) + finalPriority);
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
      const physicalKey = `${c.provider || 'unknown'}_${c.id}_${Math.round((c.durationSeconds || c.duration || 0) / 4)}`;
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
    if ((candidate as any).recordingId) return (candidate as any).recordingId;
    const titleNorm = (candidate.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const durBucket = Math.round((candidate.durationSeconds || candidate.duration || 240) / 10);
    
    // Detección de concierto, festival o transmisión en vivo
    const liveYear = titleNorm.match(/\b(19\d\d|20\d\d)\b/);
    const location = titleNorm.match(/\b(tokyo|hyde\s*park|miami|madrid|buenos\s*aires|quilmes|velez|luna\s*park|monumental|olympia|glastonbury|woodstock|vi[nñ]a|grammy|wembley|montreal|estadio)\b/);
    
    if (location || liveYear || /en\s*vivo|live|concierto|recital/i.test(titleNorm)) {
      const locKey = location ? location[1].replace(/\s+/g, '_') : 'concert';
      const yearKey = liveYear ? liveYear[1] : durBucket;
      return `rec_live_${locKey}_${yearKey}`;
    }
    
    if (/acustico|acoustic|unplugged/i.test(titleNorm)) {
      return `rec_unplugged_${durBucket}`;
    }
    
    if (/director.*cut|extended|version\s*extendida/i.test(titleNorm)) {
      return `rec_extended_cut_${durBucket}`;
    }
    
    if (/remaster|flac|deluxe|anniversary|edicion\s*especial/i.test(titleNorm)) {
      return `rec_remaster_${durBucket}`;
    }
    
    if (/lyric|letra/i.test(titleNorm)) {
      return `rec_lyric_video`;
    }

    if (/oficial|official\s*video|video\s*clip/i.test(titleNorm)) {
      return `rec_official_clip`;
    }

    // Grabación de estudio canónica
    const sig = titleNorm.replace(/[^a-z0-9]/g, '').slice(0, 10);
    return `rec_studio_${durBucket}_${sig}`;
  }
}

export const exactWorkSearchGate = new ExactWorkSearchGate();


