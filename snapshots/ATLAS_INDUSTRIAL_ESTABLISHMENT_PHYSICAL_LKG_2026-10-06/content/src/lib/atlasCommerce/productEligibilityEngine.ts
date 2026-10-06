/**
 * Atlas Commerce V1 — Product Eligibility & Quality Scoring Engine (Gate Zero Closure)
 * Enforces:
 * 1. Hard Eligibility Gate (Condition=NEW, Green Reputation, Status=active, Available reference stock > 0)
 * 2. Reference Stock Semantics: available_quantity in public API represents reference ranges (e.g. 1 represents 1..50), not exact inventory.
 * 3. Soft Atlas Quality Scoring (0..100).
 */

import {
  RawMercadoLibreItem,
  RawMercadoLibreSeller,
  ProductEligibilityResult,
  AtlasQualityScoreResult,
  AvailabilityStatus
} from './types';

export class ProductEligibilityEngine {
  /**
   * Evaluates mandatory hard eligibility gates (Fail-Closed).
   */
  static evaluateProductEligibility(
    item: RawMercadoLibreItem,
    seller: RawMercadoLibreSeller
  ): ProductEligibilityResult {
    const reasons: string[] = [];

    // 1. Condition check (NEW only)
    const condition = (item.condition || '').toUpperCase();
    const condition_is_new = condition === 'NEW';
    if (!condition_is_new) {
      reasons.push(`INELIGIBLE_CONDITION: Condition is '${item.condition}', expected 'NEW'`);
    }

    // 2. Seller reputation level check (Green only: 4_light_green or 5_green)
    const levelId = seller.seller_reputation?.level_id || '';
    const seller_is_green = levelId === '5_green' || levelId === '4_light_green';
    if (!seller_is_green) {
      reasons.push(`INELIGIBLE_SELLER_REPUTATION: Seller reputation level is '${levelId}', required '4_light_green' or '5_green'`);
    }

    // 3. Listing status check (active only)
    const listing_is_active = item.status === 'active';
    if (!listing_is_active) {
      reasons.push(`INELIGIBLE_LISTING_STATUS: Item status is '${item.status}', expected 'active'`);
    }

    // 4. Stock availability check (reference bucket > 0)
    const stock_is_available = typeof item.available_quantity === 'number' && item.available_quantity > 0;
    if (!stock_is_available) {
      reasons.push(`INELIGIBLE_STOCK: Available reference quantity is ${item.available_quantity}, required > 0`);
    }

    let availabilityStatus: AvailabilityStatus = 'AVAILABLE';
    if (item.status === 'paused') availabilityStatus = 'PAUSED';
    else if (item.status === 'closed') availabilityStatus = 'CLOSED';
    else if (!stock_is_available) availabilityStatus = 'OUT_OF_STOCK';

    const is_eligible = condition_is_new && seller_is_green && listing_is_active && stock_is_available;

    return {
      is_eligible,
      rejection_reasons: reasons,
      mandatory_checks: {
        condition_is_new,
        seller_is_green,
        listing_is_active,
        stock_is_available
      },
      availability: {
        status: availabilityStatus,
        available_quantity_reference: item.available_quantity ?? 0,
        semantics: 'REFERENCE_BUCKET'
      }
    };
  }

  /**
   * Computes soft Atlas Quality Score (0..100) for ranking.
   */
  static calculateQualityScore(
    item: RawMercadoLibreItem,
    seller: RawMercadoLibreSeller
  ): AtlasQualityScoreResult {
    const rep = seller.seller_reputation || {};

    // 1. Power Seller Points (0..30)
    let power_seller_points = 0;
    const pStatus = (rep.power_seller_status || '').toLowerCase();
    if (pStatus === 'platinum') power_seller_points = 30;
    else if (pStatus === 'gold') power_seller_points = 20;
    else if (pStatus === 'silver') power_seller_points = 10;

    // 2. Shipping / Fulfillment Points (0..25)
    let shipping_fulfillment_points = 0;
    const logType = item.shipping?.logistic_type?.toLowerCase();
    if (logType === 'fulfillment') {
      shipping_fulfillment_points = 25; // Full fulfillment
    } else if (logType === 'cross_docking' || item.shipping?.mode === 'me2') {
      shipping_fulfillment_points = 15; // Mercado Envíos standard
    }

    // 3. Reputation Level Points (0..25)
    let reputation_points = 0;
    const levelId = rep.level_id;
    if (levelId === '5_green') reputation_points = 25;
    else if (levelId === '4_light_green') reputation_points = 15;

    // 4. Low Cancellation / Claims Points (0..20)
    let low_cancellation_points = 20;
    const cancelRate = rep.metrics?.cancellations?.rate ?? 0;
    const claimsRate = rep.metrics?.claims?.rate ?? 0;

    if (cancelRate > 0.025 || claimsRate > 0.015) {
      low_cancellation_points = 0;
    } else if (cancelRate > 0.01 || claimsRate > 0.005) {
      low_cancellation_points = 10;
    }

    const totalScore = Math.min(100, Math.max(0, power_seller_points + shipping_fulfillment_points + reputation_points + low_cancellation_points));

    return {
      quality_score: totalScore,
      factors: {
        power_seller_points,
        shipping_fulfillment_points,
        reputation_points,
        low_cancellation_points
      }
    };
  }
}
