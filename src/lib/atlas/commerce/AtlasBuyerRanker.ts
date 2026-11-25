/**
 * ATLAS VENDER / COMMERCE V1
 * Module: AtlasBuyerRanker.ts
 * Path: src/lib/atlas/commerce/AtlasBuyerRanker.ts
 * 
 * Ranks candidate buyers balancing:
 * 1. BUYER_FIT (primary structural match)
 * 2. TIMING (active opportunity boost)
 * 3. CONTACTABILITY (actionable communication channels)
 * 4. CONFIDENCE (truth verification certainty)
 * 
 * Invariant: Never collapses or crushes the four distinct scores.
 */

import type { BuyerFitEvaluationResult } from './AtlasBuyerFitEngine.ts';

export interface RankedBuyerItem extends BuyerFitEvaluationResult {
  rank_position: number;
  rank_tier: 'TOP_PROSPECT' | 'HIGH_POTENTIAL' | 'QUALIFIED' | 'EXPLORATORY';
  primary_contact_display: string;
  verified_contacts: {
    emails: string[];
    phones: string[];
    linkedin: string[];
  };
  has_verified_contact: boolean;
  recommended_product_tier?: string;
  product_buyer_match_score?: number;
  product_match_breakdown?: any;
  recommended_product_id?: string;
  recommended_product_title?: string;
}

export class AtlasBuyerRanker {
  /**
   * Sorts and tiers evaluated buyer candidates.
   */
  public static rankCandidates(
    evaluations: BuyerFitEvaluationResult[]
  ): RankedBuyerItem[] {
    // Sorting order:
    // 1. Final Priority Score (Base Buyer Fit + Timing Boost from valid commercial signals)
    // 2. Base Buyer Fit Score (Structural product compatibility strictly precedes contactability)
    // 3. Evidence Coverage & Confidence Score
    // 4. Contactability Score (Actionable contact channel within same fit level)
    const sorted = [...evaluations].sort((a, b) => {
      // Primary: final priority score
      if (Math.abs(b.final_priority_score - a.final_priority_score) > 0.03) {
        return b.final_priority_score - a.final_priority_score;
      }
      // Secondary: base structural fit score
      if (Math.abs(b.base_buyer_fit_score - a.base_buyer_fit_score) > 0.03) {
        return b.base_buyer_fit_score - a.base_buyer_fit_score;
      }
      // Tertiary: evidence coverage
      if (Math.abs(b.evidence_coverage - a.evidence_coverage) > 0.05) {
        return b.evidence_coverage - a.evidence_coverage;
      }
      // Quaternary: confidence
      if (Math.abs(b.confidence_score - a.confidence_score) > 0.05) {
        return b.confidence_score - a.confidence_score;
      }
      // Quinary: actionable contactability
      return b.contactability_score - a.contactability_score;
    });

    return sorted.map((item, idx) => {
      let tier: RankedBuyerItem['rank_tier'] = 'EXPLORATORY';
      if (item.final_priority_score >= 0.85 && item.contactability_score > 0) {
        tier = 'TOP_PROSPECT';
      } else if (item.final_priority_score >= 0.70) {
        tier = 'HIGH_POTENTIAL';
      } else if (item.final_priority_score >= 0.40) {
        tier = 'QUALIFIED';
      }

      const contactPoints = item.verified_contact_points || { emails: [], phones: [], linkedin: [] };
      const hasVerifiedContact = (
        (contactPoints.emails?.length || 0) +
        (contactPoints.phones?.length || 0) +
        (contactPoints.linkedin?.length || 0)
      ) > 0;

      // Format primary contact display
      let primaryContact = 'Sin contacto verificado en SSOT';
      if (contactPoints.emails.length > 0) {
        primaryContact = contactPoints.emails[0];
      } else if (contactPoints.phones.length > 0) {
        primaryContact = contactPoints.phones[0];
      } else if (contactPoints.linkedin.length > 0) {
        primaryContact = contactPoints.linkedin[0];
      }

      return {
        ...item,
        rank_position: idx + 1,
        rank_tier: tier,
        primary_contact_display: primaryContact,
        verified_contacts: contactPoints,
        has_verified_contact: hasVerifiedContact
      };
    });
  }
}
