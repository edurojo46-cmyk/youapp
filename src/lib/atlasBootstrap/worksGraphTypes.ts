/**
 * worksGraphTypes.ts — Tipos y Estructuras del Grafo de Obras Canónicas (Works Graph V1.1)
 *
 * Ontología 3D:
 * 1. Rendition Type: studio, live, acoustic, rehearsal, demo, outtake, cover, remaster
 * 2. Content Role: performance, documentary, analysis, interview, historical_context
 * 3. Source Context: archive, broadcast, radio_session, festival, television, official_release
 */

export type CanonicalWorkType =
  | 'song'
  | 'symphony'
  | 'concerto'
  | 'sonata'
  | 'suite'
  | 'album'
  | 'opera'
  | 'improvisation_piece';

export type RenditionType =
  | 'studio'
  | 'live'
  | 'acoustic'
  | 'rehearsal'
  | 'demo'
  | 'outtake'
  | 'cover'
  | 'remaster';

export type ContentRole =
  | 'performance'
  | 'documentary'
  | 'analysis'
  | 'interview'
  | 'historical_context';

export type SourceContext =
  | 'archive'
  | 'broadcast'
  | 'radio_session'
  | 'festival'
  | 'television'
  | 'official_release';

export interface CanonicalWork {
  id: string;                          // ej: "queen:bohemian_rhapsody", "spinetta:muchacha_ojos_de_papel"
  canonicalTitle: string;
  normalizedTitle: string;
  workType: CanonicalWorkType;
  primaryEntityId: string;
  primaryEntityName: string;
  aliases: string[];
  regex?: RegExp;
  releaseYear?: number;
  movementOrStyle?: string;
}

export interface AssetWorkRelation {
  assetId: string;
  workId: string;
  canonicalTitle: string;
  primaryEntityId: string;
  
  // 3D Taxonomy
  renditionType: RenditionType;
  contentRole: ContentRole;
  sourceContext: SourceContext;

  confidence: number;
  evidence: string[];
}

export interface UnlinkedCategoryReport {
  linkableExplicit: number;
  linkableInferible: number;
  workKnownPerformerAmbiguous: number;
  traditionalAnonymous: number;
  compilationGeneric: number;
  titleWithoutArtist: number;
  insufficientMetadata: number;
  unresolvable: number;
}
