/**
 * Atlas Demand Radar V1 — Core Types & Contracts
 * Hardened Architecture with Source-Native Semantics & Zero PII
 */

import type { MercadoLibreSiteId } from '../atlasCommerce/types';

export type SourcePlatform =
  | 'GOOGLE_TRENDS_FAST'  // Trending Now (~10 min freshness)
  | 'GOOGLE_TRENDS_SLOW'  // Normalized Historical API
  | 'X_TWITTER'           // Recent Posts / Filtered Stream Counts
  | 'YOUTUBE'             // Content Publication Activity (Videos/Channels)
  | 'NEWS_WEB'            // Editorial / Article publication frequency
  | 'MASTODON'            // Fediverse public posts
  | 'BLUESKY'             // Jetstream public firehose
  | 'TIKTOK_PUBLIC';      // Public research tools (UNKNOWN/BLOCK)

export type MetricKind =
  | 'SEARCH_INTEREST_INDEX'      // Google Trends relative search index (0..100)
  | 'PUBLIC_POST_COUNT'          // X / Social mentions and posts count
  | 'CONTENT_PUBLICATION_SIGNAL' // YouTube new videos, channels, uploads count
  | 'ARTICLE_COUNT'              // Editorial news articles count
  | 'ENGAGEMENT_VOLUME';         // Social likes, reposts, comments

export type MetricUnit =
  | 'INDEX_0_100'
  | 'POST_COUNT'
  | 'VIDEO_COUNT'
  | 'ARTICLE_COUNT'
  | 'ENGAGEMENT_SCORE';

export type MeasurementWindow =
  | 'WINDOW_10M'
  | 'WINDOW_4H'
  | 'WINDOW_24H'
  | 'WINDOW_48H'
  | 'WINDOW_7D'
  | 'WINDOW_30D';

export type CapabilityStatus = 'PROVEN' | 'UNKNOWN' | 'DISABLED';

export interface SourceCapability {
  platform: SourcePlatform;
  capability_status: CapabilityStatus;
  commercial_use_authorized: boolean;
  metric_kind: MetricKind;
  metric_unit: MetricUnit;
  default_measurement_window: MeasurementWindow;
  max_freshness_seconds: number;
  documentation_ref: string;
}

export type RegionCode = 'AR' | 'BR' | 'MX' | 'CL' | 'UY' | 'CO' | 'GLOBAL';

export interface DemandSignal {
  signal_id: string;
  source_platform: SourcePlatform;
  metric_kind: MetricKind;
  metric_value: number;
  metric_unit: MetricUnit;
  measurement_window: MeasurementWindow;
  raw_query_topic: string;
  normalized_query: string;
  region_code: RegionCode;
  is_sampled: boolean;
  source_confidence: number; // 0..1.0
  observed_at: string;       // ISO 8601
  signal_hash: string;       // SHA-256 idempotency key
}

export interface SourceRollingBaseline {
  source_platform: SourcePlatform;
  cluster_id_or_topic: string;
  region_code: RegionCode;
  hour_of_day: number; // 0..23
  mean: number;
  std_dev: number;
  p50: number;
  p90: number;
  sample_count: number;
  updated_at: string;
}

export interface NormalizedMetric {
  source_platform: SourcePlatform;
  metric_kind: MetricKind;
  actual_value: number;
  baseline_mean: number;
  relative_lift: number;      // actual / max(baseline, 0.001)
  z_score: number;            // (actual - mean) / max(std_dev, 0.001)
  percentile: number;         // 0..100
  velocity_score: number;     // 0..100
  acceleration_score: number; // -100..+100
}

export type ClusterStatus =
  | 'EMERGING'
  | 'ACCELERATING'
  | 'SUSTAINED'
  | 'DECAYING'
  | 'DORMANT';

export interface DemandCluster {
  cluster_id: string;
  canonical_title: string;
  slug: string;
  synonyms: string[];
  category_hint: string;
  status: ClusterStatus;
  first_detected_at: string;
  last_seen_at: string;
}

export type MarketState =
  | 'TREND'                  // High social conversation, low buying intent -> No commerce action
  | 'SEARCH_DEMAND'          // High search interest, developing intent
  | 'COMMERCIAL_INTENT'      // Strong explicit buying intent, awaiting commerce match
  | 'COMMERCE_OPPORTUNITY'   // High demand + verified Gate Zero products + margin
  | 'HYBRID_ACCELERATING'    // Strong search + social alignment
  | 'INACTIVE';

export interface CommercialIntentAnalysis {
  raw_query: string;
  commercial_intent_score: number; // 0..100
  positive_tokens_found: string[];
  negative_tokens_found: string[];
  is_commercially_viable: boolean;
  intent_level: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  intent_modifiers: string[];
  explanation: string;
}

export interface DemandVector {
  search_strength: number;      // 0..100 (from Google Trends normalised)
  social_strength: number;      // 0..100 (from X / Social normalised)
  content_signal_strength: number; // 0..100 (from YouTube normalised)
  commercial_intent: number;    // 0..100 (lexical + semantic - negative discount)
  confidence: number;           // 0..100 (source diversity + source authority)
  persistence: number;          // 0..100 (hours active)
  acceleration: number;         // -100..+100
  saturation_index: number;     // 0..100 (competition / supply density)
}

export interface LeadLagProfileMetadata {
  leading_source: SourcePlatform;
  lag_to_search_minutes: number | null;
  lag_to_commerce_minutes: number | null;
  confidence: number;
  sample_size: number;
}

export interface DemandSnapshot {
  snapshot_id: string;
  cluster_id: string;
  as_of: string;
  metrics: NormalizedMetric[];
  demand_vector: DemandVector;
  demand_score: number; // 0..100
  market_state: MarketState;
  source_diversity_count: number;
  lead_lag_metadata?: LeadLagProfileMetadata;
  is_stale: boolean;
}

export type OpportunityTier =
  | 'TIER_1_EXPEDITE'  // >= 75: Immediate buyer reach routing
  | 'TIER_2_VIABLE'    // 50..74: Standard actionable opportunity
  | 'TIER_3_MONITOR'   // 30..49: Emerging watch
  | 'INELIGIBLE';      // < 30: Blocked

export type OpportunityStatus =
  | 'DETECTED'
  | 'MATCHED'
  | 'ACTIONABLE'
  | 'ARCHIVED';

export interface DemandOpportunity {
  opportunity_id: string;
  cluster_id: string;
  snapshot_id: string;
  site_id: MercadoLibreSiteId;
  demand_score: number;            // 0..100
  commerce_match_score: number;    // 0..100
  overall_opportunity_score: number; // 0..100
  opportunity_gap_score: number;   // 0..100 (Factoring saturation)
  opportunity_tier: OpportunityTier;
  market_state: MarketState;
  status: OpportunityStatus;
  evaluation_reason: string;
  created_at: string;
}

export interface DemandCommerceMatch {
  match_id: string;
  opportunity_id: string;
  site_id: MercadoLibreSiteId;
  matched_items_count: number;
  eligible_items_count: number;
  top_eligible_item_ids: string[];
  avg_quality_score: number;
  avg_commission_rate: number;
  estimated_unit_commission: number;
  best_product_condition: string;
  fulfillment_available: boolean;
  matched_at: string;
}
