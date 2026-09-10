/**
 * ATLAS MAIL FABRIC V1 — Type Definitions
 * 
 * Standardized contracts and models for dedicated SMTP/MTA transport,
 * domain authentication, durable spooling, reputation guard, and cost ledger.
 */

export type SMTPDeliveryStatus = 
  | 'ACCEPTED'
  | 'TEMPORARY_FAILURE'
  | 'PERMANENT_FAILURE'
  | 'REJECTED'
  | 'TIMEOUT'
  | 'AMBIGUOUS';

export type MailFabricPoolKey = 
  | 'TRANSACTIONAL'
  | 'KNOWN_CUSTOMERS'
  | 'AUTHORIZED_OUTREACH'
  | 'WARMUP'
  | 'EXPERIMENTAL';

export type SpoolItemStatus = 
  | 'QUEUED'
  | 'PROCESSING'
  | 'DELIVERED'
  | 'TEMPORARY_DEFERRED'
  | 'FAILED_PERMANENT'
  | 'EXPIRED_MAX_AGE'
  | 'QUARANTINED';

export type ReputationStatus = 
  | 'HEALTHY'
  | 'THROTTLED'
  | 'DEGRADED'
  | 'PAUSED';

export type DMARCPolicy = 'none' | 'quarantine' | 'reject';

export interface DomainAuthConfig {
  domain_name: string;
  dkim_selector: string;
  dkim_public_key_record: string;
  dkim_key_length_bits: number;
  spf_record: string;
  dmarc_policy: DMARCPolicy;
  dmarc_record: string;
  helo_hostname: string;
  ptr_record_verified: boolean;
  tls_enforced: boolean;
  is_verified?: boolean;
}

export interface ThrottlingProfile {
  profile_id?: string;
  domain_pattern: string;
  provider_family: string;
  max_messages_per_minute: number;
  max_concurrent_connections: number;
  max_messages_per_connection: number;
  initial_backoff_seconds: number;
  max_backoff_seconds: number;
  retry_window_seconds: number;
  degradation_status: 'HEALTHY' | 'THROTTLED' | 'DEGRADED' | 'SUSPENDED';
  is_active: boolean;
}

export interface OutboundSpoolRequest {
  mta_queue_id: string;
  tenant_id: string;
  execution_id: string;
  attempt_id: string;
  pool_key: MailFabricPoolKey;
  recipient_email: string;
  subject: string;
  body: string;
  canonical_message_id: string;
  return_path_address: string;
  max_age_hours?: number;
  // Raw correlation token held strictly server-side
  raw_correlation_token?: string;
}

export interface SpoolQueueItem {
  spool_id: string;
  mta_queue_id: string;
  tenant_id: string;
  execution_id: string;
  attempt_id: string;
  pool_id: string;
  recipient_domain: string;
  recipient_domain_hash: string;
  payload_hash: string;
  canonical_message_id: string;
  return_path_address: string;
  status: SpoolItemStatus;
  attempt_count: number;
  max_attempts: number;
  enqueued_at: string;
  next_attempt_at: string;
  expires_at: string;
  completed_at?: string | null;
  last_error_code?: string | null;
  last_error_message?: string | null;
}

export interface ReputationTelemetryRecord {
  pool_id: string;
  recipient_domain: string;
  sent_count: number;
  accepted_count: number;
  temporary_deferral_count: number;
  permanent_bounce_count: number;
  complaint_count: number;
  throttled_count: number;
  observed_status: ReputationStatus;
}

export interface InfraCostBreakdown {
  period_month: string;
  vps_monthly_cost_usd: number;
  dedicated_ips_cost_usd: number;
  egress_cost_per_gb_usd: number;
  storage_cost_usd: number;
  dns_cost_usd: number;
  total_messages_accepted: number;
  total_messages_delivered: number;
  total_egress_gb: number;
  effective_cost_per_1000_accepted: number;
  effective_cost_per_1000_delivered: number;
  effective_cost_per_1m_delivered: number;
  effective_cost_per_10m_delivered: number;
}

export interface SMTPTransportOutcome {
  status: SMTPDeliveryStatus;
  smtp_response_code?: number;
  enhanced_status_code?: string;
  mta_queue_id?: string;
  provider_message_id?: string;
  error_details?: {
    code: string;
    message: string;
    is_transient: boolean;
  };
}

// ==============================================================================
// REPUTATION & DELIVERABILITY GUARD V1 CONTRACTS
// ==============================================================================

export type ReputationGuardState = 'GREEN' | 'WATCH' | 'HOLD';

export type SignalProviderType = 
  | 'GOOGLE_POSTMASTER'
  | 'MICROSOFT_SNDS'
  | 'POSTFIX_SMTP'
  | 'ATLAS_LEDGER'
  | 'AUTH_TELEMETRY'
  | 'AGGREGATED';

export type DomainReputationGrade = 'HIGH' | 'MEDIUM' | 'LOW' | 'BAD' | 'UNKNOWN' | 'INSUFFICIENT_SAMPLE';
export type IPReputationGrade = 'HIGH' | 'MEDIUM' | 'LOW' | 'BAD' | 'UNKNOWN' | 'INSUFFICIENT_SAMPLE';
export type AuthenticationStatus = 'PASS' | 'FAIL' | 'PARTIAL' | 'UNKNOWN';

export type VolumeGovernorTierKey = 
  | 'STRICT_HOLD'
  | 'PILOT_ONLY'
  | 'EARLY_RAMP'
  | 'CONTROLLED_SCALE'
  | 'EXPANDED_SCALE'
  | 'PRODUCTION_1K'
  | 'PRODUCTION_2_5K'
  | 'PRODUCTION_5K_BULK';

export interface VolumeGovernorTierConfig {
  tierKey: VolumeGovernorTierKey;
  maxDailyVolume: number;
  requiredConsecutiveGreenDays: number;
  requiresSufficientSample: boolean;
  description: string;
}

export interface NormalizedReputationSignal {
  signal_id?: string;
  provider: SignalProviderType;
  signal_date: string; // YYYY-MM-DD
  domain: string;
  sending_ip_hash?: string;
  spam_rate: number; // e.g. 0.0010 = 0.10%
  domain_reputation: DomainReputationGrade;
  ip_reputation: IPReputationGrade;
  authentication_status: AuthenticationStatus;
  delivery_errors: number;
  temporary_deferrals: number;
  hard_bounces: number;
  complaints: number;
  snds_abnormal_status: boolean;
  sample_volume: number;
  has_sufficient_sample: boolean;
  source_timestamp?: string;
}

export interface ReputationEvaluationResult {
  evaluation_id?: string;
  domain: string;
  evaluation_date: string;
  overall_status: ReputationGuardState;
  gate_reason: string;
  google_spam_rate: number;
  google_domain_reputation: DomainReputationGrade;
  google_ip_reputation: IPReputationGrade;
  google_compliance_status: string;
  snds_abnormal: boolean;
  auth_status: AuthenticationStatus;
  smtp_accepted_count: number;
  smtp_deferral_count: number;
  smtp_rejection_count: number;
  bounce_rate: number;
  complaint_rate: number;
  current_allowed_volume_per_day: number;
  current_tier: VolumeGovernorTierKey;
  consecutive_green_days: number;
  can_scale_volume: boolean;
  has_sufficient_sample: boolean;
  is_stale?: boolean;
}

export interface FeedbackIDConfig {
  campaign_id: string;
  tenant_hash: string;
  mail_type: 'TRANSACTIONAL' | 'PROMOTIONAL' | 'NEWSLETTER' | 'NOTIFICATION' | 'CANARY';
  sender_id: string; // Must be 5-15 characters, stable across mail stream (e.g. 'ATLASMAIL')
}

export interface GooglePostmasterV2Stats {
  domain: string;
  date: string;
  userReportedSpamRate: number;
  domainReputation: DomainReputationGrade;
  ipReputations: { ip: string; reputation: IPReputationGrade }[];
  spfSuccessRate: number;
  dkimSuccessRate: number;
  dmarcSuccessRate: number;
  deliveryErrors: { errorType: string; errorRatio: number }[];
  sampleCount: number;
  complianceStatus: string;
}

export interface MicrosoftSNDSReport {
  ipAddress: string;
  activityDate: string;
  status: 'NORMAL' | 'ABNORMAL' | 'RED' | 'UNKNOWN';
  filterResult: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';
  complaintRate: number;
  trapHits: number;
  messageVolume: number;
  sampleCount: number;
}

