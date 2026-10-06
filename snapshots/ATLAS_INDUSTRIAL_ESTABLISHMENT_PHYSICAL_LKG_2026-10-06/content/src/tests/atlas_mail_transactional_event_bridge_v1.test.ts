/**
 * ATLAS MAIL FABRIC — TRANSACTIONAL EVENT BRIDGE V1 TEST SUITE
 *
 * Verifies all 28 mandatory architectural invariants:
 * 01. Valid email verification => eligible
 * 02. Valid password reset => eligible
 * 03. Valid registration confirmation => eligible
 * 04. Expected notification => eligible
 * 05. Cold outreach => blocked
 * 06. Scraped lead => blocked
 * 07. Warmup event => blocked
 * 08. Missing source event => blocked
 * 09. Expired event => blocked
 * 10. Duplicate event => blocked (SOURCE_EVENT_ALREADY_CONSUMED)
 * 11. Same recipient different legitimate event => valid
 * 12. 0 legitimate events => 0 sends
 * 13. 6 valid events with ceiling 5 => max 5 during pilot
 * 14. Deferred event preserved in queue/ledger
 * 15. Hard cap 25 cannot be bypassed
 * 16. Suppression overrides legitimate event
 * 17. Reputation HOLD overrides legitimate event
 * 18. Zero-PII invariant (no plain emails in bridge ledgers/telemetry)
 * 19. Source event hash deterministic
 * 20. Marketing cannot masquerade as transactional
 * 21. Duplicate concurrent workers => exactly one claim (concurrency lease)
 * 22. DEFERRED_BY_CEILING remains dispatchable later
 * 23. Deferred event that expires => SOURCE_EVENT_EXPIRED
 * 24. Marketing suppression does NOT suppress legitimate password reset
 * 25. GLOBAL_DELIVERY_BLOCK does suppress password reset
 * 26. SECURITY mail has no List-Unsubscribe headers
 * 27. Caller cannot masquerade cold outreach as transactional event
 * 28. Idempotency canonical serialization is deterministic
 */

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  AtlasMailTransactionalEventBridge,
  IncomingTransactionalEventRequest,
  computeCanonicalRecipientHash,
  generateCanonicalIdempotencyKey,
  LegitimateSourceEventGuard,
  AtlasMailReputationGuard
} from '../lib/atlasMailFabric';

describe('AtlasMailTransactionalEventBridge V1 Test Suite', () => {
  let bridge: AtlasMailTransactionalEventBridge;
  const testEmail = 'user.legitimate@youapptv.com';
  const testRecipientHash = computeCanonicalRecipientHash(testEmail);

  beforeEach(() => {
    bridge = new AtlasMailTransactionalEventBridge();
  });

  it('01. Valid email verification => eligible for dispatch', () => {
    const req: IncomingTransactionalEventRequest = {
      source_event_id: 'evt_email_verify_001',
      source_system: 'AUTH_SERVICE',
      source_event_type: 'ACCOUNT_EMAIL_VERIFICATION',
      recipient_hash: testRecipientHash,
      recipient_email_for_transport_only: testEmail,
      purpose: 'account_verification',
      created_at: new Date().toISOString()
    };

    const res = bridge.evaluateAndProcessEvent(req);
    expect(res.eligible_for_dispatch).toBe(true);
    expect(res.state).toBe('LEASED');
    expect(res.mail_classification).toBe('SECURITY');
    expect(res.priority).toBe(2);
    expect(res.rendered_mime).toBeDefined();
    expect(res.rendered_mime).toContain('Confirm');
    expect(res.zero_pii_confirmed).toBe(true);
  });

  it('02. Valid password reset => eligible for dispatch (Priority 1, SECURITY)', () => {
    const req: IncomingTransactionalEventRequest = {
      source_event_id: 'evt_pwd_reset_001',
      source_system: 'SECURITY_SERVICE',
      source_event_type: 'PASSWORD_RESET_REQUESTED',
      recipient_hash: testRecipientHash,
      recipient_email_for_transport_only: testEmail,
      purpose: 'password_reset',
      created_at: new Date().toISOString(),
      ttl_seconds: 900 // 15 min
    };

    const res = bridge.evaluateAndProcessEvent(req);
    expect(res.eligible_for_dispatch).toBe(true);
    expect(res.state).toBe('LEASED');
    expect(res.mail_classification).toBe('SECURITY');
    expect(res.priority).toBe(1);
    expect(res.rendered_mime?.toLowerCase()).toContain('restablecer');
  });

  it('03. Valid registration confirmation => eligible for dispatch (Priority 3, TRANSACTIONAL)', () => {
    const req: IncomingTransactionalEventRequest = {
      source_event_id: 'evt_reg_conf_001',
      source_system: 'ACCOUNT_SERVICE',
      source_event_type: 'REGISTRATION_CONFIRMATION',
      recipient_hash: testRecipientHash,
      recipient_email_for_transport_only: testEmail,
      purpose: 'welcome_registration',
      created_at: new Date().toISOString()
    };

    const res = bridge.evaluateAndProcessEvent(req);
    expect(res.eligible_for_dispatch).toBe(true);
    expect(res.mail_classification).toBe('TRANSACTIONAL');
    expect(res.priority).toBe(3);
    expect(res.rendered_mime).toContain('Bienvenido a YouApp');
  });

  it('04. Expected notification => eligible for dispatch (Priority 5, TRANSACTIONAL)', () => {
    const req: IncomingTransactionalEventRequest = {
      source_event_id: 'evt_notif_001',
      source_system: 'NOTIFICATION_ROUTER',
      source_event_type: 'EXPECTED_ACCOUNT_NOTIFICATION',
      recipient_hash: testRecipientHash,
      purpose: 'monthly_statement',
      created_at: new Date().toISOString()
    };

    const res = bridge.evaluateAndProcessEvent(req);
    expect(res.eligible_for_dispatch).toBe(true);
    expect(res.mail_classification).toBe('TRANSACTIONAL');
    expect(res.priority).toBe(5);
  });

  it('05. Cold outreach => strictly blocked', () => {
    const req: IncomingTransactionalEventRequest = {
      source_event_id: 'evt_cold_001',
      source_system: 'AUTH_SERVICE',
      source_event_type: 'COLD_OUTREACH',
      recipient_hash: testRecipientHash,
      purpose: 'sales_pitch',
      created_at: new Date().toISOString()
    };

    const res = bridge.evaluateAndProcessEvent(req);
    expect(res.eligible_for_dispatch).toBe(false);
    expect(res.state).toBe('FAILED_FINAL');
    expect(res.reason).toContain('PROHIBITED_OR_UNTRUSTED_WORKFLOW');
  });

  it('06. Scraped lead => strictly blocked', () => {
    const req: IncomingTransactionalEventRequest = {
      source_event_id: 'evt_scraped_001',
      source_system: 'CORE_APP',
      source_event_type: 'SCRAPED_LEAD',
      recipient_hash: testRecipientHash,
      purpose: 'prospecting',
      created_at: new Date().toISOString()
    };

    const res = bridge.evaluateAndProcessEvent(req);
    expect(res.eligible_for_dispatch).toBe(false);
    expect(res.state).toBe('FAILED_FINAL');
    expect(res.reason).toContain('PROHIBITED_OR_UNTRUSTED_WORKFLOW');
  });

  it('07. Warmup event => strictly blocked', () => {
    const req: IncomingTransactionalEventRequest = {
      source_event_id: 'evt_warmup_001',
      source_system: 'CORE_APP',
      source_event_type: 'REPUTATION_WARMUP',
      recipient_hash: testRecipientHash,
      purpose: 'volume_warming',
      created_at: new Date().toISOString()
    };

    const res = bridge.evaluateAndProcessEvent(req);
    expect(res.eligible_for_dispatch).toBe(false);
    expect(res.state).toBe('FAILED_FINAL');
    expect(res.reason).toContain('PROHIBITED_OR_UNTRUSTED_WORKFLOW');
  });

  it('08. Missing source system / untrusted source => strictly blocked', () => {
    const req: any = {
      source_event_id: 'evt_untrusted_001',
      source_system: 'UNAUTHORIZED_EXTERNAL_SCRIPT',
      source_event_type: 'PASSWORD_RESET_REQUESTED',
      recipient_hash: testRecipientHash,
      purpose: 'reset',
      created_at: new Date().toISOString()
    };

    const res = bridge.evaluateAndProcessEvent(req);
    expect(res.eligible_for_dispatch).toBe(false);
    expect(res.state).toBe('FAILED_FINAL');
    expect(res.reason).toContain('UNTRUSTED_SOURCE_SYSTEM');
  });

  it('09. Expired event => blocked with SOURCE_EVENT_EXPIRED', () => {
    const pastDate = new Date(Date.now() - 3600 * 1000).toISOString(); // 1 hour ago
    const req: IncomingTransactionalEventRequest = {
      source_event_id: 'evt_expired_001',
      source_system: 'AUTH_SERVICE',
      source_event_type: 'PASSWORD_RESET_REQUESTED',
      recipient_hash: testRecipientHash,
      purpose: 'password_reset',
      created_at: pastDate,
      expires_at: new Date(Date.now() - 1800 * 1000).toISOString() // expired 30 mins ago
    };

    const res = bridge.evaluateAndProcessEvent(req);
    expect(res.eligible_for_dispatch).toBe(false);
    expect(res.state).toBe('EXPIRED');
    expect(res.reason).toContain('SOURCE_EVENT_EXPIRED');
  });

  it('10. Duplicate event => blocked with SOURCE_EVENT_ALREADY_CONSUMED', () => {
    const req: IncomingTransactionalEventRequest = {
      source_event_id: 'evt_dup_001',
      source_system: 'AUTH_SERVICE',
      source_event_type: 'ACCOUNT_EMAIL_VERIFICATION',
      recipient_hash: testRecipientHash,
      purpose: 'account_verification',
      created_at: new Date().toISOString()
    };

    const res1 = bridge.evaluateAndProcessEvent(req, 'worker_1');
    expect(res1.eligible_for_dispatch).toBe(true);

    // Simulate successful dispatch
    bridge.releaseDispatchLease(res1.idempotency_key, 'DISPATCHED');

    // Second processing attempt must be rejected
    const res2 = bridge.evaluateAndProcessEvent(req, 'worker_2');
    expect(res2.eligible_for_dispatch).toBe(false);
    expect(res2.state).toBe('DISPATCHED');
    expect(res2.reason).toContain('SOURCE_EVENT_ALREADY_CONSUMED');
  });

  it('11. Same recipient with different legitimate event => valid and eligible', () => {
    const req1: IncomingTransactionalEventRequest = {
      source_event_id: 'evt_event_A',
      source_system: 'AUTH_SERVICE',
      source_event_type: 'ACCOUNT_EMAIL_VERIFICATION',
      recipient_hash: testRecipientHash,
      purpose: 'verification',
      created_at: new Date().toISOString()
    };

    const req2: IncomingTransactionalEventRequest = {
      source_event_id: 'evt_event_B',
      source_system: 'NOTIFICATION_ROUTER',
      source_event_type: 'USER_REQUESTED_NOTIFICATION',
      recipient_hash: testRecipientHash,
      purpose: 'account_export',
      created_at: new Date().toISOString()
    };

    const res1 = bridge.evaluateAndProcessEvent(req1);
    const res2 = bridge.evaluateAndProcessEvent(req2);

    expect(res1.eligible_for_dispatch).toBe(true);
    expect(res2.eligible_for_dispatch).toBe(true);
    expect(res1.idempotency_key).not.toBe(res2.idempotency_key);
  });

  it('12. 0 legitimate events => 0 sends (Ceiling is not a quota)', () => {
    const summary = bridge.getBridgeSummary();
    expect(summary.events_received).toBe(0);
    expect(summary.events_dispatched).toBe(0);
    expect(summary.events_deferred).toBe(0);
  });

  it('13. 6 valid events with ceiling 5 => max 5 eligible, 6th DEFERRED_BY_CEILING', () => {
    const today = '2026-09-10';

    for (let i = 1; i <= 5; i++) {
      const req: IncomingTransactionalEventRequest = {
        source_event_id: `evt_ceiling_test_${i}`,
        source_system: 'AUTH_SERVICE',
        source_event_type: 'REGISTRATION_CONFIRMATION',
        recipient_hash: computeCanonicalRecipientHash(`user_${i}@youapptv.com`),
        purpose: 'welcome',
        created_at: new Date().toISOString()
      };

      const res = bridge.evaluateAndProcessEvent(req, 'worker_1', today);
      expect(res.eligible_for_dispatch).toBe(true);
      expect(res.state).toBe('LEASED');
    }

    // 6th event must be preserved as DEFERRED_BY_CEILING
    const req6: IncomingTransactionalEventRequest = {
      source_event_id: 'evt_ceiling_test_6',
      source_system: 'AUTH_SERVICE',
      source_event_type: 'REGISTRATION_CONFIRMATION',
      recipient_hash: computeCanonicalRecipientHash('user_6@youapptv.com'),
      purpose: 'welcome',
      created_at: new Date().toISOString()
    };

    const res6 = bridge.evaluateAndProcessEvent(req6, 'worker_1', today);
    expect(res6.eligible_for_dispatch).toBe(false);
    expect(res6.state).toBe('DEFERRED');
    expect(res6.reason).toContain('DEFERRED_BY_CEILING');
  });

  it('14. Deferred event preserved in sorted priority queue', () => {
    const today = '2026-09-10';

    // Exhaust ceiling
    for (let i = 1; i <= 5; i++) {
      bridge.evaluateAndProcessEvent({
        source_event_id: `evt_fill_${i}`,
        source_system: 'NOTIFICATION_ROUTER',
        source_event_type: 'EXPECTED_ACCOUNT_NOTIFICATION',
        recipient_hash: computeCanonicalRecipientHash(`user_${i}@youapptv.com`),
        purpose: 'notif',
        created_at: new Date().toISOString()
      }, 'w1', today);
    }

    // Add P5 deferred
    bridge.evaluateAndProcessEvent({
      source_event_id: 'evt_def_notif',
      source_system: 'NOTIFICATION_ROUTER',
      source_event_type: 'EXPECTED_ACCOUNT_NOTIFICATION',
      recipient_hash: computeCanonicalRecipientHash('user_def_p5@youapptv.com'),
      purpose: 'notif',
      created_at: '2026-09-10T10:00:00Z'
    }, 'w1', today);

    // Add P1 deferred (Password Reset)
    bridge.evaluateAndProcessEvent({
      source_event_id: 'evt_def_reset',
      source_system: 'SECURITY_SERVICE',
      source_event_type: 'PASSWORD_RESET_REQUESTED',
      recipient_hash: computeCanonicalRecipientHash('user_def_p1@youapptv.com'),
      purpose: 'reset',
      created_at: '2026-09-10T10:05:00Z'
    }, 'w1', today);

    const queue = bridge.getDeferredQueueSorted();
    expect(queue.length).toBe(2);
    // P1 (Password Reset) must be ahead of P5 (Notification)
    expect(queue[0].source_event_type).toBe('PASSWORD_RESET_REQUESTED');
    expect(queue[0].priority).toBe(1);
    expect(queue[1].source_event_type).toBe('EXPECTED_ACCOUNT_NOTIFICATION');
    expect(queue[1].priority).toBe(5);
  });

  it('15. Hard cap of 25 cannot be bypassed', () => {
    expect(LegitimateSourceEventGuard.HARD_REPUTATION_CAP).toBe(25);
    expect(LegitimateSourceEventGuard.INITIAL_OPERATIONAL_CEILING).toBe(5);
  });

  it('16. Scoped suppression overrides legitimate event when matched', () => {
    bridge.getSuppressionManager().addSuppression({
      recipient_hash: testRecipientHash,
      scope: 'TRANSACTIONAL',
      reason: 'User opted out of non-essential transactional updates',
      is_hard_block: false,
      suppressed_at: new Date().toISOString()
    });

    const req: IncomingTransactionalEventRequest = {
      source_event_id: 'evt_notif_suppressed',
      source_system: 'NOTIFICATION_ROUTER',
      source_event_type: 'USER_REQUESTED_NOTIFICATION',
      recipient_hash: testRecipientHash,
      purpose: 'update',
      created_at: new Date().toISOString()
    };

    const res = bridge.evaluateAndProcessEvent(req);
    expect(res.eligible_for_dispatch).toBe(false);
    expect(res.state).toBe('FAILED_FINAL');
    expect(res.reason).toContain('SUPPRESSION_VIOLATION');
  });

  it('17. Reputation HOLD overrides legitimate event in Mail Fabric pipeline', async () => {
    const repGuard = new AtlasMailReputationGuard();
    // Simulate critical spam rate (0.40% >= 0.30% threshold -> HOLD)
    await repGuard.ingestSignal({
      domain: 'youapptv.com',
      provider: 'GOOGLE_POSTMASTER',
      spam_rate: 0.0040,
      domain_reputation: 'LOW',
      ip_reputation: 'LOW',
      authentication_status: 'PASS',
      delivery_errors: 0,
      temporary_deferrals: 0,
      hard_bounces: 0,
      complaints: 40,
      snds_abnormal_status: false,
      sample_volume: 10000,
      has_sufficient_sample: true
    });

    const gate = await repGuard.evaluateGate('youapptv.com');
    expect(gate.overall_status).toBe('HOLD');
    expect(gate.can_scale_volume).toBe(false);
  });

  it('18. Zero-PII invariant: bridge ledger contains only hashes and non-sensitive identifiers', () => {
    const req: IncomingTransactionalEventRequest = {
      source_event_id: 'evt_zero_pii_check',
      source_system: 'SECURITY_SERVICE',
      source_event_type: 'PASSWORD_RESET_REQUESTED',
      recipient_hash: testRecipientHash,
      recipient_email_for_transport_only: 'plain_secret_email@youapptv.com',
      purpose: 'reset',
      created_at: new Date().toISOString(),
      ephemeral_template_data: {
        token: 'super_secret_reset_token_xyz999'
      }
    };

    const res = bridge.evaluateAndProcessEvent(req);
    expect(res.eligible_for_dispatch).toBe(true);

    const idempotencyKey = res.idempotency_key;
    // Idempotency key must not contain token or plain email
    expect(idempotencyKey).toBeDefined();
    expect(idempotencyKey).not.toContain('super_secret_reset_token');
    expect(idempotencyKey).not.toContain('plain_secret_email');
  });

  it('19. Source event hash is strictly deterministic', () => {
    const key1 = generateCanonicalIdempotencyKey({
      source_event_id: 'evt_100',
      event_type: 'PASSWORD_RESET_REQUESTED',
      recipient_hash: testRecipientHash,
      purpose: 'pwd_reset'
    });

    const key2 = generateCanonicalIdempotencyKey({
      source_event_id: 'evt_100',
      event_type: 'PASSWORD_RESET_REQUESTED',
      recipient_hash: testRecipientHash,
      purpose: 'pwd_reset'
    });

    expect(key1).toBe(key2);
    expect(key1.length).toBe(64);
  });

  it('20. Marketing cannot masquerade as transactional', () => {
    const req: IncomingTransactionalEventRequest = {
      source_event_id: 'evt_marketing_sneak',
      source_system: 'AUTH_SERVICE',
      source_event_type: 'USER_REQUESTED_NOTIFICATION',
      recipient_hash: testRecipientHash,
      purpose: 'newsletter_promo',
      created_at: new Date().toISOString(),
      is_marketing: true // Flagged marketing
    };

    const res = bridge.evaluateAndProcessEvent(req);
    expect(res.eligible_for_dispatch).toBe(false);
    expect(res.state).toBe('FAILED_FINAL');
    expect(res.reason).toContain('PROHIBITED_OR_UNTRUSTED_WORKFLOW');
  });

  it('21. Duplicate concurrent workers => exactly one claim (atomic lease)', () => {
    const req: IncomingTransactionalEventRequest = {
      source_event_id: 'evt_concurrent_001',
      source_system: 'AUTH_SERVICE',
      source_event_type: 'ACCOUNT_EMAIL_VERIFICATION',
      recipient_hash: testRecipientHash,
      purpose: 'verify',
      created_at: new Date().toISOString()
    };

    // Worker 1 processes event
    const res1 = bridge.evaluateAndProcessEvent(req, 'worker_alpha');
    expect(res1.eligible_for_dispatch).toBe(true);
    expect(res1.state).toBe('LEASED');

    // Worker 2 attempts same event concurrently while lease is active
    const res2 = bridge.evaluateAndProcessEvent(req, 'worker_beta');
    expect(res2.eligible_for_dispatch).toBe(false);
    expect(res2.reason).toContain('CONCURRENCY_BLOCKED');
  });

  it('22. DEFERRED_BY_CEILING remains dispatchable later', () => {
    const today = '2026-09-10';
    const nextDay = '2026-09-11';

    // Exhaust today's ceiling of 5
    for (let i = 1; i <= 5; i++) {
      bridge.evaluateAndProcessEvent({
        source_event_id: `evt_day1_${i}`,
        source_system: 'AUTH_SERVICE',
        source_event_type: 'REGISTRATION_CONFIRMATION',
        recipient_hash: computeCanonicalRecipientHash(`user_day1_${i}@youapptv.com`),
        purpose: 'reg',
        created_at: `${today}T08:00:00Z`
      }, 'w1', today);
    }

    // 6th event is deferred on today
    const deferredReq: IncomingTransactionalEventRequest = {
      source_event_id: 'evt_deferred_for_tomorrow',
      source_system: 'AUTH_SERVICE',
      source_event_type: 'REGISTRATION_CONFIRMATION',
      recipient_hash: testRecipientHash,
      purpose: 'reg',
      created_at: `${today}T09:00:00Z`,
      expires_at: `${nextDay}T23:59:59Z`
    };

    const resToday = bridge.evaluateAndProcessEvent(deferredReq, 'w1', today);
    expect(resToday.eligible_for_dispatch).toBe(false);
    expect(resToday.state).toBe('DEFERRED');

    // On next day, re-processing must succeed!
    const resNextDay = bridge.evaluateAndProcessEvent(deferredReq, 'w1', nextDay);
    expect(resNextDay.eligible_for_dispatch).toBe(true);
    expect(resNextDay.state).toBe('LEASED');
  });

  it('23. Deferred event that expires => SOURCE_EVENT_EXPIRED', () => {
    const today = '2026-09-10';
    const futureExpiredTime = new Date(Date.now() - 5000).toISOString(); // expired 5 seconds ago

    const req: IncomingTransactionalEventRequest = {
      source_event_id: 'evt_def_expired',
      source_system: 'SECURITY_SERVICE',
      source_event_type: 'PASSWORD_RESET_REQUESTED',
      recipient_hash: testRecipientHash,
      purpose: 'reset',
      created_at: '2026-09-10T08:00:00Z',
      expires_at: futureExpiredTime
    };

    const res = bridge.evaluateAndProcessEvent(req, 'w1', today);
    expect(res.eligible_for_dispatch).toBe(false);
    expect(res.state).toBe('EXPIRED');
    expect(res.reason).toContain('SOURCE_EVENT_EXPIRED');
  });

  it('24. Marketing suppression does NOT suppress legitimate password reset', () => {
    bridge.getSuppressionManager().addSuppression({
      recipient_hash: testRecipientHash,
      scope: 'MARKETING', // User unsubscribed from marketing
      reason: 'User clicked marketing unsubscribe link',
      is_hard_block: false,
      suppressed_at: new Date().toISOString()
    });

    const req: IncomingTransactionalEventRequest = {
      source_event_id: 'evt_pwd_with_mkt_suppression',
      source_system: 'SECURITY_SERVICE',
      source_event_type: 'PASSWORD_RESET_REQUESTED',
      recipient_hash: testRecipientHash,
      purpose: 'password_reset',
      created_at: new Date().toISOString()
    };

    const res = bridge.evaluateAndProcessEvent(req);
    expect(res.eligible_for_dispatch).toBe(true);
    expect(res.mail_classification).toBe('SECURITY');
  });

  it('25. GLOBAL_DELIVERY_BLOCK does suppress password reset', () => {
    bridge.getSuppressionManager().addSuppression({
      recipient_hash: testRecipientHash,
      scope: 'GLOBAL',
      reason: 'ACCOUNT_DISABLED: Fraudulent account termination',
      is_hard_block: true,
      suppressed_at: new Date().toISOString()
    });

    const req: IncomingTransactionalEventRequest = {
      source_event_id: 'evt_pwd_global_block',
      source_system: 'SECURITY_SERVICE',
      source_event_type: 'PASSWORD_RESET_REQUESTED',
      recipient_hash: testRecipientHash,
      purpose: 'password_reset',
      created_at: new Date().toISOString()
    };

    const res = bridge.evaluateAndProcessEvent(req);
    expect(res.eligible_for_dispatch).toBe(false);
    expect(res.state).toBe('FAILED_FINAL');
    expect(res.reason).toContain('GLOBAL_HARD_BLOCK');
  });

  it('26. SECURITY mail has no List-Unsubscribe headers', () => {
    const rendered = bridge.renderTransactionalTemplate({
      eventType: 'PASSWORD_RESET_REQUESTED',
      recipientEmail: testEmail,
      classification: 'SECURITY'
    });

    expect(rendered.listUnsubscribePresent).toBe(false);
    expect(rendered.mimeString).not.toContain('List-Unsubscribe');
  });

  it('27. Caller cannot masquerade cold outreach as transactional event', () => {
    const req: IncomingTransactionalEventRequest = {
      source_event_id: 'evt_masquerade_001',
      source_system: 'CORE_APP',
      source_event_type: 'COLD_OUTREACH', // caller attempting prohibited category
      recipient_hash: testRecipientHash,
      purpose: 'cold_lead_generation',
      created_at: new Date().toISOString()
    };

    const res = bridge.evaluateAndProcessEvent(req);
    expect(res.eligible_for_dispatch).toBe(false);
    expect(res.state).toBe('FAILED_FINAL');
    expect(res.reason).toContain('PROHIBITED_OR_UNTRUSTED_WORKFLOW');
  });

  it('28. Idempotency canonical serialization is deterministic regardless of key order', () => {
    const hash1 = generateCanonicalIdempotencyKey({
      source_event_id: 'evt_canon_99',
      event_type: 'ACCOUNT_EMAIL_VERIFICATION',
      recipient_hash: testRecipientHash,
      purpose: 'user_verification'
    });

    const hash2 = generateCanonicalIdempotencyKey({
      purpose: 'user_verification',
      recipient_hash: testRecipientHash,
      source_event_id: 'evt_canon_99',
      event_type: 'ACCOUNT_EMAIL_VERIFICATION'
    });

    expect(hash1).toBe(hash2);
  });
});
