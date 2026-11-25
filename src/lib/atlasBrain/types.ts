export type AtlasBehaviorEventType =
  | 'CONTENT_ENGAGEMENT'
  | 'PUBLIC_COMMENT'
  | 'PUBLIC_POST'
  | 'INTERNAL_SEARCH'
  | 'PRODUCT_VIEW'
  | 'PRICE_CHECK'
  | 'REQUEST_FOR_INFO'
  | 'CART_ACTIVITY'
  | 'PURCHASE'
  | 'REPEAT_PURCHASE';

export type AtlasEventPolarity = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';

export type AtlasInterestIntentLevel = 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH';

export interface AtlasBehaviorEvent {
  id: string;
  tenant_id: string;
  person_id: string;
  event_type: AtlasBehaviorEventType;
  topic: string;
  product_ref?: string | null;
  source_type: string;
  source_ref?: string;
  evidence_ref?: string;
  polarity: AtlasEventPolarity;
  confidence: number;
  observed_at: string; // ISO String
  event_hash: string;
  created_at: string;
}

export interface AtlasScoringPolicy {
  policy_version: string;
  weights_json: {
    INTEREST: Record<string, number>;
    INTENT: Record<string, number>;
  };
  decay_json: {
    half_life_days: {
      INTEREST: number;
      INTENT: number;
    }
  };
  thresholds_json: {
    INTEREST: { LOW: number; MEDIUM: number; HIGH: number };
    INTENT: { LOW: number; MEDIUM: number; HIGH: number };
  };
}

// ==========================================
// ATLAS 10P-C: PRODUCT FIT TYPES
// ==========================================

export interface AtlasProduct {
  product_id: string;
  tenant_id: string;
  name: string;
  category: string;
  description: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  attributes_json: any;
  created_at: string;
  updated_at: string;
}

export type AtlasGeographyMode = 'GLOBAL' | 'REMOTE' | 'LOCATION_PREFERRED' | 'LOCATION_REQUIRED';

export interface AtlasProductOffer {
  offer_id: string;
  tenant_id: string;
  product_id: string;
  price: number | null;
  currency: string | null;
  availability_status: 'AVAILABLE' | 'SOLD_OUT' | 'UNAVAILABLE';
  effective_from: string | null;
  expires_at: string | null;
  geography_mode: AtlasGeographyMode;
  location_ref: string | null;
  attributes_json: any;
  offer_version: string;
  created_at: string;
  updated_at: string;
}

export interface AtlasProductFitPolicy {
  policy_version: string;
  weights_json: {
    ProductAffinity: number;
    RecentIntent: number;
    NeedEvidence: number;
    ContextCompatibility: number;
    PriorEngagement: number;
    Freshness: number;
  };
  thresholds_json: {
    LOW: number;
    MEDIUM: number;
    HIGH: number;
    VERY_HIGH: number;
  };
  hard_gates_json: any;
  context_rules_json: any;
}

export type AtlasProductFitLevel = 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NO_FIT' | 'UNKNOWN';

export interface AtlasPersonProductFitState {
  id?: string;
  tenant_id: string;
  person_id: string;
  product_id: string;
  offer_id: string;
  context_hash: string;
  
  fit_score: number;
  fit_level: AtlasProductFitLevel;
  
  component_scores: Record<string, number>;
  reason_codes: string[];
  coverage: Record<string, boolean>;
  
  evidence_count: number;
  policy_version: string;
  input_snapshot_hash: string;
  evidence_snapshot_hash: string;
  
  calculated_at: string;
  expires_at: string | null;
}

export interface AtlasInterestState {
  tenant_id: string;
  person_id: string;
  topic: string;
  interest_level: AtlasInterestIntentLevel;
  interest_score: number;
  evidence_count: number;
  last_signal_at: string | null;
  policy_version: string;
  evidence_snapshot_hash: string;
  calculated_at: string;
}

export interface AtlasIntentState {
  tenant_id: string;
  person_id: string;
  topic: string;
  product_ref: string;
  intent_level: AtlasInterestIntentLevel;
  intent_score: number;
  evidence_count: number;
  last_signal_at: string | null;
  policy_version: string;
  evidence_snapshot_hash: string;
  reason_codes: any;
  calculated_at: string;
}

export interface AtlasPersonContext {
  location_ref: string | null;
}

// ==========================================
// ATLAS 10D: NEXT BEST ACTION TYPES
// ==========================================

export type AtlasNBAStatus = 'DO_NOW' | 'WAIT' | 'OBSERVE' | 'REVIEW_REQUIRED' | 'NO_ACTION';
export type AtlasNBACostClass = 'FREE_ORGANIC' | 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';

export type AtlasNBAAction = 
  | 'NO_ACTION' | 'OBSERVE' | 'WAIT' | 'REVIEW_REQUIRED' | 'HUMAN_REVIEW'
  | 'EMAIL' | 'WHATSAPP_SERVICE_REPLY' | 'WHATSAPP_MARKETING_MESSAGE'
  | 'INSTAGRAM_DM' | 'INSTAGRAM_PUBLIC_REPLY' | 'X_DM' | 'X_PUBLIC_REPLY'
  | 'YOUTUBE_COMMENT' | 'YOUTUBE_LIVE_CHAT' | 'LINKEDIN_COMMENT' | 'TELEGRAM_GROUP_POST';

export interface AtlasActionCostRegistry {
  cost_id: string;
  tenant_id: string;
  channel: string;
  action_type: AtlasNBAAction;
  cost_class: AtlasNBACostClass;
  estimated_unit_cost: number | null;
  currency: string | null;
  cost_basis: string | null;
  cost_version: string;
  effective_from: string;
  effective_until: string | null;
}

export interface AtlasNextBestActionPolicy {
  policy_version: string;
  ranking_weights_json: {
    PERSON: {
      FitWeight: number;
      IntentWeight: number;
      FreshnessWeight: number;
      PriorityWeight: number;
    };
    COMPANY: {
      DecisionWeight: number;
      PriorityWeight: number;
      OpportunityWeight: number;
      FreshnessWeight: number;
    };
  };
  cost_penalties_json: Record<AtlasNBACostClass, number>;
  hard_gates_json: any;
}

export interface AtlasNextBestActionState {
  nba_id?: string;
  tenant_id: string;
  subject_id: string;
  subject_type: 'PERSON' | 'COMPANY';
  product_id?: string | null;
  offer_id?: string | null;
  opportunity_id?: string | null;

  recommended_action: AtlasNBAAction;
  recommended_channel: string | null;
  decision_status: AtlasNBAStatus;

  priority_score: number;
  expected_value: number | null;
  estimated_action_cost: AtlasNBACostClass | null;
  expected_net_value: number | null;

  reason_codes: string[];
  alternative_actions: Array<{ action: AtlasNBAAction; channel: string; score: number }>;

  channel_eligibility_snapshot_id?: string | null;
  upstream_decision_ref?: string | null;
  product_fit_ref?: string | null;
  evidence_snapshot_hash: string;
  input_snapshot_hash: string;

  policy_version: string;
  cost_version: string | null;
  evaluated_at: string;
  expires_at: string | null;
}

// Minimal Upstream Inputs for 10D
export interface AtlasContactDecision {
  id: string;
  candidate_id: string;
  decision: 'CONTACT_NOW' | 'REVIEW_REQUIRED' | 'DO_NOT_CONTACT';
  priority_score: number | null;
  priority_tier: string | null;
  decision_hash: string;
  created_at: string;
}

export interface AtlasChannelEligibility {
  eligibility_id: string;
  subject_id: string;
  channel: string;
  action_type: AtlasNBAAction;
  eligibility_status: 'ELIGIBLE' | 'INELIGIBLE' | 'CONSENT_REQUIRED' | 'REVIEW_REQUIRED' | 'UNKNOWN';
  evaluated_at: string;
}

// ==========================================
// ATLAS 10G: OMNICHANNEL ROUTER TYPES
// ==========================================

export type Atlas10GBusinessDomain = 'OUTREACH' | 'GROWTH' | 'COMMERCE';

export interface AtlasOmnichannelRoutingPolicy {
  policy_id?: string;
  tenant_id: string;
  business_domain: Atlas10GBusinessDomain;
  policy_version: string;
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  config_json: {
    min_action_score?: number;
    required_margin_over_no_action?: number;
    channel_weights?: Record<string, number>;
    signal_weights?: Record<string, number>;
    cost_penalties?: Record<string, number>;
  };
  effective_from: string;
  effective_to: string | null;
}

export interface AtlasOmnichannelRoutingState {
  routing_id?: string;
  tenant_id: string;
  nba_id: string;
  business_domain: Atlas10GBusinessDomain;
  policy_id: string;
  candidate_set_hash: string;
  context_signal_hash: string;
  selected_action: AtlasNBAAction;
  selected_channel: string | null;
  selected_score: number;
  scored_candidates: Array<{
    action: AtlasNBAAction;
    channel: string | null;
    score: number;
  }>;
  reason_codes: string[];
  status: 'ROUTED' | 'HOLD' | 'REVIEW_REQUIRED' | 'FAILED';
  evaluated_at: string;
  created_at?: string;
}

