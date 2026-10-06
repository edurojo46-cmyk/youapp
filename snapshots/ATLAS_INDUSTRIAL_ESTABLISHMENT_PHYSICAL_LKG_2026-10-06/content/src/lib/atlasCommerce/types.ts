/**
 * Atlas Commerce V1 — Core Types & Contracts (Gate Zero Closure)
 * Mercado Libre Affiliates & Commercial Policy Engine
 */

export type CommercePartnerId = 'MERCADO_LIBRE';
export type MercadoLibreSiteId = 'MLA' | 'MLB' | 'MLM' | 'MLC' | 'MLU' | 'MCO';

export type SitePolicyStatus = 'VERIFIED' | 'UNKNOWN' | 'BLOCKED';

export interface VersionedSitePolicy {
  site_id: MercadoLibreSiteId;
  policy_version: string;
  policy_status: SitePolicyStatus;
  attribution_window_hours: number;
  attribution_model: 'LAST_VALID_CLICK';
  source_url: string;
  observed_at: string;
  effective_from: string;
  effective_to: string | null;
}

export type CommerceChannelType =
  | 'OWN_PUBLIC_WEBSITE'
  | 'OWN_PUBLIC_SOCIAL'
  | 'PUBLIC_WHATSAPP'
  | 'PUBLIC_TELEGRAM'
  | 'EMAIL'
  | 'SMS'
  | 'PRIVATE_DM'
  | 'CLOSED_GROUP'
  | 'PAID_TRAFFIC';

export type ChannelPolicyStatus = 'ALLOW' | 'BLOCK' | 'UNKNOWN';

export interface VersionedChannelPolicy {
  policy_id: string;
  site_id: MercadoLibreSiteId;
  channel: CommerceChannelType | string;
  policy_status: ChannelPolicyStatus;
  policy_version: string;
  source_url: string;
  observed_at: string;
  effective_from: string;
  effective_to: string | null;
}

export type ProductCondition = 'NEW' | 'USED' | 'RECONDITIONED' | 'NOT_SPECIFIED';

export type SellerReputationLevel =
  | '1_red'
  | '2_orange'
  | '3_yellow'
  | '4_light_green'
  | '5_green'
  | 'unknown';

export type PowerSellerStatus = 'platinum' | 'gold' | 'silver' | null;

export type AvailabilitySemantics = 'REFERENCE_BUCKET' | 'EXACT_COUNT';
export type AvailabilityStatus = 'AVAILABLE' | 'OUT_OF_STOCK' | 'PAUSED' | 'CLOSED';

export interface RawMercadoLibreItem {
  id: string;
  title: string;
  category_id: string;
  price: number;
  currency_id: string;
  condition: string;
  status: string; // 'active' | 'paused' | 'closed'
  available_quantity: number; // In ML public API, represents reference bucket (e.g. 1 = 1..50)
  seller_id: number | string;
  shipping?: {
    mode?: string;
    free_shipping?: boolean;
    logistic_type?: string; // 'fulfillment', 'cross_docking', 'drop_off'
  };
}

export interface RawMercadoLibreSeller {
  id: number | string;
  nickname: string;
  seller_reputation: {
    level_id: string | null;
    power_seller_status: string | null;
    transactions?: {
      completed?: number;
      canceled?: number;
      ratings?: {
        positive?: number;
        negative?: number;
        neutral?: number;
      };
    };
    metrics?: {
      claims?: { rate?: number; value?: number };
      delayed_handling_time?: { rate?: number; value?: number };
      cancellations?: { rate?: number; value?: number };
    };
  };
}

export interface ProductEligibilityResult {
  is_eligible: boolean;
  rejection_reasons: string[];
  mandatory_checks: {
    condition_is_new: boolean;
    seller_is_green: boolean;
    listing_is_active: boolean;
    stock_is_available: boolean;
  };
  availability: {
    status: AvailabilityStatus;
    available_quantity_reference: number;
    semantics: AvailabilitySemantics;
  };
}

export interface AtlasQualityScoreResult {
  quality_score: number; // 0..100
  factors: {
    power_seller_points: number; // 0..30
    shipping_fulfillment_points: number; // 0..25
    reputation_points: number; // 0..25
    low_cancellation_points: number; // 0..20
  };
}

export interface VersionedCommissionMatrix {
  matrix_id: string;
  partner_id: 'MERCADO_LIBRE';
  site_id: MercadoLibreSiteId;
  version: string;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
}

export interface CommissionRule {
  rule_id: string;
  site_id: MercadoLibreSiteId;
  category_id: string;
  category_name: string;
  commission_rate_percent: number; // e.g. 0.085 (8.5%)
  fixed_commission_amount: number;
  max_commission_cap: number | null;
  min_price_threshold: number;
  is_eligible: boolean;
}

export interface CommissionCalculationResult {
  is_commissionable: boolean;
  sale_amount: number;
  commission_rate_percent: number;
  computed_commission: number;
  attribution_window_hours: number;
  attribution_model: 'LAST_VALID_CLICK';
  reason?: string;
}

export interface OfficialLinkMapping {
  internal_tracking_id: string; // Internal Atlas UUID
  tenant_id: string;
  execution_id: string; // Internal Atlas execution UUID
  cost_id: string;
  campaign_id: string; // Internal campaign grouping
  official_ml_label: string; // Official ML label: <=30 chars, [a-z0-9]
  official_generated_url: string;
  created_at: string;
}

export type ConversionSourceType =
  | 'PORTAL_REPORT'
  | 'FILE_IMPORT'
  | 'PARTNER_API'
  | 'PARTNER_WEBHOOK';

export type SourceCapabilityStatus = 'PROVEN' | 'UNKNOWN' | 'DISABLED';

export interface ConversionSourceCapability {
  source_type: ConversionSourceType;
  partner_id: 'MERCADO_LIBRE';
  capability_status: SourceCapabilityStatus;
  documentation_source: string;
  verified_at: string | null;
}

export type CommissionLifecycleState =
  | 'CLICK'
  | 'ATTRIBUTED'
  | 'SALE_REPORTED'
  | 'COMMISSION_PENDING'
  | 'COMMISSION_VALIDATED'
  | 'COMMISSION_REJECTED'
  | 'REFUND';

export interface IngestedPartnerEvent {
  source_type: ConversionSourceType;
  external_event_key: string;
  source_record_hash: string;
  raw_reference: Record<string, any>;
  observed_at: string;
  order_id: string;
  item_id: string;
  sale_amount: number;
  commission_amount: number;
  campaign_label: string | null;
  status: 'REPORTED' | 'VALIDATED' | 'CANCELLED' | 'REFUNDED';
}
