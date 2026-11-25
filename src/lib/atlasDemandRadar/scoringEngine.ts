/**
 * Atlas Demand Radar V1 — Deterministic Scoring Engine
 * Demand Score, Commerce Match Score, Opportunity Gap & Tier Assignment
 */

import type { DemandVector, OpportunityTier, DemandOpportunity, MarketState } from './types';
import type { MercadoLibreSiteId } from '../atlasCommerce/types';

export interface ScoringResult {
  demand_score: number;
  commerce_match_score: number;
  overall_opportunity_score: number;
  opportunity_gap_score: number;
  opportunity_tier: OpportunityTier;
  market_state: MarketState;
  explanation: string;
}

/**
 * Calculates deterministic Demand Score from the Demand Vector.
 * Bounded strictly 0..100.
 */
export function calculateDemandScore(vector: DemandVector): number {
  const {
    search_strength,
    social_strength,
    acceleration,
    commercial_intent,
    persistence,
    confidence
  } = vector;

  // Normalize acceleration (-100..+100) to (0..100) with 50 as neutral
  const normalizedAccel = Math.min(100, Math.max(0, 50 + (acceleration * 0.5)));

  const rawScore =
    (search_strength * 0.25) +
    (social_strength * 0.15) +
    (normalizedAccel * 0.20) +
    (commercial_intent * 0.20) +
    (persistence * 0.10) +
    (confidence * 0.10);

  return +Math.min(100, Math.max(0, rawScore)).toFixed(1);
}

/**
 * Calculates deterministic Commerce Match Score based on product availability, quality and commission.
 * Bounded strictly 0..100.
 */
export function calculateCommerceMatchScore(
  eligibleItemsCount: number,
  avgQualityScore: number,
  avgCommissionRate: number,
  fulfillmentAvailable: boolean
): number {
  if (eligibleItemsCount === 0) {
    return 0;
  }

  // 1. Availability factor (up to 30 pts)
  const availabilityPoints = Math.min(30, eligibleItemsCount * 6);

  // 2. Quality score factor (up to 30 pts)
  const qualityPoints = (Math.min(100, Math.max(0, avgQualityScore)) / 100) * 30;

  // 3. Commission rate factor (up to 25 pts: 10% rate = full points)
  const commissionPoints = Math.min(25, (avgCommissionRate / 0.10) * 25);

  // 4. Logistics fulfillment bonus (up to 15 pts)
  const fulfillmentPoints = fulfillmentAvailable ? 15 : 5;

  const total = availabilityPoints + qualityPoints + commissionPoints + fulfillmentPoints;
  return +Math.min(100, Math.max(0, total)).toFixed(1);
}

/**
 * Calculates Opportunity Gap factoring demand, intent, commerce quality and market saturation.
 * Arbitrage Formula: Demanda no saturada = mayor oportunidad real.
 */
export function calculateOpportunityGap(
  demandScore: number,
  commercialIntent: number,
  commerceMatchScore: number,
  saturationIndex: number
): number {
  const intentFactor = Math.min(1.0, Math.max(0.1, commercialIntent / 100));
  const commerceFactor = Math.min(1.0, Math.max(0.0, commerceMatchScore / 100));
  const unsaturationFactor = Math.min(1.0, Math.max(0.1, 1 - (saturationIndex / 100)));

  const gapScore = demandScore * intentFactor * commerceFactor * unsaturationFactor;
  return +Math.min(100, Math.max(0, gapScore)).toFixed(1);
}

/**
 * Assigns standardized Opportunity Tier based on scores and market state
 */
export function assignOpportunityTier(
  overallScore: number,
  marketState: MarketState
): OpportunityTier {
  if (marketState === 'TREND' || marketState === 'INACTIVE' || overallScore < 30) {
    return 'INELIGIBLE';
  }

  if (overallScore >= 75) return 'TIER_1_EXPEDITE';
  if (overallScore >= 50) return 'TIER_2_VIABLE';
  return 'TIER_3_MONITOR';
}

/**
 * Full deterministic evaluation of an opportunity
 */
export function evaluateDemandOpportunity(
  clusterId: string,
  snapshotId: string,
  siteId: MercadoLibreSiteId,
  vector: DemandVector,
  marketState: MarketState,
  commerceMatchScore: number
): DemandOpportunity {
  const demandScore = calculateDemandScore(vector);
  const overallScore = +(demandScore * (commerceMatchScore / 100)).toFixed(1);
  const gapScore = calculateOpportunityGap(
    demandScore,
    vector.commercial_intent,
    commerceMatchScore,
    vector.saturation_index
  );

  const tier = assignOpportunityTier(overallScore, marketState);

  let status: 'DETECTED' | 'MATCHED' | 'ACTIONABLE' | 'ARCHIVED' = 'DETECTED';
  if (tier === 'TIER_1_EXPEDITE' || tier === 'TIER_2_VIABLE') {
    status = 'ACTIONABLE';
  } else if (tier === 'TIER_3_MONITOR') {
    status = 'MATCHED';
  } else {
    status = 'ARCHIVED';
  }

  const explanation = `Demand: ${demandScore}, Commerce Match: ${commerceMatchScore}, Overall: ${overallScore}, Gap: ${gapScore}, State: ${marketState}, Tier: ${tier}`;

  return {
    opportunity_id: `opp_${clusterId}_${siteId}_${Date.now()}`,
    cluster_id: clusterId,
    snapshot_id: snapshotId,
    site_id: siteId,
    demand_score: demandScore,
    commerce_match_score: commerceMatchScore,
    overall_opportunity_score: overallScore,
    opportunity_gap_score: gapScore,
    opportunity_tier: tier,
    market_state: marketState,
    status,
    evaluation_reason: explanation,
    created_at: new Date().toISOString()
  };
}
