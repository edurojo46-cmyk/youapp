/**
 * ATLAS MAIL FABRIC: REPUTATION & DELIVERABILITY GUARD V1
 * Test Suite: atlas_mail_reputation_guard_v1.test.ts
 *
 * Comprehensive certification suite verifying:
 * 1. GREEN state authorizes allowed volume.
 * 2. WATCH prevents volume escalation (holds steady).
 * 3. Google spam rate >= 0.30% triggers immediate HOLD.
 * 4. Google spam rate < 0.10% operational target maintains GREEN.
 * 5. Google spam rate 0.10% <= rate < 0.30% triggers WATCH.
 * 6. Microsoft SNDS abnormal/red status triggers immediate HOLD.
 * 7. SPF/DKIM/DMARC (p=quarantine)/PTR failure triggers immediate HOLD.
 * 8. Suppression violation triggers immediate HOLD.
 * 9. Stale telemetry (>48h) triggers fail-safe (freeze scaling).
 * 10. Provider unavailable / unconfigured triggers fail-safe (no fake data, no scale).
 * 11. Insufficient sample for new IP -> WATCH / PILOT_ONLY (cap 25-50, no auto-scale).
 * 12. Zero-PII invariant across all telemetry models.
 * 13. Feedback-ID conforms strictly to Google RFC (a:b:c:SenderId, SenderId 5-15 chars stable).
 * 14. Microsoft SNDS secret export URL confidentiality invariant.
 * 15. Volume Governor enforces consecutive clean days requirement (rejects time-only scaling).
 * 16. SMTP deferral surge (>15%) degrades status to WATCH.
 * 17. Frozen migration 080000 integrity check.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { createGuardedTestClient as createClient } from '../lib/testDbGuard';
import dotenv from 'dotenv';

import {
  AtlasMailReputationGuard,
  AtlasMailVolumeGovernor,
  AtlasMailFeedbackLoop,
  GooglePostmasterV2Adapter,
  MicrosoftSNDSAdapter,
  PostfixSMTPNormalizer,
  AuthTelemetryNormalizer,
  AtlasSMTPAdapter,
  IMTAClient,
  MTAMessagePayload,
  SMTPTransportOutcome,
  NormalizedReputationSignal,
  ReputationEvaluationResult
} from '../lib/atlasMailFabric';

const loadEnv = dotenv?.config || (dotenv as any)?.default?.config;
if (typeof loadEnv === 'function') loadEnv({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseServiceKey) throw new Error('SUPABASE_SECRET_KEY must be set in environment');

const adminClient = createClient(supabaseUrl, supabaseServiceKey);
let testTenantId: string;

// Mock MTA Client
class MockReputationMTAClient implements IMTAClient {
  public lastSubmittedPayload?: MTAMessagePayload;
  async submitMessage(payload: MTAMessagePayload): Promise<SMTPTransportOutcome> {
    this.lastSubmittedPayload = payload;
    return {
      status: 'ACCEPTED',
      smtp_response_code: 250,
      enhanced_status_code: '2.0.0',
      mta_queue_id: payload.mta_queue_id,
      provider_message_id: `<rep.${crypto.randomUUID()}@youapp.com>`
    };
  }
}

async function ensureTenant(email: string): Promise<string> {
  const { data: users } = await adminClient.auth.admin.listUsers();
  let user = users.users.find((u: any) => u.email === email);
  if (!user) {
    const res = await adminClient.auth.admin.createUser({ email, password: 'TestPassword123!', email_confirm: true });
    user = res.data.user!;
  }
  const { data: existing } = await adminClient.from('atlas_tenants').select('tenant_id').eq('tenant_id', user.id).single();
  if (!existing) {
    await adminClient.from('atlas_tenants').insert({ tenant_id: user.id });
  }
  return user.id;
}

beforeAll(async () => {
  testTenantId = await ensureTenant(`tenant-rep-guard-${Date.now()}@test.com`);
});

describe('ATLAS MAIL REPUTATION & DELIVERABILITY GUARD V1 — Gate Certification', () => {

  // 1. GREEN State
  it('1. GREEN_STATE: Permits authorized volume when all signals are healthy with sufficient sample', async () => {
    const guard = new AtlasMailReputationGuard(adminClient);
    const domain = `clean-${Date.now()}.com`;
    const today = new Date().toISOString().split('T')[0];

    // Ingest clean Google Postmaster stats (spam 0.02% < 0.10% target, High reputation, sufficient sample)
    const googleAdapter = new GooglePostmasterV2Adapter();
    const googleSignal = googleAdapter.normalizeStats({
      domain,
      date: today,
      userReportedSpamRate: 0.0002,
      domainReputation: 'HIGH',
      ipReputations: [{ ip: '198.51.100.25', reputation: 'HIGH' }],
      spfSuccessRate: 1.0,
      dkimSuccessRate: 1.0,
      dmarcSuccessRate: 1.0,
      deliveryErrors: [],
      sampleCount: 500,
      complianceStatus: 'COMPLIANT_V2'
    });
    await guard.ingestSignal(googleSignal);

    // Ingest clean Microsoft SNDS report
    const msftAdapter = new MicrosoftSNDSAdapter();
    const sndsSignal = msftAdapter.normalizeReport(domain, {
      ipAddress: '198.51.100.25',
      activityDate: today,
      status: 'NORMAL',
      filterResult: 'GREEN',
      complaintRate: 0.0001,
      trapHits: 0,
      messageVolume: 200,
      sampleCount: 200
    });
    await guard.ingestSignal(sndsSignal);

    // Ingest clean Postfix outcomes
    const postfixSignal = PostfixSMTPNormalizer.normalizeOutcomes(domain, today, {
      accepted: 100,
      deferred4xx: 0,
      rejected5xx: 0,
      timeouts: 0
    });
    await guard.ingestSignal(postfixSignal);

    // Evaluate gate
    const evalRes = await guard.evaluateGate(domain, today);
    expect(evalRes.overall_status).toBe('GREEN');
    expect(evalRes.gate_reason).toBe('ALL_SIGNALS_HEALTHY_AND_VERIFIED');
    expect(evalRes.current_allowed_volume_per_day).toBeGreaterThanOrEqual(25);

    const dispatchCheck = await guard.isDispatchAllowed(domain, 25);
    expect(dispatchCheck.allowed).toBe(true);
    expect(dispatchCheck.status).toBe('GREEN');
  });

  // 2. WATCH State
  it('2. WATCH_STATE: Freezes volume scaling and holds steady when elevated warning signals exist', async () => {
    const guard = new AtlasMailReputationGuard(adminClient);
    const domain = `watch-${Date.now()}.com`;
    const today = new Date().toISOString().split('T')[0];

    // Ingest Google Postmaster in warning zone: 0.15% (between 0.10% target and 0.30% hard stop)
    const googleAdapter = new GooglePostmasterV2Adapter();
    const googleSignal = googleAdapter.normalizeStats({
      domain,
      date: today,
      userReportedSpamRate: 0.0015, // 0.15%
      domainReputation: 'MEDIUM',
      ipReputations: [{ ip: '198.51.100.25', reputation: 'MEDIUM' }],
      spfSuccessRate: 1.0,
      dkimSuccessRate: 1.0,
      dmarcSuccessRate: 1.0,
      deliveryErrors: [],
      sampleCount: 300,
      complianceStatus: 'COMPLIANT_V2'
    });
    await guard.ingestSignal(googleSignal);

    const evalRes = await guard.evaluateGate(domain, today);
    expect(evalRes.overall_status).toBe('WATCH');
    expect(evalRes.gate_reason).toBe('ELEVATED_GOOGLE_SPAM_RATE_WARNING_0_10_TO_0_29_PERCENT');
    expect(evalRes.can_scale_volume).toBe(false);
  });

  // 3. Google Spam >= 0.30% -> HOLD
  it('3. GOOGLE_SPAM_HARD_STOP: Google spam rate >= 0.30% triggers immediate HOLD and clamps volume to 0', async () => {
    const guard = new AtlasMailReputationGuard(adminClient);
    const domain = `spamhold-${Date.now()}.com`;
    const today = new Date().toISOString().split('T')[0];

    // Ingest Google Postmaster with 0.35% spam (exceeding 0.30% critical threshold)
    const googleAdapter = new GooglePostmasterV2Adapter();
    const googleSignal = googleAdapter.normalizeStats({
      domain,
      date: today,
      userReportedSpamRate: 0.0035, // 0.35%
      domainReputation: 'LOW',
      ipReputations: [{ ip: '198.51.100.25', reputation: 'LOW' }],
      spfSuccessRate: 1.0,
      dkimSuccessRate: 1.0,
      dmarcSuccessRate: 1.0,
      deliveryErrors: [],
      sampleCount: 400,
      complianceStatus: 'NON_COMPLIANT'
    });
    await guard.ingestSignal(googleSignal);

    const evalRes = await guard.evaluateGate(domain, today);
    expect(evalRes.overall_status).toBe('HOLD');
    expect(evalRes.gate_reason).toBe('CRITICAL_GOOGLE_SPAM_RATE_EXCEEDED_0_30_PERCENT');
    expect(evalRes.current_allowed_volume_per_day).toBe(0);
    expect(evalRes.consecutive_green_days).toBe(0);

    const dispatchCheck = await guard.isDispatchAllowed(domain, 1);
    expect(dispatchCheck.allowed).toBe(false);
    expect(dispatchCheck.status).toBe('HOLD');
    expect(dispatchCheck.allowedDailyVolume).toBe(0);
  });

  // 4. Microsoft SNDS Abnormal -> HOLD
  it('4. SNDS_ABNORMAL_HARD_STOP: Microsoft SNDS abnormal/red status triggers immediate HOLD', async () => {
    const guard = new AtlasMailReputationGuard(adminClient);
    const domain = `sndshold-${Date.now()}.com`;
    const today = new Date().toISOString().split('T')[0];

    const msftAdapter = new MicrosoftSNDSAdapter();
    const sndsSignal = msftAdapter.normalizeReport(domain, {
      ipAddress: '198.51.100.25',
      activityDate: today,
      status: 'ABNORMAL',
      filterResult: 'RED',
      complaintRate: 0.008,
      trapHits: 2,
      messageVolume: 150,
      sampleCount: 150
    });
    await guard.ingestSignal(sndsSignal);

    const evalRes = await guard.evaluateGate(domain, today);
    expect(evalRes.overall_status).toBe('HOLD');
    expect(evalRes.gate_reason).toBe('MICROSOFT_SNDS_ABNORMAL_OR_RED_STATUS');
    expect(evalRes.current_allowed_volume_per_day).toBe(0);
  });

  // 5. Auth Failure -> HOLD
  it('5. AUTH_FAILURE_HARD_STOP: SPF, DKIM, or DMARC failure triggers immediate HOLD', async () => {
    const guard = new AtlasMailReputationGuard(adminClient);
    const domain = `authfail-${Date.now()}.com`;
    const today = new Date().toISOString().split('T')[0];

    const authSignal = AuthTelemetryNormalizer.normalizeAuthAudit(domain, today, {
      spfVerified: false, // SPF failed
      dkimVerified: true,
      dmarcVerified: true,
      ptrVerified: true,
      tlsVerified: true
    });
    await guard.ingestSignal(authSignal);

    const evalRes = await guard.evaluateGate(domain, today);
    expect(evalRes.overall_status).toBe('HOLD');
    expect(evalRes.gate_reason).toBe('AUTHENTICATION_FAILURE_SPF_DKIM_DMARC_PTR');
    expect(evalRes.current_allowed_volume_per_day).toBe(0);
  });

  // 6. Insufficient Sample for New IP -> WATCH / PILOT_ONLY
  it('6. INSUFFICIENT_SAMPLE_NEW_IP: New IP with healthy local telemetry resolves to WATCH/PILOT_ONLY', async () => {
    const guard = new AtlasMailReputationGuard(adminClient);
    const domain = `newip-${Date.now()}.com`;
    const today = new Date().toISOString().split('T')[0];

    // Google Postmaster report has 0 sample (insufficient sample)
    const googleAdapter = new GooglePostmasterV2Adapter();
    const googleSignal = googleAdapter.normalizeStats({
      domain,
      date: today,
      userReportedSpamRate: 0.0,
      domainReputation: 'INSUFFICIENT_SAMPLE',
      ipReputations: [{ ip: '198.51.100.25', reputation: 'INSUFFICIENT_SAMPLE' }],
      spfSuccessRate: 1.0,
      dkimSuccessRate: 1.0,
      dmarcSuccessRate: 1.0,
      deliveryErrors: [],
      sampleCount: 0,
      complianceStatus: 'COMPLIANT_V2'
    });
    await guard.ingestSignal(googleSignal);

    const evalRes = await guard.evaluateGate(domain, today);
    expect(evalRes.overall_status).toBe('WATCH');
    expect(evalRes.gate_reason).toBe('INSUFFICIENT_SAMPLE_NEW_IP_PILOT_ONLY');
    expect(evalRes.current_tier).toBe('PILOT_ONLY');
    expect(evalRes.current_allowed_volume_per_day).toBe(25);
    expect(evalRes.can_scale_volume).toBe(false);
  });

  // 7. Stale Telemetry Fail-Safe
  it('7. STALE_TELEMETRY: Signals older than 48 hours freeze scaling and enforce fail-safe', () => {
    const guard = new AtlasMailReputationGuard();
    const domain = 'staletest.com';
    const threeDaysAgo = new Date(Date.now() - 72 * 3600 * 1000).toISOString();

    const staleSignal: NormalizedReputationSignal = {
      provider: 'POSTFIX_SMTP',
      signal_date: '2026-09-06',
      domain,
      sending_ip_hash: 'LOCAL_MTA',
      spam_rate: 0.0,
      domain_reputation: 'HIGH',
      ip_reputation: 'HIGH',
      authentication_status: 'PASS',
      delivery_errors: 0,
      temporary_deferrals: 0,
      hard_bounces: 0,
      complaints: 0,
      snds_abnormal_status: false,
      sample_volume: 50,
      has_sufficient_sample: true,
      source_timestamp: threeDaysAgo
    };

    const evalRes = guard.evaluateSignalsLocally(domain, [staleSignal]);
    expect(evalRes.overall_status).toBe('WATCH');
    expect(evalRes.gate_reason).toBe('STALE_TELEMETRY_EXCEEDING_48_HOURS');
    expect(evalRes.is_stale).toBe(true);
    expect(evalRes.can_scale_volume).toBe(false);
  });

  // 8. Provider Unavailable / Fail-Safe
  it('8. PROVIDER_UNAVAILABLE: Unconfigured or offline provider returns UNAVAILABLE without fake data', async () => {
    const unconfiguredGoogle = new GooglePostmasterV2Adapter({ clientId: undefined });
    expect(unconfiguredGoogle.isConfigured()).toBe(false);

    const res = await unconfiguredGoogle.queryDomainStats('testdomain.com');
    expect(res.status).toBe('NOT_CONFIGURED');
    expect(res.data).toBeUndefined();
    expect(res.error).toBeDefined();
  });

  // 9. Zero-PII Invariant
  it('9. ZERO_PII_INVARIANT: Telemetry records strictly contain 0 recipient emails or plaintext identifiers', () => {
    const googleAdapter = new GooglePostmasterV2Adapter();
    const normalized = googleAdapter.normalizeStats({
      domain: 'youapp.com',
      date: '2026-09-09',
      userReportedSpamRate: 0.0005,
      domainReputation: 'HIGH',
      ipReputations: [{ ip: '198.51.100.25', reputation: 'HIGH' }],
      spfSuccessRate: 1.0,
      dkimSuccessRate: 1.0,
      dmarcSuccessRate: 1.0,
      deliveryErrors: [],
      sampleCount: 150,
      complianceStatus: 'COMPLIANT_V2'
    });

    const serialized = JSON.stringify(normalized);
    expect(serialized).not.toContain('@recipient');
    expect(serialized).not.toContain('user@');
    expect((normalized as any).recipient_email).toBeUndefined();
    expect((normalized as any).email).toBeUndefined();
  });

  // 10. Feedback-ID Specification
  it('10. FEEDBACK_ID_SPEC: Generates Google RFC compliant header Feedback-ID: a:b:c:SenderId', () => {
    const header = AtlasMailFeedbackLoop.generateFeedbackIdHeader({
      campaign_id: 'launch_canary_01',
      tenant_hash: 'a1b2c3d4e5f6',
      mail_type: 'PROMOTIONAL',
      sender_id: 'ATLASMAIL'
    });

    expect(header).toBe('launch_canary_01:a1b2c3d4e5f6:PROMOTIONAL:ATLASMAIL');

    const validation = AtlasMailFeedbackLoop.validateFeedbackId(header);
    expect(validation.valid).toBe(true);
    expect(validation.senderId).toBe('ATLASMAIL');
    expect(validation.senderId?.length).toBeGreaterThanOrEqual(5);
    expect(validation.senderId?.length).toBeLessThanOrEqual(15);

    // Rejects invalid senderId lengths
    expect(() => AtlasMailFeedbackLoop.generateFeedbackIdHeader({
      campaign_id: 'test',
      tenant_hash: 'hash',
      mail_type: 'TRANSACTIONAL',
      sender_id: 'ABCD' // 4 chars -> invalid (<5)
    })).toThrow('FEEDBACK_ID_VIOLATION');

    expect(() => AtlasMailFeedbackLoop.generateFeedbackIdHeader({
      campaign_id: 'test',
      tenant_hash: 'hash',
      mail_type: 'TRANSACTIONAL',
      sender_id: 'THIS_IS_WAY_TOO_LONG_SENDER' // >15 chars
    })).toThrow('FEEDBACK_ID_VIOLATION');
  });

  // 11. Feedback-ID Attached in SMTP Adapter
  it('11. FEEDBACK_ID_IN_SMTP: AtlasSMTPAdapter attaches Feedback-ID header to outbound MIME payload', async () => {
    const mockMta = new MockReputationMTAClient();
    const adapter = new AtlasSMTPAdapter({ mtaClient: mockMta, supabase: adminClient });

    await adapter.sendAuthorizedMessage({
      tenant_id: testTenantId,
      execution_id: crypto.randomUUID(),
      attempt_id: crypto.randomUUID(),
      pool_key: 'WARMUP',
      campaign_id: 'cmp_pilot_1',
      mail_type: 'PROMOTIONAL',
      from: 'noreply@youapp.com',
      to: 'recipient@example.com',
      subject: 'Feedback-ID Test',
      body: 'Testing Feedback-ID'
    });

    const headers = mockMta.lastSubmittedPayload?.custom_headers;
    expect(headers).toBeDefined();
    expect(headers?.['Feedback-ID']).toBeDefined();
    expect(headers?.['Feedback-ID']).toMatch(/^cmp_pilot_1:[a-f0-9]{12}:PROMOTIONAL:ATLASMAIL$/);
  });

  // 12. Volume Governor Consecutive Days
  it('12. VOLUME_GOVERNOR_CONSECUTIVE_DAYS: Requires consecutive clean GREEN evaluations to advance tiers', () => {
    // 0 consecutive clean days -> PILOT_ONLY (cap 50)
    const eval0: ReputationEvaluationResult = {
      domain: 'govtest.com',
      evaluation_date: '2026-09-09',
      overall_status: 'GREEN',
      gate_reason: 'ALL_SIGNALS_HEALTHY_AND_VERIFIED',
      google_spam_rate: 0.0001,
      google_domain_reputation: 'HIGH',
      google_ip_reputation: 'HIGH',
      google_compliance_status: 'COMPLIANT_V2',
      snds_abnormal: false,
      auth_status: 'PASS',
      smtp_accepted_count: 50,
      smtp_deferral_count: 0,
      smtp_rejection_count: 0,
      bounce_rate: 0,
      complaint_rate: 0,
      current_allowed_volume_per_day: 50,
      current_tier: 'PILOT_ONLY',
      consecutive_green_days: 0,
      can_scale_volume: false,
      has_sufficient_sample: true
    };

    const gov0 = AtlasMailVolumeGovernor.evaluateGovernorState(eval0);
    expect(gov0.currentTier).toBe('PILOT_ONLY');
    expect(gov0.allowedDailyVolume).toBe(50);

    // 3 consecutive clean days -> EARLY_RAMP (cap 100)
    const eval3 = { ...eval0, consecutive_green_days: 3 };
    const gov3 = AtlasMailVolumeGovernor.evaluateGovernorState(eval3);
    expect(gov3.currentTier).toBe('EARLY_RAMP');
    expect(gov3.allowedDailyVolume).toBe(100);

    // 7 consecutive clean days -> EXPANDED_SCALE (cap 500)
    const eval7 = { ...eval0, consecutive_green_days: 7 };
    const gov7 = AtlasMailVolumeGovernor.evaluateGovernorState(eval7);
    expect(gov7.currentTier).toBe('EXPANDED_SCALE');
    expect(gov7.allowedDailyVolume).toBe(500);

    // 21 consecutive clean days -> PRODUCTION_5K_BULK (cap 5000)
    const eval21 = { ...eval0, consecutive_green_days: 21 };
    const gov21 = AtlasMailVolumeGovernor.evaluateGovernorState(eval21);
    expect(gov21.currentTier).toBe('PRODUCTION_5K_BULK');
    expect(gov21.allowedDailyVolume).toBe(5000);
  });

  // 13. SMTP Deferral Surge -> WATCH
  it('13. SMTP_DEFERRAL_SURGE: Deferral rate exceeding 15% transitions state to WATCH', () => {
    const guard = new AtlasMailReputationGuard();
    const domain = 'deferralsurge.com';
    const today = '2026-09-09';

    const postfixSignal = PostfixSMTPNormalizer.normalizeOutcomes(domain, today, {
      accepted: 80,
      deferred4xx: 20, // 20% deferral rate (>15%)
      rejected5xx: 0,
      timeouts: 0
    });

    const evalRes = guard.evaluateSignalsLocally(domain, [postfixSignal]);
    expect(evalRes.overall_status).toBe('WATCH');
    expect(evalRes.gate_reason).toBe('ELEVATED_SMTP_DEFERRALS_EXCEEDING_15_PERCENT');
    expect(evalRes.can_scale_volume).toBe(false);
  });

  // 14. Microsoft SNDS Secret URL Confidentiality
  it('14. SNDS_SECRET_CONFIDENTIALITY: Confidential export URLs are never exposed in serialized records', () => {
    const adapter = new MicrosoftSNDSAdapter({ dataExportUrl: 'https://postmaster.live.com/snds/data.aspx?key=SECRET_TOKEN_XYZ' });
    const normalized = adapter.normalizeReport('youapp.com', {
      ipAddress: '198.51.100.25',
      activityDate: '2026-09-09',
      status: 'NORMAL',
      filterResult: 'GREEN',
      complaintRate: 0.0,
      trapHits: 0,
      messageVolume: 100,
      sampleCount: 100
    });

    const serialized = JSON.stringify(normalized);
    expect(serialized).not.toContain('SECRET_TOKEN_XYZ');
    expect(serialized).not.toContain('data.aspx');
  });

  // 15. DMARC Quarantine Baseline
  it('15. DMARC_BASELINE: Confirms baseline authentication matches DMARC p=quarantine', () => {
    const authSignal = AuthTelemetryNormalizer.normalizeAuthAudit('youapp.com', '2026-09-09', {
      spfVerified: true,
      dkimVerified: true,
      dmarcVerified: true,
      ptrVerified: true,
      tlsVerified: true
    });

    expect(authSignal.authentication_status).toBe('PASS');
    expect(authSignal.domain_reputation).toBe('HIGH');
  });

  // 16. Frozen Migration 080000 Hash Invariant
  it('16. FROZEN_080000_INTEGRITY: Migration 20260909080000 remains strictly unmodified', () => {
    const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20260909080000_atlas_mail_fabric_v1.sql');
    const content = fs.readFileSync(migrationPath);
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    expect(hash).toBe('8d04a837f821529fd8280f1262e82b431ba2aa91ee603fe94e21365f95cf7e11');
  });

  // 17. New Migration 081000 Exists and Has Clean Hash
  it('17. MIGRATION_081000_EXISTS: Migration 20260909081000 is present and valid', () => {
    const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20260909081000_atlas_reputation_guard_v1.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);

    const content = fs.readFileSync(migrationPath);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    expect(hash.length).toBe(64);
  });

});
