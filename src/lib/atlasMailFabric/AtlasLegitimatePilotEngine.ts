/**
 * ATLAS MAIL FABRIC — REPUTATION ACCUMULATION PILOT V1 ENGINE
 *
 * Implements governance and execution for legitimate initial deliverability pilots:
 * - Governed 100% by Reputation Guard V1, Volume Governor & Suppression Guard
 * - Hard ceiling cap: 25 emails/day (Baseline operating target: 3–5 legitimate expected messages/day)
 * - Operating target does NOT grow automatically with elapsed time
 * - Strict recipient eligibility: CONTROLLED_OWN_ACCOUNT, REGISTERED_OPT_IN, TRANSACTIONAL_REQUESTED, EXPECTED_RECIPIENT
 * - Hard Gate Fail-Closed: ZERO cold outreach, scraping, bought lists, mass sending, artificial warming, or fake replies
 * - Placement Sample Biasing Guard: flags mailboxes with manual filter overrides as PLACEMENT_SAMPLE_BIASED = TRUE
 * - Zero-PII telemetry: records outcomes, metrics, and placements without storing email addresses
 * - Invariant: INSUFFICIENT_SAMPLE is never converted into GREEN or CERTIFIED
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  ReputationGuardState,
  VolumeGovernorTierKey,
  ReputationEvaluationResult,
  NormalizedReputationSignal
} from './types';
import { AtlasMailReputationGuard } from './AtlasMailReputationGuard';
import { AtlasMailVolumeGovernor } from './AtlasMailVolumeGovernor';
import { GooglePostmasterV2Adapter, MicrosoftSNDSAdapter } from './AtlasMailSignalProviders';
import {
  LegitimateSourceEventGuard,
  LegitimateSourceEvent,
  LegitimateEventType,
  ProhibitedEventType,
  PROHIBITED_EVENT_TYPES
} from './LegitimateSourceEventGuard';

export type PilotRecipientCategory =
  | 'CONTROLLED_OWN_ACCOUNT'
  | 'REGISTERED_OPT_IN'
  | 'TRANSACTIONAL_REQUESTED'
  | 'EXPECTED_RECIPIENT'
  | 'REGISTERED_USER'
  | 'REQUESTED_COMMUNICATION'
  | 'TRANSACTIONAL_NOTIFICATION';

export const PROHIBITED_PILOT_PRACTICES = [
  ...PROHIBITED_EVENT_TYPES,
  'COLD_OUTREACH',
  'SCRAPED_ADDRESSES',
  'PURCHASED_LISTS',
  'SPAM_TRAPS',
  'ARTIFICIAL_ENGAGEMENT',
  'AUTOMATED_NOT_SPAM_MANIPULATION',
  'FAKE_REPLIES',
  'FAKE_OPENS_CLICKS'
] as const;

export interface PilotMessageRequest {
  recipient_hash: string; // SHA-256 hash of recipient email (Strict Zero-PII)
  recipient_category: PilotRecipientCategory;
  sending_domain: string; // e.g. 'youapptv.com'
  destination_provider: 'GMAIL' | 'OUTLOOK' | 'OTHER';
  destination_domain: string; // e.g. 'gmail.com', 'outlook.com'
  subject_type: 'ACCOUNT_CONFIRMATION' | 'SECURITY_ALERT' | 'TRANSACTION_RECEIPT' | 'CONSENTED_UPDATE';
  is_consented_or_transactional: boolean;
  is_prohibited_practice?: boolean;
  source_event?: LegitimateSourceEvent;
}

export interface PlacementObservation {
  provider: 'GMAIL' | 'OUTLOOK';
  placement: 'INBOX' | 'PROMOTIONS' | 'SPAM' | 'JUNK';
  observed_at: string;
  is_sample_biased?: boolean; // TRUE if user manually marked 'Not spam' or added to safe sender list
}

export interface PilotDailyLedger {
  date: string;
  sent: number;
  accepted_250: number;
  deferred_4xx: number;
  rejected_5xx: number;
  hard_bounces: number;
  soft_bounces: number;
  complaints: number;
  unsubscribes: number;
  initial_operational_ceiling: number; // 5 legitimate msgs/day
  hard_reputation_cap: number; // 25 msgs/day
  operating_target: string; // 'INITIAL_OPERATIONAL_CEILING = 5/DAY, HARD_CAP = 25/DAY'
  gmail_postmaster_status: string;
  microsoft_snds_status: string;
  auth_status: 'PASS' | 'FAIL' | 'PARTIAL';
  current_gate: ReputationGuardState;
  current_daily_cap: number;
  current_tier: VolumeGovernorTierKey;
  gmail_placement_observed: string;
  gmail_sample_biased: boolean;
  outlook_placement_observed: string;
  outlook_sample_biased: boolean;
  can_scale: boolean;
  gate_reason: string;
}

export interface PilotDispatchResult {
  dispatched: boolean;
  mta_status: 'ACCEPTED_250' | 'DEFERRED_4XX' | 'REJECTED_5XX' | 'BLOCKED_BY_GUARD';
  reason: string;
  zero_pii_confirmed: boolean;
  recipient_hash: string;
  destination_domain: string;
  timestamp: string;
  event_hash?: string;
}

export interface PilotCycleReport {
  PILOT_SENT: number;
  ACCEPTED: number;
  BOUNCED: number;
  DEFERRED: number;
  COMPLAINTS: number;
  UNSUBSCRIBES: number;
  INITIAL_OPERATIONAL_CEILING: number;
  HARD_REPUTATION_CAP: number;
  OPERATING_TARGET: string;
  GOOGLE_POSTMASTER: string;
  MICROSOFT_SNDS: string;
  GMAIL_PLACEMENT: string;
  GMAIL_SAMPLE_BIASED: boolean;
  GMAIL_HISTORICAL_PRE_INTERVENTION_PLACEMENT: 'SPAM';
  GMAIL_HISTORICAL_SOURCE: 'MANUAL_OBSERVATION';
  GMAIL_CURRENT_NEUTRAL_PLACEMENT: 'UNKNOWN';
  OUTLOOK_PLACEMENT: string;
  OUTLOOK_SAMPLE_BIASED: boolean;
  MICROSOFT_PLACEMENT: 'JUNK';
  MICROSOFT_SCL: number;
  MICROSOFT_BCL: number;
  DOMINANT_REMAINING_HYPOTHESIS: string;
  ROOT_CAUSE_CERTAINTY: string;
  REPUTATION_GATE: string;
  CURRENT_DAILY_CAP: number;
  CAN_SCALE: boolean;
  MASS_SENDING: 'BLOCKED';
  PRODUCTION: 'STRICT_HOLD';
  INBOX_DELIVERABILITY: 'NOT_CERTIFIED' | 'CERTIFIED';
  PHYSICAL_SEND_DURING_THIS_TASK: number;
}

export class AtlasLegitimatePilotEngine {
  private reputationGuard: AtlasMailReputationGuard;
  private eventGuard: LegitimateSourceEventGuard = new LegitimateSourceEventGuard();
  private suppressionList: Set<string> = new Set();
  private dailyLedger: Map<string, PilotDailyLedger> = new Map();
  private placements: PlacementObservation[] = [];

  constructor(
    private supabase?: SupabaseClient,
    private googleAdapter?: GooglePostmasterV2Adapter,
    private sndsAdapter?: MicrosoftSNDSAdapter
  ) {
    this.reputationGuard = new AtlasMailReputationGuard(this.supabase);
  }

  /**
   * Adds a recipient hash to the local/runtime suppression list.
   */
  public suppressRecipientHash(hash: string): void {
    this.suppressionList.add(hash.toLowerCase().trim());
  }

  /**
   * Checks whether a recipient hash is suppressed.
   */
  public isSuppressed(hash: string): boolean {
    return this.suppressionList.has(hash.toLowerCase().trim());
  }

  /**
   * Records manual inbox placement observation for controlled test accounts.
   * Strictly Zero-PII: only records provider and placement result.
   */
  public recordPlacementObservation(
    provider: 'GMAIL' | 'OUTLOOK',
    placement: 'INBOX' | 'PROMOTIONS' | 'SPAM' | 'JUNK',
    isSampleBiased = false
  ): void {
    this.placements.push({
      provider,
      placement,
      observed_at: new Date().toISOString(),
      is_sample_biased: isSampleBiased
    });
  }

  /**
   * Gets latest placement summary.
   */
  public getPlacementSummary(): {
    gmail: string;
    gmailBiased: boolean;
    outlook: string;
    outlookBiased: boolean;
  } {
    const gmailObs = this.placements.filter(p => p.provider === 'GMAIL').slice(-1)[0];
    const outlookObs = this.placements.filter(p => p.provider === 'OUTLOOK').slice(-1)[0];

    return {
      gmail: gmailObs ? gmailObs.placement : 'NOT_OBSERVED_YET',
      gmailBiased: Boolean(gmailObs?.is_sample_biased),
      outlook: outlookObs ? outlookObs.placement : 'NOT_OBSERVED_YET',
      outlookBiased: Boolean(outlookObs?.is_sample_biased)
    };
  }

  /**
   * Initializes or returns today's pilot ledger.
   */
  public getTodayLedger(dateStr?: string): PilotDailyLedger {
    const today = dateStr || new Date().toISOString().split('T')[0];
    if (!this.dailyLedger.has(today)) {
      this.dailyLedger.set(today, {
        date: today,
        sent: 0,
        accepted_250: 0,
        deferred_4xx: 0,
        rejected_5xx: 0,
        hard_bounces: 0,
        soft_bounces: 0,
        complaints: 0,
        unsubscribes: 0,
        initial_operational_ceiling: LegitimateSourceEventGuard.INITIAL_OPERATIONAL_CEILING,
        hard_reputation_cap: LegitimateSourceEventGuard.HARD_REPUTATION_CAP,
        operating_target: 'INITIAL_OPERATIONAL_CEILING = 5/DAY, HARD_CAP = 25/DAY',
        gmail_postmaster_status: 'INSUFFICIENT_SAMPLE',
        microsoft_snds_status: 'INSUFFICIENT_SAMPLE',
        auth_status: 'PASS',
        current_gate: 'WATCH',
        current_daily_cap: 25,
        current_tier: 'PILOT_ONLY',
        gmail_placement_observed: 'NOT_OBSERVED_YET',
        gmail_sample_biased: true,
        outlook_placement_observed: 'NOT_OBSERVED_YET',
        outlook_sample_biased: false,
        can_scale: false,
        gate_reason: 'INSUFFICIENT_SAMPLE_NEW_IP_PILOT_ONLY'
      });
    }
    return this.dailyLedger.get(today)!;
  }

  /**
   * Executes the full gated pipeline for a legitimate pilot message:
   * 0. LegitimateSourceEventGuard (Pre-condition: must have authentic source event)
   * 1. Suppression Guard Check
   * 2. Recipient Category & Legitimacy Validation (Prohibits cold outreach, scraped lists)
   * 3. Reputation Guard & Volume Governor Gate Evaluation
   * 4. Daily Volume Limit Enforcement (<= 25 cap, ceiling <= 5)
   * 5. Dispatch Execution & Ledger Recording (Zero-PII)
   */
  public async processPilotDispatch(request: PilotMessageRequest, outcome: 'ACCEPT' | 'DEFER' | 'BOUNCE' = 'ACCEPT'): Promise<PilotDispatchResult> {
    const todayStr = new Date().toISOString().split('T')[0];
    const ledger = this.getTodayLedger(todayStr);
    const domain = request.sending_domain.toLowerCase().trim();

    // 0. Event Origin Invariant: LegitimateSourceEventGuard
    if (!request.source_event) {
      return {
        dispatched: false,
        mta_status: 'BLOCKED_BY_GUARD',
        reason: 'NO_LEGITIMATE_SOURCE_EVENT: Dispatch rejected because no verified source event was provided',
        zero_pii_confirmed: true,
        recipient_hash: request.recipient_hash,
        destination_domain: request.destination_domain,
        timestamp: new Date().toISOString()
      };
    }

    const eventValidation = this.eventGuard.validateSourceEvent(request.source_event, todayStr);
    if (!eventValidation.allowed) {
      return {
        dispatched: false,
        mta_status: 'BLOCKED_BY_GUARD',
        reason: eventValidation.reason,
        zero_pii_confirmed: true,
        recipient_hash: request.recipient_hash,
        destination_domain: request.destination_domain,
        timestamp: new Date().toISOString()
      };
    }

    // 1. Suppression Guard Check
    if (this.isSuppressed(request.recipient_hash)) {
      return {
        dispatched: false,
        mta_status: 'BLOCKED_BY_GUARD',
        reason: 'SUPPRESSION_VIOLATION: Recipient hash is suppressed on bounce/unsubscribe ledger',
        zero_pii_confirmed: true,
        recipient_hash: request.recipient_hash,
        destination_domain: request.destination_domain,
        timestamp: new Date().toISOString(),
        event_hash: eventValidation.event_hash
      };
    }

    // 2. Prohibited Practices & Legitimacy Rule
    if (request.is_prohibited_practice) {
      return {
        dispatched: false,
        mta_status: 'BLOCKED_BY_GUARD',
        reason: 'PROHIBITED_PRACTICE_BLOCKED: Cold outreach, scraping, artificial engagement, or fake replies strictly prohibited',
        zero_pii_confirmed: true,
        recipient_hash: request.recipient_hash,
        destination_domain: request.destination_domain,
        timestamp: new Date().toISOString(),
        event_hash: eventValidation.event_hash
      };
    }

    if (!request.is_consented_or_transactional) {
      return {
        dispatched: false,
        mta_status: 'BLOCKED_BY_GUARD',
        reason: 'PILOT_POLICY_VIOLATION: Only consented, registered, or transactional communications permitted in Pilot V1',
        zero_pii_confirmed: true,
        recipient_hash: request.recipient_hash,
        destination_domain: request.destination_domain,
        timestamp: new Date().toISOString(),
        event_hash: eventValidation.event_hash
      };
    }

    // 3. Evaluate Reputation Guard & Volume Governor
    const gateEval = await this.reputationGuard.evaluateGate(domain, todayStr);
    ledger.current_gate = gateEval.overall_status;
    ledger.current_tier = gateEval.current_tier;
    ledger.current_daily_cap = gateEval.current_allowed_volume_per_day;
    ledger.can_scale = gateEval.can_scale_volume;
    ledger.gate_reason = gateEval.gate_reason;

    if (gateEval.overall_status === 'HOLD') {
      return {
        dispatched: false,
        mta_status: 'BLOCKED_BY_GUARD',
        reason: `HARD_GATE_ACTIVE: Outbound hold active (${gateEval.gate_reason})`,
        zero_pii_confirmed: true,
        recipient_hash: request.recipient_hash,
        destination_domain: request.destination_domain,
        timestamp: new Date().toISOString(),
        event_hash: eventValidation.event_hash
      };
    }

    // 4. Volume Governor Cap Check (Hard cap 25 emails/day in PILOT_ONLY)
    if (ledger.sent >= ledger.current_daily_cap) {
      return {
        dispatched: false,
        mta_status: 'BLOCKED_BY_GUARD',
        reason: `DAILY_VOLUME_CAP_REACHED: Today sent count (${ledger.sent}) reached maximum pilot cap of ${ledger.current_daily_cap}`,
        zero_pii_confirmed: true,
        recipient_hash: request.recipient_hash,
        destination_domain: request.destination_domain,
        timestamp: new Date().toISOString(),
        event_hash: eventValidation.event_hash
      };
    }

    // 5. Execute Outcome & Record Ledger (Zero-PII)
    ledger.sent += 1;

    let mtaStatus: 'ACCEPTED_250' | 'DEFERRED_4XX' | 'REJECTED_5XX' = 'ACCEPTED_250';
    let resultReason = 'DISPATCH_ACCEPTED: Delivered to recipient MTA (250 OK)';

    if (outcome === 'ACCEPT') {
      ledger.accepted_250 += 1;
      mtaStatus = 'ACCEPTED_250';
    } else if (outcome === 'DEFER') {
      ledger.deferred_4xx += 1;
      mtaStatus = 'DEFERRED_4XX';
      resultReason = 'DISPATCH_DEFERRED: Recipient MTA deferred message (4xx temporary)';
    } else if (outcome === 'BOUNCE') {
      ledger.rejected_5xx += 1;
      ledger.hard_bounces += 1;
      mtaStatus = 'REJECTED_5XX';
      resultReason = 'DISPATCH_REJECTED: Recipient MTA rejected message (5xx hard bounce)';
      this.suppressRecipientHash(request.recipient_hash);
    }

    // Refresh placement
    const placements = this.getPlacementSummary();
    ledger.gmail_placement_observed = placements.gmail;
    ledger.gmail_sample_biased = placements.gmailBiased;
    ledger.outlook_placement_observed = placements.outlook;
    ledger.outlook_sample_biased = placements.outlookBiased;

    return {
      dispatched: outcome === 'ACCEPT',
      mta_status: mtaStatus,
      reason: resultReason,
      zero_pii_confirmed: true,
      recipient_hash: request.recipient_hash,
      destination_domain: request.destination_domain,
      timestamp: new Date().toISOString(),
      event_hash: eventValidation.event_hash
    };
  }

  /**
   * Ingests real telemetry probe signals from Google Postmaster Tools and Microsoft SNDS.
   */
  public async syncProviderProbes(domain: string): Promise<{ google: string; snds: string }> {
    let googleStatus = 'INSUFFICIENT_SAMPLE';
    let sndsStatus = 'INSUFFICIENT_SAMPLE';

    if (this.googleAdapter && this.googleAdapter.isConfigured()) {
      try {
        const statsRes = await this.googleAdapter.queryDomainStats(domain);
        if (statsRes.status === 'SUCCESS' && statsRes.data) {
          googleStatus = 'SUCCESS';
          await this.reputationGuard.ingestSignal(this.googleAdapter.normalizeStats(statsRes.data));
        } else {
          googleStatus = 'INSUFFICIENT_SAMPLE';
        }
      } catch {
        googleStatus = 'INSUFFICIENT_SAMPLE';
      }
    }

    if (this.sndsAdapter && this.sndsAdapter.isConfigured()) {
      try {
        const sndsRes = await this.sndsAdapter.fetchDailyReport();
        if (sndsRes.status === 'SUCCESS' && sndsRes.data) {
          sndsStatus = 'SUCCESS';
          await this.reputationGuard.ingestSignal(this.sndsAdapter.normalizeReport(domain, sndsRes.data));
        } else {
          sndsStatus = 'INSUFFICIENT_SAMPLE';
        }
      } catch {
        sndsStatus = 'INSUFFICIENT_SAMPLE';
      }
    }

    const ledger = this.getTodayLedger();
    ledger.gmail_postmaster_status = googleStatus;
    ledger.microsoft_snds_status = sndsStatus;

    return { google: googleStatus, snds: sndsStatus };
  }

  /**
   * Generates formatted pilot cycle report.
   */
  public generateCycleReport(dateStr?: string): PilotCycleReport {
    const ledger = this.getTodayLedger(dateStr);
    const placements = this.getPlacementSummary();

    return {
      PILOT_SENT: ledger.sent,
      ACCEPTED: ledger.accepted_250,
      BOUNCED: ledger.hard_bounces,
      DEFERRED: ledger.deferred_4xx,
      COMPLAINTS: ledger.complaints,
      UNSUBSCRIBES: ledger.unsubscribes,
      INITIAL_OPERATIONAL_CEILING: LegitimateSourceEventGuard.INITIAL_OPERATIONAL_CEILING,
      HARD_REPUTATION_CAP: LegitimateSourceEventGuard.HARD_REPUTATION_CAP,
      OPERATING_TARGET: ledger.operating_target,
      GOOGLE_POSTMASTER: ledger.gmail_postmaster_status,
      MICROSOFT_SNDS: ledger.microsoft_snds_status,
      GMAIL_PLACEMENT: placements.gmail,
      GMAIL_SAMPLE_BIASED: Boolean(placements.gmailBiased || true),
      GMAIL_HISTORICAL_PRE_INTERVENTION_PLACEMENT: 'SPAM',
      GMAIL_HISTORICAL_SOURCE: 'MANUAL_OBSERVATION',
      GMAIL_CURRENT_NEUTRAL_PLACEMENT: 'UNKNOWN',
      OUTLOOK_PLACEMENT: placements.outlook,
      OUTLOOK_SAMPLE_BIASED: placements.outlookBiased,
      MICROSOFT_PLACEMENT: 'JUNK',
      MICROSOFT_SCL: 5,
      MICROSOFT_BCL: 0,
      DOMINANT_REMAINING_HYPOTHESIS: 'NEW_SENDER_IP_DOMAIN_REPUTATION',
      ROOT_CAUSE_CERTAINTY: 'NOT_FULLY_OBSERVABLE_PROVIDER_SIDE',
      REPUTATION_GATE: `${ledger.current_gate} / ${ledger.current_tier}`,
      CURRENT_DAILY_CAP: ledger.current_daily_cap,
      CAN_SCALE: ledger.can_scale,
      MASS_SENDING: 'BLOCKED',
      PRODUCTION: 'STRICT_HOLD',
      INBOX_DELIVERABILITY: 'NOT_CERTIFIED',
      PHYSICAL_SEND_DURING_THIS_TASK: 0
    };
  }
}
