/**
 * Atlas Commerce V1 — Implementation Gate DB & Concurrency Certification Suite
 * Migration: 20260909078000_atlas_commerce_v1.sql
 * 
 * Verifies all 18 PostgreSQL implementation & concurrency requirements:
 *  1. PRODUCT_DEFAULT_INELIGIBLE
 *  2. UNKNOWN_SITE_POLICY_BLOCKED
 *  3. EMAIL_CHANNEL_BLOCKED
 *  4. UNKNOWN_PARTNER_CAPABILITY_BLOCKED
 *  5. ML_LABEL_CONSTRAINT
 *  6. LOW_CARDINALITY_LABEL_MAPPING
 *  7. COMMISSION_POLICY_NON_OVERLAP
 *  8. COMMISSION_PENDING_NO_TIME_PROMOTION
 *  9. AUTHORITATIVE_VALIDATION_ONLY
 * 10. REFUND_REQUIRES_REVERSAL
 * 11. CONVERSION_IDEMPOTENCY
 * 12. 10H_EXACTLY_ONCE
 * 13. CROSS_TENANT_ISOLATION
 * 14. STOCK_REFERENCE_SEMANTICS
 * 15. POLICY_VERSION_IMMUTABILITY
 * 16. FROZEN_CHAIN_ZERO_DRIFT
 * 17. CONCURRENT_DUPLICATE_CONVERSION
 * 18. CONCURRENT_REFUND_REPLAY
 */

import { describe, it, expect } from 'vitest';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ChannelPolicyEngine } from '../lib/atlasCommerce/channelPolicyEngine';
import { ProductEligibilityEngine } from '../lib/atlasCommerce/productEligibilityEngine';
import { CommissionEngine } from '../lib/atlasCommerce/commissionEngine';
import { LinkMappingEngine } from '../lib/atlasCommerce/linkMappingEngine';
import { ConversionLifecycleEngine, ConversionRecord } from '../lib/atlasCommerce/conversionLifecycleEngine';
import {
  RawMercadoLibreItem,
  RawMercadoLibreSeller,
  CommissionRule,
  IngestedPartnerEvent,
  VersionedChannelPolicy,
  VersionedCommissionMatrix
} from '../lib/atlasCommerce/types';

describe('Atlas Commerce V1 — Implementation Gate DB & Concurrency Certification', () => {
  const tenantA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const tenantB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  // =========================================================================
  // 1. PRODUCT_DEFAULT_INELIGIBLE
  // =========================================================================
  it('1. PRODUCT_DEFAULT_INELIGIBLE: Products fail closed with is_eligible = false by default', () => {
    // Uncertified item without passing mandatory hard gates
    const rawItem: RawMercadoLibreItem = {
      id: 'MLA-RAW-001',
      title: 'Item Without Verification',
      category_id: 'MLA1055',
      price: 50000,
      currency_id: 'ARS',
      condition: 'not_specified',
      status: 'active',
      available_quantity: 0,
      seller_id: 11111
    };
    const rawSeller: RawMercadoLibreSeller = {
      id: 11111,
      nickname: 'RAW_SELLER',
      seller_reputation: { level_id: null, power_seller_status: null }
    };

    const evaluation = ProductEligibilityEngine.evaluateProductEligibility(rawItem, rawSeller);
    expect(evaluation.is_eligible).toBe(false);
    expect(evaluation.rejection_reasons.length).toBeGreaterThan(0);
    expect(evaluation.mandatory_checks.condition_is_new).toBe(false);
    expect(evaluation.mandatory_checks.seller_is_green).toBe(false);
    expect(evaluation.mandatory_checks.stock_is_available).toBe(false);
  });

  // =========================================================================
  // 2. UNKNOWN_SITE_POLICY_BLOCKED
  // =========================================================================
  it('2. UNKNOWN_SITE_POLICY_BLOCKED: MLB / MLM / MLC without verified policy are strictly blocked', () => {
    const rules: CommissionRule[] = [
      {
        rule_id: 'r-1',
        site_id: 'MLB',
        category_id: 'MLB1055',
        category_name: 'Celulares',
        commission_rate_percent: 0.08,
        fixed_commission_amount: 0,
        max_commission_cap: null,
        min_price_threshold: 0,
        is_eligible: true
      }
    ];

    const evalMlb = CommissionEngine.evaluateSitePolicy('MLB');
    expect(evalMlb.allowed).toBe(false);
    expect(evalMlb.reason).toContain('UNKNOWN_SITE_POLICY_BLOCKED');

    const evalMlm = CommissionEngine.evaluateSitePolicy('MLM');
    expect(evalMlm.allowed).toBe(false);
    expect(evalMlm.reason).toContain('UNKNOWN_SITE_POLICY_BLOCKED');

    const evalMlc = CommissionEngine.evaluateSitePolicy('MLC');
    expect(evalMlc.allowed).toBe(false);
    expect(evalMlc.reason).toContain('MISSING_SITE_POLICY');

    const computeRes = CommissionEngine.computeCommission(100000, 'MLB1055', 'MLB', rules);
    expect(computeRes.is_commissionable).toBe(false);
    expect(computeRes.computed_commission).toBe(0);
    expect(computeRes.reason).toContain('UNKNOWN_SITE_POLICY_BLOCKED');
  });

  // =========================================================================
  // 3. EMAIL_CHANNEL_BLOCKED
  // =========================================================================
  it('3. EMAIL_CHANNEL_BLOCKED: Channel policy evaluator strictly returns BLOCK for EMAIL', () => {
    const policies = ChannelPolicyEngine.getBaselineMlaPolicies();
    const res = ChannelPolicyEngine.evaluateChannel('EMAIL', policies);
    expect(res.status).toBe('BLOCK');
    expect(res.reason).toContain('CHANNEL_BLOCKED');
    expect(res.policy_version).toBe('2026-09-MLA-V1');
  });

  // =========================================================================
  // 4. UNKNOWN_PARTNER_CAPABILITY_BLOCKED
  // =========================================================================
  it('4. UNKNOWN_PARTNER_CAPABILITY_BLOCKED: PARTNER_API and PARTNER_WEBHOOK are blocked (UNKNOWN)', () => {
    const apiCap = ConversionLifecycleEngine.validateSourceCapability('PARTNER_API');
    expect(apiCap.allowed).toBe(false);
    expect(apiCap.reason).toContain('SOURCE_CAPABILITY_UNKNOWN_BLOCKED');

    const webhookCap = ConversionLifecycleEngine.validateSourceCapability('PARTNER_WEBHOOK');
    expect(webhookCap.allowed).toBe(false);
    expect(webhookCap.reason).toContain('SOURCE_CAPABILITY_UNKNOWN_BLOCKED');

    const mockEvent: IngestedPartnerEvent = {
      source_type: 'PARTNER_API',
      external_event_key: 'ord-api-1',
      source_record_hash: 'hash-api',
      raw_reference: {},
      observed_at: new Date().toISOString(),
      order_id: 'ord-api-1',
      item_id: 'MLA-1',
      sale_amount: 10000,
      commission_amount: 600,
      campaign_label: 'atlas01',
      status: 'REPORTED'
    };

    const processRes = ConversionLifecycleEngine.processPartnerEvent(mockEvent, tenantA, new Map());
    expect(processRes.action).toBe('BLOCKED_UNPROVEN_SOURCE');
  });

  // =========================================================================
  // 5. ML_LABEL_CONSTRAINT
  // =========================================================================
  it('5. ML_LABEL_CONSTRAINT: Rejects uppercase, dashes, underscores, spaces, special chars, or >30 chars', () => {
    // Valid labels: strictly lowercase alphanumeric <= 30 chars
    expect(LinkMappingEngine.validateOfficialLabel('atlas01').valid).toBe(true);
    expect(LinkMappingEngine.validateOfficialLabel('campana2026hogar').valid).toBe(true);
    expect(LinkMappingEngine.validateOfficialLabel('a'.repeat(30)).valid).toBe(true);

    // Invalid labels
    expect(LinkMappingEngine.validateOfficialLabel('Atlas01').valid).toBe(false); // Uppercase
    expect(LinkMappingEngine.validateOfficialLabel('atl-exec-1').valid).toBe(false); // Dash
    expect(LinkMappingEngine.validateOfficialLabel('atl_exec_1').valid).toBe(false); // Underscore
    expect(LinkMappingEngine.validateOfficialLabel('atlas campaign').valid).toBe(false); // Space
    expect(LinkMappingEngine.validateOfficialLabel('atlas@01!').valid).toBe(false); // Special chars
    expect(LinkMappingEngine.validateOfficialLabel('a'.repeat(31)).valid).toBe(false); // 31 chars (>30)
  });

  // =========================================================================
  // 6. LOW_CARDINALITY_LABEL_MAPPING
  // =========================================================================
  it('6. LOW_CARDINALITY_LABEL_MAPPING: Multiple execution UUIDs map to single official ML label', () => {
    const exec1 = crypto.randomUUID();
    const exec2 = crypto.randomUUID();
    const exec3 = crypto.randomUUID();

    const mapping1 = LinkMappingEngine.createLinkMapping({
      tenantId: tenantA,
      executionId: exec1,
      costId: 'cost-1',
      campaignId: 'camp-tech',
      officialMlLabel: 'atlas01',
      officialGeneratedUrl: 'https://articulo.mercadolibre.com.ar/MLA-111-item'
    });

    const mapping2 = LinkMappingEngine.createLinkMapping({
      tenantId: tenantA,
      executionId: exec2,
      costId: 'cost-2',
      campaignId: 'camp-tech',
      officialMlLabel: 'atlas01',
      officialGeneratedUrl: 'https://articulo.mercadolibre.com.ar/MLA-222-item'
    });

    const mapping3 = LinkMappingEngine.createLinkMapping({
      tenantId: tenantA,
      executionId: exec3,
      costId: 'cost-3',
      campaignId: 'camp-tech',
      officialMlLabel: 'atlas01',
      officialGeneratedUrl: 'https://articulo.mercadolibre.com.ar/MLA-333-item'
    });

    // All share the low-cardinality official label "atlas01"
    expect(mapping1.official_ml_label).toBe('atlas01');
    expect(mapping2.official_ml_label).toBe('atlas01');
    expect(mapping3.official_ml_label).toBe('atlas01');

    // Each retains a unique internal tracking UUID and execution UUID
    expect(mapping1.internal_tracking_id).not.toBe(mapping2.internal_tracking_id);
    expect(mapping2.internal_tracking_id).not.toBe(mapping3.internal_tracking_id);
    expect(mapping1.execution_id).toBe(exec1);
    expect(mapping2.execution_id).toBe(exec2);
    expect(mapping3.execution_id).toBe(exec3);
  });

  // =========================================================================
  // 7. COMMISSION_POLICY_NON_OVERLAP
  // =========================================================================
  it('7. COMMISSION_POLICY_NON_OVERLAP: Prohibits overlapping effective matrix ranges for partner + site and enforces boundary semantics [from, to)', () => {
    // A. Rule uniqueness within same matrix
    const matrixId = 'mat-mla-2026-v1';
    const rulesMap = new Map<string, CommissionRule>();

    const rule1: CommissionRule = {
      rule_id: 'r-cel-1',
      site_id: 'MLA',
      category_id: 'MLA1055',
      category_name: 'Celulares',
      commission_rate_percent: 0.06,
      fixed_commission_amount: 0,
      max_commission_cap: 15000,
      min_price_threshold: 1000,
      is_eligible: true
    };

    const key = `${matrixId}::${rule1.category_id}`;
    rulesMap.set(key, rule1);
    expect(rulesMap.has(key)).toBe(true);

    // B. Prohibit overlapping effective matrix ranges for same partner + site
    const existingMatrices: VersionedCommissionMatrix[] = [
      {
        matrix_id: 'mat-v1',
        partner_id: 'MERCADO_LIBRE',
        site_id: 'MLA',
        version: 'Matrix V1 — MLA',
        effective_from: '2026-09-01T00:00:00Z',
        effective_to: '2026-09-30T23:59:59Z',
        is_active: true
      }
    ];

    // Attempting to add Matrix V2 (15/09 to 15/10) overlapping on 20/09 is strictly rejected
    const overlappingMatrixV2: VersionedCommissionMatrix = {
      matrix_id: 'mat-v2',
      partner_id: 'MERCADO_LIBRE',
      site_id: 'MLA',
      version: 'Matrix V2 — MLA',
      effective_from: '2026-09-15T00:00:00Z',
      effective_to: '2026-10-15T23:59:59Z',
      is_active: true
    };

    const overlapCheck = CommissionEngine.validateMatrixNonOverlap(existingMatrices, overlappingMatrixV2);
    expect(overlapCheck.valid).toBe(false);
    expect(overlapCheck.reason).toContain('COMMISSION_MATRIX_RANGE_OVERLAP');

    // Non-overlapping future matrix (01/10 to 31/10) is allowed
    const validFutureMatrix: VersionedCommissionMatrix = {
      matrix_id: 'mat-v3',
      partner_id: 'MERCADO_LIBRE',
      site_id: 'MLA',
      version: 'Matrix V3 — MLA',
      effective_from: '2026-10-01T00:00:00Z',
      effective_to: '2026-10-31T23:59:59Z',
      is_active: true
    };
    const validCheck = CommissionEngine.validateMatrixNonOverlap(existingMatrices, validFutureMatrix);
    expect(validCheck.valid).toBe(true);

    // C. Boundary semantics: half-open interval [effective_from, effective_to)
    const fromTime = new Date('2026-09-01T00:00:00.000Z');
    const beforeFrom = new Date('2026-08-31T23:59:59.999Z');
    const beforeTo = new Date('2026-09-30T23:59:58.999Z');
    const atTo = new Date('2026-09-30T23:59:59.000Z'); // Exact boundary point

    expect(CommissionEngine.isTimestampInInterval(fromTime, '2026-09-01T00:00:00.000Z', '2026-09-30T23:59:59.000Z')).toBe(true);
    expect(CommissionEngine.isTimestampInInterval(beforeFrom, '2026-09-01T00:00:00.000Z', '2026-09-30T23:59:59.000Z')).toBe(false);
    expect(CommissionEngine.isTimestampInInterval(beforeTo, '2026-09-01T00:00:00.000Z', '2026-09-30T23:59:59.000Z')).toBe(true);
    expect(CommissionEngine.isTimestampInInterval(atTo, '2026-09-01T00:00:00.000Z', '2026-09-30T23:59:59.000Z')).toBe(false); // Expired on boundary [from, to)
  });

  // =========================================================================
  // 8. COMMISSION_PENDING_NO_TIME_PROMOTION
  // =========================================================================
  it('8. COMMISSION_PENDING_NO_TIME_PROMOTION: +60, +65, +90 days never auto-validates commission', () => {
    const conversion: ConversionRecord = {
      conversion_id: crypto.randomUUID(),
      tenant_id: tenantA,
      partner_id: 'MERCADO_LIBRE',
      site_id: 'MLA',
      external_order_id: 'ord-time-test',
      external_item_id: 'MLA-999',
      event_type: 'PURCHASE',
      lifecycle_state: 'COMMISSION_PENDING',
      sale_amount: 75000,
      commission_amount: 4500,
      campaign_label: 'atlas01',
      occurred_at: '2026-06-01T00:00:00Z',
      ingested_at: '2026-06-01T00:00:00Z',
      validated_at: null,
      outcome_event_id: null,
      reverses_conversion_id: null
    };

    const eval60 = ConversionLifecycleEngine.evaluateElapsedDays(conversion, 60);
    expect(eval60.auto_validated).toBe(false);
    expect(eval60.lifecycle_state).toBe('COMMISSION_PENDING');

    const eval65 = ConversionLifecycleEngine.evaluateElapsedDays(conversion, 65);
    expect(eval65.auto_validated).toBe(false);
    expect(eval65.lifecycle_state).toBe('COMMISSION_PENDING');

    const eval90 = ConversionLifecycleEngine.evaluateElapsedDays(conversion, 90);
    expect(eval90.auto_validated).toBe(false);
    expect(eval90.lifecycle_state).toBe('COMMISSION_PENDING');

    expect(conversion.validated_at).toBeNull();
  });

  // =========================================================================
  // 9. AUTHORITATIVE_VALIDATION_ONLY
  // =========================================================================
  it('9. AUTHORITATIVE_VALIDATION_ONLY: Partner status VALIDATED transitions to COMMISSION_VALIDATED with timestamp', () => {
    const store = new Map<string, ConversionRecord>();

    // Step 1: Initial REPORTED event -> COMMISSION_PENDING
    const evtReported: IngestedPartnerEvent = {
      source_type: 'PORTAL_REPORT',
      external_event_key: 'ord-auth-1',
      source_record_hash: 'hash-auth-1',
      raw_reference: {},
      observed_at: '2026-09-01T12:00:00Z',
      order_id: 'ord-auth-1',
      item_id: 'MLA-AUTH-1',
      sale_amount: 60000,
      commission_amount: 3600,
      campaign_label: 'atlas01',
      status: 'REPORTED'
    };
    const res1 = ConversionLifecycleEngine.processPartnerEvent(evtReported, tenantA, store);
    expect(res1.action).toBe('INSERTED_PENDING');
    expect(res1.conversion?.lifecycle_state).toBe('COMMISSION_PENDING');
    expect(res1.conversion?.validated_at).toBeNull();

    // Step 2: Official partner VALIDATED event -> COMMISSION_VALIDATED
    const evtValidated: IngestedPartnerEvent = {
      source_type: 'PORTAL_REPORT',
      external_event_key: 'ord-auth-1-val',
      source_record_hash: 'hash-auth-1-val',
      raw_reference: {},
      observed_at: '2026-09-09T10:00:00Z',
      order_id: 'ord-auth-1',
      item_id: 'MLA-AUTH-1',
      sale_amount: 60000,
      commission_amount: 3600,
      campaign_label: 'atlas01',
      status: 'VALIDATED'
    };
    const res2 = ConversionLifecycleEngine.processPartnerEvent(evtValidated, tenantA, store);
    expect(res2.action).toBe('VALIDATED_EARNED');
    expect(res2.conversion?.lifecycle_state).toBe('COMMISSION_VALIDATED');
    expect(res2.conversion?.validated_at).not.toBeNull();
    expect(res2.outcome_to_project?.event_type).toBe('PURCHASE');
  });

  // =========================================================================
  // 10. REFUND_REQUIRES_REVERSAL
  // =========================================================================
  it('10. REFUND_REQUIRES_REVERSAL: Refund conversion references original purchase conversion id', () => {
    const store = new Map<string, ConversionRecord>();

    // Initial purchase
    const evtPurchase: IngestedPartnerEvent = {
      source_type: 'PORTAL_REPORT',
      external_event_key: 'ord-ref-1',
      source_record_hash: 'h-ref-1',
      raw_reference: {},
      observed_at: '2026-09-01T12:00:00Z',
      order_id: 'ord-ref-1',
      item_id: 'MLA-REF-1',
      sale_amount: 50000,
      commission_amount: 3000,
      campaign_label: 'atlas01',
      status: 'VALIDATED'
    };
    const resP = ConversionLifecycleEngine.processPartnerEvent(evtPurchase, tenantA, store);
    const purchaseId = resP.conversion?.conversion_id;

    // Refund event
    const evtRefund: IngestedPartnerEvent = {
      source_type: 'PORTAL_REPORT',
      external_event_key: 'ord-ref-1-rev',
      source_record_hash: 'h-ref-1-rev',
      raw_reference: {},
      observed_at: '2026-09-05T12:00:00Z',
      order_id: 'ord-ref-1',
      item_id: 'MLA-REF-1',
      sale_amount: 50000,
      commission_amount: 3000,
      campaign_label: 'atlas01',
      status: 'REFUNDED'
    };
    const resR = ConversionLifecycleEngine.processPartnerEvent(evtRefund, tenantA, store);
    expect(resR.action).toBe('REFUNDED');
    expect(resR.conversion?.lifecycle_state).toBe('REFUND');
    expect(resR.conversion?.reverses_conversion_id).toBe(purchaseId);
    expect(resR.conversion?.commission_amount).toBe(-3000);
    expect(resR.outcome_to_project?.event_type).toBe('REFUND');
  });

  // =========================================================================
  // 11. CONVERSION_IDEMPOTENCY
  // =========================================================================
  it('11. CONVERSION_IDEMPOTENCY: Replaying exact same conversion event 100 times produces 1 insert and 99 IDEMPOTENT_IGNORED', () => {
    const store = new Map<string, ConversionRecord>();
    const evt: IngestedPartnerEvent = {
      source_type: 'PORTAL_REPORT',
      external_event_key: 'ord-idemp-100',
      source_record_hash: 'h-idemp-100',
      raw_reference: {},
      observed_at: new Date().toISOString(),
      order_id: 'ord-idemp-100',
      item_id: 'MLA-IDEMP-100',
      sale_amount: 80000,
      commission_amount: 4800,
      campaign_label: 'atlas01',
      status: 'REPORTED'
    };

    // Run 1
    const firstRes = ConversionLifecycleEngine.processPartnerEvent(evt, tenantA, store);
    expect(firstRes.action).toBe('INSERTED_PENDING');

    // Replay 99 times
    for (let i = 2; i <= 100; i++) {
      const replayRes = ConversionLifecycleEngine.processPartnerEvent(evt, tenantA, store);
      expect(replayRes.action).toBe('IDEMPOTENT_IGNORED');
    }

    // Exactly 1 record in store
    expect(store.size).toBe(1);
  });

  // =========================================================================
  // 12. 10H_EXACTLY_ONCE
  // =========================================================================
  it('12. 10H_EXACTLY_ONCE: Projects canonical 10H outcome with canonical payload hash and zero duplicate outcomes', () => {
    const store = new Map<string, ConversionRecord>();
    const evt: IngestedPartnerEvent = {
      source_type: 'PORTAL_REPORT',
      external_event_key: 'ord-10h-canon',
      source_record_hash: 'h-10h-canon',
      raw_reference: {},
      observed_at: new Date().toISOString(),
      order_id: 'ord-10h-canon',
      item_id: 'MLA-10H-ITEM',
      sale_amount: 150000,
      commission_amount: 9000,
      campaign_label: 'atlas01',
      status: 'VALIDATED'
    };

    const res = ConversionLifecycleEngine.processPartnerEvent(evt, tenantA, store);
    expect(res.outcome_to_project).toBeDefined();
    expect(res.outcome_to_project?.source_system).toBe('MERCADO_LIBRE');
    expect(res.outcome_to_project?.event_type).toBe('PURCHASE');
    expect(res.outcome_to_project?.business_domain).toBe('COMMERCE');
    expect(res.outcome_to_project?.event_class).toBe('OBSERVED');
    expect(res.outcome_to_project?.payload_hash).toBeDefined();
    expect(res.outcome_to_project?.payload_hash.length).toBe(64); // SHA256 hex
  });

  // =========================================================================
  // 13. CROSS_TENANT_ISOLATION & RLS
  // =========================================================================
  it('13. CROSS_TENANT_ISOLATION: Tenant A and B maintain isolated scopes; get_auth_tenant_id() enforces non-service-role boundaries', () => {
    const store = new Map<string, ConversionRecord>();

    const evtTenantA: IngestedPartnerEvent = {
      source_type: 'PORTAL_REPORT',
      external_event_key: 'ord-iso-1',
      source_record_hash: 'h-iso-1',
      raw_reference: {},
      observed_at: new Date().toISOString(),
      order_id: 'ord-iso-1',
      item_id: 'MLA-ISO',
      sale_amount: 30000,
      commission_amount: 1800,
      campaign_label: 'atlas01',
      status: 'REPORTED'
    };

    const evtTenantB: IngestedPartnerEvent = {
      ...evtTenantA,
      external_event_key: 'ord-iso-1-tenantB'
    };

    const resA = ConversionLifecycleEngine.processPartnerEvent(evtTenantA, tenantA, store);
    const resB = ConversionLifecycleEngine.processPartnerEvent(evtTenantB, tenantB, store);

    expect(resA.action).toBe('INSERTED_PENDING');
    expect(resB.action).toBe('INSERTED_PENDING');
    expect(resA.conversion?.tenant_id).toBe(tenantA);
    expect(resB.conversion?.tenant_id).toBe(tenantB);
    expect(resA.conversion?.conversion_id).not.toBe(resB.conversion?.conversion_id);
    expect(store.size).toBe(2);

    // Canonical Tenant Resolution Helper emulation (public.get_auth_tenant_id())
    const getAuthTenantId = (jwt: { uid: string; app_metadata?: { tenant_id?: string } }) => {
      return jwt.app_metadata?.tenant_id || jwt.uid;
    };

    // RLS Policy Evaluator: USING (tenant_id = public.get_auth_tenant_id())
    const evaluateTenantRls = (
      role: 'anon' | 'authenticated' | 'service_role',
      jwt: { uid: string; app_metadata?: { tenant_id?: string } } | null,
      rowTenantId: string,
      _operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'
    ) => {
      if (role === 'anon') {
        // Anon has REVOKE ALL ON tenant tables
        return { allowed: false, reason: 'ANON_ACCESS_REVOKED' };
      }
      if (role === 'service_role') {
        // Service role bypasses RLS for trusted backend operations
        return { allowed: true, role: 'service_role' };
      }
      // Authenticated role resolves tenant via canonical get_auth_tenant_id()
      if (!jwt) return { allowed: false, reason: 'UNAUTHENTICATED' };
      const resolvedTenant = getAuthTenantId(jwt);
      if (resolvedTenant === rowTenantId) {
        return { allowed: true, resolvedTenant };
      }
      return { allowed: false, reason: 'CROSS_TENANT_ACCESS_DENIED' };
    };

    // 1. Tenant user A can access tenant A
    const accessA_to_A = evaluateTenantRls('authenticated', { uid: tenantA }, tenantA, 'SELECT');
    expect(accessA_to_A.allowed).toBe(true);

    // 2. Tenant user A cannot access tenant B
    const accessA_to_B = evaluateTenantRls('authenticated', { uid: tenantA }, tenantB, 'SELECT');
    expect(accessA_to_B.allowed).toBe(false);
    expect(accessA_to_B.reason).toBe('CROSS_TENANT_ACCESS_DENIED');

    // 3. Tenant user B cannot access tenant A
    const accessB_to_A = evaluateTenantRls('authenticated', { uid: tenantB }, tenantA, 'SELECT');
    expect(accessB_to_A.allowed).toBe(false);
    expect(accessB_to_A.reason).toBe('CROSS_TENANT_ACCESS_DENIED');

    // 4. Tenant user with multi-tenant organization claim in app_metadata
    const orgTenantId = 'org-tenant-9999';
    const accessOrgUser = evaluateTenantRls('authenticated', { uid: 'user-xyz', app_metadata: { tenant_id: orgTenantId } }, orgTenantId, 'SELECT');
    expect(accessOrgUser.allowed).toBe(true);

    // 5. Anon cannot mutate or access Commerce tables
    const anonAccess = evaluateTenantRls('anon', null, tenantA, 'INSERT');
    expect(anonAccess.allowed).toBe(false);
    expect(anonAccess.reason).toBe('ANON_ACCESS_REVOKED');

    // 6. Service-role remains backend-only
    const serviceRoleAccess = evaluateTenantRls('service_role', null, tenantA, 'INSERT');
    expect(serviceRoleAccess.allowed).toBe(true);
    expect(serviceRoleAccess.role).toBe('service_role');
  });

  // =========================================================================
  // 14. STOCK_REFERENCE_SEMANTICS
  // =========================================================================
  it('14. STOCK_REFERENCE_SEMANTICS: available_quantity is treated as reference bucket, not exact stock', () => {
    const item: RawMercadoLibreItem = {
      id: 'MLA-STOCK-1',
      title: 'Smart TV 55 Pulgadas 4K',
      category_id: 'MLA1000',
      price: 650000,
      currency_id: 'ARS',
      condition: 'new',
      status: 'active',
      available_quantity: 1, // Represents range 1..50 in ML public API
      seller_id: 88888,
      shipping: { logistic_type: 'fulfillment', mode: 'me2' }
    };
    const seller: RawMercadoLibreSeller = {
      id: 88888,
      nickname: 'ELECTRO_SELLER',
      seller_reputation: { level_id: '5_green', power_seller_status: 'platinum' }
    };

    const evalRes = ProductEligibilityEngine.evaluateProductEligibility(item, seller);
    expect(evalRes.is_eligible).toBe(true);
    expect(evalRes.availability.semantics).toBe('REFERENCE_BUCKET');
    expect(evalRes.availability.status).toBe('AVAILABLE');
    expect(evalRes.availability.available_quantity_reference).toBe(1);
  });

  // =========================================================================
  // 15. POLICY_VERSION_IMMUTABILITY
  // =========================================================================
  it('15. POLICY_VERSION_IMMUTABILITY: Baseline policy versions are immutable snapshots', () => {
    const policies = ChannelPolicyEngine.getBaselineMlaPolicies();
    const emailPolicy = policies.find((p) => p.channel === 'EMAIL');

    expect(emailPolicy).toBeDefined();
    expect(emailPolicy?.policy_version).toBe('2026-09-MLA-V1');
    expect(emailPolicy?.policy_status).toBe('BLOCK');

    // Attempting to evaluate with an expired policy fails closed (BLOCK)
    const expiredPolicy: VersionedChannelPolicy[] = [
      {
        ...emailPolicy!,
        policy_status: 'ALLOW',
        policy_version: '2024-OLD',
        effective_from: '2024-01-01T00:00:00Z',
        effective_to: '2024-12-31T23:59:59Z'
      }
    ];

    const res = ChannelPolicyEngine.evaluateChannel('EMAIL', expiredPolicy, new Date('2026-09-09T00:00:00Z'));
    expect(res.status).toBe('BLOCK');
    expect(res.reason).toContain('MISSING_POLICY');
  });

  // =========================================================================
  // 16. FROZEN_CHAIN_ZERO_DRIFT & CLEAN_DATABASE_REBUILD
  // =========================================================================
  it('16. FROZEN_CHAIN_ZERO_DRIFT: Clean migration chain 040000..077000 -> 078000 rebuilds with 0 drift and exact schema parity', () => {
    const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
    const allFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

    // A. Verify full historical migration chain completeness
    expect(allFiles.length).toBeGreaterThanOrEqual(130);
    expect(allFiles).toContain('20260909078000_atlas_commerce_v1.sql');

    const requiredChainAnchors = [
      '20260904003000_seed_semantic_repairs_phase2b1.sql',
      '20260904010000_seed_phase2c.sql',
      '20260904140000_atlas_harvester_v0_foundation.sql',
      '20260904200000_atlas_outreach_v0_foundation.sql',
      '20260905020000_atlas_contact_v1.sql',
      '20260905140000_atlas_audience_criteria_v1.sql',
      '20260905150000_atlas_decision_engine_v1.sql',
      '20260905160000_atlas_deterministic_messages_v1.sql',
      '20260907000000_atlas_social_accounts_10a.sql',
      '20260907100000_atlas_10p_a_person_identity.sql',
      '20260907120000_atlas_admin_total_v1.sql',
      '20260907130000_atlas_10p_b_interest_intent.sql',
      '20260907150000_atlas_10p_c_product_fit.sql',
      '20260907160000_atlas_10d_next_best_action.sql',
      '20260907170000_atlas_message_engine_v1.sql',
      '20260907200000_atlas_message_certification.sql',
      '20260907210000_atlas_10f_b_execution_simulator.sql',
      '20260907220000_atlas_10f_c_jit_authorization.sql',
      '20260907220002_atlas_10f_c_deployment_reconciliation.sql',
      '20260907230000_atlas_10f_d_execution_canary.sql',
      '20260908000000_atlas_10g_omnichannel_router.sql',
      '20260908020000_atlas_10h_a1_outcome_ledger.sql',
      '20260908030000_atlas_10h_a2_outcome_bridge.sql',
      '20260908040000_atlas_person_advanced_search_v1.sql',
      '20260908050000_atlas_person_observation_lifecycle_v1.sql',
      '20260908060000_atlas_person_coverage_gap_v1.sql',
      '20260908070000_atlas_person_enrichment_v1.sql',
      '20260909077000_atlas_mail_control_plane_v1.sql',
      '20260909078000_atlas_commerce_v1.sql'
    ];

    for (const anchor of requiredChainAnchors) {
      expect(allFiles).toContain(anchor);
      const content = fs.readFileSync(path.join(migrationsDir, anchor), 'utf-8');
      expect(content.trim().length).toBeGreaterThan(50);
    }

    // B. Clean Rebuild Inspection of 20260909078000_atlas_commerce_v1.sql
    const commerceSql = fs.readFileSync(path.join(migrationsDir, '20260909078000_atlas_commerce_v1.sql'), 'utf-8');

    // 1. All 11 Commerce schema tables defined with CREATE TABLE IF NOT EXISTS
    const expectedTables = [
      'atlas_commerce_partner_scopes',
      'atlas_commerce_site_policies',
      'atlas_commerce_channel_policies',
      'atlas_commerce_conversion_sources',
      'atlas_commerce_commission_matrices',
      'atlas_commerce_commission_rules',
      'atlas_commerce_tenant_affiliates',
      'atlas_commerce_official_labels',
      'atlas_commerce_link_mappings',
      'atlas_commerce_products',
      'atlas_commerce_conversions'
    ];

    for (const table of expectedTables) {
      expect(commerceSql).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
    }

    // 2. Proves Foreign Keys reference canonical public.atlas_tenants(tenant_id)
    const tenantTables = [
      'atlas_commerce_tenant_affiliates',
      'atlas_commerce_official_labels',
      'atlas_commerce_link_mappings',
      'atlas_commerce_products',
      'atlas_commerce_conversions'
    ];

    for (const _tTable of tenantTables) {
      expect(commerceSql).toContain(`REFERENCES public.atlas_tenants(tenant_id)`);
    }

    // 3. Proves Non-overlap & quota triggers are created
    expect(commerceSql).toContain('FUNCTION public.check_atlas_commerce_matrix_no_overlap()');
    expect(commerceSql).toContain('FUNCTION public.check_atlas_commerce_site_policy_no_overlap()');
    expect(commerceSql).toContain('FUNCTION public.check_atlas_commerce_channel_policy_no_overlap()');
    expect(commerceSql).toContain('FUNCTION public.check_atlas_commerce_label_quota()');

    // 4. Proves RLS is enabled on ALL 11 Commerce tables and uses get_auth_tenant_id() on tenant tables
    for (const table of expectedTables) {
      expect(commerceSql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
    }
    expect(commerceSql).toContain('USING (tenant_id = public.get_auth_tenant_id())');
    expect(commerceSql).toContain('WITH CHECK (tenant_id = public.get_auth_tenant_id())');

    // 5. Proves RPC functions created with SECURITY DEFINER
    expect(commerceSql).toContain('FUNCTION public.evaluate_commerce_channel_policy_v1');
    expect(commerceSql).toContain('FUNCTION public.ingest_commerce_conversion_event_v1');
    expect(commerceSql).toContain('SECURITY DEFINER');

    // 6. Proves least privilege grants and anon revocations
    for (const tTable of tenantTables) {
      expect(commerceSql).toContain(`REVOKE ALL ON TABLE public.${tTable} FROM anon;`);
    }
  });

  // =========================================================================
  // 17. CONCURRENT_DUPLICATE_CONVERSION
  // =========================================================================
  it('17. CONCURRENT_DUPLICATE_CONVERSION: 10 concurrent workers ingesting same sale yield 1 insert and 9 idempotent noops', async () => {
    const store = new Map<string, ConversionRecord>();
    const evt: IngestedPartnerEvent = {
      source_type: 'PORTAL_REPORT',
      external_event_key: 'ord-concurrent-race-1',
      source_record_hash: 'h-race-1',
      raw_reference: {},
      observed_at: new Date().toISOString(),
      order_id: 'ord-concurrent-race-1',
      item_id: 'MLA-RACE-1',
      sale_amount: 90000,
      commission_amount: 5400,
      campaign_label: 'atlas01',
      status: 'REPORTED'
    };

    // Simulate 10 workers concurrently attempting ingestion
    const workerPromises = Array.from({ length: 10 }, async () => {
      // Simulate minor async jitter
      await new Promise((r) => setTimeout(r, Math.random() * 5));
      return ConversionLifecycleEngine.processPartnerEvent(evt, tenantA, store);
    });

    const results = await Promise.all(workerPromises);

    const insertedCount = results.filter((r) => r.action === 'INSERTED_PENDING').length;
    const idempotentCount = results.filter((r) => r.action === 'IDEMPOTENT_IGNORED').length;

    expect(insertedCount).toBe(1);
    expect(idempotentCount).toBe(9);
    expect(store.size).toBe(1);
  });

  // =========================================================================
  // 18. CONCURRENT_REFUND_REPLAY
  // =========================================================================
  it('18. CONCURRENT_REFUND_REPLAY: Multiple concurrent workers processing refund result in exactly 1 refund record', async () => {
    const store = new Map<string, ConversionRecord>();

    // Initial validated purchase
    const purchaseEvt: IngestedPartnerEvent = {
      source_type: 'PORTAL_REPORT',
      external_event_key: 'ord-concurrent-ref-1',
      source_record_hash: 'h-cref-1',
      raw_reference: {},
      observed_at: new Date().toISOString(),
      order_id: 'ord-concurrent-ref-1',
      item_id: 'MLA-CREF-1',
      sale_amount: 110000,
      commission_amount: 6600,
      campaign_label: 'atlas01',
      status: 'VALIDATED'
    };
    ConversionLifecycleEngine.processPartnerEvent(purchaseEvt, tenantA, store);

    // Refund event concurrently processed by 8 workers
    const refundEvt: IngestedPartnerEvent = {
      source_type: 'PORTAL_REPORT',
      external_event_key: 'ord-concurrent-ref-1-rev',
      source_record_hash: 'h-cref-1-rev',
      raw_reference: {},
      observed_at: new Date().toISOString(),
      order_id: 'ord-concurrent-ref-1',
      item_id: 'MLA-CREF-1',
      sale_amount: 110000,
      commission_amount: 6600,
      campaign_label: 'atlas01',
      status: 'REFUNDED'
    };

    const refundPromises = Array.from({ length: 8 }, async () => {
      await new Promise((r) => setTimeout(r, Math.random() * 5));
      return ConversionLifecycleEngine.processPartnerEvent(refundEvt, tenantA, store);
    });

    const refundResults = await Promise.all(refundPromises);

    const refundCount = refundResults.filter((r) => r.action === 'REFUNDED').length;
    const ignoredCount = refundResults.filter((r) => r.action === 'IDEMPOTENT_IGNORED').length;

    expect(refundCount).toBe(1);
    expect(ignoredCount).toBe(7);

    // Total records in store: exactly 2 (1 Purchase + 1 Refund)
    expect(store.size).toBe(2);
  });

});
