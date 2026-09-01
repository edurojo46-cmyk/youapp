export type QueryFreshness = 'live' | 'news' | 'trending' | 'current' | 'evergreen';
export type IntentType = 'NEWS' | 'LIVE' | 'TUTORIAL' | 'DOCUMENTARY' | 'HISTORY' | 'ENTERTAINMENT' | 'MUSIC' | 'SPORTS' | 'UNKNOWN';

export interface SearchQuery {
  rawQuery: string;
  normalizedQuery: string;
  freshness: QueryFreshness;
  limit?: number;
  forceExternal?: boolean; // If user clicked "Search more on internet"
  context?: {
    source: 'tv_signal' | 'user' | 'unknown';
    parentTopic?: string;
    needsDocumentary?: boolean;
    entities?: Array<{
      canonical: string;
      aliases: string[];
    }>;
  };
}

export interface RankingBreakdown {
  semantic: number;
  title: number;
  topic: number;
  entityCentrality: number;
  intent: number;
  temporal: number;
  temporalReason?: string;
  quality: number;
  relevance: number;
  finalRank: number;
}

export interface EntityMatch {
  name: string;
  type: string;
  confidence: number;
}

export type ProviderUtilityContext = {
  intent?: string;
  topicCluster?: string;
  language?: string;
  freshness?: string;
  contentFormat?: string;
};

export interface ProviderUtilityRecord {
  learned_utility: number;
  sample_size: number;
  
  // V1 signals
  top20SampleSize?: number;
  top5SampleSize?: number;
  searchSuccessSampleSize?: number;
  eligibleYieldSampleSize?: number;
  latencySampleSize?: number;
  radarAvoidanceSampleSize?: number;
  reliabilitySampleSize?: number;
  
  top20Conversion?: number;
  top5Conversion?: number;
  searchSuccess?: number;
  eligibleYield?: number;
  latencyEfficiency?: number;
  radarAvoidance?: number;
  reliability?: number;

  // V2 signals (audience value)
  engagementSampleSize?: number;
  engagementRate?: number;
  completionSampleSize?: number;
  completionRate?: number;
  valueSampleSize?: number;
  valueRate?: number;
  
  updated_at?: string;
}

export interface ProviderUtilitySource {
  getUtility(
    provider: string,
    context: ProviderUtilityContext
  ): ProviderUtilityRecord | null;
}

export interface ContentItem {
  id: string;
  attributionId?: string;
  type: 'video' | 'channel' | 'playlist' | 'article';
  
  provider: 'youtube' | 'twitch' | 'tiktok' | 'instagram' | 'vimeo' | 'dailymotion' | 'itunes' | 'direct' | 'youapp' | 'unknown';
  providerId?: string;
  canonicalUrl?: string;
  
  title: string;
  description?: string;
  thumbnail: string;
  thumbnailCandidates?: string[];
  videoUrl: string;
  
  channelTitle: string;
  channelId: string;
  channelAvatar?: string;
  
  durationText?: string;
  durationSeconds?: number;
  
  viewsText?: string;
  viewCount?: number;
  publishedText?: string;
  publishedAt?: string;
  
  isLive: boolean;
  contentState?: 'vod' | 'live' | 'upcoming' | 'unknown';
  isVerified: boolean;
  
  subscribersText?: string;
  videoCountText?: string;
  handle?: string;
  badge?: string;
  
  playbackPolicy?: 'embed_allowed' | 'external_only' | 'unknown';
  
  topics?: string[];
  tags?: string[];
  
  qualityScore?: number;
  qualityConfidence?: number;
  sourceConfidence?: number;
  valueRate?: number;
  relevanceScore?: number;
  semanticScore?: number; // Similarity from gemini-embedding-2
  aiScore?: number; // Score from gemini-reranker
  affinityScore?: number;
  youScore?: number;
  
  rankingVersion?: string;
  qualityVersion?: string;
  
  rankingBreakdown?: RankingBreakdown;
  
  metadata?: {
    publishedAt: 'real' | 'derived' | 'missing';
    viewCount: 'real' | 'derived' | 'missing';
    duration: 'real' | 'derived' | 'missing';
  };
  metadataCompleteness?: number;
  
  source?: {
    provider: string;
    discoveryMethod: 'curated' | 'user-submitted' | 'youtube-api' | 'vimeo-api' | 'twitch-api' | 'import' | 'local-catalog' | 'video-mesh' | 'publisher' | 'web-discover';
    discoveredAt: string;
    lastVerifiedAt?: string;
  };
  discoverySource?: DiscoverySource;

  /**
   * retrievalSource: CÓMO se obtuvo este video (independiente del proveedor de contenido).
   * Ejemplo: un video de YouTube puede llegar vía Atlas (recuperación interna) o vía Radar (YouTube API).
   *
   *   contentProvider = 'youtube'  +  retrievalSource = 'atlas'    → ✅ Independiente (no gasta cuota)
   *   contentProvider = 'youtube'  +  retrievalSource = 'radar'    → ⚠  Usó YouTube search.list
   *   contentProvider = 'vimeo'    +  retrievalSource = 'vimeo-api' → ✅ Independiente
   */
  retrievalSource?:
    | 'atlas'           // youapp_index / Supabase local
    | 'radar'           // YouTube search.list (quota-cost)
    | 'vimeo-api'       // Vimeo API oficial
    | 'video-mesh'      // Archive.org + PeerTube + Twitch
    | 'publisher'       // RSS Watcher / Publisher feeds
    | 'web-discover'    // Web Discover (universidades, museos)
    | 'dailymotion-api' // Dailymotion API
    | 'cache'           // IndexedDB / candidate pool hit
    | 'local'           // localProvider (hardcoded seeds)
    | 'mock';           // mockAdapter (dev)
}

export type DiscoverySource = 
  | 'external-youtube' 
  | 'external-vimeo' 
  | 'creator-import' 
  | 'user-share' 
  | 'curator' 
  | 'feed' 
  | 'editorial' 
  | 'mock' 
  | 'unknown';

export interface CandidateRef {
  contentId: string;
  relevanceScore?: number;
  qualityScore?: number;
  youScore?: number;
}

export interface CandidatePool {
  normalizedQuery: string;
  candidates: CandidateRef[];
  queryVersion: number;
  qualityVersion: number;
  rankingVersion: number;
  createdAt: number;
  expiresAt: number;
}

export type SearchPhase = 'cache' | 'index' | 'external' | 'semantic' | 'ai-rerank' | 'final';

export interface AiOverview {
  text: string;
  generatedAt: number;
  sourceContentIds: string[];
  modelVersion: string;
}

export interface SearchResponse {
  results: ContentItem[];
  newsContext?: ContentItem[];
  overview?: AiOverview;
  rankingVersion?: number;
  normalizationVersion?: number;
  intentVersion?: number;
}

export interface SearchUpdate {
  requestId: string;
  phase: SearchPhase;
  response: SearchResponse;
  isFinal: boolean;
  generatedAt: number;
}

export interface NormalizedVideo {
  provider: 'youtube' | 'vimeo' | 'local';
  providerContentId: string;
  
  title: string;
  description: string;
  
  channelId?: string;
  channelTitle: string;
  
  publishedAt?: string;
  publishedAtPrecision: 'exact' | 'day' | 'month' | 'relative' | 'unknown';
  
  viewCount?: number;
  durationSeconds?: number;
  
  contentState: 'vod' | 'live' | 'upcoming' | 'unknown';
  
  canonicalUrl?: string;
  sourceVerified?: boolean;
  embeddable?: boolean;
  
  metadata: {
    publishedAt: 'real' | 'derived' | 'missing';
    viewCount: 'real' | 'derived' | 'missing';
    duration: 'real' | 'derived' | 'missing';
  };
  
  metadataCompleteness: number;
  metadataReadiness: number;
  
  enrichment?: {
    attempted: boolean;
    succeeded: boolean;
    provider?: 'youtube-api';
    fieldsAdded: string[];
  };
}
