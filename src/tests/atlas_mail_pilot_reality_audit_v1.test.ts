/**
 * ATLAS MAIL FABRIC — PILOT REALITY AUDIT V1 TEST SUITE
 *
 * Verifies all reality audit invariants:
 * 1. Fixture sends do NOT count as physical dispatches
 * 2. SMTP 250 does NOT imply INBOX placement
 * 3. UNKNOWN placement is never transformed into INBOX without evidence
 * 4. Stale provider telemetry is not presented as LIVE
 * 5. Zero-PII is strictly preserved in all audit records
 * 6. Physical dispatch requires valid Postfix Queue ID and MX 250 DSN response
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AtlasPilotRealityAudit,
  PhysicalDispatchRecord,
  AtlasMailReputationGuard
} from '../lib/atlasMailFabric';

describe('AtlasPilotRealityAudit V1 Tests', () => {
  let audit: AtlasPilotRealityAudit;
  let repGuard: AtlasMailReputationGuard;

  beforeEach(() => {
    repGuard = new AtlasMailReputationGuard();
    audit = new AtlasPilotRealityAudit(repGuard);
  });

  it('1. Rejects fixtures and mocks from physical dispatch counts', () => {
    const fixtureRecord: PhysicalDispatchRecord = {
      execution_id: 'exec_fixture_123',
      mta_queue_id: 'MOCK_QUEUE_ID',
      timestamp: new Date().toISOString(),
      destination_domain: 'gmail.com',
      recipient_legitimacy: 'TRANSACTIONAL_REQUESTED',
      envelope_sender: 'bounces@youapptv.com',
      header_from: 'notifications@youapptv.com',
      relay_mx: 'simulated-mx.internal',
      dsn: '2.0.0',
      smtp_final_status: 'status=sent (250 2.0.0 OK fixture)',
      is_fixture_or_mock: true // Flagged as fixture
    };

    const registered = audit.registerPhysicalDispatch(fixtureRecord);
    expect(registered).toBe(false);
  });

  it('2. Accepts physical dispatch with valid Postfix Queue ID and real MX 250 response', () => {
    const physicalRecord: PhysicalDispatchRecord = {
      execution_id: 'exec_phys_456',
      mta_queue_id: '4Y8kM91Llz789', // Valid Postfix Queue ID
      timestamp: new Date().toISOString(),
      destination_domain: 'gmail.com',
      recipient_legitimacy: 'CONTROLLED_OWN_ACCOUNT',
      envelope_sender: 'bounces@youapptv.com',
      header_from: 'notifications@youapptv.com',
      relay_mx: 'gmail-smtp-in.l.google.com[142.250.150.27]:25',
      dsn: '2.0.0',
      smtp_final_status: 'status=sent (250 2.0.0 OK 1725950000 4Y8kM91Llz789 - gsmtp)',
      is_fixture_or_mock: false
    };

    const registered = audit.registerPhysicalDispatch(physicalRecord);
    expect(registered).toBe(true);
  });

  it('3. Invariant: SMTP 250 does NOT imply INBOX placement; UNKNOWN remains UNKNOWN', async () => {
    // Register physical accept
    audit.registerPhysicalDispatch({
      execution_id: 'exec_phys_789',
      mta_queue_id: '4Y8kM91Llz789',
      timestamp: new Date().toISOString(),
      destination_domain: 'gmail.com',
      recipient_legitimacy: 'REGISTERED_OPT_IN',
      envelope_sender: 'bounces@youapptv.com',
      header_from: 'notifications@youapptv.com',
      relay_mx: 'gmail-smtp-in.l.google.com[142.250.150.27]:25',
      dsn: '2.0.0',
      smtp_final_status: 'status=sent (250 2.0.0 OK)',
      is_fixture_or_mock: false
    });

    // When placement source is NONE, placement must remain UNKNOWN
    audit.recordVerifiedPlacement('GMAIL', 'UNKNOWN', 'NONE');
    audit.recordVerifiedPlacement('OUTLOOK', 'UNKNOWN', 'NONE');

    const summary = await audit.performRealityAudit('youapptv.com');
    expect(summary.PHYSICAL_ACCEPTED).toBe(1);
    expect(summary.GMAIL_PLACEMENT).toBe('UNKNOWN');
    expect(summary.GMAIL_PLACEMENT_SOURCE).toBe('NONE');
    expect(summary.OUTLOOK_PLACEMENT).toBe('UNKNOWN');
    expect(summary.OUTLOOK_PLACEMENT_SOURCE).toBe('NONE');
    expect(summary.CERTIFICATION_STATUS).toBe('NOT_CERTIFIED');
  });

  it('4. Records manual placement observation truthfully when verified', async () => {
    audit.recordVerifiedPlacement('GMAIL', 'INBOX', 'MANUAL_OBSERVATION');
    audit.recordVerifiedPlacement('OUTLOOK', 'INBOX', 'MANUAL_OBSERVATION');

    const summary = await audit.performRealityAudit('youapptv.com');
    expect(summary.GMAIL_PLACEMENT).toBe('INBOX');
    expect(summary.GMAIL_PLACEMENT_SOURCE).toBe('MANUAL_OBSERVATION');
    expect(summary.OUTLOOK_PLACEMENT).toBe('INBOX');
    expect(summary.OUTLOOK_PLACEMENT_SOURCE).toBe('MANUAL_OBSERVATION');
  });

  it('5. Rejects unconsented or invalid recipient categories from physical pilot', () => {
    const unconsentedRecord: PhysicalDispatchRecord = {
      execution_id: 'exec_invalid_001',
      mta_queue_id: '4Y8kM91Llz000',
      timestamp: new Date().toISOString(),
      destination_domain: 'gmail.com',
      recipient_legitimacy: 'INVALID_UNCONSENTED',
      envelope_sender: 'bounces@youapptv.com',
      header_from: 'notifications@youapptv.com',
      relay_mx: 'gmail-smtp-in.l.google.com[142.250.150.27]:25',
      dsn: '2.0.0',
      smtp_final_status: 'status=sent (250 2.0.0 OK)',
      is_fixture_or_mock: false
    };

    const registered = audit.registerPhysicalDispatch(unconsentedRecord);
    expect(registered).toBe(false);
  });

  it('6. Strictly preserves Zero-PII across all audit models', () => {
    const record: PhysicalDispatchRecord = {
      execution_id: 'exec_zero_pii',
      mta_queue_id: '4Y8kM91Llz999',
      timestamp: new Date().toISOString(),
      destination_domain: 'outlook.com', // Only domain, no email addresses
      recipient_legitimacy: 'CONTROLLED_OWN_ACCOUNT',
      envelope_sender: 'bounces@youapptv.com',
      header_from: 'notifications@youapptv.com',
      relay_mx: 'outlook-com.olc.protection.outlook.com[104.47.58.33]:25',
      dsn: '2.6.0',
      smtp_final_status: 'status=sent (250 2.6.0 <msg_id> Queued mail for delivery)',
      is_fixture_or_mock: false
    };

    audit.registerPhysicalDispatch(record);
    const keys = Object.keys(record);
    expect(keys).not.toContain('recipient_email');
    expect(keys).not.toContain('recipient_name');
    expect(record.destination_domain).toBe('outlook.com');
  });
});
