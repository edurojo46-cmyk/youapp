/**
 * Atlas Commerce V1 — Commission & Attribution Engine (Gate Zero Closure)
 * Enforces:
 * 1. Multi-Site Policy Isolation: MLA is VERIFIED (24h Last Valid Click); MLB/MLM/MLC are UNKNOWN (BLOCK).
 * 2. Versioned Category Commission calculations.
 */

import {
  CommissionRule,
  CommissionCalculationResult,
  MercadoLibreSiteId,
  VersionedSitePolicy,
  VersionedCommissionMatrix
} from './types';

export class CommissionEngine {
  /**
   * Prohibits overlapping effective time ranges for the same (partner_id, site_id).
   * Range semantics: half-open interval [effective_from, effective_to).
   */
  static validateMatrixNonOverlap(
    matrices: VersionedCommissionMatrix[],
    newMatrix: VersionedCommissionMatrix
  ): { valid: boolean; reason?: string } {
    const newFrom = new Date(newMatrix.effective_from).getTime();
    const newTo = newMatrix.effective_to ? new Date(newMatrix.effective_to).getTime() : Infinity;

    if (newTo <= newFrom) {
      return {
        valid: false,
        reason: `INVALID_RANGE: effective_to (${newMatrix.effective_to}) must be strictly after effective_from (${newMatrix.effective_from})`
      };
    }

    for (const existing of matrices) {
      if (existing.partner_id !== newMatrix.partner_id || existing.site_id !== newMatrix.site_id) {
        continue;
      }
      if (existing.matrix_id === newMatrix.matrix_id) {
        continue;
      }

      const existingFrom = new Date(existing.effective_from).getTime();
      const existingTo = existing.effective_to ? new Date(existing.effective_to).getTime() : Infinity;

      // Overlap condition for half-open intervals [A_from, A_to) and [B_from, B_to):
      // Overlaps if (newFrom < existingTo && newTo > existingFrom)
      if (newFrom < existingTo && newTo > existingFrom) {
        return {
          valid: false,
          reason: `COMMISSION_MATRIX_RANGE_OVERLAP: Effective range [${newMatrix.effective_from}, ${newMatrix.effective_to || 'infinity'}) overlaps with existing matrix version '${existing.version}' [${existing.effective_from}, ${existing.effective_to || 'infinity'}) for site '${newMatrix.site_id}'`
        };
      }
    }

    return { valid: true };
  }

  /**
   * Evaluates if a timestamp falls within a versioned interval [effective_from, effective_to).
   */
  static isTimestampInInterval(timestamp: Date, effectiveFrom: string, effectiveTo: string | null): boolean {
    const t = timestamp.getTime();
    const from = new Date(effectiveFrom).getTime();
    const to = effectiveTo ? new Date(effectiveTo).getTime() : Infinity;
    return t >= from && t < to;
  }
  /**
   * Returns baseline site policies. MLA is VERIFIED (24h Last Valid Click).
   * MLB, MLM, MLC are UNKNOWN (blocked fail-closed until officially verified).
   */
  static getBaselineSitePolicies(): VersionedSitePolicy[] {
    const now = new Date('2026-09-09T00:00:00Z').toISOString();
    return [
      {
        site_id: 'MLA',
        policy_version: '2026-09-MLA-V1',
        policy_status: 'VERIFIED',
        attribution_window_hours: 24,
        attribution_model: 'LAST_VALID_CLICK',
        source_url: 'https://www.mercadolibre.com.ar/l/afiliados-ventana-de-atribucion',
        observed_at: now,
        effective_from: '2026-01-01T00:00:00Z',
        effective_to: null
      },
      {
        site_id: 'MLB',
        policy_version: '2026-09-MLB-UNVERIFIED',
        policy_status: 'UNKNOWN',
        attribution_window_hours: 24,
        attribution_model: 'LAST_VALID_CLICK',
        source_url: 'NOT_VERIFIED',
        observed_at: now,
        effective_from: '2026-01-01T00:00:00Z',
        effective_to: null
      },
      {
        site_id: 'MLM',
        policy_version: '2026-09-MLM-UNVERIFIED',
        policy_status: 'UNKNOWN',
        attribution_window_hours: 24,
        attribution_model: 'LAST_VALID_CLICK',
        source_url: 'NOT_VERIFIED',
        observed_at: now,
        effective_from: '2026-01-01T00:00:00Z',
        effective_to: null
      }
    ];
  }

  /**
   * Evaluates if a given Mercado Libre site has a verified commercial policy.
   * Fails closed: returns BLOCKED if site policy is UNKNOWN or missing.
   */
  static evaluateSitePolicy(
    siteId: MercadoLibreSiteId,
    policies: VersionedSitePolicy[] = CommissionEngine.getBaselineSitePolicies()
  ): { allowed: boolean; policy?: VersionedSitePolicy; reason?: string } {
    const pol = policies.find((p) => p.site_id === siteId);

    if (!pol) {
      return {
        allowed: false,
        reason: `MISSING_SITE_POLICY: No policy found for site '${siteId}' (fail-closed)`
      };
    }

    if (pol.policy_status === 'UNKNOWN') {
      return {
        allowed: false,
        reason: `UNKNOWN_SITE_POLICY_BLOCKED: Commercial policy for site '${siteId}' is UNKNOWN (fail-closed)`
      };
    }

    if (pol.policy_status === 'BLOCKED') {
      return {
        allowed: false,
        reason: `SITE_POLICY_BLOCKED: Site '${siteId}' is explicitly blocked`
      };
    }

    if (pol.policy_status === 'VERIFIED') {
      return { allowed: true, policy: pol };
    }

    return { allowed: false, reason: `UNRECOGNIZED_SITE_STATUS: '${pol.policy_status}'` };
  }

  /**
   * Calculates the projected affiliate commission for an item.
   * Fails closed if site policy is not verified, category rule is not found, or category is ineligible.
   */
  static computeCommission(
    saleAmount: number,
    categoryId: string,
    siteId: MercadoLibreSiteId,
    rules: CommissionRule[],
    sitePolicies: VersionedSitePolicy[] = CommissionEngine.getBaselineSitePolicies()
  ): CommissionCalculationResult {
    // 1. Site Policy Gate (Fail-Closed)
    const siteCheck = CommissionEngine.evaluateSitePolicy(siteId, sitePolicies);
    if (!siteCheck.allowed || !siteCheck.policy) {
      return {
        is_commissionable: false,
        sale_amount: saleAmount,
        commission_rate_percent: 0,
        computed_commission: 0,
        attribution_window_hours: 0,
        attribution_model: 'LAST_VALID_CLICK',
        reason: siteCheck.reason
      };
    }

    const attributionHours = siteCheck.policy.attribution_window_hours;

    // 2. Category Rule Gate
    const rule = rules.find((r) => r.category_id === categoryId && r.site_id === siteId);

    if (!rule) {
      return {
        is_commissionable: false,
        sale_amount: saleAmount,
        commission_rate_percent: 0,
        computed_commission: 0,
        attribution_window_hours: attributionHours,
        attribution_model: 'LAST_VALID_CLICK',
        reason: `MISSING_CATEGORY_RULE: No commission rule found for category '${categoryId}' on site '${siteId}'`
      };
    }

    if (!rule.is_eligible) {
      return {
        is_commissionable: false,
        sale_amount: saleAmount,
        commission_rate_percent: 0,
        computed_commission: 0,
        attribution_window_hours: attributionHours,
        attribution_model: 'LAST_VALID_CLICK',
        reason: `CATEGORY_EXCLUDED: Category '${rule.category_name}' (${categoryId}) is explicitly excluded from commission on site '${siteId}'`
      };
    }

    if (saleAmount < rule.min_price_threshold) {
      return {
        is_commissionable: false,
        sale_amount: saleAmount,
        commission_rate_percent: rule.commission_rate_percent,
        computed_commission: 0,
        attribution_window_hours: attributionHours,
        attribution_model: 'LAST_VALID_CLICK',
        reason: `BELOW_MIN_PRICE: Sale amount ${saleAmount} is below category threshold ${rule.min_price_threshold}`
      };
    }

    // Compute raw commission
    let rawCommission = (saleAmount * rule.commission_rate_percent) + rule.fixed_commission_amount;

    // Apply cap if defined
    if (rule.max_commission_cap !== null && rawCommission > rule.max_commission_cap) {
      rawCommission = rule.max_commission_cap;
    }

    const computed_commission = Math.round(rawCommission * 10000) / 10000;

    return {
      is_commissionable: true,
      sale_amount: saleAmount,
      commission_rate_percent: rule.commission_rate_percent,
      computed_commission,
      attribution_window_hours: attributionHours,
      attribution_model: 'LAST_VALID_CLICK'
    };
  }

  /**
   * Evaluates if a conversion occurred within the strict attribution window.
   */
  static isWithinAttributionWindow(
    clickTimestamp: Date,
    conversionTimestamp: Date,
    attributionWindowHours: number = 24
  ): boolean {
    const diffMs = conversionTimestamp.getTime() - clickTimestamp.getTime();
    if (diffMs < 0) return false;
    const maxMs = attributionWindowHours * 3600 * 1000;
    return diffMs <= maxMs;
  }
}
