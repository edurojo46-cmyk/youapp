/**
 * typesV3.ts — Definiciones de Tipos para Atlas Residual Intelligence V3
 */

export type ResidualRootCause =
  | 'ranking_failure'             // Candidate in Atlas, ranked outside top-8
  | 'metadata_weakness'           // Candidate in Atlas, unsearchable/sparse title
  | 'broadcaster_deep_archive'    // Rare bootleg/audio tape needing deep linker
  | 'freshness_realtime'          // Live stream or recent breaking event
  | 'provider_unavailable'        // Geoblocked or proprietary rights
  | 'entity_missing'              // Unindexed indie artist
  | 'genuinely_unavailable';      // Lost media

export interface ResidualGapRecord {
  queryId: string;                // e.g. "GAP-0001" to "GAP-0184"
  query: string;
  category: 'easy' | 'medium' | 'difficult' | 'longtail';
  rootCause: ResidualRootCause;
  atlasCandidateCount: number;
  bestCandidateScore: number;     // 0.0 to 1.0
  metadataCompleteness: number;   // 0.0 to 1.0
  entityResolution: string;       // Resolved entity name or 'unresolved'
  workResolution: string;         // Resolved work/event or 'unresolved'
  providerStatus: 'ready' | 'geoblocked' | 'unindexed';
  recommendedModule: 'ResidualAdaptiveRanker' | 'OfflineMetadataEnricher' | 'HistoricalDeepLinker' | 'FreshnessEngine' | 'Excluded';
  expectedConversion: boolean;
}

export interface MultiSignalRankerInput {
  lexicalScore: number;
  semanticSimilarity: number;
  entityMatchScore: number;
  workMatchScore: number;
  exactIntentMatch: number;
  qualityScore: number;
  playabilityScore: number;
  freshnessScore: number;
  sourceConfidence: number;
  ambiguityPenalty: number;
}

export type ResolutionRoute =
  | 'ATLAS_FAST_PATH'
  | 'FREE_PROVIDER_FALLBACK'
  | 'DISCOVERY_EXTERNAL'
  | 'YOUTUBE_SEARCH_AIRBAG'
  | 'UNRESOLVED';

export type ProviderType =
  | 'youtube'
  | 'vimeo'
  | 'dailymotion'
  | 'peertube'
  | 'archive_org'
  | 'broadcaster_publisher';

export type DomainCategory =
  | 'music'
  | 'news'
  | 'sports'
  | 'archive'
  | 'entertainment'
  | 'longtail'
  | 'freshness';

export interface EnrichedMetadataRecord {
  contentId: string;
  rawTitle: string;
  canonicalTitle: string;
  entities: string[];
  works: string[];
  year?: string;
  program?: string;
  contentType: 'interview' | 'concert' | 'documentary' | 'music_video' | 'news_clip' | 'generic';
  semanticTags: string[];
  metadataConfidence: number;
  enrichmentVersion: string;          // e.g. "v3_shadow_1"
  enrichedAt: string;                  // ISO timestamp
}

export interface ShadowProductionSessionMetrics {
  sessionId: string;
  query: string;
  domainCategory: DomainCategory;
  resolutionRoute: ResolutionRoute;
  providerType?: ProviderType;
  resultsDeliveredCount: number;
  fastPathLatencyMs: number;
  resultClickedIndex?: number;         // 0 to 7 (or undefined if no click)
  playbackStarted: boolean;
  videoDurationSeconds: number;        // total duration in seconds
  watchTimeSeconds: number;            // watched time in seconds
  watchedRatio: number;                // watchTimeSeconds / Math.max(1, videoDurationSeconds)
  isImmediateReformulation: boolean;   // true if user re-queried within 15s
  satisfactionClass: 'satisfied' | 'neutral' | 'dissatisfied';
}

export interface DomainMetricsBreakdown {
  domain: DomainCategory;
  totalQueries: number;
  fastPathRate: number;
  satisfactionRate: number;
  successfulPlayAtTop5: number;
}

export type ComparisonOutcome = 'V3_WIN' | 'V2_WIN' | 'TIE' | 'UNKNOWN';

export interface ShadowLogEntry {
  queryId: string;
  timestamp: number;
  domain: DomainCategory;
  atlasVersion: string;
  candidateSetHash: string;
  v2Top5: string[];
  v3Top5: string[];
  v2Scores: number[];
  v3Scores: number[];
  fastPath: boolean;
  resolutionRoute: ResolutionRoute;
  clickPosition?: number;              // 0-indexed position clicked (or undefined)
  playStarted: boolean;
  watchTimeSeconds: number;
  durationSeconds: number;
  watchedRatio: number;
  reformulationWithin15s: boolean;
  zeroResults: boolean;
  playabilityFailure: boolean;
  youtubeSearchCalled: boolean;        // default false (Search.list = 0)
  latencyMs: number;
  comparisonOutcome: ComparisonOutcome;
}

export interface ShadowDailyReport {
  dayNumber: number;
  totalQueries: number;
  
  // V2 Control
  v2FastPath: number;
  v2SearchSatisfaction: number;
  v2SuccessfulPlayTop5: number;

  // V3 Shadow
  v3ProjectedFastPath: number;
  v3RankingWinRate: number;            // % of queries where V3 was superior
  v3RankingRegressionRate: number;     // % of queries where V3 was inferior
  tieRate: number;

  // Real Traffic Behavior
  zeroResultRate: number;
  reformulationRate: number;
  playabilityFailureRate: number;

  // Independence Breakdown
  independenceBreakdown: {
    atlas: number;
    freeProvider: number;
    discovery: number;
    ytSearch: number;
    unresolved: number;
  };

  // Operational Latency
  p50Ms: number;
  p95Ms: number;

  // Domain Breakdown
  domainBreakdown: DomainMetricsBreakdown[];

  // Gate Evaluation
  canaryDecision: 'GO_CANARY_10' | 'HOLD_SHADOW';
  canaryReadinessScore: number;
}



