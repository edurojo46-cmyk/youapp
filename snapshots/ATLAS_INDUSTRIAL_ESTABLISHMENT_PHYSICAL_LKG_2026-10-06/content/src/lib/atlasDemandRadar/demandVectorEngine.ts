/**
 * Atlas Demand Radar V1 — Demand Vector & Market State Engine
 * Multidimensional Vector Modeling, State Derivation & Lead/Lag Architecture
 */

import type {
  DemandVector,
  MarketState,
  NormalizedMetric,
  CommercialIntentAnalysis,
  LeadLagProfileMetadata,
  SourcePlatform
} from './types';

export function constructDemandVector(
  metrics: NormalizedMetric[],
  intent: CommercialIntentAnalysis,
  activeHours: number = 1,
  saturationIndex: number = 20
): DemandVector {
  let searchStrength = 0;
  let socialStrength = 0;
  let contentSignalStrength = 0;
  let totalAcceleration = 0;

  let searchCount = 0;
  let socialCount = 0;
  let contentCount = 0;

  for (const m of metrics) {
    if (m.source_platform === 'GOOGLE_TRENDS_FAST' || m.source_platform === 'GOOGLE_TRENDS_SLOW') {
      searchStrength += m.velocity_score;
      totalAcceleration += m.acceleration_score;
      searchCount++;
    } else if (m.source_platform === 'X_TWITTER' || m.source_platform === 'MASTODON' || m.source_platform === 'BLUESKY') {
      socialStrength += m.velocity_score;
      totalAcceleration += m.acceleration_score;
      socialCount++;
    } else if (m.source_platform === 'YOUTUBE') {
      contentSignalStrength += m.velocity_score;
      totalAcceleration += m.acceleration_score;
      contentCount++;
    } else if (m.source_platform === 'NEWS_WEB') {
      contentSignalStrength += m.velocity_score * 0.5;
      totalAcceleration += m.acceleration_score;
      contentCount++;
    }
  }

  const avgSearch = searchCount > 0 ? searchStrength / searchCount : 0;
  const avgSocial = socialCount > 0 ? socialStrength / socialCount : 0;
  const avgContent = contentCount > 0 ? contentSignalStrength / contentCount : 0;
  const avgAccel = metrics.length > 0 ? totalAcceleration / metrics.length : 0;

  // Source diversity factor: 1 source = penalty (0.6x), 2 sources = 0.85x, 3+ sources = 1.0x
  const distinctSources = new Set(metrics.map(m => m.source_platform)).size;
  let diversityMultiplier = 0.5;
  if (distinctSources >= 3) diversityMultiplier = 1.0;
  else if (distinctSources === 2) diversityMultiplier = 0.85;
  else if (distinctSources === 1) diversityMultiplier = 0.65;

  // Confidence combines sample support, baseline validity and diversity
  const rawConfidence = 70 + (metrics.length * 5);
  const confidence = Math.min(100, Math.max(10, Math.round(rawConfidence * diversityMultiplier)));

  // Persistence score (0..100) based on continuous observation hours
  const persistence = Math.min(100, Math.max(10, Math.round(activeHours * 4.5)));

  return {
    search_strength: +avgSearch.toFixed(1),
    social_strength: +avgSocial.toFixed(1),
    content_signal_strength: +avgContent.toFixed(1),
    commercial_intent: intent.commercial_intent_score,
    confidence,
    persistence,
    acceleration: +avgAccel.toFixed(1),
    saturation_index: saturationIndex
  };
}

/**
 * Derives Market State from the multidimensional vector.
 * Crucial: Does NOT assume a strict sequential ladder (Trend -> Search -> Commercial -> Opportunity).
 * A purely search-driven tool query can directly be COMMERCIAL_INTENT / COMMERCE_OPPORTUNITY without social trend.
 */
export function deriveMarketState(vector: DemandVector, hasEligibleProducts: boolean = false): MarketState {
  const { search_strength, social_strength, commercial_intent } = vector;

  // Case 1: Inactive
  if (search_strength < 15 && social_strength < 15 && commercial_intent < 20) {
    return 'INACTIVE';
  }

  // Case 2: High social viral conversation, but low buying intent -> TREND (NOT commercial)
  if (social_strength >= 60 && search_strength < 40 && commercial_intent < 35) {
    return 'TREND';
  }

  // Case 3: Hybrid accelerating (high search + high social)
  if (search_strength >= 60 && social_strength >= 60 && commercial_intent >= 50) {
    return hasEligibleProducts ? 'COMMERCE_OPPORTUNITY' : 'HYBRID_ACCELERATING';
  }

  // Case 4: Strong search interest with developing commercial intent
  if (search_strength >= 55 && commercial_intent >= 45) {
    return hasEligibleProducts ? 'COMMERCE_OPPORTUNITY' : 'COMMERCIAL_INTENT';
  }

  // Case 5: Direct high commercial intent without prior social trend (e.g. "comprar bomba de agua 1hp")
  if (commercial_intent >= 65 && (search_strength >= 30 || hasEligibleProducts)) {
    return hasEligibleProducts ? 'COMMERCE_OPPORTUNITY' : 'COMMERCIAL_INTENT';
  }

  // Case 6: Pure search interest emerging
  if (search_strength >= 50) {
    return 'SEARCH_DEMAND';
  }

  // Fallback: If social is primary driver
  if (social_strength >= 40) {
    return 'TREND';
  }

  return 'INACTIVE';
}

/**
 * Computes Lead/Lag temporal sequence across source timestamps
 */
export function computeLeadLagMetadata(
  sourceFirstObserved: Array<{ platform: SourcePlatform; observedAtIso: string }>,
  commerceFirstClickedIso?: string
): LeadLagProfileMetadata {
  if (sourceFirstObserved.length === 0) {
    return {
      leading_source: 'GOOGLE_TRENDS_FAST',
      lag_to_search_minutes: null,
      lag_to_commerce_minutes: null,
      confidence: 10,
      sample_size: 0
    };
  }

  // Sort chronologically
  const sorted = [...sourceFirstObserved].sort(
    (a, b) => new Date(a.observedAtIso).getTime() - new Date(b.observedAtIso).getTime()
  );

  const leading = sorted[0];
  const leadingTime = new Date(leading.observedAtIso).getTime();

  const searchObs = sorted.find(s => s.platform === 'GOOGLE_TRENDS_FAST' || s.platform === 'GOOGLE_TRENDS_SLOW');
  let lagToSearch: number | null = null;
  if (searchObs && searchObs !== leading) {
    lagToSearch = Math.max(0, Math.round((new Date(searchObs.observedAtIso).getTime() - leadingTime) / (1000 * 60)));
  }

  let lagToCommerce: number | null = null;
  if (commerceFirstClickedIso) {
    lagToCommerce = Math.max(0, Math.round((new Date(commerceFirstClickedIso).getTime() - leadingTime) / (1000 * 60)));
  }

  return {
    leading_source: leading.platform,
    lag_to_search_minutes: lagToSearch,
    lag_to_commerce_minutes: lagToCommerce,
    confidence: sorted.length >= 3 ? 85 : 50,
    sample_size: sorted.length
  };
}
