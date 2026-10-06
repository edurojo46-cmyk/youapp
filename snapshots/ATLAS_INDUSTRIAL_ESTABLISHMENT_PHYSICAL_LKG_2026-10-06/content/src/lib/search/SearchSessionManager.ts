import type { 
  DiscoveryBudget, 
  EphemeralSearchSession, 
  LightweightPersonRecord, 
  ProviderPaginationCursor, 
  PossibleMatchCluster 
} from './MassDiscoveryTypes';
import type { QueryIntent } from './UniversalQueryModel';
import { SourceCapabilityRegistry } from './SourceCapabilityRegistry';

export class SearchSessionManager {
  private static sessions = new Map<string, EphemeralSearchSession>();
  private static readonly TTL_MS = 30 * 60 * 1000; // 30 minutes TTL

  /**
   * Retrieves an existing ephemeral search session or creates a new one.
   * STRICT REQUIREMENT:
   * SEARCH_SESSION_WRITES_ATLAS_PEOPLE = NO
   * SEARCH_SESSION_WRITES_OBSERVATIONS = NO
   * SEARCH_SESSION_WRITES_PROJECTION = NO
   * Transient in-memory state only.
   */
  public static getOrCreateSession(
    sessionId: string | undefined,
    intent: QueryIntent,
    budget: DiscoveryBudget = 'STANDARD'
  ): EphemeralSearchSession {
    this.cleanExpiredSessions();

    if (sessionId && this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId)!;
      session.last_accessed_at = Date.now();
      session.expires_at = Date.now() + this.TTL_MS;
      return session;
    }

    const newId = sessionId || `session_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36)}`;
    const targetBudget = this.resolveBudgetLimit(budget);

    // Initialize provider cursors from capable sources
    const capableSources = SourceCapabilityRegistry.getCapableSources(intent);
    const initialCursors: Record<string, ProviderPaginationCursor> = {};
    const initialStatuses: Record<string, 'ACTIVE' | 'EXHAUSTED' | 'RATE_LIMITED' | 'ERROR'> = {};

    for (const src of capableSources) {
      initialCursors[src.source_id] = {
        provider_id: src.source_id,
        cursor: undefined,
        page: 1,
        offset: 0,
        page_size: src.default_page_size || 100,
        provider_exhausted: false,
        reported_total: src.reported_total || null,
        retrievable_limit: src.retrievable_limit || null,
        discovered_so_far: 0
      };
      initialStatuses[src.source_id] = 'ACTIVE';
    }

    const session: EphemeralSearchSession = {
      search_session_id: newId,
      query_intent: intent,
      budget,
      target_unique_budget: targetBudget,
      provider_cursors: initialCursors,
      provider_statuses: initialStatuses,
      discovered_records: [],
      discovered_businesses: [],
      clusters: [],
      known_total: null,
      estimated_total: null,
      provider_reported_totals: {},
      created_at: Date.now(),
      last_accessed_at: Date.now(),
      expires_at: Date.now() + this.TTL_MS,
      all_providers_exhausted: false
    };

    this.sessions.set(newId, session);
    return session;
  }

  public static getSession(sessionId: string): EphemeralSearchSession | undefined {
    this.cleanExpiredSessions();
    const session = this.sessions.get(sessionId);
    if (session) {
      session.last_accessed_at = Date.now();
      session.expires_at = Date.now() + this.TTL_MS;
    }
    return session;
  }

  public static saveSession(session: EphemeralSearchSession): void {
    session.last_accessed_at = Date.now();
    session.expires_at = Date.now() + this.TTL_MS;
    this.sessions.set(session.search_session_id, session);
  }

  public static resolveBudgetLimit(budget: DiscoveryBudget): number {
    switch (budget) {
      case 'QUICK':
        return 100;
      case 'STANDARD':
        return 1000;
      case 'DEEP':
        return 10000;
      case 'MAX_AVAILABLE':
        return 100000;
      default:
        return 1000;
    }
  }

  private static cleanExpiredSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (now > session.expires_at) {
        this.sessions.delete(id);
      }
    }
  }
}
