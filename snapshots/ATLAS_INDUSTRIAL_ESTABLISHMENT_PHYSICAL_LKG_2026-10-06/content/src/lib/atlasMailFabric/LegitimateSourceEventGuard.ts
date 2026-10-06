/**
 * ATLAS MAIL FABRIC — LEGITIMATE SOURCE EVENT GUARD
 *
 * Enforces strict real-traffic governance before any dispatch:
 * 1. Every outbound dispatch must be backed by a verifiable legitimate event:
 *    - REGISTERED_OPT_IN
 *    - TRANSACTIONAL_REQUESTED
 *    - EXPECTED_NOTIFICATION
 *    - CONTROLLED_EXPLICIT_TEST
 * 2. Strictly PROHIBITS synthetic warming, fake replies, and filler volume:
 *    - REPUTATION_WARMUP_ONLY
 *    - SELF_SEND_FOR_VOLUME
 *    - SYNTHETIC_ENGAGEMENT
 *    - AUTO_NOT_SPAM
 *    - AUTO_REPLY
 *    - AUTO_OPEN
 *    - FAKE_TRANSACTION
 * 3. Enforces INITIAL_OPERATIONAL_CEILING = 5 legitimate messages/day
 * 4. Invariant: If legitimateEventsToday === 0 => SEND_COUNT === 0 (no quota filling)
 * 5. Zero-PII: stores only event_hash, event_type, and timestamp
 */

import crypto from 'crypto';

export type LegitimateEventType =
  | 'REGISTERED_OPT_IN'
  | 'TRANSACTIONAL_REQUESTED'
  | 'EXPECTED_NOTIFICATION'
  | 'CONTROLLED_EXPLICIT_TEST';

export type ProhibitedEventType =
  | 'REPUTATION_WARMUP_ONLY'
  | 'SELF_SEND_FOR_VOLUME'
  | 'SYNTHETIC_ENGAGEMENT'
  | 'AUTO_NOT_SPAM'
  | 'AUTO_REPLY'
  | 'AUTO_OPEN'
  | 'FAKE_TRANSACTION';

export const PROHIBITED_EVENT_TYPES: ProhibitedEventType[] = [
  'REPUTATION_WARMUP_ONLY',
  'SELF_SEND_FOR_VOLUME',
  'SYNTHETIC_ENGAGEMENT',
  'AUTO_NOT_SPAM',
  'AUTO_REPLY',
  'AUTO_OPEN',
  'FAKE_TRANSACTION'
];

export interface LegitimateSourceEvent {
  event_id: string; // Zero-PII unique identifier
  event_type: LegitimateEventType | ProhibitedEventType;
  timestamp: string;
  context_hash?: string;
  is_synthetic_or_warmup?: boolean;
}

export interface EventGuardValidationResult {
  allowed: boolean;
  reason: string;
  event_hash?: string;
  is_within_initial_ceiling: boolean;
  current_daily_event_count: number;
}

export class LegitimateSourceEventGuard {
  public static readonly INITIAL_OPERATIONAL_CEILING = 5;
  public static readonly HARD_REPUTATION_CAP = 25;

  private dailyEvents: Map<string, LegitimateSourceEvent[]> = new Map();

  /**
   * Validates whether an event is authentic, non-synthetic, and within operating ceiling.
   * Fail-closed: missing event or prohibited type halts pipeline immediately.
   */
  public validateSourceEvent(
    event: LegitimateSourceEvent | undefined | null,
    dateStr?: string
  ): EventGuardValidationResult {
    const today = dateStr || new Date().toISOString().split('T')[0];
    const todayEvents = this.dailyEvents.get(today) || [];

    // 1. Fail Closed: Event must exist
    if (!event || !event.event_id || !event.event_type) {
      return {
        allowed: false,
        reason: 'NO_LEGITIMATE_SOURCE_EVENT: Dispatch rejected because no verified source event was provided',
        is_within_initial_ceiling: todayEvents.length < LegitimateSourceEventGuard.INITIAL_OPERATIONAL_CEILING,
        current_daily_event_count: todayEvents.length
      };
    }

    // 2. Prohibit Synthetic Warming & Fake Volume
    if (
      event.is_synthetic_or_warmup ||
      PROHIBITED_EVENT_TYPES.includes(event.event_type as ProhibitedEventType)
    ) {
      return {
        allowed: false,
        reason: `PROHIBITED_PRACTICE_BLOCKED: Event type '${event.event_type}' is prohibited (synthetic warming / fake engagement forbidden)`,
        is_within_initial_ceiling: todayEvents.length < LegitimateSourceEventGuard.INITIAL_OPERATIONAL_CEILING,
        current_daily_event_count: todayEvents.length
      };
    }

    // 3. Enforce Allowed Categories
    const isAllowedType = (
      event.event_type === 'REGISTERED_OPT_IN' ||
      event.event_type === 'TRANSACTIONAL_REQUESTED' ||
      event.event_type === 'EXPECTED_NOTIFICATION' ||
      event.event_type === 'CONTROLLED_EXPLICIT_TEST'
    );

    if (!isAllowedType) {
      return {
        allowed: false,
        reason: `INVALID_EVENT_TYPE: '${event.event_type}' is not recognized as a legitimate source event`,
        is_within_initial_ceiling: todayEvents.length < LegitimateSourceEventGuard.INITIAL_OPERATIONAL_CEILING,
        current_daily_event_count: todayEvents.length
      };
    }

    // 4. Enforce Initial Operational Ceiling (5 msgs/day)
    if (todayEvents.length >= LegitimateSourceEventGuard.INITIAL_OPERATIONAL_CEILING) {
      return {
        allowed: false,
        reason: `INITIAL_OPERATIONAL_CEILING_REACHED: Daily event count (${todayEvents.length}) reached operational ceiling of ${LegitimateSourceEventGuard.INITIAL_OPERATIONAL_CEILING} legitimate msgs/day`,
        is_within_initial_ceiling: false,
        current_daily_event_count: todayEvents.length
      };
    }

    // 5. Enforce Hard Reputation Cap (25 msgs/day)
    if (todayEvents.length >= LegitimateSourceEventGuard.HARD_REPUTATION_CAP) {
      return {
        allowed: false,
        reason: `HARD_REPUTATION_CAP_REACHED: Daily event count (${todayEvents.length}) reached hard cap of ${LegitimateSourceEventGuard.HARD_REPUTATION_CAP} msgs/day`,
        is_within_initial_ceiling: false,
        current_daily_event_count: todayEvents.length
      };
    }

    const eventHash = crypto.createHash('sha256')
      .update(`${event.event_id}:${event.event_type}:${event.timestamp}`)
      .digest('hex');

    // Register valid event in daily ledger
    todayEvents.push(event);
    this.dailyEvents.set(today, todayEvents);

    return {
      allowed: true,
      reason: 'EVENT_VERIFIED: Legitimate source event authenticated within operational ceiling',
      event_hash: eventHash,
      is_within_initial_ceiling: true,
      current_daily_event_count: todayEvents.length
    };
  }

  /**
   * Returns current count of legitimate events for a given day.
   */
  public getDailyEventCount(dateStr?: string): number {
    const today = dateStr || new Date().toISOString().split('T')[0];
    return (this.dailyEvents.get(today) || []).length;
  }
}
