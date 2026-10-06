import type { RetrievalStrategy } from '../SourceCapabilityRegistry';

export type CacheTier = 'STATIC' | 'INSTITUTIONAL_DIRECTORY' | 'NEWS' | 'REAL_TIME';

export interface CacheEntry<T> {
  key: string;
  data: T;
  source_id: string;
  tier: CacheTier;
  cached_at: number;
  expires_at: number;
}

export class AtlasRetrievalCache {
  private static cache: Map<string, CacheEntry<any>> = new Map();
  private static totalHits = 0;
  private static totalMisses = 0;

  // Specific TTLs per source tier (Section 20)
  public static readonly TTL_CONFIG: Record<CacheTier, number> = {
    STATIC: 24 * 60 * 60 * 1000,                  // 24 hours
    INSTITUTIONAL_DIRECTORY: 4 * 60 * 60 * 1000,  // 4 hours
    NEWS: 15 * 60 * 1000,                         // 15 minutes
    REAL_TIME: 60 * 1000                          // 1 minute
  };

  public static resolveTier(sourceId: string, strategy?: RetrievalStrategy): CacheTier {
    if (sourceId.includes('NEWS') || sourceId.includes('MEDIA')) return 'NEWS';
    if (sourceId.includes('REAL_TIME') || sourceId.includes('STREAM')) return 'REAL_TIME';
    if (strategy === 'INDEX_FULL' || sourceId.includes('GOVERNMENT') || sourceId.includes('GCBA') || sourceId.includes('UBA')) {
      return 'INSTITUTIONAL_DIRECTORY';
    }
    return 'STATIC';
  }

  public static get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.totalMisses++;
      return null;
    }

    const now = Date.now();
    if (now > entry.expires_at) {
      this.cache.delete(key);
      this.totalMisses++;
      return null;
    }

    this.totalHits++;
    return entry.data as T;
  }

  public static set<T>(key: string, data: T, sourceId: string, customTier?: CacheTier): void {
    const tier = customTier || this.resolveTier(sourceId);
    const ttl = this.TTL_CONFIG[tier];
    const now = Date.now();

    this.cache.set(key, {
      key,
      data,
      source_id: sourceId,
      tier,
      cached_at: now,
      expires_at: now + ttl
    });
  }

  public static getHitRate(): number {
    const total = this.totalHits + this.totalMisses;
    return total > 0 ? this.totalHits / total : 0;
  }

  public static getStats() {
    return {
      size: this.cache.size,
      total_hits: this.totalHits,
      total_misses: this.totalMisses,
      hit_rate: this.getHitRate()
    };
  }

  public static clear(): void {
    this.cache.clear();
    this.totalHits = 0;
    this.totalMisses = 0;
  }
}
