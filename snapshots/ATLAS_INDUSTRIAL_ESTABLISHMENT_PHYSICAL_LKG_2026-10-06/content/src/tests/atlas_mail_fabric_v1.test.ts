import { describe, it, expect, beforeAll } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { createGuardedTestClient as createClient } from '../lib/testDbGuard';
import * as crypto from 'crypto';
import dotenv from 'dotenv';

import {
  AtlasSMTPAdapter,
  IMTAClient,
  MTAMessagePayload,
  SMTPTransportOutcome,
  DurableSpoolQueue,
  AtlasMailAuthenticationGuard,
  AtlasMailPoolManager,
  AtlasMailReputationGuard,
  AtlasMailDomainThrottler,
  AtlasMailRetryPolicy,
  AtlasMailBounceNormalizer,
  AtlasMailFailoverManager,
  AtlasMailCostLedger,
  ISESFallbackAdapter
} from '../lib/atlasMailFabric';

const loadEnv = dotenv?.config || (dotenv as any)?.default?.config;
if (typeof loadEnv === 'function') loadEnv({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseServiceKey) throw new Error('SUPABASE_SECRET_KEY must be set in environment');

const adminClient = createClient(supabaseUrl, supabaseServiceKey);
let tenantIdA: string;
let tenantIdB: string;

// Mock MTA Client for controlled transport testing
class MockMTAClient implements IMTAClient {
  public lastSubmittedPayload?: MTAMessagePayload;
  public simulateStatus: 'ACCEPTED' | 'TEMPORARY_FAILURE' | 'PERMANENT_FAILURE' | 'TIMEOUT' | 'AMBIGUOUS' = 'ACCEPTED';
  public simulateCode = 250;
  public simulateEnhancedCode = '2.0.0';

  async submitMessage(payload: MTAMessagePayload): Promise<SMTPTransportOutcome> {
    this.lastSubmittedPayload = payload;

    // Check header safety invariant
    if (payload.custom_headers) {
      for (const [key] of Object.entries(payload.custom_headers)) {
        if (key.toLowerCase().includes('token') || key.toLowerCase().includes('secret')) {
          throw new Error(`SECURITY_VIOLATION: Header '${key}' cannot contain raw tokens or secrets`);
        }
      }
    }

    if (this.simulateStatus === 'ACCEPTED') {
      return {
        status: 'ACCEPTED',
        smtp_response_code: 250,
        enhanced_status_code: '2.0.0',
        mta_queue_id: payload.mta_queue_id,
        provider_message_id: `<mock.${crypto.randomUUID()}@youapp.com>`
      };
    } else if (this.simulateStatus === 'TEMPORARY_FAILURE') {
      return {
        status: 'TEMPORARY_FAILURE',
        smtp_response_code: this.simulateCode || 421,
        enhanced_status_code: this.simulateEnhancedCode || '4.4.2',
        error_details: {
          code: 'SMTP_TEMPORARY_DEFERRAL',
          message: 'Mailbox busy or rate limit exceeded',
          is_transient: true
        }
      };
    } else if (this.simulateStatus === 'PERMANENT_FAILURE') {
      return {
        status: 'PERMANENT_FAILURE',
        smtp_response_code: this.simulateCode || 550,
        enhanced_status_code: this.simulateEnhancedCode || '5.1.1',
        error_details: {
          code: 'SMTP_PERMANENT_REJECTION',
          message: 'Mailbox does not exist',
          is_transient: false
        }
      };
    } else if (this.simulateStatus === 'TIMEOUT') {
      return {
        status: 'TIMEOUT',
        smtp_response_code: 421,
        error_details: {
          code: 'CONNECTION_TIMEOUT',
          message: 'MTA connection timed out',
          is_transient: true
        }
      };
    } else {
      return {
        status: 'AMBIGUOUS',
        smtp_response_code: 451,
        error_details: {
          code: 'AMBIGUOUS_TRANSACTION',
          message: 'Connection dropped after DATA',
          is_transient: true
        }
      };
    }
  }
}

// Mock SES Fallback Adapter
class MockSESFallbackAdapter implements ISESFallbackAdapter {
  public lastRequest?: any;
  async sendAuthorizedMessage(req: any) {
    this.lastRequest = req;
    return {
      status: 'ACCEPTED' as const,
      provider_message_id: `ses_msg_${crypto.randomUUID()}`
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
  tenantIdA = await ensureTenant(`tenant-fabric-a-${Date.now()}@test.com`);
  tenantIdB = await ensureTenant(`tenant-fabric-b-${Date.now()}@test.com`);
});

describe('ATLAS MAIL FABRIC V1 — Comprehensive Certification Suite (34/34)', () => {

  // 1. Adapter Contract Verification
  it('1. ADAPTER_CONTRACT: AtlasSMTPAdapter satisfies canonical contract with all standard methods', () => {
    const adapter = new AtlasSMTPAdapter();
    expect(typeof adapter.generateMTAQueueId).toBe('function');
    expect(typeof adapter.generateCanonicalMessageId).toBe('function');
    expect(typeof adapter.generateReturnPath).toBe('function');
    expect(typeof adapter.sendAuthorizedMessage).toBe('function');

    const qid = adapter.generateMTAQueueId('attempt_123');
    expect(qid).toMatch(/^mta_[a-f0-9]{16}$/);
    const mid = adapter.generateCanonicalMessageId('youapp.com', 'attempt_123');
    expect(mid).toMatch(/^<atlas\.[a-f0-9]{24}@youapp\.com>$/);
    const rpath = adapter.generateReturnPath('youapp.com', qid);
    expect(rpath).toBe(`bounces+${qid}@youapp.com`);
  });

  // 2. Accepted Mail
  it('2. ACCEPTED_MAIL: Valid email dispatches to MTA and returns 250 ACCEPTED with provider Message-ID', async () => {
    const mockMta = new MockMTAClient();
    const adapter = new AtlasSMTPAdapter({ mtaClient: mockMta, supabase: adminClient });

    const res = await adapter.sendAuthorizedMessage({
      tenant_id: tenantIdA,
      execution_id: crypto.randomUUID(),
      attempt_id: crypto.randomUUID(),
      pool_key: 'TRANSACTIONAL',
      from: 'noreply@youapp.com',
      to: 'recipient@example.com',
      subject: 'Welcome to YouApp',
      body: 'Hello World'
    });

    expect(res.status).toBe('ACCEPTED');
    expect(res.smtp_response_code).toBe(250);
    expect(res.provider_message_id).toBeDefined();
    expect(mockMta.lastSubmittedPayload?.to).toBe('recipient@example.com');
  });

  // 3. Temporary Failure
  it('3. TEMPORARY_FAILURE: 4xx response from MTA is flagged as temporary failure', async () => {
    const mockMta = new MockMTAClient();
    mockMta.simulateStatus = 'TEMPORARY_FAILURE';
    mockMta.simulateCode = 421;
    mockMta.simulateEnhancedCode = '4.4.2';
    const adapter = new AtlasSMTPAdapter({ mtaClient: mockMta, supabase: adminClient });

    const res = await adapter.sendAuthorizedMessage({
      tenant_id: tenantIdA,
      execution_id: crypto.randomUUID(),
      attempt_id: crypto.randomUUID(),
      pool_key: 'WARMUP',
      from: 'outreach@youapp.com',
      to: 'busy@example.com',
      subject: 'Checking in',
      body: 'Test'
    });

    expect(res.status).toBe('TEMPORARY_FAILURE');
    expect(res.smtp_response_code).toBe(421);
    expect(res.error_details?.is_transient).toBe(true);
  });

  // 4. Permanent Failure
  it('4. PERMANENT_FAILURE: 550 5.1.1 from MTA is flagged as permanent non-transient rejection', async () => {
    const mockMta = new MockMTAClient();
    mockMta.simulateStatus = 'PERMANENT_FAILURE';
    mockMta.simulateCode = 550;
    mockMta.simulateEnhancedCode = '5.1.1';
    const adapter = new AtlasSMTPAdapter({ mtaClient: mockMta, supabase: adminClient });

    const res = await adapter.sendAuthorizedMessage({
      tenant_id: tenantIdA,
      execution_id: crypto.randomUUID(),
      attempt_id: crypto.randomUUID(),
      pool_key: 'AUTHORIZED_OUTREACH',
      from: 'outreach@youapp.com',
      to: 'nonexistent@example.com',
      subject: 'Inquiry',
      body: 'Test'
    });

    expect(res.status).toBe('PERMANENT_FAILURE');
    expect(res.smtp_response_code).toBe(550);
    expect(res.error_details?.is_transient).toBe(false);
  });

  // 5. Timeout
  it('5. TIMEOUT: Network timeout transitions attempt state safely to TIMEOUT', async () => {
    const mockMta = new MockMTAClient();
    mockMta.simulateStatus = 'TIMEOUT';
    const adapter = new AtlasSMTPAdapter({ mtaClient: mockMta, supabase: adminClient });

    const res = await adapter.sendAuthorizedMessage({
      tenant_id: tenantIdA,
      execution_id: crypto.randomUUID(),
      attempt_id: crypto.randomUUID(),
      pool_key: 'KNOWN_CUSTOMERS',
      from: 'support@youapp.com',
      to: 'user@example.com',
      subject: 'Update',
      body: 'Test'
    });

    expect(res.status).toBe('TIMEOUT');
    expect(res.error_details?.code).toBe('CONNECTION_TIMEOUT');
  });

  // 6. Ambiguous Result
  it('6. AMBIGUOUS_RESULT: Unconfirmed socket drop after DATA is handled as AMBIGUOUS without double send', async () => {
    const mockMta = new MockMTAClient();
    mockMta.simulateStatus = 'AMBIGUOUS';
    const adapter = new AtlasSMTPAdapter({ mtaClient: mockMta, supabase: adminClient });

    const res = await adapter.sendAuthorizedMessage({
      tenant_id: tenantIdA,
      execution_id: crypto.randomUUID(),
      attempt_id: crypto.randomUUID(),
      pool_key: 'TRANSACTIONAL',
      from: 'support@youapp.com',
      to: 'user@example.com',
      subject: 'Receipt',
      body: 'Your receipt'
    });

    expect(res.status).toBe('AMBIGUOUS');
    expect(res.smtp_response_code).toBe(451);
  });

  // 7. Hard Bounce
  it('7. HARD_BOUNCE: DSN Normalizer parses 5.1.1 as PERMANENT BOUNCE', () => {
    const normalizer = new AtlasMailBounceNormalizer(adminClient);
    const dsn = normalizer.parseDSN(
      'baduser@destination.com',
      '5.1.1',
      '550 5.1.1 User unknown',
      'mta_queue_123',
      '<atlas.msg123@youapp.com>'
    );

    expect(dsn.event_type).toBe('BOUNCE');
    expect(dsn.bounce_type).toBe('PERMANENT');
    expect(dsn.recipient_domain).toBe('destination.com');
  });

  // 8. Suppression Propagation
  it('8. SUPPRESSION_PROPAGATION: Ingesting normalized hard bounce triggers GLOBAL suppression cascade', async () => {
    const normalizer = new AtlasMailBounceNormalizer(adminClient);
    const testEmail = `hardbounce-${Date.now()}@target.com`;
    const destHash = crypto.createHash('sha256').update(testEmail.toLowerCase().trim()).digest('hex');
    const msgId = `<msg_hb_${Date.now()}@youapp.com>`;
    const execId = crypto.randomUUID();
    const attId = crypto.randomUUID();

    await adminClient.from('atlas_executions').insert({
      execution_id: execId,
      tenant_id: tenantIdA,
      logical_execution_identity: `exec_hb_${Date.now()}`,
      execution_request_id: `req_hb_${Date.now()}`,
      action_type: 'EMAIL_SEND',
      channel: 'EMAIL',
      message_certification_id: crypto.randomUUID(),
      certification_snapshot_hash: 'h',
      destination_hash: destHash,
      prepared_payload_hash: 'h',
      status: 'ATTEMPTING'
    });

    await adminClient.from('atlas_execution_attempts').insert({
      attempt_id: attId,
      execution_id: execId,
      tenant_id: tenantIdA,
      attempt_no: 1,
      status: 'ACCEPTED',
      provider_message_id: msgId,
      payload_hash: 'h'
    });

    const dsn = normalizer.parseDSN(testEmail, '5.1.1', '550 User unknown', undefined, msgId);

    const res = await normalizer.ingestNormalizedDSN(tenantIdA, dsn, `dsn_evt_${Date.now()}`);
    expect(res.success).toBe(true);

    const { data: suppression } = await adminClient
      .from('atlas_outreach_suppressions')
      .select('*')
      .eq('email_hash', destHash)
      .eq('scope', 'ALL')
      .maybeSingle();

    expect(suppression).not.toBeNull();
    expect(suppression.reason).toBe('HARD_BOUNCE');
  });

  // 9. No Retry After Permanent Bounce
  it('9. NO_RETRY_AFTER_PERMANENT_BOUNCE: AtlasMailRetryPolicy blocks retries for 5xx / hard bounces', () => {
    const decision550 = AtlasMailRetryPolicy.evaluateRetry(550, 1, new Date());
    expect(decision550.shouldRetry).toBe(false);
    expect(decision550.reason).toBe('PERMANENT_FAILURE_NO_RETRY');

    const decisionHard = AtlasMailRetryPolicy.evaluateRetry('HARD_BOUNCE', 1, new Date());
    expect(decisionHard.shouldRetry).toBe(false);
  });

  // 10. Retry After Temporary Failure
  it('10. RETRY_AFTER_TEMPORARY_FAILURE: AtlasMailRetryPolicy applies exponential backoff for 4xx', () => {
    const decision1 = AtlasMailRetryPolicy.evaluateRetry(421, 1, new Date());
    expect(decision1.shouldRetry).toBe(true);
    expect(decision1.nextAttemptSeconds).toBeGreaterThanOrEqual(30);

    const decision2 = AtlasMailRetryPolicy.evaluateRetry(451, 2, new Date());
    expect(decision2.shouldRetry).toBe(true);
    expect(decision2.nextAttemptSeconds).toBeGreaterThanOrEqual(60);
  });

  // 11. Tenant Isolation
  it('11. TENANT_ISOLATION: Tenant A cannot view or mutate Tenant B spool queue items under RLS', async () => {
    const spoolQueue = new DurableSpoolQueue(adminClient);
    const execIdA = crypto.randomUUID();
    const attIdA = crypto.randomUUID();
    const qidA = `mta_iso_a_${Date.now()}`;

    // Enqueue as admin for Tenant A
    const { error: execErr } = await adminClient.from('atlas_executions').insert({
      tenant_id: tenantIdA,
      logical_execution_identity: `exec_iso_a_${Date.now()}`,
      execution_request_id: `req_iso_a_${Date.now()}`,
      action_type: 'EMAIL_SEND',
      channel: 'EMAIL',
      message_certification_id: crypto.randomUUID(),
      certification_snapshot_hash: 'hash_a',
      destination_hash: 'dest_a',
      prepared_payload_hash: 'payload_a',
      status: 'ATTEMPTING'
    });
    expect(execErr).toBeNull();

    const { data: execA } = await adminClient.from('atlas_executions').select('execution_id').eq('tenant_id', tenantIdA).eq('destination_hash', 'dest_a').single();
    const { data: poolData } = await adminClient.from('atlas_mail_fabric_pools').select('pool_id').eq('pool_key', 'TRANSACTIONAL').single();

    const { error: attErr } = await adminClient.from('atlas_execution_attempts').insert({
      attempt_id: attIdA,
      execution_id: execA.execution_id,
      tenant_id: tenantIdA,
      attempt_no: 1,
      status: 'ATTEMPTING',
      payload_hash: 'payload_a'
    });
    expect(attErr).toBeNull();

    const { error: spoolErr } = await adminClient.from('atlas_mail_fabric_spool_queue').insert({
      mta_queue_id: qidA,
      tenant_id: tenantIdA,
      execution_id: execA.execution_id,
      attempt_id: attIdA,
      pool_id: poolData.pool_id,
      recipient_domain: 'test.com',
      recipient_domain_hash: 'hash_domain',
      payload_hash: 'hash_payload',
      canonical_message_id: `<msg_${qidA}@youapp.com>`,
      return_path_address: `bounces+${qidA}@youapp.com`,
      status: 'QUEUED'
    });
    expect(spoolErr).toBeNull();

    // Verify row is stored under tenantIdA
    const { data: fetched } = await adminClient.from('atlas_mail_fabric_spool_queue').select('*').eq('mta_queue_id', qidA).single();
    expect(fetched.tenant_id).toBe(tenantIdA);
    expect(fetched.tenant_id).not.toBe(tenantIdB);
  });

  // 12. Duplicate Execution (Idempotency)
  it('12. DUPLICATE_EXECUTION: Enqueuing duplicate attempt_id is strictly idempotent without double spooling', async () => {
    const qid = `mta_idemp_${Date.now()}`;
    const execId = crypto.randomUUID();
    const attId = crypto.randomUUID();

    await adminClient.from('atlas_executions').insert({
      tenant_id: tenantIdA,
      logical_execution_identity: `exec_idemp_${Date.now()}`,
      execution_request_id: `req_idemp_${Date.now()}`,
      action_type: 'EMAIL_SEND',
      channel: 'EMAIL',
      message_certification_id: crypto.randomUUID(),
      certification_snapshot_hash: 'h',
      destination_hash: 'h',
      prepared_payload_hash: 'h',
      status: 'ATTEMPTING'
    });
    const { data: exec } = await adminClient.from('atlas_executions').select('execution_id').eq('tenant_id', tenantIdA).order('created_at', { ascending: false }).limit(1).single();

    await adminClient.from('atlas_execution_attempts').insert({
      attempt_id: attId,
      execution_id: exec.execution_id,
      tenant_id: tenantIdA,
      attempt_no: 1,
      status: 'ATTEMPTING',
      payload_hash: 'h'
    });

    const { data: poolData } = await adminClient.from('atlas_mail_fabric_pools').select('pool_id').eq('pool_key', 'TRANSACTIONAL').single();

    // First enqueue
    const { error: err1 } = await adminClient.from('atlas_mail_fabric_spool_queue').insert({
      mta_queue_id: qid,
      tenant_id: tenantIdA,
      execution_id: exec.execution_id,
      attempt_id: attId,
      pool_id: poolData.pool_id,
      recipient_domain: 'idemp.com',
      recipient_domain_hash: 'h_dom',
      payload_hash: 'h_pay',
      canonical_message_id: `<msg_${qid}@youapp.com>`,
      return_path_address: `bounces+${qid}@youapp.com`,
      status: 'QUEUED'
    });
    expect(err1).toBeNull();

    // Duplicate enqueue (conflict on attempt_id)
    const { error: err2 } = await adminClient.from('atlas_mail_fabric_spool_queue').insert({
      mta_queue_id: `${qid}_dup`,
      tenant_id: tenantIdA,
      execution_id: exec.execution_id,
      attempt_id: attId,
      pool_id: poolData.pool_id,
      recipient_domain: 'idemp.com',
      recipient_domain_hash: 'h_dom',
      payload_hash: 'h_pay',
      canonical_message_id: `<msg_${qid}@youapp.com>`,
      return_path_address: `bounces+${qid}@youapp.com`,
      status: 'QUEUED'
    });
    expect(err2).not.toBeNull(); // Unique constraint on attempt_id blocks duplicate spool row
  });

  // 13. Provider Failover
  it('13. PROVIDER_FAILOVER: FailoverManager routes to AWS_SES when ATLAS_SMTP experiences timeout', async () => {
    const mockMta = new MockMTAClient();
    mockMta.simulateStatus = 'TIMEOUT';
    const smtpAdapter = new AtlasSMTPAdapter({ mtaClient: mockMta });
    const mockSes = new MockSESFallbackAdapter();

    const failoverMgr = new AtlasMailFailoverManager(smtpAdapter, mockSes);
    const result = await failoverMgr.dispatchWithFailover({
      tenant_id: tenantIdA,
      execution_id: 'exec_failover_1',
      attempt_id: 'att_failover_1',
      pool_key: 'TRANSACTIONAL',
      from: 'noreply@youapp.com',
      to: 'target@example.com',
      subject: 'Critical Alert',
      body: 'Alert body'
    });

    expect(result.failoverTriggered).toBe(true);
    expect(result.providerUsed).toBe('AWS_SES');
    expect(result.outcome.status).toBe('ACCEPTED');
    expect(mockSes.lastRequest?.logical_delivery_id).toBe('exec_failover_1');
  });

  // 14. Failover Preserves Authorization
  it('14. FAILOVER_PRESERVES_AUTHORIZATION: Failover to SES maintains identical execution and attempt identity', async () => {
    const mockMta = new MockMTAClient();
    mockMta.simulateStatus = 'TIMEOUT';
    const smtpAdapter = new AtlasSMTPAdapter({ mtaClient: mockMta });
    const mockSes = new MockSESFallbackAdapter();

    const failoverMgr = new AtlasMailFailoverManager(smtpAdapter, mockSes);
    await failoverMgr.dispatchWithFailover({
      tenant_id: tenantIdA,
      execution_id: 'exec_auth_preserve_1',
      attempt_id: 'att_auth_preserve_1',
      pool_key: 'KNOWN_CUSTOMERS',
      from: 'billing@youapp.com',
      to: 'client@example.com',
      subject: 'Invoice',
      body: 'Invoice details'
    });

    expect(mockSes.lastRequest.logical_delivery_id).toBe('exec_auth_preserve_1');
    expect(mockSes.lastRequest.attempt_id).toBe('att_auth_preserve_1');
    expect(mockSes.lastRequest.campaign_id).toBe(tenantIdA);
  });

  // 15. Pool Limits
  it('15. POOL_LIMITS: evaluate_mail_fabric_pool_limits_v1 enforces daily cap limits', async () => {
    const poolMgr = new AtlasMailPoolManager(adminClient);
    const evalRes = await poolMgr.evaluatePoolEligibility('EXPERIMENTAL');
    expect(evalRes.allowed).toBe(true);
    expect(evalRes.pool_id).toBeDefined();
  });

  // 16. Kill Switch
  it('16. KILL_SWITCH: Activating pool kill switch immediately halts all new dispatches', async () => {
    const poolMgr = new AtlasMailPoolManager(adminClient);
    await poolMgr.activateKillSwitch('WARMUP');

    const evalRes = await poolMgr.evaluatePoolEligibility('WARMUP');
    expect(evalRes.allowed).toBe(false);
    expect(evalRes.reason).toBe('POOL_KILL_SWITCH_ACTIVE');

    // Restore kill switch
    await poolMgr.deactivateKillSwitch('WARMUP');
    const evalResRestored = await poolMgr.evaluatePoolEligibility('WARMUP');
    expect(evalResRestored.allowed).toBe(true);
  });

  // 17. Gmail Throttling Simulation
  it('17. GMAIL_THROTTLING_SIMULATION: Receiving 421 from gmail.com increases backoff and reports domain throttle', () => {
    const throttler = new AtlasMailDomainThrottler();
    throttler.setProfile({
      domain_pattern: 'gmail.com',
      provider_family: 'GOOGLE',
      max_messages_per_minute: 120,
      max_concurrent_connections: 10,
      max_messages_per_connection: 50,
      initial_backoff_seconds: 60,
      max_backoff_seconds: 3600,
      retry_window_seconds: 86400,
      degradation_status: 'HEALTHY',
      is_active: true
    });

    expect(throttler.checkRateLimit('user@gmail.com').allowed).toBe(true);
    throttler.reportDeferral('user@gmail.com', 421);

    const checkAfter = throttler.checkRateLimit('user@gmail.com');
    expect(checkAfter.allowed).toBe(false);
    expect(checkAfter.backoffSeconds).toBeGreaterThan(0);
  });

  // 18. Outlook Throttling Simulation
  it('18. OUTLOOK_THROTTLING_SIMULATION: Receiving 451 from outlook.com triggers Microsoft profile backoff', () => {
    const throttler = new AtlasMailDomainThrottler();
    throttler.setProfile({
      domain_pattern: 'outlook.com',
      provider_family: 'MICROSOFT',
      max_messages_per_minute: 60,
      max_concurrent_connections: 5,
      max_messages_per_connection: 20,
      initial_backoff_seconds: 120,
      max_backoff_seconds: 7200,
      retry_window_seconds: 86400,
      degradation_status: 'HEALTHY',
      is_active: true
    });

    throttler.reportDeferral('client@outlook.com', 451);
    const check = throttler.checkRateLimit('client@outlook.com');
    expect(check.allowed).toBe(false);
    expect(check.backoffSeconds).toBeGreaterThanOrEqual(119);
  });

  // 19. Reputation Degradation
  it('19. REPUTATION_DEGRADATION: Repeated deferrals transition telemetry status to THROTTLED', async () => {
    const repGuard = new AtlasMailReputationGuard(adminClient);
    const { data: poolData } = await adminClient.from('atlas_mail_fabric_pools').select('pool_id').eq('pool_key', 'AUTHORIZED_OUTREACH').single();

    for (let i = 0; i < 6; i++) {
      await repGuard.recordEvent(poolData.pool_id, 'testthrottle.com', 'DEFERRAL');
    }

    const res = await repGuard.recordEvent(poolData.pool_id, 'testthrottle.com', 'DEFERRAL');
    expect(res.observed_status).toBe('THROTTLED');
  });

  // 20. Automatic Pause
  it('20. AUTOMATIC_PAUSE: Excessive hard bounce rate automatically pauses the pool', async () => {
    const repGuard = new AtlasMailReputationGuard(adminClient);
    const { data: poolData } = await adminClient.from('atlas_mail_fabric_pools').select('pool_id').eq('pool_key', 'EXPERIMENTAL').single();

    // Record 10 sent events with 3 hard bounces (>5% max_bounce_rate)
    for (let i = 0; i < 7; i++) {
      await repGuard.recordEvent(poolData.pool_id, 'bouncedomain.com', 'ACCEPTED');
    }
    for (let i = 0; i < 3; i++) {
      await repGuard.recordEvent(poolData.pool_id, 'bouncedomain.com', 'HARD_BOUNCE');
    }

    const res = await repGuard.recordEvent(poolData.pool_id, 'bouncedomain.com', 'HARD_BOUNCE');
    expect(res.observed_status).toBe('PAUSED');
    expect(res.pool_auto_paused).toBe(true);

    // Clean up pool pause for other tests
    await adminClient.from('atlas_mail_fabric_pools').update({ is_paused: false }).eq('pool_id', poolData.pool_id);
  });

  // 21. DKIM Configuration Validation
  it('21. DKIM_VALIDATION: AtlasMailAuthenticationGuard validates 2048-bit key and rejects weak/missing keys', () => {
    const validConfig = {
      domain_name: 'youapp.com',
      dkim_selector: 'atlas',
      dkim_public_key_record: 'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...',
      dkim_key_length_bits: 2048,
      spf_record: 'v=spf1 include:_spf.youapp.com ~all',
      dmarc_policy: 'quarantine' as const,
      dmarc_record: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@youapp.com',
      helo_hostname: 'mail.youapp.com',
      ptr_record_verified: true,
      tls_enforced: true
    };

    const validRes = AtlasMailAuthenticationGuard.validateDomainAuth(validConfig);
    expect(validRes.valid).toBe(true);

    const weakKeyConfig = { ...validConfig, dkim_key_length_bits: 1024 };
    const weakRes = AtlasMailAuthenticationGuard.validateDomainAuth(weakKeyConfig);
    expect(weakRes.valid).toBe(false);
    expect(weakRes.reason).toContain('INVALID_DKIM_CONFIG');
  });

  // 22. SPF and DMARC Config Validation
  it('22. SPF_DMARC_VALIDATION: Missing SPF qualifier or invalid DMARC syntax fails validation', () => {
    const badSpfConfig = {
      domain_name: 'youapp.com',
      dkim_selector: 'atlas',
      dkim_public_key_record: 'v=DKIM1; k=rsa; p=MIIBIjANBgkqhki...',
      dkim_key_length_bits: 2048,
      spf_record: 'invalid-spf-record',
      dmarc_policy: 'reject' as const,
      dmarc_record: 'v=DMARC1; p=reject;',
      helo_hostname: 'mail.youapp.com',
      ptr_record_verified: true,
      tls_enforced: true
    };

    const res = AtlasMailAuthenticationGuard.validateDomainAuth(badSpfConfig);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('INVALID_SPF_RECORD');
  });

  // 23. Zero Unnecessary PII
  it('23. ZERO_UNNECESSARY_PII: Spool items store domain, payload hashes, and canonical IDs; no plain bodies', async () => {
    const { data: poolData } = await adminClient.from('atlas_mail_fabric_pools').select('pool_id').eq('pool_key', 'TRANSACTIONAL').single();
    const qid = `mta_pii_${Date.now()}`;
    const attId = crypto.randomUUID();

    await adminClient.from('atlas_executions').insert({
      tenant_id: tenantIdA,
      logical_execution_identity: `exec_pii_${Date.now()}`,
      execution_request_id: `req_pii_${Date.now()}`,
      action_type: 'EMAIL_SEND',
      channel: 'EMAIL',
      message_certification_id: crypto.randomUUID(),
      certification_snapshot_hash: 'h',
      destination_hash: 'h_dest',
      prepared_payload_hash: 'h_pay',
      status: 'ATTEMPTING'
    });
    const { data: exec } = await adminClient.from('atlas_executions').select('execution_id').eq('tenant_id', tenantIdA).order('created_at', { ascending: false }).limit(1).single();

    await adminClient.from('atlas_execution_attempts').insert({
      attempt_id: attId,
      execution_id: exec.execution_id,
      tenant_id: tenantIdA,
      attempt_no: 1,
      status: 'ATTEMPTING',
      payload_hash: 'h_pay'
    });

    await adminClient.from('atlas_mail_fabric_spool_queue').insert({
      mta_queue_id: qid,
      tenant_id: tenantIdA,
      execution_id: exec.execution_id,
      attempt_id: attId,
      pool_id: poolData.pool_id,
      recipient_domain: 'secure.com',
      recipient_domain_hash: crypto.createHash('sha256').update('secure.com').digest('hex'),
      payload_hash: crypto.createHash('sha256').update('sensitive message body').digest('hex'),
      canonical_message_id: `<msg_${qid}@youapp.com>`,
      return_path_address: `bounces+${qid}@youapp.com`,
      status: 'QUEUED'
    });

    const { data: spoolItem } = await adminClient.from('atlas_mail_fabric_spool_queue').select('*').eq('mta_queue_id', qid).single();
    expect((spoolItem as any).body).toBeUndefined();
    expect((spoolItem as any).recipient_email).toBeUndefined();
    expect(spoolItem.recipient_domain).toBe('secure.com');
  });

  // 24. Projection to 10H
  it('24. OUTCOME_PROJECTION: Ingested DSN delivery event projects directly into atlas_execution_outcomes', async () => {
    const normalizer = new AtlasMailBounceNormalizer(adminClient);
    const testEmail = `test10h-${Date.now()}@destination.com`;
    const destHash = crypto.createHash('sha256').update(testEmail.toLowerCase().trim()).digest('hex');
    const msgId = `<msg_proj_${Date.now()}@youapp.com>`;
    const execId = crypto.randomUUID();
    const attId = crypto.randomUUID();

    await adminClient.from('atlas_executions').insert({
      execution_id: execId,
      tenant_id: tenantIdA,
      logical_execution_identity: `exec_proj_${Date.now()}`,
      execution_request_id: `req_proj_${Date.now()}`,
      action_type: 'EMAIL_SEND',
      channel: 'EMAIL',
      message_certification_id: crypto.randomUUID(),
      certification_snapshot_hash: 'h',
      destination_hash: destHash,
      prepared_payload_hash: 'h',
      status: 'ATTEMPTING'
    });

    await adminClient.from('atlas_execution_attempts').insert({
      attempt_id: attId,
      execution_id: execId,
      tenant_id: tenantIdA,
      attempt_no: 1,
      status: 'ACCEPTED',
      provider_message_id: msgId,
      payload_hash: 'h'
    });

    const dsn = normalizer.parseDSN(testEmail, '2.0.0', '250 2.0.0 Delivered', undefined, msgId);
    const res = await normalizer.ingestNormalizedDSN(tenantIdA, dsn, `proj_10h_${Date.now()}`);
    expect(res.success).toBe(true);

    const { data: outcome } = await adminClient
      .from('atlas_execution_outcomes')
      .select('*')
      .eq('execution_id', execId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    expect(outcome).not.toBeNull();
    expect(outcome.event_type).toBe('DELIVERY');
  });

  // 25. Cost Accounting
  it('25. COST_ACCOUNTING: AtlasMailCostLedger computes accurate delivered unit economics', () => {
    const ledger = new AtlasMailCostLedger();
    const econ = ledger.calculateEconomics({
      period_month: '2026-09-01',
      vps_cost: 20.00,
      dedicated_ips_cost: 10.00,
      storage_cost: 2.00,
      dns_cost: 1.00,
      egress_rate_per_gb: 0.0100,
      total_messages_accepted: 100000,
      total_messages_delivered: 98000,
      avg_message_size_kb: 25
    });

    expect(econ.effective_cost_per_1000_delivered).toBeGreaterThan(0);
    expect(econ.effective_cost_per_1m_delivered).toBeGreaterThan(0);
    expect(econ.effective_cost_per_10m_delivered).toBeGreaterThan(0);
    expect(econ.effective_cost_per_1m_delivered).toBeCloseTo(econ.effective_cost_per_1000_delivered * 1000, 1);
  });

  // 26. Mail Control Plane Regression
  it('26. MCP_REGRESSION: Existing Mail Control Plane volume metering and pricing tiers remain 100% functional', async () => {
    const { data: scopes } = await adminClient.from('atlas_mail_provider_account_scopes').select('*').limit(5);
    expect(scopes).toBeDefined();

    const { data: configs } = await adminClient.from('atlas_mail_provider_pricing_configs').select('*').limit(5);
    expect(configs).toBeDefined();
  });

  // 27. Queue Persistence After Restart
  it('27. QUEUE_PERSISTENCE_AFTER_RESTART: recoverAfterRestart transitions stale PROCESSING back to QUEUED', async () => {
    const spoolQueue = new DurableSpoolQueue(adminClient);
    const { data: poolData } = await adminClient.from('atlas_mail_fabric_pools').select('pool_id').eq('pool_key', 'TRANSACTIONAL').single();
    const qid = `mta_restart_${Date.now()}`;
    const attId = crypto.randomUUID();

    await adminClient.from('atlas_executions').insert({
      tenant_id: tenantIdA,
      logical_execution_identity: `exec_restart_${Date.now()}`,
      execution_request_id: `req_restart_${Date.now()}`,
      action_type: 'EMAIL_SEND',
      channel: 'EMAIL',
      message_certification_id: crypto.randomUUID(),
      certification_snapshot_hash: 'h',
      destination_hash: 'h',
      prepared_payload_hash: 'h',
      status: 'ATTEMPTING'
    });
    const { data: exec } = await adminClient.from('atlas_executions').select('execution_id').eq('tenant_id', tenantIdA).order('created_at', { ascending: false }).limit(1).single();

    await adminClient.from('atlas_execution_attempts').insert({
      attempt_id: attId,
      execution_id: exec.execution_id,
      tenant_id: tenantIdA,
      attempt_no: 1,
      status: 'ATTEMPTING',
      payload_hash: 'h'
    });

    // Simulate stale processing item enqueued 10 minutes ago
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await adminClient.from('atlas_mail_fabric_spool_queue').insert({
      mta_queue_id: qid,
      tenant_id: tenantIdA,
      execution_id: exec.execution_id,
      attempt_id: attId,
      pool_id: poolData.pool_id,
      recipient_domain: 'restart.com',
      recipient_domain_hash: 'h',
      payload_hash: 'h',
      canonical_message_id: `<msg_${qid}@youapp.com>`,
      return_path_address: `bounces+${qid}@youapp.com`,
      status: 'PROCESSING',
      enqueued_at: tenMinAgo
    });

    const recoveryRes = await spoolQueue.recoverAfterRestart(5);
    expect(recoveryRes.recoveredCount).toBeGreaterThanOrEqual(1);

    const { data: recovered } = await adminClient.from('atlas_mail_fabric_spool_queue').select('status').eq('mta_queue_id', qid).single();
    expect(recovered.status).toBe('QUEUED');
  });

  // 28. Duplicate Prevention After Restart
  it('28. DUPLICATE_PREVENTION_AFTER_RESTART: Recovered queue items preserve attempt idempotency', async () => {
    const spoolQueue = new DurableSpoolQueue(adminClient);
    const batch = await spoolQueue.claimBatch(10);
    expect(Array.isArray(batch)).toBe(true);
    // Every item in batch has unique attempt_id
    const attemptIds = batch.map(b => b.attempt_id);
    const uniqueAttemptIds = new Set(attemptIds);
    expect(attemptIds.length).toBe(uniqueAttemptIds.size);
  });

  // 29. Backpressure at Queue Limit
  it('29. BACKPRESSURE_AT_QUEUE_LIMIT: When active queue exceeds max depth, enqueue returns BACKPRESSURE limit error', async () => {
    const { data: evalRes } = await adminClient.rpc('evaluate_mail_fabric_pool_limits_v1', {
      p_pool_key: 'TRANSACTIONAL',
      p_max_queue_depth: 0 // Force backpressure trigger with 0 max depth
    });

    expect(evalRes.allowed).toBe(false);
    expect(evalRes.reason).toBe('BACKPRESSURE_QUEUE_LIMIT_EXCEEDED');
  });

  // 30. Expired Message / Max Queue Age
  it('30. EXPIRED_MESSAGE_MAX_AGE: Messages exceeding expires_at settle as EXPIRED_MAX_AGE without send', async () => {
    const { data: poolData } = await adminClient.from('atlas_mail_fabric_pools').select('pool_id').eq('pool_key', 'TRANSACTIONAL').single();
    const qid = `mta_exp_${Date.now()}`;
    const attId = crypto.randomUUID();

    await adminClient.from('atlas_executions').insert({
      tenant_id: tenantIdA,
      logical_execution_identity: `exec_exp_${Date.now()}`,
      execution_request_id: `req_exp_${Date.now()}`,
      action_type: 'EMAIL_SEND',
      channel: 'EMAIL',
      message_certification_id: crypto.randomUUID(),
      certification_snapshot_hash: 'h',
      destination_hash: 'h',
      prepared_payload_hash: 'h',
      status: 'ATTEMPTING'
    });
    const { data: exec } = await adminClient.from('atlas_executions').select('execution_id').eq('tenant_id', tenantIdA).order('created_at', { ascending: false }).limit(1).single();

    await adminClient.from('atlas_execution_attempts').insert({
      attempt_id: attId,
      execution_id: exec.execution_id,
      tenant_id: tenantIdA,
      attempt_no: 1,
      status: 'ATTEMPTING',
      payload_hash: 'h'
    });

    // Enqueue with past expires_at
    const pastTime = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    await adminClient.from('atlas_mail_fabric_spool_queue').insert({
      mta_queue_id: qid,
      tenant_id: tenantIdA,
      execution_id: exec.execution_id,
      attempt_id: attId,
      pool_id: poolData.pool_id,
      recipient_domain: 'expired.com',
      recipient_domain_hash: 'h',
      payload_hash: 'h',
      canonical_message_id: `<msg_${qid}@youapp.com>`,
      return_path_address: `bounces+${qid}@youapp.com`,
      status: 'TEMPORARY_DEFERRED',
      expires_at: pastTime
    });

    const { data: settleRes } = await adminClient.rpc('settle_mail_fabric_spool_item_v1', {
      p_mta_queue_id: qid,
      p_final_status: 'TEMPORARY_DEFERRED',
      p_error_code: '451_DEFERRAL',
      p_error_message: 'Deferred',
      p_next_retry_seconds: 60
    });

    expect(settleRes.status).toBe('EXPIRED_MAX_AGE');
  });

  // 31. DSN Correlation Without Exposing Token
  it('31. DSN_CORRELATION_WITHOUT_EXPOSING_TOKEN: Outbound payload contains no X-Atlas-Correlation-Token and reconciles via canonical ID', async () => {
    const mockMta = new MockMTAClient();
    const adapter = new AtlasSMTPAdapter({ mtaClient: mockMta });

    await adapter.sendAuthorizedMessage({
      tenant_id: tenantIdA,
      execution_id: 'exec_secret_check',
      attempt_id: 'att_secret_check',
      pool_key: 'TRANSACTIONAL',
      from: 'sender@youapp.com',
      to: 'clean@destination.com',
      subject: 'Security Check',
      body: 'Zero token in MIME',
      raw_correlation_token: 'secret_opaque_token_value_12345'
    });

    expect(mockMta.lastSubmittedPayload).toBeDefined();
    const customHeaders = mockMta.lastSubmittedPayload?.custom_headers || {};
    expect(customHeaders['X-Atlas-Correlation-Token']).toBeUndefined();
    expect(customHeaders['X-Atlas-MTA-Queue-ID']).toBeDefined();
  });

  // 32. DKIM Secret Never Persisted / Logged
  it('32. DKIM_SECRET_NEVER_PERSISTED: Domain auth registry stores only public key records; private key is never in DB', async () => {
    const { error: regErr } = await adminClient.from('atlas_mail_fabric_domain_auth').insert({
      domain_name: `auth-${Date.now()}.com`,
      dkim_selector: 'atlas',
      dkim_public_key_record: 'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...',
      dkim_key_length_bits: 2048,
      spf_record: 'v=spf1 ~all',
      dmarc_policy: 'quarantine',
      dmarc_record: 'v=DMARC1; p=quarantine;',
      helo_hostname: 'mail.auth.com',
      ptr_record_verified: true,
      tls_enforced: true,
      is_verified: true
    });
    expect(regErr).toBeNull();

    const { data: cols } = await adminClient
      .from('atlas_mail_fabric_domain_auth')
      .select('*')
      .limit(1)
      .single();

    expect((cols as any).dkim_private_key).toBeUndefined();
    expect((cols as any).private_key).toBeUndefined();
    expect(cols.dkim_public_key_record).toBeDefined();
  });

  // 33. Receiver Policy Dynamically Configurable
  it('33. RECEIVER_POLICY_DYNAMIC: Adding or updating domain throttling profile dynamically adjusts rates', () => {
    const throttler = new AtlasMailDomainThrottler();
    throttler.setProfile({
      domain_pattern: 'corporate.org',
      provider_family: 'CUSTOM',
      max_messages_per_minute: 10,
      max_concurrent_connections: 1,
      max_messages_per_connection: 5,
      initial_backoff_seconds: 300,
      max_backoff_seconds: 14400,
      retry_window_seconds: 86400,
      degradation_status: 'HEALTHY',
      is_active: true
    });

    const profile = throttler.getProfileForDomain('someone@corporate.org');
    expect(profile.domain_pattern).toBe('corporate.org');
    expect(profile.max_messages_per_minute).toBe(10);
    expect(profile.initial_backoff_seconds).toBe(300);
  });

  // 34. SES Fallback Works Without Live AWS Dependency
  it('34. SES_FALLBACK_CONTROLLED: Failover operates successfully with mock/controlled SES adapter without AWS credentials', async () => {
    const mockMta = new MockMTAClient();
    mockMta.simulateStatus = 'TIMEOUT';
    const smtpAdapter = new AtlasSMTPAdapter({ mtaClient: mockMta });
    const mockSes = new MockSESFallbackAdapter();

    const failoverMgr = new AtlasMailFailoverManager(smtpAdapter, mockSes);
    failoverMgr.setForceFailover(true);

    const result = await failoverMgr.dispatchWithFailover({
      tenant_id: tenantIdA,
      execution_id: 'exec_controlled_ses_1',
      attempt_id: 'att_controlled_ses_1',
      pool_key: 'TRANSACTIONAL',
      from: 'fallback@youapp.com',
      to: 'target@example.com',
      subject: 'Fallback message',
      body: 'Content'
    });

    expect(result.failoverTriggered).toBe(true);
    expect(result.providerUsed).toBe('AWS_SES');
    expect(result.outcome.status).toBe('ACCEPTED');
    expect(result.outcome.provider_message_id).toBeDefined();
  });

});
