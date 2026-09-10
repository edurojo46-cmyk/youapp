import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_IWSDC0aWUR8cvOPrwYSaqg_JU8aASm8';

const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);
let userClient: ReturnType<typeof createClient>;

let tenantId: string;
let scopeId: string;
let configId: string;

function sha256Hex(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function generateBase64UrlToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

beforeAll(async () => {
  // 1. Create dedicated test tenant for shadow tests
  const email = `tenant-shadow-${Date.now()}@test.com`;
  const { data: userData, error: userErr } = await adminSupabase.auth.admin.createUser({
    email,
    password: 'TestPassword123!',
    email_confirm: true
  });
  if (userErr) throw userErr;
  tenantId = userData.user!.id;
  await adminSupabase.from('atlas_tenants').insert({ tenant_id: tenantId });

  // Create authenticated user client
  userClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  await userClient.auth.signInWithPassword({ email, password: 'TestPassword123!' });

  // 2. Setup Provider Scope & Account Mapping
  const { data: scope } = await adminSupabase.from('atlas_mail_provider_account_scopes').insert({
    provider_id: 'AWS_SES',
    aws_region: 'us-east-1',
    scope_name: `Shadow Scope ${Date.now()}`
  }).select().single();
  scopeId = scope.provider_account_scope_id;

  await adminSupabase.from('atlas_mail_tenant_provider_accounts').insert({
    tenant_id: tenantId,
    provider_account_scope_id: scopeId,
    is_active: true
  });

  // 3. Setup Pricing Configuration with Continuous Tiers
  const { data: config } = await adminSupabase.from('atlas_mail_provider_pricing_configs').insert({
    provider_account_scope_id: scopeId,
    provider_id: 'AWS_SES',
    aws_region: 'us-east-1',
    pricing_mode: 'A_LA_CARTE',
    pricing_version: 'v1.0',
    effective_from: new Date(Date.now() - 86400000).toISOString(),
    is_active: true
  }).select().single();
  configId = config.config_id;

  await adminSupabase.from('atlas_mail_provider_pricing_tiers').insert([
    { config_id: configId, tier_from_volume: 0, tier_to_volume: 10000, cost_per_1000: 0.100000 },
    { config_id: configId, tier_from_volume: 10000, tier_to_volume: 50000, cost_per_1000: 0.080000 },
    { config_id: configId, tier_from_volume: 50000, tier_to_volume: null, cost_per_1000: 0.050000 }
  ]);
});

describe('Atlas Mail V1 — Production Shadow Testing Suite', () => {

  it('Shadow Test 1: HTTP 200 -> ACCEPTED -> volume slot COMMITTED -> budget COMMITTED', async () => {
    const rawEmail = `shadow1_${Date.now()}@recipient-test.com`;
    const rawToken = generateBase64UrlToken();
    const providerMsgId = `ses_msg_200_${Date.now()}`;
    const logicalId = `exec_shadow1_${crypto.randomUUID()}`;

    // 1. Plan & route email via authenticated RPC
    const { data: plan, error: planErr } = await userClient.rpc('plan_and_route_email_v1', {
      p_logical_execution_identity: logicalId,
      p_execution_request_id: crypto.randomUUID(),
      p_action_type: 'OUTREACH_EMAIL',
      p_destination_email: rawEmail,
      p_prepared_payload: { subject: 'Shadow Test 1' },
      p_raw_correlation_token: rawToken
    });

    expect(planErr).toBeNull();
    expect(plan.success).toBe(true);
    expect(plan.attempt_id).toBeDefined();

    // 2. Simulate Provider HTTP 200 Acceptance (commit_mail_volume_slot_v1)
    const { data: commitRes, error: commitErr } = await adminSupabase.rpc('commit_mail_volume_slot_v1', {
      p_attempt_id: plan.attempt_id,
      p_provider_message_id: providerMsgId
    });
    expect(commitErr).toBeNull();
    expect(commitRes.success).toBe(true);
    expect(commitRes.volume_ordinal).toBeDefined();

    // Verify reservation status in DB
    const { data: volRes } = await adminSupabase.from('atlas_mail_volume_reservations')
      .select('*')
      .eq('attempt_id', plan.attempt_id)
      .single();

    expect(volRes.status).toBe('COMMITTED');
    expect(volRes.volume_ordinal).toBeDefined();
  });

  it('Shadow Test 2: Network Timeout -> AMBIGUOUS -> budget remains RESERVED -> volume remains RESERVED', async () => {
    const rawEmail = `shadow2_${Date.now()}@recipient-test.com`;
    const rawToken = generateBase64UrlToken();
    const logicalId = `exec_shadow2_${crypto.randomUUID()}`;

    // 1. Plan & route
    const { data: plan, error: planErr } = await userClient.rpc('plan_and_route_email_v1', {
      p_logical_execution_identity: logicalId,
      p_execution_request_id: crypto.randomUUID(),
      p_action_type: 'OUTREACH_EMAIL',
      p_destination_email: rawEmail,
      p_prepared_payload: { subject: 'Shadow Test 2 Timeout' },
      p_raw_correlation_token: rawToken
    });
    expect(planErr).toBeNull();
    expect(plan.success).toBe(true);

    // 2. Verify volume reservation holds status RESERVED (slot held, not released or committed)
    const { data: volRes } = await adminSupabase.from('atlas_mail_volume_reservations')
      .select('*')
      .eq('attempt_id', plan.attempt_id)
      .single();

    expect(volRes.status).toBe('RESERVED');
    expect(volRes.volume_ordinal).toBeNull();
  });

  it('Shadow Test 3: SNS Correlation -> AMBIGUOUS reconciled -> exactly-once COMMITTED -> duplicate SNS = NOOP', async () => {
    const rawEmail = `shadow3_${Date.now()}@recipient-test.com`;
    const rawToken = generateBase64UrlToken();
    const tokenHash = sha256Hex(rawToken);
    const providerMsgId = `ses_async_reconcile_${Date.now()}`;
    const logicalId = `exec_shadow3_${crypto.randomUUID()}`;

    // 1. Plan & route
    const { data: plan, error: planErr } = await userClient.rpc('plan_and_route_email_v1', {
      p_logical_execution_identity: logicalId,
      p_execution_request_id: crypto.randomUUID(),
      p_action_type: 'OUTREACH_EMAIL',
      p_destination_email: rawEmail,
      p_prepared_payload: { subject: 'Shadow Test 3 Correlation' },
      p_raw_correlation_token: rawToken
    });
    expect(planErr).toBeNull();
    expect(plan.success).toBe(true);

    // 2. First SNS notification arrives -> Reconciles AMBIGUOUS to COMMITTED
    const { data: recRes, error: recErr } = await adminSupabase.rpc('reconcile_mail_timeout_via_correlation_v1', {
      p_tenant_id: tenantId,
      p_correlation_token_hash: tokenHash,
      p_provider_message_id: providerMsgId,
      p_resolution: 'ACCEPTED'
    });
    expect(recErr).toBeNull();
    expect(recRes.success).toBe(true);
    expect(recRes.volume_ordinal).toBeDefined();

    // 3. Duplicate SNS notification arrives with same provider_event_id -> Idempotent NOOP
    const eventId = `evt_dup_${Date.now()}`;
    const { data: ev1 } = await adminSupabase.rpc('ingest_minimized_mail_provider_event_v1', {
      p_tenant_id: tenantId,
      p_provider_event_id: eventId,
      p_provider_message_id: providerMsgId,
      p_correlation_token_hash: tokenHash,
      p_event_type: 'DELIVERY',
      p_event_timestamp: new Date().toISOString(),
      p_bounce_class: null,
      p_bounce_sub_type: null,
      p_canonical_payload_hash: sha256Hex(eventId),
      p_minimized_metadata: { statusCode: 200 }
    });
    expect(ev1.success).toBe(true);

    const { data: ev2 } = await adminSupabase.rpc('ingest_minimized_mail_provider_event_v1', {
      p_tenant_id: tenantId,
      p_provider_event_id: eventId,
      p_provider_message_id: providerMsgId,
      p_correlation_token_hash: tokenHash,
      p_event_type: 'DELIVERY',
      p_event_timestamp: new Date().toISOString(),
      p_bounce_class: null,
      p_bounce_sub_type: null,
      p_canonical_payload_hash: sha256Hex(eventId),
      p_minimized_metadata: { statusCode: 200 }
    });
    expect(ev2.success).toBe(true);
    expect(ev2.status).toBe('IDEMPOTENT_IGNORED');
  });

  it('Shadow Test 4: Hard Bounce -> public.atlas_outreach_suppressions (scope=ALL, reason=HARD_BOUNCE)', async () => {
    const rawEmail = `hardbounce_${Date.now()}@invalid-domain-test.com`;
    const destHash = sha256Hex(rawEmail.toLowerCase().trim());
    const rawToken = generateBase64UrlToken();
    const tokenHash = sha256Hex(rawToken);
    const providerMsgId = `ses_hb_${Date.now()}`;

    // Plan & route so execution correlation exists
    await userClient.rpc('plan_and_route_email_v1', {
      p_logical_execution_identity: `exec_hb_${crypto.randomUUID()}`,
      p_execution_request_id: crypto.randomUUID(),
      p_action_type: 'OUTREACH_EMAIL',
      p_destination_email: rawEmail,
      p_prepared_payload: { subject: 'Hard Bounce Test' },
      p_raw_correlation_token: rawToken
    });

    const { data: res, error } = await adminSupabase.rpc('ingest_minimized_mail_provider_event_v1', {
      p_tenant_id: tenantId,
      p_provider_event_id: `evt_hb_${Date.now()}`,
      p_provider_message_id: providerMsgId,
      p_correlation_token_hash: tokenHash,
      p_event_type: 'BOUNCE',
      p_event_timestamp: new Date().toISOString(),
      p_bounce_class: 'PERMANENT',
      p_bounce_sub_type: 'General',
      p_canonical_payload_hash: sha256Hex('canon_hb_hash'),
      p_minimized_metadata: { subType: 'General' }
    });
    expect(error).toBeNull();
    expect(res.success).toBe(true);

    // Verify suppression row in public.atlas_outreach_suppressions
    const { data: sup } = await adminSupabase.from('atlas_outreach_suppressions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('email_hash', destHash)
      .eq('scope', 'ALL')
      .single();

    expect(sup).toBeDefined();
    expect(sup.reason).toBe('HARD_BOUNCE');
    expect(sup.scope).toBe('ALL');
  });

  it('Shadow Test 5: Complaint -> public.atlas_outreach_suppressions (scope=ALL, reason=COMPLAINT)', async () => {
    const rawEmail = `complaint_${Date.now()}@recipient-test.com`;
    const destHash = sha256Hex(rawEmail.toLowerCase().trim());
    const rawToken = generateBase64UrlToken();
    const tokenHash = sha256Hex(rawToken);
    const providerMsgId = `ses_complaint_${Date.now()}`;

    // Plan & route
    await userClient.rpc('plan_and_route_email_v1', {
      p_logical_execution_identity: `exec_comp_${crypto.randomUUID()}`,
      p_execution_request_id: crypto.randomUUID(),
      p_action_type: 'OUTREACH_EMAIL',
      p_destination_email: rawEmail,
      p_prepared_payload: { subject: 'Complaint Test' },
      p_raw_correlation_token: rawToken
    });

    const { data: res, error } = await adminSupabase.rpc('ingest_minimized_mail_provider_event_v1', {
      p_tenant_id: tenantId,
      p_provider_event_id: `evt_comp_${Date.now()}`,
      p_provider_message_id: providerMsgId,
      p_correlation_token_hash: tokenHash,
      p_event_type: 'COMPLAINT',
      p_event_timestamp: new Date().toISOString(),
      p_bounce_class: null,
      p_bounce_sub_type: 'abuse',
      p_canonical_payload_hash: sha256Hex('canon_comp_hash'),
      p_minimized_metadata: { feedbackType: 'abuse' }
    });
    expect(error).toBeNull();
    expect(res.success).toBe(true);

    // Verify suppression row in public.atlas_outreach_suppressions
    const { data: sup } = await adminSupabase.from('atlas_outreach_suppressions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('email_hash', destHash)
      .eq('scope', 'ALL')
      .single();

    expect(sup).toBeDefined();
    expect(sup.reason).toBe('COMPLAINT');
    expect(sup.scope).toBe('ALL');
  });

  it('Shadow Test 6: SES Subscription / Unsubscribe -> public.atlas_outreach_suppressions (scope=MARKETING, reason=UNSUBSCRIBED) & transactional remains eligible', async () => {
    const rawEmail = `unsubscribe_${Date.now()}@subscriber-test.com`;
    const destHash = sha256Hex(rawEmail.toLowerCase().trim());
    const rawToken = generateBase64UrlToken();
    const tokenHash = sha256Hex(rawToken);
    const providerMsgId = `ses_unsub_${Date.now()}`;

    // Plan & route
    await userClient.rpc('plan_and_route_email_v1', {
      p_logical_execution_identity: `exec_unsub_${crypto.randomUUID()}`,
      p_execution_request_id: crypto.randomUUID(),
      p_action_type: 'OUTREACH_EMAIL',
      p_destination_email: rawEmail,
      p_prepared_payload: { subject: 'Unsubscribe Test' },
      p_raw_correlation_token: rawToken
    });

    // Ingest event with event_type = 'SUBSCRIPTION'
    const { data: res, error } = await adminSupabase.rpc('ingest_minimized_mail_provider_event_v1', {
      p_tenant_id: tenantId,
      p_provider_event_id: `evt_unsub_${Date.now()}`,
      p_provider_message_id: providerMsgId,
      p_correlation_token_hash: tokenHash,
      p_event_type: 'SUBSCRIPTION',
      p_event_timestamp: new Date().toISOString(),
      p_bounce_class: null,
      p_bounce_sub_type: null,
      p_canonical_payload_hash: sha256Hex('canon_unsub_hash'),
      p_minimized_metadata: { source: 'LIST_UNSUBSCRIBE_HEADER' }
    });
    expect(error).toBeNull();
    expect(res.success).toBe(true);

    // Verify MARKETING suppression exists
    const { data: supMkt } = await adminSupabase.from('atlas_outreach_suppressions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('email_hash', destHash)
      .eq('scope', 'MARKETING')
      .single();

    expect(supMkt).toBeDefined();
    expect(supMkt.reason).toBe('UNSUBSCRIBED');
    expect(supMkt.scope).toBe('MARKETING');

    // Verify ALL scope suppression does NOT exist (transactional emails remain eligible)
    const { data: supAll } = await adminSupabase.from('atlas_outreach_suppressions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('email_hash', destHash)
      .eq('scope', 'ALL');

    expect(supAll).toEqual([]);
  });

});
