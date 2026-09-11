import { GroundedClaim } from './types';

export class EvidenceRankingEngine {
  /**
   * Ranks claims using RULE_GATED_V1 deterministic scoring.
   */
  public static rankClaims(
    claims: GroundedClaim[],
    contradictions?: Array<{ predicate_code: string; conflicting_claim_ids?: string[] }>
  ): GroundedClaim[] {
    const disputedIds = new Set<string>();
    if (contradictions) {
      for (const contra of contradictions) {
        if (contra.conflicting_claim_ids) {
          for (const cid of contra.conflicting_claim_ids) {
            disputedIds.add(cid);
          }
        }
      }
    }

    const annotated = claims.map(c => {
      const isDisputed = disputedIds.has(c.claim_id) || c.contradiction_info?.is_disputed === true;
      const score = this.calculateScore({
        ...c,
        contradiction_info: isDisputed
          ? { is_disputed: true, conflicting_statement: 'Disputed claim' }
          : c.contradiction_info
      });
      return {
        ...c,
        ranking_score: score,
        contradiction_info: isDisputed
          ? { is_disputed: true, conflicting_statement: 'Disputed claim' }
          : c.contradiction_info
      };
    });

    return annotated.sort((a, b) => {
      const diff = (b.ranking_score || 0) - (a.ranking_score || 0);
      if (Math.abs(diff) > 0.0001) return diff;
      const confDiff = (b.confidence || 0) - (a.confidence || 0);
      if (Math.abs(confDiff) > 0.0001) return confDiff;
      return a.statement.localeCompare(b.statement);
    });
  }

  public static calculateScore(claim: GroundedClaim): number {
    let base = 0.40;

    switch (claim.epistemic_status) {
      case 'USER_CONFIRMED_FACT':
        base = 1.00;
        break;
      case 'FACT':
        base = 0.95;
        break;
      case 'INFERRED':
        base = 0.85;
        break;
      case 'CLAIM':
        base = 0.70;
        break;
      case 'RAW_OBSERVATION':
        base = 0.40;
        break;
    }

    // Corroboration multiplier (up to 0.15)
    const sourceCount = claim.evidence_sources?.length || 0;
    const corroborationBonus = Math.min(sourceCount * 0.05, 0.15);

    // Contradiction penalty
    const contradictionPenalty = claim.contradiction_info?.is_disputed ? 0.30 : 0.0;

    return Math.max(0.0, Math.min(1.0, base + corroborationBonus - contradictionPenalty));
  }
}
