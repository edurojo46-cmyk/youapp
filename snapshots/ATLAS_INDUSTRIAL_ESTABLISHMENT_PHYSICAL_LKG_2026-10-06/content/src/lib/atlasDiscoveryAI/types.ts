/**
 * types.ts — Definiciones de Tipos de Atlas Discovery AI V1
 */

export type DiscoveryChannel =
  | 'atlas'
  | 'bluesky_live'
  | 'bluesky_backfill'
  | 'nostr'
  | 'lemmy'
  | 'publisher_sitemap'
  | 'broadcaster_archive'
  | 'rss'
  | 'mrss'
  | 'vimeo'
  | 'dailymotion'
  | 'peertube'
  | 'archive';

export interface AtlasGap {
  type:
    | 'LOW_COVERAGE'
    | 'LOW_RELEVANCE'
    | 'MISSING_ENTITY'
    | 'MISSING_WORK'
    | 'MISSING_ROLE'
    | 'MISSING_ERA'
    | 'MISSING_RARE_CONTENT';
  score: number;
  detail: string;
}

export interface DiscoveryRequest {
  query: string;
  entities?: string[];
  works?: string[];
  atlasResultCount: number;
  qualityQualifiedCount: number;
  relevanceQualifiedCount: number;
  coverageScore: number;
  qualityScore: number;
  gaps: AtlasGap[];
}

export interface DiscoveryPlan {
  shouldDiscover: boolean;
  intent: string;
  targetEntities: string[];
  targetWorks: string[];
  preferredChannels: DiscoveryChannel[];
  targetConcepts: string[];
  rarityTarget?: 'normal' | 'high';
  maxSources: number;
  maxPagesPerSource: number;
  confidence: number;
  reason: string;
}

export interface DiscoveryMissionResult {
  missionId: string;
  query: string;
  plan: DiscoveryPlan;
  referencesScanned: number;
  uniqueCandidates: number;
  netNewPersisted: number;
  durationMs: number;
  predictedYield?: number;
  actualYield?: number;
  aiCostUsd?: number;
  coverageBefore?: number;
  coverageAfter?: number;
}
