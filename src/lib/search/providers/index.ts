import type { ContentItem, SearchQuery } from '../types';

export interface SearchOptions {
  limit?: number;
  useFallback?: boolean;
}

export interface SearchProvider {
  name: string;
  search(query: SearchQuery, options?: SearchOptions): Promise<ContentItem[]>;
}
