/**
 * Atlas Demand Radar V1 — Commerce Bridge
 * Read-Only Integration with Certified Atlas Commerce V1 (Mercado Libre Gate Zero)
 */

import type {
  MercadoLibreSiteId,
  RawMercadoLibreItem,
  RawMercadoLibreSeller,
  VersionedSitePolicy,
  CommissionRule
} from '../atlasCommerce/types';
import {
  ProductEligibilityEngine
} from '../atlasCommerce/productEligibilityEngine';
import {
  CommissionEngine
} from '../atlasCommerce/commissionEngine';
import type { DemandCommerceMatch } from './types';
import { calculateCommerceMatchScore } from './scoringEngine';

export interface CandidateProductBundle {
  item: RawMercadoLibreItem;
  seller: RawMercadoLibreSeller;
}

export function matchClusterToCommerce(
  opportunityId: string,
  siteId: MercadoLibreSiteId,
  sitePolicy: VersionedSitePolicy,
  commissionRule: CommissionRule,
  candidateBundles: CandidateProductBundle[],
  _referenceDateIso?: string
): {
  is_policy_allowed: boolean;
  policy_rejection_reason?: string;
  commerce_match?: DemandCommerceMatch;
  commerce_match_score: number;
} {
  // 1. Check Site Policy validity (Fail-closed on UNKNOWN / BLOCKED)
  const policyCheck = CommissionEngine.evaluateSitePolicy(siteId, [sitePolicy]);
  if (!policyCheck.allowed) {
    return {
      is_policy_allowed: false,
      policy_rejection_reason: `SITE_POLICY_NOT_VERIFIED: ${policyCheck.reason}`,
      commerce_match_score: 0
    };
  }

  // 2. Filter Candidate Items through Gate Zero Product Eligibility
  const eligibleBundles: CandidateProductBundle[] = [];
  let totalQualityScore = 0;
  let totalCommissionAmount = 0;
  let totalCommissionRate = 0;
  let fulfillmentCount = 0;

  for (const bundle of candidateBundles) {
    const eligibility = ProductEligibilityEngine.evaluateProductEligibility(bundle.item, bundle.seller);
    if (eligibility.is_eligible) {
      eligibleBundles.push(bundle);

      // Quality Score (0..100)
      const qScore = ProductEligibilityEngine.calculateQualityScore(bundle.item, bundle.seller);
      totalQualityScore += qScore.quality_score;

      // Commission Estimation
      const comm = CommissionEngine.computeCommission(
        bundle.item.price,
        bundle.item.category_id,
        siteId,
        [commissionRule],
        [sitePolicy]
      );
      if (comm.is_commissionable) {
        totalCommissionAmount += comm.computed_commission;
        totalCommissionRate += comm.commission_rate_percent;
      }

      // Shipping Fulfillment Check
      if (bundle.item.shipping?.logistic_type === 'fulfillment') {
        fulfillmentCount++;
      }
    }
  }

  const eligibleCount = eligibleBundles.length;
  if (eligibleCount === 0) {
    return {
      is_policy_allowed: true,
      commerce_match_score: 0,
      commerce_match: {
        match_id: `match_${opportunityId}`,
        opportunity_id: opportunityId,
        site_id: siteId,
        matched_items_count: candidateBundles.length,
        eligible_items_count: 0,
        top_eligible_item_ids: [],
        avg_quality_score: 0,
        avg_commission_rate: 0,
        estimated_unit_commission: 0,
        best_product_condition: 'NONE',
        fulfillment_available: false,
        matched_at: new Date().toISOString()
      }
    };
  }

  const avgQuality = +(totalQualityScore / eligibleCount).toFixed(1);
  const avgCommRate = +(totalCommissionRate / eligibleCount).toFixed(4);
  const avgCommAmount = +(totalCommissionAmount / eligibleCount).toFixed(2);
  const fulfillmentAvailable = fulfillmentCount > 0;

  // 3. Compute Commerce Match Score (0..100)
  const matchScore = calculateCommerceMatchScore(
    eligibleCount,
    avgQuality,
    avgCommRate,
    fulfillmentAvailable
  );

  const topItemIds = eligibleBundles.slice(0, 5).map(b => b.item.id);

  const commerceMatch: DemandCommerceMatch = {
    match_id: `match_${opportunityId}`,
    opportunity_id: opportunityId,
    site_id: siteId,
    matched_items_count: candidateBundles.length,
    eligible_items_count: eligibleCount,
    top_eligible_item_ids: topItemIds,
    avg_quality_score: avgQuality,
    avg_commission_rate: avgCommRate,
    estimated_unit_commission: avgCommAmount,
    best_product_condition: eligibleBundles[0].item.condition.toUpperCase(),
    fulfillment_available: fulfillmentAvailable,
    matched_at: new Date().toISOString()
  };

  return {
    is_policy_allowed: true,
    commerce_match: commerceMatch,
    commerce_match_score: matchScore
  };
}
