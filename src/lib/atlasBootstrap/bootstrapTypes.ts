/**
 * bootstrapTypes.ts — Tipos fundamentales para ATLAS 100K BOOTSTRAP V2
 */

export type BootstrapProvider = 'vimeo' | 'dailymotion' | 'archive' | 'peertube' | 'publisher' | 'youtube_seed';

export type ContentState = 'discovered' | 'enriched' | 'quality_ready';

export type BootstrapTerminationReason = 'target_reached' | 'safety_cap' | 'source_exhausted' | 'manual_stop';

export interface BootstrapProvenance {
  bootstrapRun: string;           // ej: "atlas100k_wave_02b"
  discoveryOrigin: string;        // ej: "vimeo_api", "archive_org", "dailymotion_api"
  sourceSeed: string;             // ej: "filosofia_latam", "historia_argentina"
  discoveredAt: string;           // ISO timestamp
  canonicalId: string;            // ID único del proveedor
}

export interface RawDiscoveredItem {
  provider: BootstrapProvider;
  providerContentId: string;
  title: string;
  description?: string;
  creatorId?: string;
  creatorName?: string;
  canonicalUrl: string;
  embedUrl: string;
  thumbnailUrl?: string;
  durationSeconds: number;
  publishedAt?: string | null;
  language: string;
  topicId: string;
  subtopicId?: string;
  provenance: BootstrapProvenance;
  embeddable: boolean;
}

export interface AtlasEnrichedItem extends RawDiscoveredItem {
  contentState: ContentState;
  metadataCompleteness: number;   // 0 - 100
  qualityScore: number;           // 0 - 100
  isQualityScorePass: boolean;    // Q >= 60
  isEmbeddablePass: boolean;      // embeddable === true
  isTechnicallyUsable: boolean;   // Duración > 0, ID válido, URL válida
  isQualityReady: boolean;        // Intersección estricta: Q >= 60 && embeddable && isTechnicallyUsable
  hasCriticalMetadata: boolean;   // provider, id, title, canonicalUrl, source, contentState
  isMusicDomain?: boolean;
  musicConfidence?: number;
  musicArtistId?: string;
  musicGenre?: string;
  musicFormat?: string;
  enrichedAt: string;
}

export interface BootstrapTopic {
  id: string;
  topic: string;
  subtopic: string;
  name: string;
  category: string;
  desiredInventory: number;
  currentInventory?: number;
  deficit?: number;
  languages: string[];
  regions?: string[];
  preferredProviders: BootstrapProvider[];
  seeds: string[];
}

export interface BootstrapTiming {
  plannerMs: number;
  vimeoMs: number;
  dailymotionMs: number;
  archiveMs: number;
  peertubeMs: number;
  normalizationMs: number;
  dedupMs: number;
  persistenceMs: number;
  wallClockMs: number;
  providerCumulativeMs: number;
}

export interface MusicFunnelTelemetry {
  musicRequested: number;
  musicRawDiscovered: number;
  musicCanonicalValid: number;
  musicAfterDedupe: number;
  musicHighConfidence: number;
  musicPersisted: number;
  generalRequested: number;
  generalPersisted: number;
}

export interface BootstrapWaveProgress {
  waveNumber: number;
  waveSubId?: string;             // ej: "2B"
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'paused' | 'completed' | 'failed';
  terminationReason?: BootstrapTerminationReason;
  isDryRun: boolean;
  targetAtlasTotalSize: number;
  currentAtlasTotalSize: number;
  maxNewItemsAllowed: number;
  rawDiscovered: number;
  canonicalValid: number;
  duplicatesIntercepted: number;
  uniqueCandidates: number;
  
  // Desglose de Quality Ready
  qualityScorePassCount: number;
  embeddablePassCount: number;
  technicallyUsableCount: number;
  qualityReadyCount: number;       // Intersección estricta

  insertedCount: number;
  avgMetadataCompleteness: number;
  criticalMetadataRate: number;    // % con campos críticos
  embeddableRate: number;
  rawThroughputPerMin: number;
  netGrowthThroughputPerMin: number;

  musicFunnel: MusicFunnelTelemetry;
  providerStats: Record<string, { discovered: number; valid: number; inserted: number }>;
  timing: BootstrapTiming;
  youtubeRadarCalls: 0;            // Inviolable: siempre 0
}
