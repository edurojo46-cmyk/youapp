export type Intent = 'news' | 'sports' | 'tech' | 'history' | 'documentary' | 'general' | 'tourism' | 'culture' | 'nature' | 'economy' | 'politics';
export type Topic = string;

export interface QueryUnderstanding {
  primaryIntent: Intent;
  secondaryIntent?: Intent;
  topic?: Topic;
  entities: string[];
  confidence: number;
}

export interface NormalizedVideo {
  provider: 'youtube' | 'vimeo' | 'local';
  providerContentId: string;

  title: string;
  description: string;

  channelId?: string;
  channelTitle: string;
  thumbnailUrl?: string;

  publishedAt?: string; // Always ISO 8601 UTC
  viewCount?: number;
  durationSeconds?: number;

  contentState: 'vod' | 'live' | 'upcoming' | 'unknown';
  canonicalUrl?: string;
  sourceVerified?: boolean;

  metadata: {
    publishedAt: 'real' | 'derived' | 'missing';
    viewCount: 'real' | 'derived' | 'missing';
    duration: 'real' | 'derived' | 'missing';
  };

  metadataCompleteness: number;
}
