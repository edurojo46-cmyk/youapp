/**
 * Atlas Commerce V1 — Conversion Lifecycle & 10H Bridge Engine (Gate Zero Closure)
 * Enforces:
 * 1. Source Capability Check: UNKNOWN source types (PARTNER_API/PARTNER_WEBHOOK) fail closed.
 * 2. Strict No Time-Based Auto-Validation: 60 days elapsed NEVER auto-validates. Partner confirmation is required.
 * 3. Idempotent Deduplication Key: UNIQUE(tenant_id, partner_id, site_id, external_order_id, external_item_id, event_type).
 */

import { IngestedPartnerEvent, CommissionLifecycleState, ConversionSourceCapability } from './types';
import * as crypto from 'crypto';

export interface ConversionRecord {
  conversion_id: string;
  tenant_id: string;
  partner_id: 'MERCADO_LIBRE';
  site_id: string;
  external_order_id: string;
  external_item_id: string;
  event_type: 'PURCHASE' | 'REFUND';
  lifecycle_state: CommissionLifecycleState;
  sale_amount: number;
  commission_amount: number;
  campaign_label: string | null;
  occurred_at: string;
  ingested_at: string;
  validated_at: string | null;
  outcome_event_id: string | null;
  reverses_conversion_id: string | null;
}

export class ConversionLifecycleEngine {
  /**
   * Baseline verified capabilities for Mercado Libre conversion sources.
   * Portal Report and File Import are PROVEN. Webhook and Direct API are UNKNOWN (blocked).
   */
  static getBaselineSourceCapabilities(): ConversionSourceCapability[] {
    return [
      {
        source_type: 'PORTAL_REPORT',
        partner_id: 'MERCADO_LIBRE',
        capability_status: 'PROVEN',
        documentation_source: 'https://www.mercadolibre.com.ar/l/afiliados-metricas',
        verified_at: '2026-09-09T00:00:00Z'
      },
      {
        source_type: 'FILE_IMPORT',
        partner_id: 'MERCADO_LIBRE',
        capability_status: 'PROVEN',
        documentation_source: 'https://www.mercadolibre.com.ar/l/afiliados-metricas',
        verified_at: '2026-09-09T00:00:00Z'
      },
      {
        source_type: 'PARTNER_API',
        partner_id: 'MERCADO_LIBRE',
        capability_status: 'UNKNOWN',
        documentation_source: 'NOT_DOCUMENTED',
        verified_at: null
      },
      {
        source_type: 'PARTNER_WEBHOOK',
        partner_id: 'MERCADO_LIBRE',
        capability_status: 'UNKNOWN',
        documentation_source: 'NOT_DOCUMENTED',
        verified_at: null
      }
    ];
  }

  /**
   * Computes the deterministic deduplication fingerprint for an affiliate conversion fact.
   */
  static generateDeduplicationKey(
    tenantId: string,
    partnerId: string,
    siteId: string,
    orderId: string,
    itemId: string,
    eventType: string
  ): string {
    return `${tenantId}::${partnerId}::${siteId}::${orderId}::${itemId}::${eventType}`;
  }

  /**
   * Validates if a conversion source is officially PROVEN.
   * UNKNOWN or DISABLED source types are strictly rejected (fail-closed).
   */
  static validateSourceCapability(
    sourceType: IngestedPartnerEvent['source_type'],
    capabilities: ConversionSourceCapability[] = ConversionLifecycleEngine.getBaselineSourceCapabilities()
  ): { allowed: boolean; reason?: string } {
    const cap = capabilities.find((c) => c.source_type === sourceType && c.partner_id === 'MERCADO_LIBRE');

    if (!cap || cap.capability_status === 'UNKNOWN') {
      return {
        allowed: false,
        reason: `SOURCE_CAPABILITY_UNKNOWN_BLOCKED: Ingestion source '${sourceType}' is UNKNOWN for Mercado Libre Affiliates (fail-closed)`
      };
    }

    if (cap.capability_status === 'DISABLED') {
      return {
        allowed: false,
        reason: `SOURCE_CAPABILITY_DISABLED: Ingestion source '${sourceType}' is disabled`
      };
    }

    if (cap.capability_status === 'PROVEN') {
      return { allowed: true };
    }

    return { allowed: false, reason: `UNRECOGNIZED_CAPABILITY_STATUS: '${cap.capability_status}'` };
  }

  /**
   * Evaluates whether time elapsed (e.g. 60+ days) can automatically transition a commission to VALIDATED.
   * STRICT CONTRACT: Time elapsed alone NEVER auto-validates a commission.
   * It MUST remain COMMISSION_PENDING until an authoritative Mercado Libre report confirms delivery without return.
   */
  static evaluateElapsedDays(
    record: ConversionRecord,
    daysElapsed: number
  ): { lifecycle_state: CommissionLifecycleState; auto_validated: boolean; reason: string } {
    return {
      lifecycle_state: record.lifecycle_state,
      auto_validated: false,
      reason: `NO_TIME_AUTO_VALIDATION: Commission remains in '${record.lifecycle_state}' after ${daysElapsed} days. Only official Mercado Libre confirmation can transition to COMMISSION_VALIDATED.`
    };
  }

  /**
   * Evaluates the lifecycle transition for an ingested partner event.
   */
  static processPartnerEvent(
    event: IngestedPartnerEvent,
    tenantId: string,
    existingConversions: Map<string, ConversionRecord>,
    siteId: string = 'MLA',
    capabilities: ConversionSourceCapability[] = ConversionLifecycleEngine.getBaselineSourceCapabilities()
  ): {
    action: 'INSERTED_PENDING' | 'VALIDATED_EARNED' | 'REFUNDED' | 'IDEMPOTENT_IGNORED' | 'BLOCKED_UNPROVEN_SOURCE';
    reason?: string;
    conversion?: ConversionRecord;
    outcome_to_project?: {
      source_system: 'MERCADO_LIBRE';
      event_type: 'PURCHASE' | 'REFUND';
      business_domain: 'COMMERCE';
      event_class: 'OBSERVED';
      source_event_id: string;
      payload_hash: string;
      reverses_event_id?: string;
    };
  } {
    // 1. Source Capability Gate (Fail-Closed)
    const sourceCheck = ConversionLifecycleEngine.validateSourceCapability(event.source_type, capabilities);
    if (!sourceCheck.allowed) {
      return {
        action: 'BLOCKED_UNPROVEN_SOURCE',
        reason: sourceCheck.reason
      };
    }

    const eventType = event.status === 'REFUNDED' || event.status === 'CANCELLED' ? 'REFUND' : 'PURCHASE';
    const dedupeKey = ConversionLifecycleEngine.generateDeduplicationKey(
      tenantId,
      'MERCADO_LIBRE',
      siteId,
      event.order_id,
      event.item_id,
      eventType
    );

    const existing = existingConversions.get(dedupeKey);

    // 2. Idempotency Guard
    if (existing) {
      if (
        (event.status === 'REPORTED' && existing.lifecycle_state === 'COMMISSION_PENDING') ||
        (event.status === 'VALIDATED' && existing.lifecycle_state === 'COMMISSION_VALIDATED') ||
        (event.status === 'REFUNDED' && existing.lifecycle_state === 'REFUND')
      ) {
        return { action: 'IDEMPOTENT_IGNORED', conversion: existing };
      }
    }

    // 3. Handle Initial Reported Sale -> COMMISSION_PENDING
    if (event.status === 'REPORTED') {
      const convRecord: ConversionRecord = {
        conversion_id: crypto.randomUUID(),
        tenant_id: tenantId,
        partner_id: 'MERCADO_LIBRE',
        site_id: siteId,
        external_order_id: event.order_id,
        external_item_id: event.item_id,
        event_type: 'PURCHASE',
        lifecycle_state: 'COMMISSION_PENDING',
        sale_amount: event.sale_amount,
        commission_amount: event.commission_amount,
        campaign_label: event.campaign_label,
        occurred_at: event.observed_at,
        ingested_at: new Date().toISOString(),
        validated_at: null,
        outcome_event_id: null,
        reverses_conversion_id: null
      };

      existingConversions.set(dedupeKey, convRecord);
      return { action: 'INSERTED_PENDING', conversion: convRecord };
    }

    // 4. Handle Confirmed Validation by Mercado Libre -> COMMISSION_VALIDATED (earned)
    if (event.status === 'VALIDATED') {
      const convRecord: ConversionRecord = existing || {
        conversion_id: crypto.randomUUID(),
        tenant_id: tenantId,
        partner_id: 'MERCADO_LIBRE',
        site_id: siteId,
        external_order_id: event.order_id,
        external_item_id: event.item_id,
        event_type: 'PURCHASE',
        lifecycle_state: 'COMMISSION_VALIDATED',
        sale_amount: event.sale_amount,
        commission_amount: event.commission_amount,
        campaign_label: event.campaign_label,
        occurred_at: event.observed_at,
        ingested_at: new Date().toISOString(),
        validated_at: new Date().toISOString(),
        outcome_event_id: null,
        reverses_conversion_id: null
      };

      convRecord.lifecycle_state = 'COMMISSION_VALIDATED';
      convRecord.validated_at = new Date().toISOString();
      existingConversions.set(dedupeKey, convRecord);

      const payloadHash = crypto.createHash('sha256')
        .update(JSON.stringify({ order_id: event.order_id, item_id: event.item_id, amount: event.commission_amount }))
        .digest('hex');

      return {
        action: 'VALIDATED_EARNED',
        conversion: convRecord,
        outcome_to_project: {
          source_system: 'MERCADO_LIBRE',
          event_type: 'PURCHASE',
          business_domain: 'COMMERCE',
          event_class: 'OBSERVED',
          source_event_id: `ml-purchase-${event.order_id}-${event.item_id}`,
          payload_hash: payloadHash
        }
      };
    }

    // 5. Handle Reversal / Refund -> REFUND
    if (event.status === 'REFUNDED' || event.status === 'CANCELLED') {
      const originalPurchaseKey = ConversionLifecycleEngine.generateDeduplicationKey(
        tenantId,
        'MERCADO_LIBRE',
        siteId,
        event.order_id,
        event.item_id,
        'PURCHASE'
      );
      const originalPurchase = existingConversions.get(originalPurchaseKey);

      const convRecord: ConversionRecord = {
        conversion_id: crypto.randomUUID(),
        tenant_id: tenantId,
        partner_id: 'MERCADO_LIBRE',
        site_id: siteId,
        external_order_id: event.order_id,
        external_item_id: event.item_id,
        event_type: 'REFUND',
        lifecycle_state: 'REFUND',
        sale_amount: -event.sale_amount,
        commission_amount: -event.commission_amount,
        campaign_label: event.campaign_label,
        occurred_at: event.observed_at,
        ingested_at: new Date().toISOString(),
        validated_at: new Date().toISOString(),
        outcome_event_id: null,
        reverses_conversion_id: originalPurchase ? originalPurchase.conversion_id : null
      };

      existingConversions.set(dedupeKey, convRecord);

      const payloadHash = crypto.createHash('sha256')
        .update(JSON.stringify({ order_id: event.order_id, item_id: event.item_id, reversal: true }))
        .digest('hex');

      return {
        action: 'REFUNDED',
        conversion: convRecord,
        outcome_to_project: {
          source_system: 'MERCADO_LIBRE',
          event_type: 'REFUND',
          business_domain: 'COMMERCE',
          event_class: 'OBSERVED',
          source_event_id: `ml-refund-${event.order_id}-${event.item_id}`,
          payload_hash: payloadHash,
          reverses_event_id: originalPurchase?.outcome_event_id || undefined
        }
      };
    }

    return { action: 'IDEMPOTENT_IGNORED' };
  }
}
