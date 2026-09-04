export type QueryFreshness = 'live' | 'news' | 'trending' | 'current' | 'evergreen';
export type IntentType = 'NEWS' | 'LIVE' | 'TUTORIAL' | 'DOCUMENTARY' | 'HISTORY' | 'ENTERTAINMENT' | 'MUSIC' | 'SPORTS' | 'UNKNOWN';

export type SearchConstraintType = 
  | 'VENUE'
  | 'CONTENT_TYPE'
  | 'LOCATION'
  | 'DATE'
  | 'LANGUAGE'
  | 'EVENT';

export interface SearchConstraint {
  type: SearchConstraintType;
  value: string;
  canonicalValue: string;
  confidence: number;
}

export type MandatoryConstraintType =
  | 'VENUE'
  | 'CONTENT_TYPE'
  | 'GENRE'
  | 'PERFORMANCE_MODE'
  | 'DATE'
  | 'TOPIC';

export interface MandatoryConstraint {
  type: MandatoryConstraintType;
  value: string;
  required: true;
  minFidelity: number;
}

export interface MandatoryIntentGates {
  entity?: {
    required: true;
    entityId?: string;
    canonicalName: string;
    minIdentityFidelity: number;
    requireExplicitEntityVisibleMatch?: boolean;
  };
  object?: {
    required: true;
    objectId?: string;
    canonicalValue: string;
    objectType: 'WORK' | 'TITLE';
    minFidelity: number;
  };
  constraints: MandatoryConstraint[];
  explicitName?: {
    required: true;
    normalizedPhrase: string;
    titleOnly: true;
  };
  sourceIntentType: string; // fallback to string if IntentType is not exactly mapped, but I'll use string here for simplicity since baseIntent works.
}

export interface GateResult {
  passed: boolean;
  reason?: 'wrongEntity' | 'wrongObject' | 'constraintViolation' | 'explicitNameMissing';
  failedConstraint?: MandatoryConstraintType;
  scores?: {
    entityIdentity?: number;
    object?: number;
    constraints?: Partial<Record<MandatoryConstraintType, number>>;
  };
}

export interface IntentEntity {
  id?: string;
  name: string;
  confidence: number;
}

export interface IntentObject {
  type: 'WORK' | 'TITLE';
  canonicalValue: string;
  id?: string;
  confidence: number;
}

export interface ResolvedSearchIntent {
  baseIntent: 'GENERIC' | 'ENTITY' | 'ENTITY_OBJECT';
  entity?: IntentEntity;
  object?: IntentObject;
  constraints?: SearchConstraint[];
  confidence: number;
  source: 'AUTOCOMPLETE_SELECTION' | 'QUERY_RESOLVER';

  // Backwards-compatible mappings for legacy modules
  type?: 'GENERIC' | 'EXACT_ENTITY' | 'EXACT_ENTITY_TITLE' | 'EXACT_ENTITY_WORK' | 'ENTITY_TOPIC';
  entityId?: string;
  entityName?: string;
  workId?: string;
  canonicalTitle?: string;
  residualTitle?: string;
  provisionalTitleKey?: string;
  topic?: string;
  topicCategory?: 'ENTREVISTA' | 'DISCURSO' | 'CONFERENCIA' | 'MISA' | 'DOCUMENTAL' | 'DEBATE' | 'OTHER';
}

export interface SearchQuery {
  rawQuery: string;
  normalizedQuery: string;
  retrievalQuery?: string;
  freshness: QueryFreshness;
  limit?: number;
  forceExternal?: boolean; // If user clicked "Search more on internet"
  resolvedIntent?: ResolvedSearchIntent;
  context?: {
    source: 'tv_signal' | 'user' | 'unknown';
    parentTopic?: string;
    needsDocumentary?: boolean;
    resolvedIntent?: ResolvedSearchIntent;
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
  providerContentId?: string;
  category?: string;
  language?: string;
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

  // ── Typed Semantic Match Contract (Zero any) ──────────────────────────
  semanticMatch?: SemanticMatch;
  isExactEntityWork?: boolean;
  isExactEntityTitle?: boolean;
  isOriginalArtist?: boolean;
  artistFidelityScore?: number;
  workFidelityScore?: number;
  titleFidelityScore?: number;
  contentRole?: ContentRole;
  renditionCategory?: RenditionCategory;
  recordingId?: string;
  objectType?: RequestedObjectType;
  directPerformance?: boolean;
  isEntityTopic?: boolean;
  topicFidelityScore?: number;
  venueFidelityScore?: number;
  constraintFidelityScore?: number;
  isVenueMatch?: boolean;
  isConstraintMatch?: boolean;

  // ── Media Quality Contract ──────────────────────────────────────────────
  mediaMetrics?: MediaQualityMetrics;
  mediaQualityScore?: number;
  playableState?: PlayableState;
}

export type PlayableState = 'STREAM' | 'DERIVATIVE_ONLY' | 'BROKEN' | 'UNKNOWN';

export interface MediaQualityMetrics {
  resolutionHeight?: number; // e.g. 360, 480, 720, 1080
  bitrateKbps?: number;
  audioQuality?: 'LOW' | 'NORMAL' | 'HIGH';
  playbackAvailability?: PlayableState;
  historicalValue?: 'HIGH' | 'NORMAL';
}

export type RequestedObjectType =
  | 'SONG'
  | 'ALBUM_CONTAINER'
  | 'NEWS'
  | 'DOCUMENTARY'
  | 'COMMENTARY'
  | 'OTHER';

export type ContentRole =
  | 'PRIMARY_WORK'
  | 'OFFICIAL_VIDEO'
  | 'LIVE_PERFORMANCE'
  | 'SOLO_LIVE_PERFORMANCE'
  | 'MULTI_WORK_PERFORMANCE'
  | 'INTERVIEW_WITH_PERFORMANCE'
  | 'MEDLEY'
  | 'TV_PERFORMANCE'
  | 'REMASTER'
  | 'LYRIC'
  | 'COVER'
  | 'TRIBUTE'
  | 'CONTEXTUAL_USE'
  | 'COMMENTARY'
  | 'DOCUMENTARY'
  | 'NEWS'
  | 'ALBUM_CONTAINER'
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

export type PrimaryWorkEvidenceType = 'TITLE_EXACT' | 'STRUCTURED_METADATA' | 'DESCRIPTION_EXPLICIT' | 'CHAPTER_MATCH' | 'TRANSCRIPT_MATCH' | 'INFERRED';

export interface PrimaryWorkEvidence {
  type: PrimaryWorkEvidenceType;
  confidence: number;
}

export interface RelationshipExpansionPolicy {
  maxHops: number;
  minRelationshipStrength: number;
  activateOnlyOnGap: boolean;
  maxExpandedResults: number;
  preserveExactResultsFirst: boolean;
}

export interface SemanticMatch {
  isExactEntityWork: boolean;
  isExactEntityTitle: boolean;
  isOriginalArtist: boolean;
  
  // Identity vs Relationship
  artistFidelity: number;
  entityIdentityMatch?: boolean;
  explicitEntityTitleMatch?: boolean;
  relatedEntityMatch?: boolean;
  relationshipType?: string;
  relationshipScore?: number;
  
  workFidelity: number;
  titleFidelity?: number;
  workSpecificity?: number;
  
  primaryWorkEvidence?: PrimaryWorkEvidence[];
  primaryWorkConfidence?: number;
  
  contentRole?: ContentRole;
  renditionCategory?: RenditionCategory;
  recordingId?: string;
  objectType?: RequestedObjectType;
  directPerformance?: boolean;
  isEntityTopic?: boolean;
  topicFidelity?: number;
  venueFidelity?: number;
  constraintFidelity?: number;
  isVenueMatch?: boolean;
  isConstraintMatch?: boolean;
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
  relatedResults?: ContentItem[];
  
  coverage?: {
    exactQualified: number;
    playableExact: number;
    gapDetected: boolean;
    gapType?: string;
  };
  
  expansion?: {
    activated: boolean;
    reason?: string;
    sourceEntity?: string;
    relationsUsed?: string[];
  };

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
