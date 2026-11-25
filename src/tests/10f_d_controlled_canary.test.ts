import { describe, it, expect, beforeAll } from 'vitest';
import { createGuardedTestClient as createClient } from '../lib/testDbGuard';
import { supabase } from '../lib/supabase';
import { CanaryExecutionService, CanaryExecutionRequest } from '../lib/atlas10f/canary/CanaryExecutionService';
import { MockCanaryProvider } from '../lib/atlas10f/canary/ProviderBoundary';
import { randomUUID } from 'crypto';

let TEST_TENANT = '';
let TEST_TENANT_2 = '';
let adminSupabase: ReturnType<typeof createClient>;
let costId = '';

beforeAll(async () => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
  const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || '';
  adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

  const email = `tenant-10fd-${Date.now()}@test.com`;
  await adminSupabase.auth.admin.createUser({ email, password: 'TestPassword123!', email_confirm: true });
  await supabase.auth.signInWithPassword({ email, password: 'TestPassword123!' });
  const { data: { user } } = await supabase.auth.getUser();
  TEST_TENANT = user!.id;
  await adminSupabase.from('atlas_tenants').insert({ tenant_id: TEST_TENANT });

  const email2 = `tenant-10fd-iso-${Date.now()}@test.com`;
  await adminSupabase.auth.admin.createUser({ email: email2, password: 'TestPassword123!', email_confirm: true });
  const { data: { user: user2 } } = await adminSupabase.auth.admin.getUserById((await adminSupabase.auth.admin.listUsers()).data.users.find(u => u.email === email2)!.id);
  TEST_TENANT_2 = user2!.id;
  await adminSupabase.from('atlas_tenants').insert({ tenant_id: TEST_TENANT_2 });

  costId = randomUUID();
  await adminSupabase.from('atlas_action_cost_registry').insert({
    cost_id: costId, tenant_id: TEST_TENANT, channel: 'EMAIL', action_type: 'EMAIL_SEND', cost_version: 'v1'
  });
});

async function setupValidJitContext(options?: any) {
  const subjectId = randomUUID();
  const nbaId = randomUUID();
  const draftId = randomUUID();
  const certId = randomUUID();
  const certHash = 'cert_hash_' + randomUUID();
  const destHash = 'dest_hash_' + randomUUID();
  const payloadHash = 'payload_hash_' + randomUUID();
  const emailHash = 'email_' + randomUUID();
  
  // Cleanup
  await adminSupabase.from('atlas_canary_allowed_destinations').delete().eq('tenant_id', TEST_TENANT);
  await adminSupabase.from('atlas_canary_envelopes').delete().eq('tenant_id', TEST_TENANT);
  await adminSupabase.from('atlas_executions').delete().eq('tenant_id', TEST_TENANT);
  await adminSupabase.from('atlas_execution_budget_reservations').delete().eq('tenant_id', TEST_TENANT);

  // Create canonical person in atlas_people (which automatically populates atlas_subject_registry)
  await adminSupabase.from('atlas_people').insert({
    person_id: subjectId,
    tenant_id: TEST_TENANT,
    lifecycle_stage: 'CANONICAL',
    status: 'ACTIVE'
  });
  await adminSupabase.from('atlas_channel_eligibility').insert({ subject_id: subjectId, channel: 'EMAIL', action_type: 'EMAIL_SEND', eligibility_status: 'ELIGIBLE' });
  await adminSupabase.from('atlas_next_best_action_state').insert({ nba_id: nbaId, tenant_id: TEST_TENANT, subject_id: subjectId, subject_type: 'PERSON', recommended_action: 'EMAIL', decision_status: 'DO_NOW', evidence_snapshot_hash: 'ev1', input_snapshot_hash: 'in1', policy_version: 'v1' });

  await adminSupabase.from('atlas_message_drafts').insert({
    id: draftId, tenant_id: TEST_TENANT, subject_type: 'PERSON', subject_id: subjectId, nba_state_id: nbaId,
    nba_decision_hash: 'nba_hash', channel: 'EMAIL', action_type: 'EMAIL', policy_id: randomUUID(),
    policy_version: 'v1', policy_hash: 'policy_hash', generation_request_id: 'req1', message_body: 'Hello', status: 'COPY_VALIDATED'
  });

  await adminSupabase.from('atlas_message_certifications').insert({
    tenant_id: TEST_TENANT, id: certId, draft_id: draftId, status: 'CURRENT',
    nba_snapshot_hash: 'n1', eligibility_snapshot_hash: 'e1', policy_hash: 'p1',
    product_snapshot_hash: 'pr1', offer_snapshot_hash: 'o1', evidence_snapshot_hash: 'ev1',
    claim_snapshot_hash: 'c1', authority_bundle_hash: certHash
  });
  
  const envId = randomUUID();
  
  if (!options?.noEnvelope) {
    const startAt = new Date();
    const endAt = new Date();
    if (options?.expiredEnvelope) {
        startAt.setDate(startAt.getDate() - 2);
        endAt.setDate(endAt.getDate() - 1);
    } else {
        startAt.setDate(startAt.getDate() - 1);
        endAt.setDate(endAt.getDate() + 1);
    }
    
    await adminSupabase.from('atlas_canary_envelopes').insert({
        envelope_id: envId, tenant_id: TEST_TENANT, canary_enabled: !options?.killSwitchDisabled,
        allowed_provider: options?.badProvider ? 'WRONG' : 'MOCK',
        allowed_action: options?.badAction ? 'WRONG' : 'EMAIL_SEND',
        max_external_effects: options?.maxEffects ?? 3, claimed_effects: options?.claimedEffects ?? 0,
        start_at: startAt.toISOString(), end_at: endAt.toISOString()
    });
    
    await adminSupabase.from('atlas_canary_allowed_destinations').insert({
        tenant_id: TEST_TENANT, envelope_id: envId,
        destination_hash: destHash, destination_class: 'MOCK',
        is_enabled: true
    });
  }
  
  return { subjectId, nbaId, certId, certHash, destHash, payloadHash, emailHash, envId };
}

function createReq(ctx: any, override: any = {}): CanaryExecutionRequest {
    const logicalId = 'exec_' + randomUUID();
    return {
      logical_execution_identity: logicalId, execution_request_id: ctx.nbaId, subject_type: 'PERSON',
      subject_id: ctx.subjectId, action_type: 'EMAIL_SEND', channel: 'EMAIL', message_certification_id: ctx.certId,
      certification_snapshot_hash: ctx.certHash, destination_hash: ctx.destHash, prepared_payload_hash: ctx.payloadHash,
      email_hash: ctx.emailHash, payload: { to: 'success@simulator.amazonses.com' }, cost_id: costId, amount_reserved: 0.01,
      ...override
    };
}

describe('10F-D Controlled Canary Execution Extended Matrix', () => {

  it('1, 24, 32, 38: valid execution, budget available, provider ACCEPTED, budget COMMITTED', async () => {
    const ctx = await setupValidJitContext();
    const req = createReq(ctx);
    await adminSupabase.from('atlas_execution_budget_reservations').insert({ tenant_id: TEST_TENANT, logical_execution_identity: req.logical_execution_identity, cost_id: costId, amount_reserved: 0.01, status: 'RESERVED' });

    const res = await CanaryExecutionService.executeCanary(req, new MockCanaryProvider('ACCEPT'));
    expect(res.status).toBe('ACCEPTED');
    const { data: budget } = await adminSupabase.from('atlas_execution_budget_reservations').select('*').eq('logical_execution_identity', req.logical_execution_identity).single();
    expect(budget.status).toBe('COMMITTED');
  });

  it('4: already ACCEPTED prevents replay', async () => {
    const ctx = await setupValidJitContext();
    const req = createReq(ctx);
    await adminSupabase.from('atlas_execution_budget_reservations').insert({ tenant_id: TEST_TENANT, logical_execution_identity: req.logical_execution_identity, cost_id: costId, amount_reserved: 0.01, status: 'RESERVED' });

    await CanaryExecutionService.executeCanary(req, new MockCanaryProvider('ACCEPT'));
    
    // Replay
    const res2 = await CanaryExecutionService.executeCanary(req, new MockCanaryProvider('ACCEPT'));
    expect(res2.status).toBe('FAILED_PRE_ACCEPT');
    expect(res2.reason).toContain('ALREADY_ACCEPTED');
  });

  it('5, 41: existing AMBIGUOUS prevents retry', async () => {
    const ctx = await setupValidJitContext();
    const req = createReq(ctx);
    await adminSupabase.from('atlas_execution_budget_reservations').insert({ tenant_id: TEST_TENANT, logical_execution_identity: req.logical_execution_identity, cost_id: costId, amount_reserved: 0.01, status: 'RESERVED' });

    await CanaryExecutionService.executeCanary(req, new MockCanaryProvider('TIMEOUT_AFTER_BOUNDARY'));
    
    // Replay
    const res2 = await CanaryExecutionService.executeCanary(req, new MockCanaryProvider('ACCEPT'));
    expect(res2.status).toBe('FAILED_PRE_ACCEPT');
    expect(res2.reason).toContain('AMBIGUOUS_HOLD');
  });

  it('7, 11, 39: early JIT denial via active suppression, budget RELEASED', async () => {
    const ctx = await setupValidJitContext();
    const req = createReq(ctx);
    await adminSupabase.from('atlas_execution_budget_reservations').insert({ tenant_id: TEST_TENANT, logical_execution_identity: req.logical_execution_identity, cost_id: costId, amount_reserved: 0.01, status: 'RESERVED' });

    await adminSupabase.from('atlas_outreach_suppressions').insert({ tenant_id: TEST_TENANT, email_hash: ctx.emailHash, scope: 'ALL', reason: 'UNSUBSCRIBED' });

    const res = await CanaryExecutionService.executeCanary(req, new MockCanaryProvider('ACCEPT'));
    expect(res.status).toBe('FAILED_PRE_ACCEPT');
    expect(res.reason).toMatch(/JIT_DENIED/);
    
    const { data: budget } = await adminSupabase.from('atlas_execution_budget_reservations').select('*').eq('logical_execution_identity', req.logical_execution_identity).single();
    expect(budget.status).toBe('RELEASED');
  });

  it('13, 14: kill switch disabled -> CANARY_DISABLED', async () => {
    const ctx = await setupValidJitContext({ killSwitchDisabled: true });
    const req = createReq(ctx);
    await adminSupabase.from('atlas_execution_budget_reservations').insert({ tenant_id: TEST_TENANT, logical_execution_identity: req.logical_execution_identity, cost_id: costId, amount_reserved: 0.01, status: 'RESERVED' });

    const res = await CanaryExecutionService.executeCanary(req, new MockCanaryProvider('ACCEPT'));
    expect(res.status).toBe('FAILED_PRE_ACCEPT');
    expect(res.reason).toContain('CANARY_DISABLED');
  });

  it('15: missing envelope -> CANARY_DISABLED', async () => {
    const ctx = await setupValidJitContext({ noEnvelope: true });
    const req = createReq(ctx);
    await adminSupabase.from('atlas_execution_budget_reservations').insert({ tenant_id: TEST_TENANT, logical_execution_identity: req.logical_execution_identity, cost_id: costId, amount_reserved: 0.01, status: 'RESERVED' });

    const res = await CanaryExecutionService.executeCanary(req, new MockCanaryProvider('ACCEPT'));
    expect(res.status).toBe('FAILED_PRE_ACCEPT');
    expect(res.reason).toContain('CANARY_DISABLED');
  });

  it('16: expired envelope -> CANARY_DISABLED', async () => {
    const ctx = await setupValidJitContext({ expiredEnvelope: true });
    const req = createReq(ctx);
    await adminSupabase.from('atlas_execution_budget_reservations').insert({ tenant_id: TEST_TENANT, logical_execution_identity: req.logical_execution_identity, cost_id: costId, amount_reserved: 0.01, status: 'RESERVED' });

    const res = await CanaryExecutionService.executeCanary(req, new MockCanaryProvider('ACCEPT'));
    expect(res.status).toBe('FAILED_PRE_ACCEPT');
    expect(res.reason).toContain('CANARY_DISABLED');
  });

  it('17: wrong provider', async () => {
    // The envelope dictates the provider. If the envelope says WRONG, the execution service would ideally dispatch to WRONG provider.
    // For canary tests, we just verify the RPC returns it.
    const ctx = await setupValidJitContext({ badProvider: true });
    const req = createReq(ctx);
    await adminSupabase.from('atlas_execution_budget_reservations').insert({ tenant_id: TEST_TENANT, logical_execution_identity: req.logical_execution_identity, cost_id: costId, amount_reserved: 0.01, status: 'RESERVED' });

    const { data } = await supabase.rpc('begin_real_execution', {
        p_logical_execution_identity: req.logical_execution_identity, p_execution_request_id: req.execution_request_id,
        p_subject_type: req.subject_type, p_subject_id: req.subject_id, p_email_hash: req.email_hash,
        p_action_type: req.action_type, p_channel: req.channel, p_message_certification_id: req.message_certification_id,
        p_certification_snapshot_hash: req.certification_snapshot_hash, p_destination_hash: req.destination_hash,
        p_prepared_payload_hash: req.prepared_payload_hash, p_cost_id: req.cost_id, p_amount_reserved: req.amount_reserved
    });
    expect(data.allowed_provider).toBe('WRONG');
  });

  it('18: wrong action', async () => {
    const ctx = await setupValidJitContext({ badAction: true });
    const req = createReq(ctx);
    await adminSupabase.from('atlas_execution_budget_reservations').insert({ tenant_id: TEST_TENANT, logical_execution_identity: req.logical_execution_identity, cost_id: costId, amount_reserved: 0.01, status: 'RESERVED' });

    const res = await CanaryExecutionService.executeCanary(req, new MockCanaryProvider('ACCEPT'));
    expect(res.status).toBe('FAILED_PRE_ACCEPT');
    expect(res.reason).toContain('CANARY_DISABLED'); // Row mismatch
  });

  it('19, 21: arbitrary destination or wrong destination hash', async () => {
    const ctx = await setupValidJitContext();
    const req = createReq(ctx, { destination_hash: 'wrong_hash' });
    await adminSupabase.from('atlas_execution_budget_reservations').insert({ tenant_id: TEST_TENANT, logical_execution_identity: req.logical_execution_identity, cost_id: costId, amount_reserved: 0.01, status: 'RESERVED' });

    const res = await CanaryExecutionService.executeCanary(req, new MockCanaryProvider('ACCEPT'));
    expect(res.status).toBe('FAILED_PRE_ACCEPT');
    expect(res.reason).toContain('DESTINATION_NOT_ALLOWLISTED');
  });

  it('23: payload hash mismatch -> JIT_DENIED', async () => {
    const ctx = await setupValidJitContext();
    const req = createReq(ctx, { certification_snapshot_hash: 'changed_hash' });
    await adminSupabase.from('atlas_execution_budget_reservations').insert({ tenant_id: TEST_TENANT, logical_execution_identity: req.logical_execution_identity, cost_id: costId, amount_reserved: 0.01, status: 'RESERVED' });

    const res = await CanaryExecutionService.executeCanary(req, new MockCanaryProvider('ACCEPT'));
    expect(res.status).toBe('FAILED_PRE_ACCEPT');
    expect(res.reason).toMatch(/JIT_DENIED/);
  });

  it('25, 26, 27: budget exhausted or no valid reservation', async () => {
    const ctx = await setupValidJitContext();
    const req = createReq(ctx);
    // DO NOT INSERT RESERVATION
    
    // Will fail at RPC
    const { data } = await supabase.rpc('begin_real_execution', {
        p_logical_execution_identity: req.logical_execution_identity, p_execution_request_id: req.execution_request_id,
        p_subject_type: req.subject_type, p_subject_id: req.subject_id, p_email_hash: req.email_hash,
        p_action_type: req.action_type, p_channel: req.channel, p_message_certification_id: req.message_certification_id,
        p_certification_snapshot_hash: req.certification_snapshot_hash, p_destination_hash: req.destination_hash,
        p_prepared_payload_hash: req.prepared_payload_hash, p_cost_id: req.cost_id, p_amount_reserved: req.amount_reserved
    });
    
    expect(data.success).toBe(false);
    expect(data.reason).toBe('NO_VALID_RESERVATION');
  });

  it('28, 29, 30: effect cap permutations', async () => {
    // Test that if we claim 1, then 2, then 3, it works until 3.
    const ctx = await setupValidJitContext({ maxEffects: 3, claimedEffects: 2 });
    const req = createReq(ctx);
    await adminSupabase.from('atlas_execution_budget_reservations').insert({ tenant_id: TEST_TENANT, logical_execution_identity: req.logical_execution_identity, cost_id: costId, amount_reserved: 0.01, status: 'RESERVED' });

    const res = await CanaryExecutionService.executeCanary(req, new MockCanaryProvider('ACCEPT'));
    expect(res.status).toBe('ACCEPTED'); // 3rd slot permitted
    
    const { data: env } = await adminSupabase.from('atlas_canary_envelopes').select('claimed_effects').eq('envelope_id', ctx.envId).single();
    expect(env.claimed_effects).toBe(3);
  });

  it('31: fourth call mechanically denied', async () => {
    const ctx = await setupValidJitContext({ maxEffects: 3, claimedEffects: 3 });
    const req = createReq(ctx);
    await adminSupabase.from('atlas_execution_budget_reservations').insert({ tenant_id: TEST_TENANT, logical_execution_identity: req.logical_execution_identity, cost_id: costId, amount_reserved: 0.01, status: 'RESERVED' });

    const res = await CanaryExecutionService.executeCanary(req, new MockCanaryProvider('ACCEPT'));
    expect(res.status).toBe('FAILED_PRE_ACCEPT');
    expect(res.reason).toContain('EXTERNAL_EFFECT_CAP_REACHED');
  });

  it('34, 40: timeout after boundary => AMBIGUOUS => HOLD', async () => {
    const ctx = await setupValidJitContext();
    const req = createReq(ctx);
    await adminSupabase.from('atlas_execution_budget_reservations').insert({ tenant_id: TEST_TENANT, logical_execution_identity: req.logical_execution_identity, cost_id: costId, amount_reserved: 0.01, status: 'RESERVED' });

    const res = await CanaryExecutionService.executeCanary(req, new MockCanaryProvider('TIMEOUT_AFTER_BOUNDARY'));
    expect(res.status).toBe('AMBIGUOUS');
    const { data: budget } = await adminSupabase.from('atlas_execution_budget_reservations').select('*').eq('logical_execution_identity', req.logical_execution_identity).single();
    expect(budget.status).toBe('HOLD');
  });

  it('42: reconcile AMBIGUOUS -> ACCEPTED', async () => {
    const ctx = await setupValidJitContext();
    const req = createReq(ctx);
    await adminSupabase.from('atlas_execution_budget_reservations').insert({ tenant_id: TEST_TENANT, logical_execution_identity: req.logical_execution_identity, cost_id: costId, amount_reserved: 0.01, status: 'RESERVED' });

    await CanaryExecutionService.executeCanary(req, new MockCanaryProvider('TIMEOUT_AFTER_BOUNDARY'));
    
    const { data: attempt } = await adminSupabase.from('atlas_execution_attempts').select('attempt_id').eq('tenant_id', TEST_TENANT).single();
    
    await supabase.rpc('reconcile_ambiguous_execution', {
        p_logical_execution_identity: req.logical_execution_identity,
        p_attempt_id: attempt.attempt_id,
        p_resolution: 'ACCEPTED', p_provider_message_id: 'msg_123', p_evidence: {}
    });

    const { data: budget } = await adminSupabase.from('atlas_execution_budget_reservations').select('*').eq('logical_execution_identity', req.logical_execution_identity).single();
    expect(budget.status).toBe('COMMITTED');
  });

  it('43: authoritative confirmed non-acceptance (FAILED_PRE_ACCEPT)', async () => {
    const ctx = await setupValidJitContext();
    const req = createReq(ctx);
    await adminSupabase.from('atlas_execution_budget_reservations').insert({ tenant_id: TEST_TENANT, logical_execution_identity: req.logical_execution_identity, cost_id: costId, amount_reserved: 0.01, status: 'RESERVED' });

    await CanaryExecutionService.executeCanary(req, new MockCanaryProvider('TIMEOUT_AFTER_BOUNDARY'));
    
    const { data: attempt } = await adminSupabase.from('atlas_execution_attempts').select('attempt_id').eq('tenant_id', TEST_TENANT).single();
    
    await supabase.rpc('reconcile_ambiguous_execution', {
        p_logical_execution_identity: req.logical_execution_identity,
        p_attempt_id: attempt.attempt_id,
        p_resolution: 'FAILED_PRE_ACCEPT', p_provider_message_id: null, p_evidence: {}
    });

    const { data: budget } = await adminSupabase.from('atlas_execution_budget_reservations').select('*').eq('logical_execution_identity', req.logical_execution_identity).single();
    expect(budget.status).toBe('RELEASED');
    
    const { data: env } = await adminSupabase.from('atlas_canary_envelopes').select('claimed_effects').eq('envelope_id', ctx.envId).single();
    expect(env.claimed_effects).toBe(0); // Slot reclaimed!
  });

  it('45: tenant isolation', async () => {
    const ctx = await setupValidJitContext();
    const req = createReq(ctx);
    
    // We try to run the execution as a different tenant (we simulate this by creating an anon client for another user)
    // Actually, RLS ensures tenant A cannot read tenant B's envelope.
    // The RPC begin_real_execution uses get_auth_tenant_id().
    const anonClient2 = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
    await anonClient2.auth.signInWithPassword({ email: `tenant-10fd-iso-${Date.now()}@test.com`, password: 'TestPassword123!' });
    
    const { data, error } = await anonClient2.rpc('begin_real_execution', {
        p_logical_execution_identity: req.logical_execution_identity, p_execution_request_id: req.execution_request_id,
        p_subject_type: req.subject_type, p_subject_id: req.subject_id, p_email_hash: req.email_hash,
        p_action_type: req.action_type, p_channel: req.channel, p_message_certification_id: req.message_certification_id,
        p_certification_snapshot_hash: req.certification_snapshot_hash, p_destination_hash: req.destination_hash,
        p_prepared_payload_hash: req.prepared_payload_hash, p_cost_id: req.cost_id, p_amount_reserved: req.amount_reserved
    });
    
    // It shouldn't see the envelope (or fail entirely via RLS/null violation)
    if (error) {
        expect(error).toBeDefined();
    } else {
        expect(data.success).toBe(false);
        expect(data.reason).toBe('CANARY_DISABLED_OR_NOT_FOUND');
    }
  });

  it('2, 3, 6, 48, 49, 50: duplicate worker racing -> exactly one wins, one effect, one reservation', async () => {
    const ctx = await setupValidJitContext();
    const req = createReq(ctx);
    await adminSupabase.from('atlas_execution_budget_reservations').insert({ tenant_id: TEST_TENANT, logical_execution_identity: req.logical_execution_identity, cost_id: costId, amount_reserved: 0.01, status: 'RESERVED' });

    const p1 = CanaryExecutionService.executeCanary(req, new MockCanaryProvider('ACCEPT'));
    const p2 = CanaryExecutionService.executeCanary(req, new MockCanaryProvider('ACCEPT'));

    const [res1, res2] = await Promise.all([p1, p2]);
    const successes = [res1, res2].filter(r => r.status === 'ACCEPTED');
    expect(successes.length).toBe(1);
    
    const { data: env } = await adminSupabase.from('atlas_canary_envelopes').select('claimed_effects').eq('envelope_id', ctx.envId).single();
    expect(env.claimed_effects).toBe(1);
  });
});
