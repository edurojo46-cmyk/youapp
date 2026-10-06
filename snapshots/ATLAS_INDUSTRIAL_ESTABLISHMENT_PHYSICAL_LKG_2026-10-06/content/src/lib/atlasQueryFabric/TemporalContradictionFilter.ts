import { GroundedClaim } from './types';

export class TemporalContradictionFilter {
  private static readonly MULTI_CARDINALITY_PREDICATES = new Set([
    'LOCATED_IN',
    'OFFERS',
    'TECH_STACK',
    'INTERESTED_IN',
    'HAS_NEED',
    'OPENED_LOCATION',
    'EXPANDED_TO',
    'ASSOCIATED_WITH',
    'BELONGS_TO'
  ]);

  /**
   * Filters claims based on temporal mode and as_of date.
   */
  public static filterTemporal(
    claims: GroundedClaim[],
    temporalMode: 'CURRENT' | 'HISTORICAL' | 'AS_OF' | 'ALL',
    asOfDate?: string
  ): GroundedClaim[] {
    if (temporalMode === 'ALL') return claims;

    const targetDate = asOfDate ? new Date(asOfDate) : new Date();

    return claims.filter(c => {
      const from = c.valid_from ? new Date(c.valid_from) : null;
      const to = c.valid_to ? new Date(c.valid_to) : null;

      if (temporalMode === 'CURRENT') {
        if (!c.is_active) return false;
        if (from && from > targetDate) return false;
        if (to && to < targetDate) return false;
        return true;
      }

      if (temporalMode === 'HISTORICAL') {
        // Historical means either superseded/inactive or valid_to in the past
        return !c.is_active || (to !== null && to < targetDate);
      }

      if (temporalMode === 'AS_OF') {
        if (from && from > targetDate) return false;
        if (to && to < targetDate) return false;
        return true;
      }

      return true;
    });
  }

  /**
   * Identifies contradictions and conflicting claims across same entity & predicate.
   */
  public static detectContradictions(claims: GroundedClaim[]): GroundedClaim[] {
    if (claims.length === 0) return [];

    const claimsBySubjectPred = new Map<string, GroundedClaim[]>();

    for (const c of claims) {
      const key = `${c.subject_entity_id}:${c.predicate_code}`;
      if (!claimsBySubjectPred.has(key)) {
        claimsBySubjectPred.set(key, []);
      }
      claimsBySubjectPred.get(key)!.push(c);
    }

    const annotatedClaims: GroundedClaim[] = [];

    for (const [, group] of claimsBySubjectPred) {
      const predicateCode = group[0].predicate_code;
      const isMulti = this.MULTI_CARDINALITY_PREDICATES.has(predicateCode);

      if (group.length > 1 && !isMulti) {
        // Check if distinct values exist
        const distinctValues = new Set(
          group.map(g => (g.object_value !== undefined ? String(g.object_value) : g.object_name || ''))
        );

        const hasConflict = distinctValues.size > 1;

        for (const c of group) {
          if (hasConflict) {
            c.contradiction_info = {
              is_disputed: true,
              conflicting_statement: `Conflicting assertions observed for ${c.predicate_code} across sources.`
            };
          }
          annotatedClaims.push(c);
        }
      } else {
        for (const c of group) {
          annotatedClaims.push(c);
        }
      }
    }

    return annotatedClaims;
  }
}
