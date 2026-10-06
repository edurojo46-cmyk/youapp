/**
 * types.ts — Tipos Fundacionales del Atlas YouTube Reference Harvester
 */

export type HarvestSourceType =
  | 'mrss'
  | 'rss'
  | 'video_sitemap'
  | 'sitemap_index'
  | 'json_ld'
  | 'publisher_page';

export type HarvestTier = 'bronze' | 'silver' | 'gold';

export interface YouTubeReferenceOrigin {
  type: HarvestSourceType;
  sourceUrl: string;
  publisherId: string;
  publisherName: string;
  country: string;
  language: string;
  category: string;
}

export interface YouTubeHarvestReference {
  videoId: string;
  canonicalUrl: string;
  title?: string;
  description?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  publishedAt?: string;
  discoveredAt: string;
  origin: YouTubeReferenceOrigin;
  harvestTier: HarvestTier;
}

export interface PublisherHarvestSource {
  id: string;
  name: string;
  domain: string;
  country: string;
  language: string;
  category: string;
  feeds: { url: string; type: HarvestSourceType }[];
  enabled: boolean;
  priority: number;             // 1 (alta) a 5 (baja)
  requestsPerSecond: number;
}

export interface SourceHarvestTelemetry {
  sourceId: string;
  sourceName: string;
  rawReferencesScanned: number;
  youtubeRefsFound: number;
  alreadyInAtlas: number;
  netNewYouTube: number;
  errorsCount: number;
  latencyMs: number;
  yieldRate: number;            // netNewYouTube / youtubeRefsFound
  status: 'active' | 'throttled' | 'paused' | 'exhausted';
}

export interface HarvesterRunProgress {
  startTime: number;
  elapsedSeconds: number;
  initialAtlasSize: number;
  currentAtlasSize: number;
  netNewInserted: number;
  netNewPerSecond: number;
  referencesScanned: number;
  youtubeRefsFound: number;
  alreadyInAtlasCount: number;
  youtubeSearchCalls: number;    // Inviolable = 0 🔒
  youtubeRadarCalls: number;     // Inviolable = 0 🔒
  globalYieldRate: number;
  externalDiscoveryRate: number; // 100%
  sourceStats: Record<string, SourceHarvestTelemetry>;
}
