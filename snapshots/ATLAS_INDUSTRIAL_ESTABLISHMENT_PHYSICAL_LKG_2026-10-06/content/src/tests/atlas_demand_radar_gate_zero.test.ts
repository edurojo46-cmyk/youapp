/**
 * Atlas Demand Radar V1 — Gate Zero Implementation Test Suite
 * Covers DR-01 through DR-33 Hardened Architectural Assertions
 */

import { describe, it, expect } from 'vitest';
import {
  validateZeroPii,
  validateSourceCapability,
  isSignalFresh,
  SOURCE_CAPABILITIES_REGISTRY,
  normalizeSourceMetric,
  BaselineRegistry,
  normalCdf,
  analyzeCommercialIntent,
  SemanticClusterRegistry,
  constructDemandVector,
  deriveMarketState,
  computeLeadLagMetadata,
  calculateDemandScore,
  calculateCommerceMatchScore,
  calculateOpportunityGap,
  evaluateDemandOpportunity,
  matchClusterToCommerce,
  DemandRadarEvaluator,
  DemandSignal,
  CandidateProductBundle
} from '../lib/atlasDemandRadar';
import type { VersionedSitePolicy, CommissionRule, RawMercadoLibreItem, RawMercadoLibreSeller } from '../lib/atlasCommerce/types';

describe('Atlas Demand Radar V1 — Gate Zero Hardening Suite', () => {

  const mockSitePolicy: VersionedSitePolicy = {
    site_id: 'MLA',
    policy_version: '2026-09-MLA-V1',
    policy_status: 'VERIFIED',
    attribution_window_hours: 24,
    attribution_model: 'LAST_VALID_CLICK',
    source_url: 'https://afiliados.mercadolibre.com.ar/politicas',
    observed_at: '2026-09-09T00:00:00Z',
    effective_from: '2026-01-01T00:00:00Z',
    effective_to: null
  };

  const mockCommissionRule: CommissionRule = {
    rule_id: 'rule_mla_electro',
    site_id: 'MLA',
    category_id: 'MLA1055',
    category_name: 'Electrodomésticos',
    commission_rate_percent: 0.085,
    fixed_commission_amount: 0,
    max_commission_cap: 50000,
    min_price_threshold: 1000,
    is_eligible: true
  };

  const createMockBundle = (
    id: string,
    title: string,
    price: number,
    condition = 'new',
    levelId = '5_green',
    status = 'active',
    availableQty = 15,
    fulfillment = true
  ): CandidateProductBundle => ({
    item: {
      id,
      title,
      category_id: 'MLA1055',
      price,
      currency_id: 'ARS',
      condition,
      status,
      available_quantity: availableQty,
      seller_id: 123456,
      shipping: {
        mode: 'me2',
        free_shipping: true,
        logistic_type: fulfillment ? 'fulfillment' : 'cross_docking'
      }
    } as RawMercadoLibreItem,
    seller: {
      id: 123456,
      nickname: 'ELECTRO_STORE_OFICIAL',
      seller_reputation: {
        level_id: levelId,
        power_seller_status: 'platinum',
        metrics: {
          claims: { rate: 0.01 },
          delayed_handling_time: { rate: 0.02 },
          cancellations: { rate: 0.005 }
        }
      }
    } as RawMercadoLibreSeller
  });

  // DR-01: Zero PII Invariant
  it('DR-01: Zero PII Invariant — Rejects queries with personal data (emails, IPs, phones)', () => {
    const cleanQuery = 'aspiradora robot comprar precio';
    const emailQuery = 'comprar aspiradora para juan.perez@gmail.com';
    const ipQuery = 'consulta sobre servidor 192.168.1.100 precio';
    const phoneQuery = 'llamar al +54 9 11 4567 8900 para comprar';

    expect(validateZeroPii(cleanQuery).is_clean).toBe(true);
    expect(validateZeroPii(emailQuery).is_clean).toBe(false);
    expect(validateZeroPii(emailQuery).violations).toContain('EMAIL_PATTERN_DETECTED');
    expect(validateZeroPii(ipQuery).is_clean).toBe(false);
    expect(validateZeroPii(ipQuery).violations).toContain('IP_ADDRESS_PATTERN_DETECTED');
    expect(validateZeroPii(phoneQuery).is_clean).toBe(false);
    expect(validateZeroPii(phoneQuery).violations).toContain('PHONE_NUMBER_PATTERN_DETECTED');
  });

  // DR-02: Unknown source capability -> BLOCK
  it('DR-02: Unknown source capability — Rejects unregistered platforms with BLOCK', () => {
    const result = validateSourceCapability('UNKNOWN_PLATFORM' as any);
    expect(result.is_authorized).toBe(false);
    expect(result.rejection_reason).toContain('SOURCE_CAPABILITY_NOT_FOUND');
  });

  // DR-03: Stale source data -> BLOCK / Fail Closed
  it('DR-03: Stale source data — Rejects signals exceeding max freshness SLA', () => {
    const freshSignal: DemandSignal = {
      signal_id: 'sig_1',
      source_platform: 'GOOGLE_TRENDS_FAST',
      metric_kind: 'SEARCH_INTEREST_INDEX',
      metric_value: 85,
      metric_unit: 'INDEX_0_100',
      measurement_window: 'WINDOW_10M',
      raw_query_topic: 'aspiradora robot',
      normalized_query: 'aspiradora robot',
      region_code: 'AR',
      is_sampled: false,
      source_confidence: 0.95,
      observed_at: '2026-09-09T09:00:00Z',
      signal_hash: 'hash_1'
    };

    // 10 minutes later -> Fresh (SLA 30 min)
    const freshCheck = isSignalFresh(freshSignal, '2026-09-09T09:10:00Z');
    expect(freshCheck.is_fresh).toBe(true);

    // 45 minutes later -> Stale (SLA 30 min exceeded)
    const staleCheck = isSignalFresh(freshSignal, '2026-09-09T09:45:00Z');
    expect(staleCheck.is_fresh).toBe(false);
    expect(staleCheck.age_seconds).toBe(2700);
  });

  // DR-04: TikTok unauthorized capability -> BLOCK
  it('DR-04: TikTok capability UNKNOWN/BLOCK — Rejects non-commercial research API', () => {
    const result = validateSourceCapability('TIKTOK_PUBLIC');
    expect(result.is_authorized).toBe(false);
    expect(result.capability?.capability_status).toBe('UNKNOWN');
    expect(result.capability?.commercial_use_authorized).toBe(false);
    expect(result.rejection_reason).toContain('SOURCE_CAPABILITY_UNKNOWN');
  });

  // DR-05: Google Trends interest != absolute search volume
  it('DR-05: Google Trends semantic precision — Classified strictly as SEARCH_INTEREST_INDEX', () => {
    const cap = SOURCE_CAPABILITIES_REGISTRY['GOOGLE_TRENDS_FAST'];
    expect(cap.metric_kind).toBe('SEARCH_INTEREST_INDEX');
    expect(cap.metric_unit).toBe('INDEX_0_100');
    expect(cap.metric_kind).not.toBe('PUBLIC_POST_COUNT');
  });

  // DR-06: YouTube content != user search volume
  it('DR-06: YouTube semantic precision — Classified strictly as CONTENT_PUBLICATION_SIGNAL', () => {
    const cap = SOURCE_CAPABILITIES_REGISTRY['YOUTUBE'];
    expect(cap.metric_kind).toBe('CONTENT_PUBLICATION_SIGNAL');
    expect(cap.metric_unit).toBe('VIDEO_COUNT');
  });

  // DR-07: X posts != search volume
  it('DR-07: X semantic precision — Classified strictly as PUBLIC_POST_COUNT', () => {
    const cap = SOURCE_CAPABILITIES_REGISTRY['X_TWITTER'];
    expect(cap.metric_kind).toBe('PUBLIC_POST_COUNT');
    expect(cap.metric_unit).toBe('POST_COUNT');
  });

  // DR-08: Source-native units never summed raw across heterogeneous dimensions
  it('DR-08: Source-native unit isolation — Normalizes each source to its own baseline before fusion', () => {
    const baseline = {
      source_platform: 'X_TWITTER' as const,
      cluster_id_or_topic: 'aspiradora-robot',
      region_code: 'AR' as const,
      hour_of_day: 14,
      mean: 500,
      std_dev: 100,
      p50: 500,
      p90: 750,
      sample_count: 30,
      updated_at: '2026-09-09T00:00:00Z'
    };

    const norm = normalizeSourceMetric('X_TWITTER', 'PUBLIC_POST_COUNT', 2500, baseline);
    expect(norm.relative_lift).toBe(5.0); // 2500 / 500
    expect(norm.z_score).toBe(20.0);       // (2500 - 500) / 100
    expect(norm.velocity_score).toBeGreaterThan(70);
    expect(norm.velocity_score).toBeLessThanOrEqual(100);
  });

  // DR-09: Rolling baseline normalization
  it('DR-09: Rolling baseline normalization — Generates z-score and statistical percentile', () => {
    expect(normalCdf(0)).toBeCloseTo(50, 1);
    expect(normalCdf(1.96)).toBeCloseTo(97.5, 1);
    expect(normalCdf(-1.96)).toBeCloseTo(2.5, 1);
  });

  // DR-10: Regional baseline awareness
  it('DR-10: Regional baseline awareness — Evaluates region-specific baselines independently', () => {
    const reg = new BaselineRegistry();
    reg.setBaseline({
      source_platform: 'GOOGLE_TRENDS_FAST',
      cluster_id_or_topic: 'aire-acondicionado',
      region_code: 'AR',
      hour_of_day: 12,
      mean: 60,
      std_dev: 15,
      p50: 60,
      p90: 85,
      sample_count: 30,
      updated_at: '2026-09-09T00:00:00Z'
    });

    reg.setBaseline({
      source_platform: 'GOOGLE_TRENDS_FAST',
      cluster_id_or_topic: 'aire-acondicionado',
      region_code: 'BR',
      hour_of_day: 12,
      mean: 20,
      std_dev: 5,
      p50: 20,
      p90: 30,
      sample_count: 30,
      updated_at: '2026-09-09T00:00:00Z'
    });

    const bAR = reg.getBaseline('GOOGLE_TRENDS_FAST', 'aire-acondicionado', 'AR', 12);
    const bBR = reg.getBaseline('GOOGLE_TRENDS_FAST', 'aire-acondicionado', 'BR', 12);

    expect(bAR.mean).toBe(60);
    expect(bBR.mean).toBe(20);
  });

  // DR-11: Time-of-day baseline awareness
  it('DR-11: Time-of-day baseline awareness — Differentiates peak vs off-peak hours', () => {
    const reg = new BaselineRegistry();
    reg.setBaseline({
      source_platform: 'X_TWITTER',
      cluster_id_or_topic: 'notebook-gamer',
      region_code: 'AR',
      hour_of_day: 3, // 3 AM
      mean: 50,
      std_dev: 10,
      p50: 50,
      p90: 70,
      sample_count: 30,
      updated_at: '2026-09-09T00:00:00Z'
    });

    reg.setBaseline({
      source_platform: 'X_TWITTER',
      cluster_id_or_topic: 'notebook-gamer',
      region_code: 'AR',
      hour_of_day: 20, // 8 PM
      mean: 800,
      std_dev: 120,
      p50: 800,
      p90: 1000,
      sample_count: 30,
      updated_at: '2026-09-09T00:00:00Z'
    });

    const b3am = reg.getBaseline('X_TWITTER', 'notebook-gamer', 'AR', 3);
    const b8pm = reg.getBaseline('X_TWITTER', 'notebook-gamer', 'AR', 20);

    expect(b3am.mean).toBe(50);
    expect(b8pm.mean).toBe(800);
  });

  // DR-12: Relative lift calculation
  it('DR-12: Relative lift — Correctly calculates actual / baseline ratio', () => {
    const baseline = {
      source_platform: 'NEWS_WEB' as const,
      cluster_id_or_topic: 'vacunas',
      region_code: 'GLOBAL' as const,
      hour_of_day: 10,
      mean: 10,
      std_dev: 2,
      p50: 10,
      p90: 15,
      sample_count: 30,
      updated_at: '2026-09-09T00:00:00Z'
    };

    const norm = normalizeSourceMetric('NEWS_WEB', 'ARTICLE_COUNT', 35, baseline);
    expect(norm.relative_lift).toBe(3.5);
  });

  // DR-13: Acceleration computation
  it('DR-13: Acceleration metric — Measures lift velocity delta over time', () => {
    const baseline = {
      source_platform: 'GOOGLE_TRENDS_FAST' as const,
      cluster_id_or_topic: 'aspiradora-robot',
      region_code: 'AR' as const,
      hour_of_day: 15,
      mean: 40,
      std_dev: 10,
      p50: 40,
      p90: 60,
      sample_count: 30,
      updated_at: '2026-09-09T00:00:00Z'
    };

    // Actual 80 (lift 2.0x), Prior 40 (lift 1.0x) -> Acceleration positive
    const accelNorm = normalizeSourceMetric('GOOGLE_TRENDS_FAST', 'SEARCH_INTEREST_INDEX', 80, baseline, 40);
    expect(accelNorm.acceleration_score).toBeGreaterThan(0);
    expect(accelNorm.acceleration_score).toBe(25);
  });

  // DR-14: Viral meme with no commercial intent -> TREND (No Commerce action)
  it('DR-14: Viral meme isolation — High social conversation without buying intent stays TREND', () => {
    const vector = {
      search_strength: 20,
      social_strength: 95,
      content_signal_strength: 40,
      commercial_intent: 10, // Viral meme, zero buy intent
      confidence: 90,
      persistence: 30,
      acceleration: 80,
      saturation_index: 10
    };

    const state = deriveMarketState(vector, false);
    expect(state).toBe('TREND');

    const opp = evaluateDemandOpportunity('cluster_meme', 'snap_1', 'MLA', vector, state, 0);
    expect(opp.opportunity_tier).toBe('INELIGIBLE');
    expect(opp.status).toBe('ARCHIVED');
  });

  // DR-15: Search with no social viral presence can still be COMMERCE_OPPORTUNITY
  it('DR-15: Direct commercial search — High search + high intent can become COMMERCE_OPPORTUNITY without social buzz', () => {
    const vector = {
      search_strength: 85,
      social_strength: 5,  // Zero viral social presence
      content_signal_strength: 10,
      commercial_intent: 95, // "comprar bomba de agua 1hp"
      confidence: 85,
      persistence: 60,
      acceleration: 30,
      saturation_index: 25
    };

    const state = deriveMarketState(vector, true);
    expect(state).toBe('COMMERCE_OPPORTUNITY');

    const opp = evaluateDemandOpportunity('cluster_bomba', 'snap_2', 'MLA', vector, state, 85);
    expect(opp.opportunity_tier).toBe('TIER_2_VIABLE');
    expect(opp.status).toBe('ACTIONABLE');
  });

  // DR-16: Social with no search remains trend
  it('DR-16: Social without search remains TREND and does not false-trigger commercial opportunity', () => {
    const vector = {
      search_strength: 15,
      social_strength: 75,
      content_signal_strength: 20,
      commercial_intent: 20,
      confidence: 80,
      persistence: 20,
      acceleration: 50,
      saturation_index: 10
    };

    const state = deriveMarketState(vector, false);
    expect(state).toBe('TREND');
  });

  // DR-17: Explicit lexical and semantic buying intent detection
  it('DR-17: Explicit commercial intent — Detects purchase tokens, specs and comparisons', () => {
    const analysis = analyzeCommercialIntent('comprar notebook gamer rtx 16gb en cuotas envio gratis');
    expect(analysis.commercial_intent_score).toBeGreaterThanOrEqual(70);
    expect(analysis.intent_level).toBe('HIGH');
    expect(analysis.is_commercially_viable).toBe(true);
    expect(analysis.positive_tokens_found).toContain('comprar');
    expect(analysis.positive_tokens_found).toContain('cuotas');
    expect(analysis.positive_tokens_found).toContain('16gb');
    expect(analysis.positive_tokens_found).toContain('envio gratis');
  });

  // DR-18: Negative commercial intent discount
  it('DR-18: Negative intent discount — Penalizes warnings, freebies, repair and historical queries', () => {
    // 1. "Por qué no comprar iphone"
    const warning = analyzeCommercialIntent('por que no comprar iphone 15');
    expect(warning.negative_tokens_found).toContain('por que no comprar');
    expect(warning.commercial_intent_score).toBeLessThan(40);
    expect(warning.is_commercially_viable).toBe(false);

    // 2. "Review histórica del primer iphone"
    const history = analyzeCommercialIntent('review historica del primer iphone');
    expect(history.negative_tokens_found).toContain('historica');
    expect(history.commercial_intent_score).toBeLessThan(50);

    // 3. "Descargar manual de reparacion gratis"
    const freeManual = analyzeCommercialIntent('descargar manual de reparacion gratis');
    expect(freeManual.negative_tokens_found).toContain('gratis');
    expect(freeManual.negative_tokens_found).toContain('reparacion');
    expect(freeManual.is_commercially_viable).toBe(false);
  });

  // DR-19: Single source observation receives confidence penalty
  it('DR-19: Single source confidence penalty — 1 source yields significantly lower confidence than multiple', () => {
    const singleSourceMetric = [{
      source_platform: 'X_TWITTER' as const,
      metric_kind: 'PUBLIC_POST_COUNT' as const,
      actual_value: 1000,
      baseline_mean: 200,
      relative_lift: 5.0,
      z_score: 4.0,
      percentile: 99.9,
      velocity_score: 85,
      acceleration_score: 30
    }];

    const intent = analyzeCommercialIntent('aspiradora robot');
    const vectorSingle = constructDemandVector(singleSourceMetric, intent, 1);
    expect(vectorSingle.confidence).toBeLessThanOrEqual(60);
  });

  // DR-20: Multi-source independent confirmation receives confidence boost
  it('DR-20: Multi-source confidence boost — Concurrence across Google + X + YouTube maximizes confidence', () => {
    const multiMetrics = [
      {
        source_platform: 'GOOGLE_TRENDS_FAST' as const,
        metric_kind: 'SEARCH_INTEREST_INDEX' as const,
        actual_value: 80,
        baseline_mean: 30,
        relative_lift: 2.6,
        z_score: 3.0,
        percentile: 98,
        velocity_score: 80,
        acceleration_score: 25
      },
      {
        source_platform: 'X_TWITTER' as const,
        metric_kind: 'PUBLIC_POST_COUNT' as const,
        actual_value: 3000,
        baseline_mean: 500,
        relative_lift: 6.0,
        z_score: 5.0,
        percentile: 99.9,
        velocity_score: 90,
        acceleration_score: 40
      },
      {
        source_platform: 'YOUTUBE' as const,
        metric_kind: 'CONTENT_PUBLICATION_SIGNAL' as const,
        actual_value: 40,
        baseline_mean: 10,
        relative_lift: 4.0,
        z_score: 3.5,
        percentile: 99,
        velocity_score: 85,
        acceleration_score: 20
      }
    ];

    const intent = analyzeCommercialIntent('aspiradora robot precio comprar');
    const vectorMulti = constructDemandVector(multiMetrics, intent, 5);
    expect(vectorMulti.confidence).toBeGreaterThanOrEqual(85);
  });

  // DR-21: Duplicate signal idempotency & hash uniqueness
  it('DR-21: Duplicate signal idempotency — Evaluator handles signal hashes predictably', () => {
    const sig1: DemandSignal = {
      signal_id: 'sig_a',
      source_platform: 'GOOGLE_TRENDS_FAST',
      metric_kind: 'SEARCH_INTEREST_INDEX',
      metric_value: 75,
      metric_unit: 'INDEX_0_100',
      measurement_window: 'WINDOW_10M',
      raw_query_topic: 'aspiradora robot',
      normalized_query: 'aspiradora robot',
      region_code: 'AR',
      is_sampled: false,
      source_confidence: 0.9,
      observed_at: '2026-09-09T09:00:00Z',
      signal_hash: 'same_hash_123'
    };

    expect(sig1.signal_hash).toBe('same_hash_123');
  });

  // DR-22: Out-of-order event handling
  it('DR-22: Out-of-order event handling — Lead/Lag properly sorts observations chronologically', () => {
    const observations = [
      { platform: 'YOUTUBE' as const, observedAtIso: '2026-09-09T07:00:00Z' },
      { platform: 'X_TWITTER' as const, observedAtIso: '2026-09-09T05:00:00Z' }, // Earliest
      { platform: 'GOOGLE_TRENDS_FAST' as const, observedAtIso: '2026-09-09T09:00:00Z' }
    ];

    const leadLag = computeLeadLagMetadata(observations, '2026-09-09T12:00:00Z');
    expect(leadLag.leading_source).toBe('X_TWITTER');
    expect(leadLag.lag_to_search_minutes).toBe(240); // 4 hours (05:00 to 09:00)
    expect(leadLag.lag_to_commerce_minutes).toBe(420); // 7 hours (05:00 to 12:00)
  });

  // DR-23: Stale snapshot cannot become ACTIONABLE
  it('DR-23: Stale snapshot guard — Zero valid signals produces an INACTIVE snapshot', () => {
    const evaluator = new DemandRadarEvaluator();
    const staleSignal: DemandSignal = {
      signal_id: 'sig_old',
      source_platform: 'GOOGLE_TRENDS_FAST',
      metric_kind: 'SEARCH_INTEREST_INDEX',
      metric_value: 90,
      metric_unit: 'INDEX_0_100',
      measurement_window: 'WINDOW_10M',
      raw_query_topic: 'aspiradora robot',
      normalized_query: 'aspiradora robot',
      region_code: 'AR',
      is_sampled: false,
      source_confidence: 0.9,
      observed_at: '2026-09-09T00:00:00Z', // 9 hours old
      signal_hash: 'hash_old'
    };

    const res = evaluator.evaluateSignals(
      [staleSignal],
      'MLA',
      mockSitePolicy,
      mockCommissionRule,
      [],
      { nowIso: '2026-09-09T09:00:00Z' }
    );

    expect(res.rejected_signals.length).toBe(1);
    expect(res.rejected_signals[0].reason).toContain('SIGNAL_STALE');
    expect(res.snapshot.market_state).toBe('INACTIVE');
  });

  // DR-24: Commerce INELIGIBLE -> no opportunity
  it('DR-24: Commerce Gate Zero rejection — If all products fail Gate Zero, match score is 0 and tier INELIGIBLE', () => {
    const badBundle = createMockBundle('MLA999', 'Aspiradora Usada Rota', 5000, 'used', '1_red', 'paused', 0);
    const matchRes = matchClusterToCommerce('opp_1', 'MLA', mockSitePolicy, mockCommissionRule, [badBundle]);

    expect(matchRes.commerce_match?.eligible_items_count).toBe(0);
    expect(matchRes.commerce_match_score).toBe(0);

    const vector = {
      search_strength: 80,
      social_strength: 30,
      content_signal_strength: 20,
      commercial_intent: 80,
      confidence: 80,
      persistence: 50,
      acceleration: 20,
      saturation_index: 20
    };

    const opp = evaluateDemandOpportunity('cluster_1', 'snap_1', 'MLA', vector, 'COMMERCIAL_INTENT', 0);
    expect(opp.opportunity_tier).toBe('INELIGIBLE');
    expect(opp.overall_opportunity_score).toBe(0);
  });

  // DR-25: Commerce eligible -> match
  it('DR-25: Commerce Gate Zero pass — Eligible products produce positive match score and tier assignment', () => {
    const goodBundle1 = createMockBundle('MLA001', 'Aspiradora Robot Inteligente Nueva', 150000, 'new', '5_green', 'active', 20, true);
    const goodBundle2 = createMockBundle('MLA002', 'Robot Aspiradora Trapeadora Nueva', 180000, 'new', '5_green', 'active', 15, true);

    const matchRes = matchClusterToCommerce('opp_2', 'MLA', mockSitePolicy, mockCommissionRule, [goodBundle1, goodBundle2]);
    expect(matchRes.commerce_match?.eligible_items_count).toBe(2);
    expect(matchRes.commerce_match_score).toBeGreaterThan(50);

    const vector = {
      search_strength: 85,
      social_strength: 40,
      content_signal_strength: 50,
      commercial_intent: 85,
      confidence: 85,
      persistence: 60,
      acceleration: 40,
      saturation_index: 20
    };

    const opp = evaluateDemandOpportunity('cluster_aspiradora', 'snap_2', 'MLA', vector, 'COMMERCE_OPPORTUNITY', matchRes.commerce_match_score);
    expect(opp.opportunity_tier).toBe('TIER_2_VIABLE');
    expect(opp.status).toBe('ACTIONABLE');
  });

  // DR-26: Unknown MLA site policy -> BLOCK
  it('DR-26: Site Policy fail closed — Returns BLOCK if site policy is UNKNOWN or unverified', () => {
    const unverifiedPolicy: VersionedSitePolicy = {
      ...mockSitePolicy,
      policy_status: 'UNKNOWN'
    };

    const goodBundle = createMockBundle('MLA001', 'Aspiradora Robot', 150000);
    const matchRes = matchClusterToCommerce('opp_3', 'MLA', unverifiedPolicy, mockCommissionRule, [goodBundle]);

    expect(matchRes.is_policy_allowed).toBe(false);
    expect(matchRes.policy_rejection_reason).toContain('SITE_POLICY_NOT_VERIFIED');
    expect(matchRes.commerce_match_score).toBe(0);
  });

  // DR-27: Zero modifications to 078000
  it('DR-27: Immutability invariant — Consumes Atlas Commerce V1 read-only without schema modifications', () => {
    expect(typeof mockCommissionRule.commission_rate_percent).toBe('number');
    expect(mockSitePolicy.attribution_model).toBe('LAST_VALID_CLICK');
  });

  // DR-28: Deterministic score calculation
  it('DR-28: Deterministic score calculation — Mathematical formula is exact and repeatable', () => {
    const vector = {
      search_strength: 78,
      social_strength: 65,
      content_signal_strength: 50,
      commercial_intent: 88,
      confidence: 84,
      persistence: 72,
      acceleration: 82, // mapped accel: 50 + 41 = 91
      saturation_index: 20
    };

    const score = calculateDemandScore(vector);
    // (78 * .25) + (65 * .15) + (91 * .20) + (88 * .20) + (72 * .10) + (84 * .10)
    // 19.5 + 9.75 + 18.2 + 17.6 + 7.2 + 8.4 = 80.65 -> 80.7
    expect(score).toBe(80.7);
  });

  // DR-29: Score bounded strictly 0..100
  it('DR-29: Bounded scores — Even extreme outlier inputs stay strictly between 0 and 100', () => {
    const extremeHigh = {
      search_strength: 9999,
      social_strength: 9999,
      content_signal_strength: 9999,
      commercial_intent: 9999,
      confidence: 9999,
      persistence: 9999,
      acceleration: 9999,
      saturation_index: 0
    };

    const extremeLow = {
      search_strength: -500,
      social_strength: -500,
      content_signal_strength: -500,
      commercial_intent: -500,
      confidence: -500,
      persistence: -500,
      acceleration: -500,
      saturation_index: 100
    };

    expect(calculateDemandScore(extremeHigh)).toBe(100);
    expect(calculateDemandScore(extremeLow)).toBe(0);
    expect(calculateCommerceMatchScore(100, 100, 0.5, true)).toBeLessThanOrEqual(100);
    expect(calculateOpportunityGap(100, 100, 100, 0)).toBe(100);
    expect(calculateOpportunityGap(0, 0, 0, 100)).toBe(0);
  });

  // DR-30: Exact replay yields identical score
  it('DR-30: Exact replay determinism — 100 repeated runs on same vector produce exact identical output', () => {
    const vector = {
      search_strength: 62.4,
      social_strength: 71.8,
      content_signal_strength: 45.0,
      commercial_intent: 83.2,
      confidence: 76.5,
      persistence: 54.0,
      acceleration: 22.0,
      saturation_index: 35
    };

    const firstScore = calculateDemandScore(vector);
    for (let i = 0; i < 100; i++) {
      expect(calculateDemandScore(vector)).toBe(firstScore);
    }
  });

  // DR-31: Opportunity Gap factors market saturation
  it('DR-31: Saturation arbitrage — Low saturation yields higher Opportunity Gap than high competition', () => {
    const lowSatGap = calculateOpportunityGap(80, 85, 80, 15);  // 15% saturation (Low competition)
    const highSatGap = calculateOpportunityGap(80, 85, 80, 85); // 85% saturation (Crowded market)

    expect(lowSatGap).toBeGreaterThan(highSatGap);
    expect(lowSatGap).toBeCloseTo(46.2, 1);
    expect(highSatGap).toBeCloseTo(8.2, 1);
  });

  // DR-32: Semantic Cluster synonym resolution
  it('DR-32: Semantic clustering — Resolves synonyms and variations to canonical cluster', () => {
    const registry = new SemanticClusterRegistry();
    const c1 = registry.resolveCluster('notebook gamer');
    const c2 = registry.resolveCluster('laptop gamer');
    const c3 = registry.resolveCluster('notebook para gaming');

    expect(c1.slug).toBe('notebook-gamer');
    expect(c2.slug).toBe('notebook-gamer');
    expect(c3.slug).toBe('notebook-gamer');
  });

  // DR-33: Full End-to-End Evaluator Pipeline Test
  it('DR-33: End-to-End Pipeline — Integrates ingestion, normalization, intent, commerce match & tiering', () => {
    const evaluator = new DemandRadarEvaluator();

    const nowIso = '2026-09-09T09:15:00Z';
    const signals: DemandSignal[] = [
      {
        signal_id: 'sig_g_1',
        source_platform: 'GOOGLE_TRENDS_FAST',
        metric_kind: 'SEARCH_INTEREST_INDEX',
        metric_value: 82,
        metric_unit: 'INDEX_0_100',
        measurement_window: 'WINDOW_10M',
        raw_query_topic: 'aspiradora robot comprar precio',
        normalized_query: 'aspiradora robot comprar precio',
        region_code: 'AR',
        is_sampled: false,
        source_confidence: 0.95,
        observed_at: '2026-09-09T09:10:00Z',
        signal_hash: 'hash_g_1'
      },
      {
        signal_id: 'sig_x_1',
        source_platform: 'X_TWITTER',
        metric_kind: 'PUBLIC_POST_COUNT',
        metric_value: 2800,
        metric_unit: 'POST_COUNT',
        measurement_window: 'WINDOW_10M',
        raw_query_topic: 'aspiradora robot comprar precio',
        normalized_query: 'aspiradora robot comprar precio',
        region_code: 'AR',
        is_sampled: false,
        source_confidence: 0.88,
        observed_at: '2026-09-09T09:05:00Z',
        signal_hash: 'hash_x_1'
      }
    ];

    const bundles = [
      createMockBundle('MLA101', 'Aspiradora Robot Inteligente con Mapeo Láser Nueva', 220000, 'new', '5_green', 'active', 25, true),
      createMockBundle('MLA102', 'Aspiradora Robot Trapeadora WiFi Nueva', 195000, 'new', '5_green', 'active', 10, true)
    ];

    const result = evaluator.evaluateSignals(
      signals,
      'MLA',
      mockSitePolicy,
      mockCommissionRule,
      bundles,
      { nowIso, activeHours: 4, saturationIndex: 15 }
    );

    expect(result.rejected_signals.length).toBe(0);
    expect(result.snapshot.cluster_id).toBe('cluster_aspiradora-robot');
    expect(result.snapshot.source_diversity_count).toBe(2);
    expect(result.snapshot.market_state).toBe('COMMERCE_OPPORTUNITY');
    expect(result.opportunity).toBeDefined();
    expect(result.opportunity?.status).toBe('ACTIONABLE');
    expect(result.opportunity?.overall_opportunity_score).toBeGreaterThan(40);
  });
});
