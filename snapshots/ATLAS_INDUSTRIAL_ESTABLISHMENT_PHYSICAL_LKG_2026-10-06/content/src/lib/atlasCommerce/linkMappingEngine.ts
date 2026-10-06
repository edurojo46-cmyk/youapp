/**
 * Atlas Commerce V1 — Link & Campaign Label Mapping Engine (Gate Zero Closure)
 * Enforces official Mercado Libre label rules:
 * - Max 30 characters
 * - Only lowercase letters and numbers [a-z0-9] (no dashes, underscores, spaces, or special characters)
 * - Max 100 distinct labels per affiliate account
 * - Low-cardinality campaign grouping mapped to internal high-cardinality Atlas UUIDs
 */

import { OfficialLinkMapping } from './types';
import * as crypto from 'crypto';

export class LinkMappingEngine {
  public static readonly MAX_LABEL_LENGTH = 30;
  public static readonly MAX_LABELS_PER_ACCOUNT = 100;
  public static readonly VALID_LABEL_REGEX = /^[a-z0-9]{1,30}$/;

  /**
   * Validates that an official Mercado Libre campaign label adheres strictly to ML rules:
   * 1. Between 1 and 30 characters
   * 2. Only lowercase alphanumeric [a-z0-9]
   */
  static validateOfficialLabel(label: string): { valid: boolean; reason?: string } {
    if (!label || typeof label !== 'string') {
      return { valid: false, reason: 'INVALID_LABEL: Label must be a non-empty string' };
    }

    if (label.length > LinkMappingEngine.MAX_LABEL_LENGTH) {
      return {
        valid: false,
        reason: `LABEL_TOO_LONG: Label length (${label.length}) exceeds Mercado Libre maximum of ${LinkMappingEngine.MAX_LABEL_LENGTH} chars`
      };
    }

    if (!LinkMappingEngine.VALID_LABEL_REGEX.test(label)) {
      return {
        valid: false,
        reason: `INVALID_LABEL_CHARACTERS: Label '${label}' must contain only lowercase letters and numbers [a-z0-9] (no spaces, dashes, or special chars)`
      };
    }

    return { valid: true };
  }

  /**
   * Checks whether adding a new label would exceed the 100-label quota per Mercado Libre account.
   */
  static checkAccountLabelQuota(existingLabels: Set<string> | string[], newLabel: string): { allowed: boolean; reason?: string } {
    const labelSet = new Set(existingLabels);
    if (labelSet.has(newLabel)) {
      return { allowed: true }; // Existing label reused -> no quota increase
    }

    if (labelSet.size >= LinkMappingEngine.MAX_LABELS_PER_ACCOUNT) {
      return {
        allowed: false,
        reason: `LABEL_QUOTA_EXCEEDED: Account has reached maximum of ${LinkMappingEngine.MAX_LABELS_PER_ACCOUNT} official labels in Mercado Libre`
      };
    }

    return { allowed: true };
  }

  /**
   * Registers an official link mapping linking the internal Atlas execution identity (UUID)
   * to a low-cardinality official Mercado Libre label (e.g. "atlas01") and the official URL.
   */
  static createLinkMapping(params: {
    tenantId: string;
    executionId: string;
    costId: string;
    campaignId: string;
    officialMlLabel: string;
    officialGeneratedUrl: string;
    accountExistingLabels?: Set<string> | string[];
  }): OfficialLinkMapping {
    // 1. Validate label structure
    const labelVal = LinkMappingEngine.validateOfficialLabel(params.officialMlLabel);
    if (!labelVal.valid) {
      throw new Error(`FAIL-CLOSED: ${labelVal.reason}`);
    }

    // 2. Validate account label quota
    if (params.accountExistingLabels) {
      const quotaCheck = LinkMappingEngine.checkAccountLabelQuota(params.accountExistingLabels, params.officialMlLabel);
      if (!quotaCheck.allowed) {
        throw new Error(`FAIL-CLOSED: ${quotaCheck.reason}`);
      }
    }

    // 3. Validate official URL
    const urlVal = LinkMappingEngine.validateAffiliateUrlStructure(params.officialGeneratedUrl);
    if (!urlVal.valid) {
      throw new Error(`FAIL-CLOSED: ${urlVal.reason}`);
    }

    const internalTrackingId = crypto.randomUUID();

    return {
      internal_tracking_id: internalTrackingId,
      tenant_id: params.tenantId,
      execution_id: params.executionId,
      costId: params.costId,
      campaign_id: params.campaignId,
      official_ml_label: params.officialMlLabel,
      official_generated_url: params.officialGeneratedUrl,
      created_at: new Date().toISOString()
    };
  }

  /**
   * Validates that an affiliate URL matches official Mercado Libre domains.
   */
  static validateAffiliateUrlStructure(urlStr: string): { valid: boolean; reason?: string } {
    try {
      const parsed = new URL(urlStr);
      const host = parsed.hostname.toLowerCase();

      const isMlDomain =
        host === 'mercadolibre.com.ar' ||
        host === 'articulo.mercadolibre.com.ar' ||
        host.endsWith('.mercadolibre.com.ar') ||
        host === 'mercadolivre.com.br' ||
        host.endsWith('.mercadolivre.com.br') ||
        host === 'mercadolibre.com.mx' ||
        host.endsWith('.mercadolibre.com.mx') ||
        host === 'meli.la'; // Official short link domain

      if (!isMlDomain) {
        return { valid: false, reason: `UNTRUSTED_DOMAIN: Host '${host}' is not an official Mercado Libre domain` };
      }

      if (parsed.protocol !== 'https:') {
        return { valid: false, reason: `INSECURE_PROTOCOL: Expected https, got ${parsed.protocol}` };
      }

      return { valid: true };
    } catch (e: any) {
      return { valid: false, reason: `MALFORMED_URL: ${e.message}` };
    }
  }
}
