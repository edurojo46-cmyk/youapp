/**
 * musicGraphTypes.ts — Taxonomía, Grafos de Entidades y Puntuaciones Editoriales por Bandas para Onda
 */

export type MusicDomainType = 'music';

export type MusicGenreType =
  | 'rock_argentino'
  | 'tango'
  | 'folklore'
  | 'jazz'
  | 'blues'
  | 'classical'
  | 'latam_fusion'
  | 'rock_pop_intl'
  | 'electronic'
  | 'hiphop'
  | 'world_music'
  | 'ambient_experimental'
  | 'heavy_metal_prog'
  | 'flamenco'
  | 'reggae_dub'
  | 'chanson_poetica';

export type MusicFormatType =
  | 'studio'
  | 'concert'
  | 'session'
  | 'acoustic_unplugged'
  | 'documentary'
  | 'interview_masterclass'
  | 'videoclip';

export type MusicEraType =
  | 'pre_1950'
  | '1950s'
  | '1960s'
  | '1970s'
  | '1980s'
  | '1990s'
  | '2000s'
  | '2010s'
  | '2020s';

// Roles Editoriales de Experiencia (Onda Experience Roles)
export type OndaExperienceRole =
  | 'hook'          // Canción o clip icónico de captura inmediata
  | 'context'       // Entrevista o masterclass que sitúa al artista en su contexto histórico
  | 'performance'   // Ejecución en vivo o sesión de estudio estándar
  | 'deep_dive'     // Documental o análisis exhaustivo de álbum / movimiento
  | 'bridge'        // Pieza instrumental o de transición suave
  | 'surprise'      // Toma inédita, bootleg, rareza o colaboración inesperada
  | 'breather'      // Acústico íntimo o ambient para descansar la atención
  | 'climax'        // Concierto multitudinario de alta energía o solo cumbre
  | 'closer';       // Cierre reflexivo o despedida épica

// Bandas Editoriales de Calidad Narrativa
export type NarrativeScoreTier = 'elite' | 'strong' | 'usable' | 'avoid';

export interface OndaNarrativeScores {
  openerScore: number;         // 0–100
  transitionScore: number;     // 0–100
  closerScore: number;         // 0–100
  energyScore: number;         // 0–100
  visualDemandScore: number;   // 0–100
  rarityScore: number;         // 0–100
  historicalScore: number;     // 0–100
}

export interface OndaNarrativeMetadata extends OndaNarrativeScores {
  energyLevel: 'low' | 'medium' | 'high' | 'dynamic';
  visualAttention: 'low' | 'medium' | 'high';
  historicalValue: 'standard' | 'high' | 'masterpiece';
  
  // Rol Editorial Primario para Onda
  experienceRole: OndaExperienceRole;

  // Bandas Narrativas (Tiers) para el Director de Onda
  openerTier: NarrativeScoreTier;       // elite (>=85), strong (>=75), usable (>=60), avoid (<60)
  transitionTier: NarrativeScoreTier;   // elite (>=85), strong (>=75), usable (>=60), avoid (<60)
  closerTier: NarrativeScoreTier;       // elite (>=85), strong (>=75), usable (>=60), avoid (<60)

  // Flags booleanos
  isGoodOpener: boolean;       // openerScore >= 75
  isGoodTransition: boolean;   // transitionScore >= 70
  isGoodCloser: boolean;       // closerScore >= 70
  isDeepCut: boolean;          // rarityScore >= 70
}

export interface MusicItemClassification {
  domain: MusicDomainType;
  genre: MusicGenreType;
  movement?: string;
  cohortOrCollection?: string;
  
  // Entidad Individual Estricta (No taxonomía)
  artistId?: string;
  artistName?: string;
  entityType?: 'solo_artist' | 'band' | 'composer' | 'orchestra' | 'performer';
  projectOrBand?: string;
  
  format: MusicFormatType;
  venueOrSeries?: string;
  era?: MusicEraType;
  country?: string;
  
  // Perfil Narrativo para el Director de Onda
  narrativeProfile?: OndaNarrativeMetadata;
}

export interface MusicArtistProfile {
  id: string;
  name: string;
  entityType: 'solo_artist' | 'band' | 'composer' | 'orchestra' | 'performer';
  country: string;
  era: string;
  genres: string[];
  bandsAndProjects: string[];
  influences: string[];
  relatedArtists: string[];
  movements: string[];
  canonicalSeeds: string[];
}

export interface MusicSubgenreCategory {
  id: string;
  name: string;
  area: string;
  targetCount: number;
  description: string;
  preferredProviders: string[];
  artists: MusicArtistProfile[];
  genericSeeds: string[];
}
