/**
 * ATLAS RATE LIMIT INTELLIGENCE V1
 * 
 * Tracks source state: ACTIVE, THROTTLED, COOLDOWN, RATE_LIMITED, BLOCKED.
 * Prevents retry storms and busy polling.
 * Automatically diverts worker capacity when a source is rate-limited (e.g. OpenAlex 429).
 */

export type SourceRateState = 
  | 'ACTIVE' 
  | 'THROTTLED' 
  | 'COOLDOWN' 
  | 'RATE_LIMITED' 
  | 'BLOCKED';

export interface SourceRateLimitInfo {
  source_id: string;
  state: SourceRateState;
  http_status: number;
  last_attempt_at: string;
  next_allowed_attempt_at: string | null;
  cooldown_seconds_remaining: number;
  reason: string;
  retry_count: number;
}

export class AtlasRateLimitManager {
  private static states: Map<string, SourceRateLimitInfo> = new Map();

  static {
    // Initial known states based on physical audits
    this.recordRateLimit('OPENALEX', 429, 'Rate limit exceeded: Insufficient daily budget ($0 remaining). Resets at midnight UTC.', this.calculateMidnightUtc());
    this.recordState('BIEP_APN', 'ACTIVE', 200, 'Bulk open CSV verified.');
    this.recordState('GEOREF_ARGENTINA', 'ACTIVE', 200, 'Public Open API verified.');
    this.recordState('WIKIDATA', 'ACTIVE', 200, 'Public SPARQL endpoint verified.');
  }

  public static calculateMidnightUtc(): string {
    const now = new Date();
    const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 5, 0));
    return midnight.toISOString();
  }

  public static recordRateLimit(sourceId: string, httpStatus: number, reason: string, nextAllowedIso?: string): SourceRateLimitInfo {
    const nextAllowed = nextAllowedIso || new Date(Date.now() + 3600 * 1000).toISOString();
    const info: SourceRateLimitInfo = {
      source_id: sourceId,
      state: 'RATE_LIMITED',
      http_status: httpStatus,
      last_attempt_at: new Date().toISOString(),
      next_allowed_attempt_at: nextAllowed,
      cooldown_seconds_remaining: Math.max(0, Math.floor((new Date(nextAllowed).getTime() - Date.now()) / 1000)),
      reason,
      retry_count: (this.states.get(sourceId)?.retry_count || 0) + 1
    };
    this.states.set(sourceId, info);
    console.log(`[RateLimitManager] Source ${sourceId} marked RATE_LIMITED until ${nextAllowed}. Reason: ${reason}`);
    return info;
  }

  public static recordState(sourceId: string, state: SourceRateState, httpStatus: number, reason: string): SourceRateLimitInfo {
    const info: SourceRateLimitInfo = {
      source_id: sourceId,
      state,
      http_status: httpStatus,
      last_attempt_at: new Date().toISOString(),
      next_allowed_attempt_at: null,
      cooldown_seconds_remaining: 0,
      reason,
      retry_count: 0
    };
    this.states.set(sourceId, info);
    return info;
  }

  public static isSourceAllowed(sourceId: string): boolean {
    const info = this.states.get(sourceId);
    if (!info) return true;

    if (info.state === 'BLOCKED') return false;

    if (info.state === 'RATE_LIMITED' || info.state === 'COOLDOWN') {
      if (info.next_allowed_attempt_at && new Date(info.next_allowed_attempt_at).getTime() > Date.now()) {
        return false; // Still in cooldown/rate-limit
      }
      // Cooldown expired, restore to ACTIVE
      info.state = 'ACTIVE';
      info.next_allowed_attempt_at = null;
      info.cooldown_seconds_remaining = 0;
      return true;
    }

    return true;
  }

  public static getSourceStatus(sourceId: string): SourceRateLimitInfo {
    const info = this.states.get(sourceId);
    if (!info) {
      return {
        source_id: sourceId,
        state: 'ACTIVE',
        http_status: 200,
        last_attempt_at: new Date().toISOString(),
        next_allowed_attempt_at: null,
        cooldown_seconds_remaining: 0,
        reason: 'Default active state',
        retry_count: 0
      };
    }
    // Update cooldown seconds
    if (info.next_allowed_attempt_at) {
      info.cooldown_seconds_remaining = Math.max(0, Math.floor((new Date(info.next_allowed_attempt_at).getTime() - Date.now()) / 1000));
    }
    return info;
  }

  public static getAllStates(): SourceRateLimitInfo[] {
    const all: SourceRateLimitInfo[] = [];
    for (const s of this.states.keys()) {
      all.push(this.getSourceStatus(s));
    }
    return all;
  }
}
