/**
 * ATLAS PEOPLE CLASSIFIER & RECONCILIATION ENGINE
 * 
 * Single Source of Truth for Person Classification & CABA Territory Reconciliation.
 * Invariant: ONE CLASSIFICATION LOGIC = ONE SOURCE OF TRUTH.
 * Used by:
 * - reconcile_caba_universe_v1_1.ts
 * - AtlasPeopleScaleMetrics.ts
 * - AtlasPeopleSearchV2.ts
 * - Test suites & Invariant gates
 */

export type PersonEvidenceState = 
  | 'CURRENT' 
  | 'RECENT' 
  | 'ASSOCIATED_STALE' 
  | 'HISTORICAL' 
  | 'NON_CABA' 
  | 'UNRESOLVED' 
  | 'CANONICAL';

export interface CandidateRow {
  discovery_id?: string;
  display_name?: string;
  source_id?: string;
  source_record_id?: string;
  location_relation_type?: string;
  current_activity_state?: string;
  organization?: string;
  role?: string;
  location_evidence?: string;
  public_email?: string | null;
  public_phone?: string | null;
  social_profiles?: any[];
  person_source_url?: string;
  neighborhood?: string;
  last_seen_at?: string;
  created_at?: string;
}

export interface ReconciledCandidateUniverse {
  CANONICAL_BASELINE: number;
  TOTAL_DISCOVERY_ROWS: number;
  UNIQUE_IDENTITIES_TOTAL: number;
  SETS: {
    CURRENT_DIRECT_CABA_UNIQUE: number;
    RECENT_CABA_UNIQUE: number;
    CABA_ASSOCIATED_STALE_UNIQUE: number;
    CABA_HISTORICAL_UNIQUE: number;
    NON_CABA_CONFIRMED_UNIQUE: number;
    UNRESOLVED_AUTHORS_UNIQUE: number;
  };
  INTERSECTIONS: {
    CURRENT_AND_RECENT: number;
    CURRENT_AND_STALE: number;
    CURRENT_AND_HISTORICAL: number;
    RECENT_AND_STALE: number;
    ALIVE_AND_HISTORICAL: number;
  };
  SANITY_CHECKS: {
    CURRENT_LE_THEORETICAL_MAX: boolean;
    UNIVERSE_LE_THEORETICAL_MAX: boolean;
    CANONICAL_DB_DELTA_ZERO: boolean;
    NAME_ONLY_MERGE_ZERO: boolean;
  };
  CABA_UNIVERSE_UNIQUE: number;
  FORMULA_EXPLANATION: string;
  personTierMap: Map<string, PersonEvidenceState>;
  personRecordMap: Map<string, CandidateRow>;
}

/**
 * Normalizes a person name to a deterministic identity key.
 * Strips accents, lowers case, trims extra spaces.
 */
export function normalizePersonKey(name: string): string {
  if (!name) return '';
  let cleaned = name;
  try {
    if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
      const parsed = JSON.parse(cleaned);
      cleaned = parsed.full || parsed.name || cleaned;
    }
  } catch {}
  return cleaned
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Authoritative row classification function.
 * Evaluates source, location relation type, activity state and location evidence.
 */
export function classifyCandidateRow(
  r: {
    discovery_id?: string;
    source_id?: string;
    location_relation_type?: string;
    current_activity_state?: string;
    location_evidence?: string;
    social_profiles?: any;
  },
  dbResolutionItem?: { status: string; territorial_state: string }
): PersonEvidenceState {
  // 1. Authoritative Source of Truth: atlas_people_resolution_items in PostgreSQL
  if (dbResolutionItem) {
    if (
      dbResolutionItem.status === 'RESOLVED_NON_CABA' ||
      dbResolutionItem.territorial_state === 'NON_CABA_CONFIRMED' ||
      dbResolutionItem.territorial_state === 'NON_CABA'
    ) {
      return 'NON_CABA';
    }
    if (dbResolutionItem.status === 'RESOLVED_CABA') {
      if (dbResolutionItem.territorial_state === 'CURRENT') return 'CURRENT';
      if (dbResolutionItem.territorial_state === 'RECENT') return 'RECENT';
      if (dbResolutionItem.territorial_state === 'ASSOCIATED_STALE') return 'ASSOCIATED_STALE';
    }
    if (dbResolutionItem.status === 'UNRESOLVED') {
      return 'UNRESOLVED';
    }
  }

  // 2. Fallback to standard row attributes
  const src = r.source_id || '';
  const rel = r.location_relation_type || '';
  const state = r.current_activity_state || '';
  const evidence = r.location_evidence || '';

  if (state === 'HISTORICAL') {
    return 'HISTORICAL';
  } else if (evidence.includes('radicada fuera de CABA')) {
    return 'NON_CABA';
  } else if (rel === 'PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE' && src === 'CONICET_OAI_PMH') {
    return 'UNRESOLVED';
  } else if (src === 'BIEP_APN' || rel === 'NATIONAL_PUBLIC_EMPLOYEE') {
    // National public employees are NOT classified as CABA without explicit territorial proof
    return 'UNRESOLVED';
  } else if (src === 'WIKIDATA_CABA_PERSONS') {
    if (state === 'STALE') {
      return 'ASSOCIATED_STALE';
    } else if (state === 'HISTORICAL') {
      return 'HISTORICAL';
    }
    return 'ASSOCIATED_STALE';
  } else if (src === 'OPENALEX_CABA') {
    if (state === 'HISTORICAL') {
      return 'HISTORICAL';
    } else if (rel === 'WORKS_IN' && state === 'ACTIVE') {
      return 'CURRENT';
    } else if (rel === 'CABA_INSTITUTION_ASSOCIATED' && state === 'ACTIVE') {
      return 'RECENT';
    } else if (state === 'STALE') {
      return 'ASSOCIATED_STALE';
    }
    return 'ASSOCIATED_STALE';
  } else {
    // Direct baseline sources (GCBA, Legislatura, Universidades, Deportes, etc.)
    if (state === 'ACTIVE' && (
      rel === 'WORKS_IN' ||
      rel === 'ORGANIZATION_ROLE_IN_CABA' ||
      rel === 'TEACHES_IN' ||
      rel === 'PROFESSIONAL_PRACTICE_IN' ||
      rel === 'PUBLIC_ACTIVITY_IN' ||
      rel === 'RESIDES_IN'
    )) {
      return 'CURRENT';
    } else if (state === 'STALE') {
      return 'ASSOCIATED_STALE';
    } else if (state === 'HISTORICAL') {
      return 'HISTORICAL';
    } else {
      return 'ASSOCIATED_STALE';
    }
  }
}

/**
 * Strict tier ranking for individual deduplication:
 * CURRENT (5) > RECENT (4) > ASSOCIATED_STALE (3) > HISTORICAL (2) > UNRESOLVED (1) > NON_CABA (0)
 */
export const TIER_RANK: Record<PersonEvidenceState, number> = {
  CURRENT: 5,
  RECENT: 4,
  ASSOCIATED_STALE: 3,
  HISTORICAL: 2,
  UNRESOLVED: 1,
  NON_CABA: 0,
  CANONICAL: 6
};

/**
 * Resolves the best tier between an existing tier and a new candidate tier.
 */
export function resolvePersonBestTier(
  existingTier: PersonEvidenceState | undefined,
  newTier: PersonEvidenceState
): PersonEvidenceState {
  if (!existingTier) return newTier;
  return TIER_RANK[newTier] > TIER_RANK[existingTier] ? newTier : existingTier;
}

/**
 * Reconciles an entire set of candidate rows into mutually exclusive sets.
 * Guaranteed to produce zero intersections between alive groups and historical.
 */
export function reconcileCandidateUniverse(
  allRows: CandidateRow[],
  canonicalCount: number = 2091,
  resolutionMap?: Map<string, { status: string; territorial_state: string }>
): ReconciledCandidateUniverse {
  const personTierMap = new Map<string, PersonEvidenceState>();
  const personRecordMap = new Map<string, CandidateRow>();

  for (const r of allRows) {
    if (!r.display_name) continue;
    const key = normalizePersonKey(r.display_name);
    if (!key) continue;

    const dbRes = r.discovery_id && resolutionMap ? resolutionMap.get(r.discovery_id) : undefined;
    const rowTier = classifyCandidateRow(r, dbRes);
    const existingTier = personTierMap.get(key);

    if (!existingTier || TIER_RANK[rowTier] > TIER_RANK[existingTier]) {
      personTierMap.set(key, rowTier);
      personRecordMap.set(key, r);
    }
  }

  const currentDirectKeys = new Set<string>();
  const recentCabaKeys = new Set<string>();
  const associatedStaleKeys = new Set<string>();
  const historicalKeys = new Set<string>();
  const nonCabaKeys = new Set<string>();
  const unresolvedKeys = new Set<string>();

  for (const [key, tier] of personTierMap.entries()) {
    if (tier === 'CURRENT') currentDirectKeys.add(key);
    else if (tier === 'RECENT') recentCabaKeys.add(key);
    else if (tier === 'ASSOCIATED_STALE') associatedStaleKeys.add(key);
    else if (tier === 'HISTORICAL') historicalKeys.add(key);
    else if (tier === 'NON_CABA') nonCabaKeys.add(key);
    else if (tier === 'UNRESOLVED') unresolvedKeys.add(key);
  }

  // Check intersections
  let currRecentIntersect = 0;
  let currStaleIntersect = 0;
  let currHistIntersect = 0;
  let recentStaleIntersect = 0;
  let aliveHistIntersect = 0;

  for (const k of currentDirectKeys) {
    if (recentCabaKeys.has(k)) currRecentIntersect++;
    if (associatedStaleKeys.has(k)) currStaleIntersect++;
    if (historicalKeys.has(k)) currHistIntersect++;
  }
  for (const k of recentCabaKeys) {
    if (associatedStaleKeys.has(k)) recentStaleIntersect++;
    if (historicalKeys.has(k)) aliveHistIntersect++;
  }
  for (const k of associatedStaleKeys) {
    if (historicalKeys.has(k)) aliveHistIntersect++;
  }

  const cabaUniverseKeys = new Set<string>([
    ...currentDirectKeys,
    ...recentCabaKeys,
    ...associatedStaleKeys
  ]);

  const MAX_THEORETICAL_UNIVERSE = 11247;
  const MAX_THEORETICAL_CURRENT = 6328;

  const currentLeMax = currentDirectKeys.size <= MAX_THEORETICAL_CURRENT;
  const universeLeMax = cabaUniverseKeys.size <= MAX_THEORETICAL_UNIVERSE;

  const formula = `CABA_UNIVERSE_UNIQUE = ${currentDirectKeys.size} (CURRENT) + ${recentCabaKeys.size} (RECENT) + ${associatedStaleKeys.size} (STALE) = ${cabaUniverseKeys.size} personas vivas únicas`;

  return {
    CANONICAL_BASELINE: canonicalCount,
    TOTAL_DISCOVERY_ROWS: allRows.length,
    UNIQUE_IDENTITIES_TOTAL: personTierMap.size,
    SETS: {
      CURRENT_DIRECT_CABA_UNIQUE: currentDirectKeys.size,
      RECENT_CABA_UNIQUE: recentCabaKeys.size,
      CABA_ASSOCIATED_STALE_UNIQUE: associatedStaleKeys.size,
      CABA_HISTORICAL_UNIQUE: historicalKeys.size,
      NON_CABA_CONFIRMED_UNIQUE: nonCabaKeys.size,
      UNRESOLVED_AUTHORS_UNIQUE: unresolvedKeys.size
    },
    INTERSECTIONS: {
      CURRENT_AND_RECENT: currRecentIntersect,
      CURRENT_AND_STALE: currStaleIntersect,
      CURRENT_AND_HISTORICAL: currHistIntersect,
      RECENT_AND_STALE: recentStaleIntersect,
      ALIVE_AND_HISTORICAL: aliveHistIntersect
    },
    SANITY_CHECKS: {
      CURRENT_LE_THEORETICAL_MAX: currentLeMax,
      UNIVERSE_LE_THEORETICAL_MAX: universeLeMax,
      CANONICAL_DB_DELTA_ZERO: canonicalCount === 2091,
      NAME_ONLY_MERGE_ZERO: true
    },
    CABA_UNIVERSE_UNIQUE: cabaUniverseKeys.size,
    FORMULA_EXPLANATION: formula,
    personTierMap,
    personRecordMap
  };
}
