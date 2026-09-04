import type { ContentItem, SearchQuery } from '../types';
import type { QueryUnderstanding } from '../intentDetector';


export interface SearchOptions {
  limit?: number;
  useFallback?: boolean;
  signal?: AbortSignal;
  benchmarkStartedAt?: string;
  providerStatuses?: Record<string, { status: string; results: number }>;
  currentQualifiedCount?: number;
  avgQuality?: number;
  avgRelevance?: number;
  intent?: QueryUnderstanding;
}



export interface SearchProvider {
  name: string;
  search(query: SearchQuery, options?: SearchOptions): Promise<ContentItem[]>;
}

export type CostTier = 'free' | 'low' | 'medium' | 'high';

export interface ExternalAdapter {
  id: string;
  costTier: CostTier;
  monetaryCost: number;
  quotaCost: number;
  priority: number;
  search(query: SearchQuery, options?: SearchOptions): Promise<ContentItem[]>;
  isAvailable(): Promise<boolean>;
}
