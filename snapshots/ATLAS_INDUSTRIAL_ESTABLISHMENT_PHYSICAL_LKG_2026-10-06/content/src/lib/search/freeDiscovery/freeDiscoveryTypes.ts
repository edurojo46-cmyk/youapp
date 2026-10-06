import type { ContentItem } from '../types';

export interface FreeDiscoveryStats {
  pagesFetched: number;
  rawVideosFound: number;
  uniqueVideos: number;
  qualifiedVideos: number;
  absorbedNew: number;
  alreadyKnown: number;
}

export interface FreeDiscoveryResult {
  passed: boolean;
  candidates: ContentItem[];
  stats: FreeDiscoveryStats;
  radarAvoided: boolean;
}
