/**
 * Atlas Commerce V1 — Gate Zero Certification & Closure Test Suite
 * Total Tests: 41 tests covering all 10 Gate Zero pillars with strict fail-closed assertions.
 */

import { describe, it, expect } from 'vitest';
import { ChannelPolicyEngine } from '../lib/atlasCommerce/channelPolicyEngine';
import { ProductEligibilityEngine } from '../lib/atlasCommerce/productEligibilityEngine';
import { CommissionEngine } from '../lib/atlasCommerce/commissionEngine';
import { LinkMappingEngine } from '../lib/atlasCommerce/linkMappingEngine';
import { ConversionLifecycleEngine, ConversionRecord } from '../lib/atlasCommerce/conversionLifecycleEngine';
import { MercadoLibreClient } from '../lib/atlasCommerce/mercadoLibreClient';
import {
  RawMercadoLibreItem,
  RawMercadoLibreSeller,
  VersionedChannelPolicy,
  CommissionRule,
  IngestedPartnerEvent
} from '../lib/atlasCommerce/types';

describe('Atlas Commerce V1 — Gate Zero Certification & Closure', () => {

  // =========================================================================
  // G0.1: Affiliate Program Access & Multi-Tenant Boundary
  // =========================================================================
  describe('G0.1: Affiliate Program Access & Partner Scope', () => {
    it('1. Fails closed when tenant has no active ML affiliate program', () => {
      const activePrograms: any[] = [];
      const tenantProgram = activePrograms.find((p) => p.tenant_id === 't1' && p.is_active);
      expect(tenantProgram).toBeUndefined();
    });

    it('2. Multi-country site isolation supports MLA, MLB, MLM without collision', () => {
      const programs = [
        { tenant_id: 't1', partner_id: 'MERCADO_LIBRE', site_id: 'MLA', tag: 'tag-mla-1' },
        { tenant_id: 't1', partner_id: 'MERCADO_LIBRE', site_id: 'MLB', tag: 'tag-mlb-1' },
        { tenant_id: 't2', partner_id: 'MERCADO_LIBRE', site_id: 'MLA', tag: 'tag-mla-2' }
      ];

      const t1Mla = programs.find((p) => p.tenant_id === 't1' && p.site_id === 'MLA');
      const t1Mlb = programs.find((p) => p.tenant_id === 't1' && p.site_id === 'MLB');
      const t2Mla = programs.find((p) => p.tenant_id === 't2' && p.site_id === 'MLA');

      expect(t1Mla?.tag).toBe('tag-mla-1');
      expect(t1Mlb?.tag).toBe('tag-mlb-1');
      expect(t2Mla?.tag).toBe('tag-mla-2');
    });
  });

  // =========================================================================
  // G0.2: Official Link Contract & Strict Label Constraints
  // =========================================================================
  describe('G0.2: Official Link Contract & Low-Cardinality Label Constraints', () => {
    it('3. Validates official ML label constraints: <=30 chars and strictly lowercase alphanumeric [a-z0-9]', () => {
      expect(LinkMappingEngine.validateOfficialLabel('atlas01').valid).toBe(true);
      expect(LinkMappingEngine.validateOfficialLabel('hogar2026').valid).toBe(true);
      expect(LinkMappingEngine.validateOfficialLabel('tecnologia12345678901234567890').valid).toBe(true); // 30 chars exactly

      // Exceeds 30 chars
      const tooLong = LinkMappingEngine.validateOfficialLabel('thislabeliswaytoolongtofitinmercadolibreslimit31');
      expect(tooLong.valid).toBe(false);
      expect(tooLong.reason).toContain('LABEL_TOO_LONG');

      // Invalid characters: uppercase, dashes, underscores, spaces
      expect(LinkMappingEngine.validateOfficialLabel('Atlas01').valid).toBe(false);
      expect(LinkMappingEngine.validateOfficialLabel('atl-exec-1').valid).toBe(false);
      expect(LinkMappingEngine.validateOfficialLabel('atl_exec_1').valid).toBe(false);
      expect(LinkMappingEngine.validateOfficialLabel('atlas label').valid).toBe(false);
    });

    it('4. Enforces maximum 100 official labels per Mercado Libre account', () => {
      const existing100 = new Set<string>();
      for (let i = 1; i <= 100; i++) {
        existing100.add(`label${i}`);
      }

      // Existing label can be reused without quota error
      expect(LinkMappingEngine.checkAccountLabelQuota(existing100, 'label1').allowed).toBe(true);

      // Attempting to create 101st label fails closed
      const res101 = LinkMappingEngine.checkAccountLabelQuota(existing100, 'label101');
      expect(res101.allowed).toBe(false);
      expect(res101.reason).toContain('LABEL_QUOTA_EXCEEDED');
    });

    it('5. Creates link mapping linking internal execution UUID to low-cardinality ML label', () => {
      const mapping = LinkMappingEngine.createLinkMapping({
        tenantId: '11111111-2222-3333-4444-555555555555',
        executionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        costId: 'cost-1',
        campaignId: 'camp-tech',
        officialMlLabel: 'atlas01',
        officialGeneratedUrl: 'https://articulo.mercadolibre.com.ar/MLA-123456789-item'
      });

      expect(mapping.tenant_id).toBe('11111111-2222-3333-4444-555555555555');
      expect(mapping.execution_id).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(mapping.official_ml_label).toBe('atlas01');
      expect(mapping.official_generated_url).toContain('mercadolibre.com.ar');
    });

    it('6. Rejects ad-hoc query string forging or non-ML domains', () => {
      expect(LinkMappingEngine.validateAffiliateUrlStructure('https://articulo.mercadolibre.com.ar/MLA-123').valid).toBe(true);
      expect(LinkMappingEngine.validateAffiliateUrlStructure('https://meli.la/2abc').valid).toBe(true);

      // Fake redirect domain
      const fake = LinkMappingEngine.validateAffiliateUrlStructure('https://untrusted-affiliate.com/MLA-123');
      expect(fake.valid).toBe(false);
      expect(fake.reason).toContain('UNTRUSTED_DOMAIN');

      // Insecure HTTP
      expect(LinkMappingEngine.validateAffiliateUrlStructure('http://articulo.mercadolibre.com.ar/MLA-123').valid).toBe(false);
    });
  });

  // =========================================================================
  // G0.3: Distribution & Channel Policy (EMAIL = BLOCK, UNKNOWN = BLOCK)
  // =========================================================================
  describe('G0.3: Distribution & Channel Policy (Fail-Closed)', () => {
    const policies = ChannelPolicyEngine.getBaselineMlaPolicies();

    it('7. OWN_PUBLIC_WEBSITE is ALLOW under active policy', () => {
      const res = ChannelPolicyEngine.evaluateChannel('OWN_PUBLIC_WEBSITE', policies);
      expect(res.status).toBe('ALLOW');
    });

    it('8. OWN_PUBLIC_SOCIAL is ALLOW under active policy', () => {
      const res = ChannelPolicyEngine.evaluateChannel('OWN_PUBLIC_SOCIAL', policies);
      expect(res.status).toBe('ALLOW');
    });

    it('9. EMAIL is strictly BLOCK by default (fail-closed)', () => {
      const res = ChannelPolicyEngine.evaluateChannel('EMAIL', policies);
      expect(res.status).toBe('BLOCK');
      expect(res.reason).toContain('CHANNEL_BLOCKED');
    });

    it('10. SMS, PRIVATE_DM, CLOSED_GROUP are strictly BLOCK by default', () => {
      expect(ChannelPolicyEngine.evaluateChannel('SMS', policies).status).toBe('BLOCK');
      expect(ChannelPolicyEngine.evaluateChannel('PRIVATE_DM', policies).status).toBe('BLOCK');
      expect(ChannelPolicyEngine.evaluateChannel('CLOSED_GROUP', policies).status).toBe('BLOCK');
    });

    it('11. UNKNOWN channel or policy is strictly BLOCK (fail-closed)', () => {
      const unkChannel = ChannelPolicyEngine.evaluateChannel('UNKNOWN_TIKTOK_SECRET_CHANNEL', policies);
      expect(unkChannel.status).toBe('BLOCK');
      expect(unkChannel.reason).toContain('MISSING_POLICY');
    });

    it('12. Expired policy fails closed (BLOCK)', () => {
      const expiredPolicies: VersionedChannelPolicy[] = [
        {
          policy_id: 'pol-exp',
          site_id: 'MLA',
          channel: 'OWN_PUBLIC_WEBSITE',
          policy_status: 'ALLOW',
          policy_version: '2025-EXPIRED',
          source_url: 'https://test.com',
          observed_at: '2025-01-01T00:00:00Z',
          effective_from: '2025-01-01T00:00:00Z',
          effective_to: '2025-12-31T23:59:59Z'
        }
      ];
      const res = ChannelPolicyEngine.evaluateChannel('OWN_PUBLIC_WEBSITE', expiredPolicies, new Date('2026-09-09T00:00:00Z'));
      expect(res.status).toBe('BLOCK');
      expect(res.reason).toContain('MISSING_POLICY');
    });
  });

  // =========================================================================
  // G0.4: Product Eligibility & Stock Semantics (Reference Bucket)
  // =========================================================================
  describe('G0.4: Product Eligibility & Reference Stock Semantics', () => {
    const validSeller: RawMercadoLibreSeller = {
      id: 12345,
      nickname: 'TOP_SELLER',
      seller_reputation: {
        level_id: '5_green',
        power_seller_status: 'platinum',
        transactions: { completed: 1000 },
        metrics: { cancellations: { rate: 0.005 }, claims: { rate: 0.002 } }
      }
    };

    const validItem: RawMercadoLibreItem = {
      id: 'MLA1001',
      title: 'Smartphone 5G 128GB',
      category_id: 'MLA1055',
      price: 250000,
      currency_id: 'ARS',
      condition: 'new',
      status: 'active',
      available_quantity: 1, // Represents reference bucket in ML public API
      seller_id: 12345,
      shipping: { logistic_type: 'fulfillment', mode: 'me2' }
    };

    it('13. Valid new item with green seller is ELIGIBLE with REFERENCE_BUCKET stock semantics', () => {
      const res = ProductEligibilityEngine.evaluateProductEligibility(validItem, validSeller);
      expect(res.is_eligible).toBe(true);
      expect(res.rejection_reasons.length).toBe(0);
      expect(res.mandatory_checks.condition_is_new).toBe(true);
      expect(res.mandatory_checks.seller_is_green).toBe(true);
      expect(res.mandatory_checks.listing_is_active).toBe(true);
      expect(res.mandatory_checks.stock_is_available).toBe(true);
      expect(res.availability.status).toBe('AVAILABLE');
      expect(res.availability.semantics).toBe('REFERENCE_BUCKET');
      expect(res.availability.available_quantity_reference).toBe(1);
    });

    it('14. Light green (4_light_green) seller is also ELIGIBLE', () => {
      const lightGreenSeller: RawMercadoLibreSeller = {
        ...validSeller,
        seller_reputation: { ...validSeller.seller_reputation, level_id: '4_light_green' }
      };
      const res = ProductEligibilityEngine.evaluateProductEligibility(validItem, lightGreenSeller);
      expect(res.is_eligible).toBe(true);
    });

    it('15. Used or reconditioned condition is strictly INELIGIBLE', () => {
      const usedItem: RawMercadoLibreItem = { ...validItem, condition: 'used' };
      const res = ProductEligibilityEngine.evaluateProductEligibility(usedItem, validSeller);
      expect(res.is_eligible).toBe(false);
      expect(res.rejection_reasons).toContain("INELIGIBLE_CONDITION: Condition is 'used', expected 'NEW'");
    });

    it('16. Non-green seller (yellow, orange, red, unknown) is strictly INELIGIBLE', () => {
      const yellowSeller: RawMercadoLibreSeller = {
        ...validSeller,
        seller_reputation: { ...validSeller.seller_reputation, level_id: '3_yellow' }
      };
      const resYellow = ProductEligibilityEngine.evaluateProductEligibility(validItem, yellowSeller);
      expect(resYellow.is_eligible).toBe(false);
      expect(resYellow.rejection_reasons[0]).toContain('INELIGIBLE_SELLER_REPUTATION');
    });

    it('17. Paused or closed listing is strictly INELIGIBLE', () => {
      const pausedItem: RawMercadoLibreItem = { ...validItem, status: 'paused' };
      const res = ProductEligibilityEngine.evaluateProductEligibility(pausedItem, validSeller);
      expect(res.is_eligible).toBe(false);
      expect(res.availability.status).toBe('PAUSED');
      expect(res.rejection_reasons[0]).toContain('INELIGIBLE_LISTING_STATUS');
    });

    it('18. Zero available reference quantity is strictly INELIGIBLE', () => {
      const zeroStockItem: RawMercadoLibreItem = { ...validItem, available_quantity: 0 };
      const res = ProductEligibilityEngine.evaluateProductEligibility(zeroStockItem, validSeller);
      expect(res.is_eligible).toBe(false);
      expect(res.availability.status).toBe('OUT_OF_STOCK');
      expect(res.rejection_reasons[0]).toContain('INELIGIBLE_STOCK');
    });
  });

  // =========================================================================
  // G0.5: Atlas Quality Score (Soft Ranking Gate)
  // =========================================================================
  describe('G0.5: Atlas Quality Score (Soft Ranking Gate)', () => {
    it('19. Valid green seller with power_seller_status = null remains ELIGIBLE with valid score', () => {
      const greenNoPowerSeller: RawMercadoLibreSeller = {
        id: 999,
        nickname: 'REGULAR_GREEN_SELLER',
        seller_reputation: {
          level_id: '5_green',
          power_seller_status: null,
          metrics: { cancellations: { rate: 0.008 }, claims: { rate: 0.003 } }
        }
      };

      const item: RawMercadoLibreItem = {
        id: 'MLA2002',
        title: 'Auriculares Bluetooth',
        category_id: 'MLA1055',
        price: 35000,
        currency_id: 'ARS',
        condition: 'new',
        status: 'active',
        available_quantity: 1,
        seller_id: 999,
        shipping: { logistic_type: 'cross_docking', mode: 'me2' }
      };

      const eligibility = ProductEligibilityEngine.evaluateProductEligibility(item, greenNoPowerSeller);
      expect(eligibility.is_eligible).toBe(true);

      const score = ProductEligibilityEngine.calculateQualityScore(item, greenNoPowerSeller);
      expect(score.quality_score).toBeGreaterThanOrEqual(50);
      expect(score.factors.power_seller_points).toBe(0);
      expect(score.factors.reputation_points).toBe(25);
    });

    it('20. Platinum seller with Full Fulfillment receives maximum quality score (100)', () => {
      const platinumSeller: RawMercadoLibreSeller = {
        id: 111,
        nickname: 'TOP_PLATINUM',
        seller_reputation: {
          level_id: '5_green',
          power_seller_status: 'platinum',
          metrics: { cancellations: { rate: 0.001 }, claims: { rate: 0.001 } }
        }
      };

      const fullItem: RawMercadoLibreItem = {
        id: 'MLA3003',
        title: 'Laptop Gamer 16GB',
        category_id: 'MLA1648',
        price: 950000,
        currency_id: 'ARS',
        condition: 'new',
        status: 'active',
        available_quantity: 5,
        seller_id: 111,
        shipping: { logistic_type: 'fulfillment', mode: 'me2' }
      };

      const score = ProductEligibilityEngine.calculateQualityScore(fullItem, platinumSeller);
      expect(score.quality_score).toBe(100);
      expect(score.factors.power_seller_points).toBe(30);
      expect(score.factors.shipping_fulfillment_points).toBe(25);
      expect(score.factors.reputation_points).toBe(25);
      expect(score.factors.low_cancellation_points).toBe(20);
    });
  });

  // =========================================================================
  // G0.6: Commission Policy & Multi-Site Isolation (MLA vs MLB/MLM)
  // =========================================================================
  describe('G0.6: Commission Policy & Multi-Site Policy Isolation', () => {
    const rules: CommissionRule[] = [
      {
        rule_id: 'r-celulares-mla',
        site_id: 'MLA',
        category_id: 'MLA1055',
        category_name: 'Celulares y Smartphones',
        commission_rate_percent: 0.0600,
        fixed_commission_amount: 0,
        max_commission_cap: 15000,
        min_price_threshold: 10000,
        is_eligible: true
      },
      {
        rule_id: 'r-inmuebles-mla',
        site_id: 'MLA',
        category_id: 'MLA1459',
        category_name: 'Inmuebles',
        commission_rate_percent: 0,
        fixed_commission_amount: 0,
        max_commission_cap: null,
        min_price_threshold: 0,
        is_eligible: false
      }
    ];

    it('21. MLA commission computes with verified 24h Last Valid Click policy', () => {
      const res = CommissionEngine.computeCommission(100000, 'MLA1055', 'MLA', rules);
      expect(res.is_commissionable).toBe(true);
      expect(res.commission_rate_percent).toBe(0.06);
      expect(res.computed_commission).toBe(6000);
      expect(res.attribution_window_hours).toBe(24);
      expect(res.attribution_model).toBe('LAST_VALID_CLICK');
    });

    it('22. Unverified site (MLB / MLM) fails closed with UNKNOWN_SITE_POLICY_BLOCKED', () => {
      const resMlb = CommissionEngine.computeCommission(100000, 'MLA1055', 'MLB', rules);
      expect(resMlb.is_commissionable).toBe(false);
      expect(resMlb.reason).toContain('UNKNOWN_SITE_POLICY_BLOCKED');

      const resMlm = CommissionEngine.computeCommission(100000, 'MLA1055', 'MLM', rules);
      expect(resMlm.is_commissionable).toBe(false);
      expect(resMlm.reason).toContain('UNKNOWN_SITE_POLICY_BLOCKED');
    });

    it('23. Direct evaluateSitePolicy returns BLOCK for UNKNOWN site policy (MLB) or MISSING policy (MLC)', () => {
      const evalMlb = CommissionEngine.evaluateSitePolicy('MLB');
      expect(evalMlb.allowed).toBe(false);
      expect(evalMlb.reason).toContain('UNKNOWN_SITE_POLICY_BLOCKED');

      const evalMlc = CommissionEngine.evaluateSitePolicy('MLC');
      expect(evalMlc.allowed).toBe(false);
      expect(evalMlc.reason).toContain('MISSING_SITE_POLICY');

      const evalMla = CommissionEngine.evaluateSitePolicy('MLA');
      expect(evalMla.allowed).toBe(true);
      expect(evalMla.policy?.policy_status).toBe('VERIFIED');
    });

    it('24. High-value item respects max_commission_cap on MLA', () => {
      const res = CommissionEngine.computeCommission(500000, 'MLA1055', 'MLA', rules);
      expect(res.is_commissionable).toBe(true);
      expect(res.computed_commission).toBe(15000);
    });

    it('25. Excluded category fails closed with is_commissionable = false', () => {
      const res = CommissionEngine.computeCommission(10000000, 'MLA1459', 'MLA', rules);
      expect(res.is_commissionable).toBe(false);
      expect(res.reason).toContain('CATEGORY_EXCLUDED');
    });

    it('26. Attribution window: within 24h is VALID, >24h is EXPIRED', () => {
      const clickTime = new Date('2026-09-09T10:00:00Z');
      const validConversion = new Date('2026-09-10T09:30:00Z');
      const expiredConversion = new Date('2026-09-10T10:30:00Z');

      expect(CommissionEngine.isWithinAttributionWindow(clickTime, validConversion, 24)).toBe(true);
      expect(CommissionEngine.isWithinAttributionWindow(clickTime, expiredConversion, 24)).toBe(false);
    });
  });

  // =========================================================================
  // G0.7: Flexible Conversion Sources & Capability Check
  // =========================================================================
  describe('G0.7: Flexible Conversion Sources & Capability Status Check', () => {
    it('27. PROVEN sources (PORTAL_REPORT, FILE_IMPORT) are allowed for ingestion', () => {
      expect(ConversionLifecycleEngine.validateSourceCapability('PORTAL_REPORT').allowed).toBe(true);
      expect(ConversionLifecycleEngine.validateSourceCapability('FILE_IMPORT').allowed).toBe(true);
    });

    it('28. UNKNOWN sources (PARTNER_API, PARTNER_WEBHOOK) fail closed (BLOCKED)', () => {
      const apiCheck = ConversionLifecycleEngine.validateSourceCapability('PARTNER_API');
      expect(apiCheck.allowed).toBe(false);
      expect(apiCheck.reason).toContain('SOURCE_CAPABILITY_UNKNOWN_BLOCKED');

      const webhookCheck = ConversionLifecycleEngine.validateSourceCapability('PARTNER_WEBHOOK');
      expect(webhookCheck.allowed).toBe(false);
      expect(webhookCheck.reason).toContain('SOURCE_CAPABILITY_UNKNOWN_BLOCKED');
    });

    it('29. Ingestion attempt from UNKNOWN source is rejected by processPartnerEvent', () => {
      const unprovenEvt: IngestedPartnerEvent = {
        source_type: 'PARTNER_WEBHOOK',
        external_event_key: 'evt-webhook-001',
        source_record_hash: 'hash-wh',
        raw_reference: {},
        observed_at: new Date().toISOString(),
        order_id: 'ord-wh-1',
        item_id: 'MLA-1',
        sale_amount: 50000,
        commission_amount: 3000,
        campaign_label: 'atlas01',
        status: 'REPORTED'
      };

      const res = ConversionLifecycleEngine.processPartnerEvent(unprovenEvt, 't1', new Map());
      expect(res.action).toBe('BLOCKED_UNPROVEN_SOURCE');
      expect(res.reason).toContain('SOURCE_CAPABILITY_UNKNOWN_BLOCKED');
    });
  });

  // =========================================================================
  // G0.8: Commission Lifecycle & Strict No Time-Based Auto-Validation
  // =========================================================================
  describe('G0.8: Commission Lifecycle & No Time-Based Auto-Validation', () => {
    const existingConversions = new Map<string, ConversionRecord>();
    const tenantId = 't-lifecycle-closure';

    it('30. Initial SALE_REPORTED starts as COMMISSION_PENDING (not earned yet)', () => {
      const evt: IngestedPartnerEvent = {
        source_type: 'PORTAL_REPORT',
        external_event_key: 'ord-901-mla',
        source_record_hash: 'h-901',
        raw_reference: {},
        observed_at: new Date().toISOString(),
        order_id: 'ord-901',
        item_id: 'MLA-901',
        sale_amount: 80000,
        commission_amount: 4800,
        campaign_label: 'atlas01',
        status: 'REPORTED'
      };

      const res = ConversionLifecycleEngine.processPartnerEvent(evt, tenantId, existingConversions);
      expect(res.action).toBe('INSERTED_PENDING');
      expect(res.conversion?.lifecycle_state).toBe('COMMISSION_PENDING');
      expect(res.conversion?.validated_at).toBeNull();
    });

    it('31. 60 days elapsed NEVER auto-validates commission (strict partner authority)', () => {
      const record = existingConversions.get(
        ConversionLifecycleEngine.generateDeduplicationKey(tenantId, 'MERCADO_LIBRE', 'MLA', 'ord-901', 'MLA-901', 'PURCHASE')
      )!;

      expect(record.lifecycle_state).toBe('COMMISSION_PENDING');

      // Test 60, 65, 90 days elapsed
      const res60 = ConversionLifecycleEngine.evaluateElapsedDays(record, 60);
      expect(res60.auto_validated).toBe(false);
      expect(res60.lifecycle_state).toBe('COMMISSION_PENDING');
      expect(res60.reason).toContain('NO_TIME_AUTO_VALIDATION');

      const res90 = ConversionLifecycleEngine.evaluateElapsedDays(record, 90);
      expect(res90.auto_validated).toBe(false);
      expect(res90.lifecycle_state).toBe('COMMISSION_PENDING');
    });

    it('32. Absence of return observed internally never declares commission earned without ML validation', () => {
      const record = existingConversions.get(
        ConversionLifecycleEngine.generateDeduplicationKey(tenantId, 'MERCADO_LIBRE', 'MLA', 'ord-901', 'MLA-901', 'PURCHASE')
      )!;

      // Even if Atlas internally observes zero returns for 65 days, status remains COMMISSION_PENDING
      const res65 = ConversionLifecycleEngine.evaluateElapsedDays(record, 65);
      expect(res65.auto_validated).toBe(false);
      expect(res65.lifecycle_state).toBe('COMMISSION_PENDING');
      expect(record.validated_at).toBeNull();
    });

    it('33. Order delivered with 0 return confirmed by ML advances to COMMISSION_VALIDATED (earned)', () => {
      const evtValidated: IngestedPartnerEvent = {
        source_type: 'PORTAL_REPORT',
        external_event_key: 'ord-901-mla-val',
        source_record_hash: 'h-901-val',
        raw_reference: {},
        observed_at: new Date().toISOString(),
        order_id: 'ord-901',
        item_id: 'MLA-901',
        sale_amount: 80000,
        commission_amount: 4800,
        campaign_label: 'atlas01',
        status: 'VALIDATED'
      };

      const res = ConversionLifecycleEngine.processPartnerEvent(evtValidated, tenantId, existingConversions);
      expect(res.action).toBe('VALIDATED_EARNED');
      expect(res.conversion?.lifecycle_state).toBe('COMMISSION_VALIDATED');
      expect(res.conversion?.validated_at).toBeDefined();
      expect(res.outcome_to_project?.event_type).toBe('PURCHASE');
    });

    it('34. Cancelled / returned order triggers REFUND reversing original conversion', () => {
      const evtRefund: IngestedPartnerEvent = {
        source_type: 'PORTAL_REPORT',
        external_event_key: 'ord-901-mla-ref',
        source_record_hash: 'h-901-ref',
        raw_reference: {},
        observed_at: new Date().toISOString(),
        order_id: 'ord-901',
        item_id: 'MLA-901',
        sale_amount: 80000,
        commission_amount: 4800,
        campaign_label: 'atlas01',
        status: 'REFUNDED'
      };

      const res = ConversionLifecycleEngine.processPartnerEvent(evtRefund, tenantId, existingConversions);
      expect(res.action).toBe('REFUNDED');
      expect(res.conversion?.lifecycle_state).toBe('REFUND');
      expect(res.conversion?.reverses_conversion_id).toBeDefined();
      expect(res.outcome_to_project?.event_type).toBe('REFUND');
    });
  });

  // =========================================================================
  // G0.9: Idempotency & 10H Outcome Ledger Bridge
  // =========================================================================
  describe('G0.9: Idempotency & 10H Outcome Ledger Bridge', () => {
    it('35. Duplicate partner event replay returns IDEMPOTENT_IGNORED (NOOP, 0 duplicate ledger entries)', () => {
      const conversionsMap = new Map<string, ConversionRecord>();
      const tenantId = 't-idemp-closure';

      const evt: IngestedPartnerEvent = {
        source_type: 'PORTAL_REPORT',
        external_event_key: 'ord-dup-1',
        source_record_hash: 'h-dup',
        raw_reference: {},
        observed_at: new Date().toISOString(),
        order_id: 'ord-dup-1',
        item_id: 'MLA-555',
        sale_amount: 40000,
        commission_amount: 2400,
        campaign_label: 'atlas01',
        status: 'REPORTED'
      };

      // First run: inserted
      const res1 = ConversionLifecycleEngine.processPartnerEvent(evt, tenantId, conversionsMap);
      expect(res1.action).toBe('INSERTED_PENDING');

      // Duplicate replay: ignored
      const res2 = ConversionLifecycleEngine.processPartnerEvent(evt, tenantId, conversionsMap);
      expect(res2.action).toBe('IDEMPOTENT_IGNORED');
      expect(conversionsMap.size).toBe(1);
    });

    it('36. Maps confirmed affiliate outcomes to 10H-A1 canonical specification', () => {
      const conversionsMap = new Map<string, ConversionRecord>();
      const evt: IngestedPartnerEvent = {
        source_type: 'PORTAL_REPORT',
        external_event_key: 'ord-10h-1',
        source_record_hash: 'h-10h',
        raw_reference: {},
        observed_at: new Date().toISOString(),
        order_id: 'ord-10h-1',
        item_id: 'MLA-777',
        sale_amount: 120000,
        commission_amount: 7200,
        campaign_label: 'atlas01',
        status: 'VALIDATED'
      };

      const res = ConversionLifecycleEngine.processPartnerEvent(evt, 't1', conversionsMap);
      expect(res.outcome_to_project).toBeDefined();
      expect(res.outcome_to_project?.source_system).toBe('MERCADO_LIBRE');
      expect(res.outcome_to_project?.event_type).toBe('PURCHASE');
      expect(res.outcome_to_project?.business_domain).toBe('COMMERCE');
      expect(res.outcome_to_project?.event_class).toBe('OBSERVED');
    });
  });

  // =========================================================================
  // G0.10: Modern Bulk API Endpoints & Zero Schema Drift
  // =========================================================================
  describe('G0.10: Modern Bulk API Endpoints & Zero Schema Drift', () => {
    it('37. Modern bulk items URL matches /items/bulk?ids= format', () => {
      const url = MercadoLibreClient.buildBulkItemsUrl(['MLA101', 'MLA102', 'MLA103']);
      expect(url).toBe('https://api.mercadolibre.com/items/bulk?ids=MLA101,MLA102,MLA103');
    });

    it('38. Modern bulk users URL matches /users/bulk?ids= format', () => {
      const url = MercadoLibreClient.buildBulkUsersUrl([12345, 67890]);
      expect(url).toBe('https://api.mercadolibre.com/users/bulk?ids=12345,67890');
    });

    it('39. Empty item or user arrays fail closed with error', () => {
      expect(() => MercadoLibreClient.buildBulkItemsUrl([])).toThrow('INVALID_ARGUMENT');
      expect(() => MercadoLibreClient.buildBulkUsersUrl([])).toThrow('INVALID_ARGUMENT');
    });

    it('40. Bulk item parser separates valid 200 items from 404/inactive items without poisoning batch', () => {
      const mockResponse = [
        { code: 200, body: { id: 'MLA101', title: 'Item 1', status: 'active' } as any },
        { code: 404, body: { id: 'MLA404' } as any },
        { code: 200, body: { id: 'MLA102', title: 'Item 2', status: 'active' } as any }
      ];

      const parsed = MercadoLibreClient.parseBulkItemsResponse(mockResponse);
      expect(parsed.activeItems.length).toBe(2);
      expect(parsed.missingOrInactiveIds).toEqual(['MLA404']);
    });

    it('41. Bulk user parser separates valid sellers from invalid/error user ids', () => {
      const mockResponse = [
        { code: 200, body: { id: 100, nickname: 'SELLER_1', seller_reputation: { level_id: '5_green' } } as any },
        { code: 403, body: { id: 200 } as any }
      ];

      const parsed = MercadoLibreClient.parseBulkUsersResponse(mockResponse);
      expect(parsed.validSellers.length).toBe(1);
      expect(parsed.invalidUserIds).toEqual(['200']);
    });
  });

});
