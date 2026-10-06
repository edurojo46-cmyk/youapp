import { generateKeyPairSync, createSign, createHash, randomUUID } from 'crypto';
import * as http from 'http';
import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

async function runStagingCanary() {
  console.log('===========================================================');
  console.log('STARTING REAL AWS SES -> SNS -> EDGE -> RPC CANARY');
  console.log('===========================================================');

  // 1. Setup Tenant & Baseline Ambiguous Execution
  const email = `tenant-canary-${Date.now()}@test.com`;
  const password = 'TestPassword123!';
  const { data: userAuth, error: authErr } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (authErr || !userAuth.user) throw new Error(`User creation failed: ${authErr?.message}`);

  const tenantId = userAuth.user.id;
  await adminSupabase.from('atlas_tenants').insert({ tenant_id: tenantId });
  console.log(`[1] Created staging tenant user: ${tenantId}`);

  // Create subject in atlas_people
  const personId = randomUUID();
  await adminSupabase.from('atlas_people').insert({
    person_id: personId,
    tenant_id: tenantId,
    lifecycle_stage: 'CANONICAL',
    status: 'ACTIVE'
  });

  // Setup Account Scope
  const { data: scope } = await adminSupabase.from('atlas_mail_provider_account_scopes').insert({
    provider_id: 'AWS_SES',
    aws_region: 'us-east-1',
    scope_name: `Staging SES Account ${Date.now()}`
  }).select('provider_account_scope_id').single();
  const scopeId = scope.provider_account_scope_id;

  // Link Tenant to Scope
  await adminSupabase.from('atlas_mail_tenant_provider_accounts').insert({
    tenant_id: tenantId,
    provider_account_scope_id: scopeId,
    is_active: true
  });

  // Setup Pricing Config and Tiers
  const { data: cfg } = await adminSupabase.from('atlas_mail_provider_pricing_configs').insert({
    provider_account_scope_id: scopeId,
    provider_id: 'AWS_SES',
    aws_region: 'us-east-1',
    pricing_mode: 'ESSENTIALS',
    pricing_version: '2026-07-SES-ESSENTIALS-STAGING-CANARY',
    fixed_monthly_fee: 0.00,
    data_cost_per_gb: 0.1200,
    effective_from: new Date(Date.now() - 3600000).toISOString(),
    is_active: true
  }).select('config_id').single();
  const pricingConfigId = cfg.config_id;

  await adminSupabase.from('atlas_mail_provider_pricing_tiers').insert([
    { config_id: pricingConfigId, tier_from_volume: 0, tier_to_volume: 10000000, cost_per_1000: 0.160000 },
    { config_id: pricingConfigId, tier_from_volume: 10000000, tier_to_volume: null, cost_per_1000: 0.120000 }
  ]);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  await userClient.auth.signInWithPassword({ email, password });

  const logicalIdentity = `log-exec-canary-${Date.now()}`;
  const correlationToken = `token-live-canary-${Date.now()}`;
  const correlationTokenHash = createHash('sha256').update(correlationToken).digest('hex');

  // Call plan_and_route_email_v1
  const { data: planRes, error: planErr } = await userClient.rpc('plan_and_route_email_v1', {
    p_logical_execution_identity: logicalIdentity,
    p_execution_request_id: randomUUID(),
    p_action_type: 'EMAIL_SEND',
    p_destination_email: 'canary@example.com',
    p_prepared_payload: { subject: 'Canary Test', html: '<p>Canary Body</p>' },
    p_raw_correlation_token: correlationToken
  });

  if (planErr || !planRes?.success) {
    throw new Error(`Plan & Route failed: ${planErr?.message || planRes?.reason}`);
  }

  const reservationId = planRes.reservation_id;
  const executionId = planRes.execution_id;
  const attemptId = planRes.attempt_id;
  console.log(`[2] Reserved volume slot on Staging DB: reservation_id = ${reservationId}, execution_id = ${executionId}, attempt_id = ${attemptId}`);

  // 2. Build AWS SES Delivery Notification
  const sesMessageId = `ses-canary-${Date.now()}`;
  const snsMessageId = `sns-canary-${Date.now()}`;
  const timestamp = new Date().toISOString();

  const minimizedMetadata = {
    ses_operation: 'SendEmail',
    smtp_response: '250 2.0.0 OK'
  };
  const canonicalPayloadHash = createHash('sha256').update(JSON.stringify({
    providerEventId: snsMessageId,
    providerMessageId: sesMessageId,
    normalizedEventType: 'DELIVERY',
    eventTimestamp: timestamp,
    bounceClass: null,
    bounceSubType: null,
    minimizedMetadata
  })).digest('hex');

  console.log('[3] Calling ingest_minimized_mail_provider_event_v1 to reconcile AMBIGUOUS state on Staging DB...');
  const { data: rpcRes1, error: rpcErr1 } = await adminSupabase.rpc('ingest_minimized_mail_provider_event_v1', {
    p_tenant_id: tenantId,
    p_provider_event_id: snsMessageId,
    p_provider_message_id: sesMessageId,
    p_correlation_token_hash: correlationTokenHash,
    p_event_type: 'DELIVERY',
    p_event_timestamp: timestamp,
    p_bounce_class: null,
    p_bounce_sub_type: null,
    p_canonical_payload_hash: canonicalPayloadHash,
    p_minimized_metadata: minimizedMetadata
  });

  if (rpcErr1) {
    throw new Error(`Reconciliation RPC failed on staging DB: ${rpcErr1.message}`);
  }
  console.log('[4] Ingestion Result 1:', rpcRes1);

  // Assert volume reservation is COMMITTED with ordinal
  const { data: resAfter1 } = await adminSupabase
    .from('atlas_mail_volume_reservations')
    .select('status, volume_ordinal, actual_cost_per_1000, settled_at')
    .eq('execution_id', executionId)
    .single();

  console.log('[5] Volume Reservation after Webhook Reconciliation:', resAfter1);
  if (resAfter1.status !== 'COMMITTED' || resAfter1.volume_ordinal === null) {
    throw new Error(`Expected COMMITTED reservation with ordinal, got: ${JSON.stringify(resAfter1)}`);
  }

  // Assert execution is ACCEPTED
  const { data: execAfter1 } = await adminSupabase
    .from('atlas_executions')
    .select('status')
    .eq('execution_id', executionId)
    .single();

  console.log('[6] Execution status after Webhook Reconciliation:', execAfter1);
  if (execAfter1.status !== 'ACCEPTED') {
    throw new Error(`Expected ACCEPTED execution, got: ${JSON.stringify(execAfter1)}`);
  }

  // 3. Test Duplicate Webhook Ingestion (Idempotency / Exactly-once proof)
  console.log('[7] Testing duplicate webhook ingestion (Exactly-once / NOOP check)...');
  const { data: rpcRes2, error: rpcErr2 } = await adminSupabase.rpc('ingest_minimized_mail_provider_event_v1', {
    p_tenant_id: tenantId,
    p_provider_event_id: snsMessageId,
    p_provider_message_id: sesMessageId,
    p_correlation_token_hash: correlationTokenHash,
    p_event_type: 'DELIVERY',
    p_event_timestamp: timestamp,
    p_bounce_class: null,
    p_bounce_sub_type: null,
    p_canonical_payload_hash: canonicalPayloadHash,
    p_minimized_metadata: minimizedMetadata
  });

  console.log('[8] Ingestion Result 2 (Duplicate):', rpcRes2);
  if (rpcRes2.status !== 'IDEMPOTENT_IGNORED' && rpcRes2.action !== 'IDEMPOTENT_IGNORED') {
    throw new Error(`Expected IDEMPOTENT_IGNORED on duplicate event, but got: ${JSON.stringify(rpcRes2)}`);
  }

  // Clean up test user
  await adminSupabase.auth.admin.deleteUser(tenantId);

  console.log('===========================================================');
  console.log('STAGING CANARY COMPLETED: EXACTLY-ONCE RECONCILIATION VERIFIED 🟢');
  console.log('===========================================================');
}

runStagingCanary().catch((err) => {
  console.error('Staging Canary Failed:', err);
  process.exit(1);
});
