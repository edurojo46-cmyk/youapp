export type QueryFreshness = 'live' | 'news' | 'trending' | 'current' | 'evergreen';

export interface SearchQuery {
  rawQuery: string;
  normalizedQuery: string;
  freshness: QueryFreshness;
  limit?: number;
  forceExternal?: boolean; // If user clicked "Search more on internet"
}

export interface ContentItem {
  id: string;
  type: 'video' | 'channel' | 'playlist';
  
  provider: 'youtube' | 'twitch' | 'tiktok' | 'instagram' | 'vimeo' | 'dailymotion' | 'itunes' | 'direct' | 'youapp' | 'unknown';
  providerId?: string;
  canonicalUrl?: string;
  
  title: string;
  description?: string;
  thumbnail: string;
  videoUrl: string;
  
  channelTitle: string;
  channelId: string;
  channelAvatar?: string;
  
  durationText?: string;
  durationSeconds?: number;
  
  viewsText?: string;
  publishedText?: string;
  publishedAt?: string;
  
  isLive: boolean;
  isVerified: boolean;
  
  subscribersText?: string;
  videoCountText?: string;
  handle?: string;
  badge?: string;
  
  topics?: string[];
  tags?: string[];
  
  qualityScore?: number;
  qualityConfidence?: number;
  sourceConfidence?: number;
  valueRate?: number;
  relevanceScore?: number;
  affinityScore?: number;
  youScore?: number;
  
  rankingVersion?: string;
  qualityVersion?: string;
  
  source?: {
    provider: string;
    discoveryMethod: 'curated' | 'user-submitted' | 'youtube-api' | 'vimeo-api' | 'twitch-api' | 'import' | 'local-catalog';
    discoveredAt: string;
    lastVerifiedAt?: string;
  };
}

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
