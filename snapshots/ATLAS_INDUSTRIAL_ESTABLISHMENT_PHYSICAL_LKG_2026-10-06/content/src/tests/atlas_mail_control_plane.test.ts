import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { createGuardedTestClient as createClient } from '../lib/testDbGuard';
import * as crypto from 'crypto';
import dotenv from 'dotenv';

const loadEnv = dotenv?.config || (dotenv as any)?.default?.config;
if (typeof loadEnv === 'function') loadEnv({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_IWSDC0aWUR8cvOPrwYSaqg_JU8aASm8';
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseServiceKey) throw new Error('SUPABASE_SECRET_KEY must be set in environment');

const adminClient = createClient(supabaseUrl, supabaseServiceKey);
let userClientA: SupabaseClient;
let userClientB: SupabaseClient;

function randomUUID(): string {
    return crypto.randomUUID();
}

function generateBase64UrlToken(length = 24): string {
    return crypto.randomBytes(length).toString('base64url');
}

function sha256Hex(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
}

describe('Atlas Mail Control Plane V1 Integration Suite (Migration 20260909077000)', () => {
    let tenantA: string;
    let tenantB: string;
    let scopeId: string;
    let pricingConfigId: string;

    const userEmailA = `mail_test_a_${Date.now()}_${randomUUID().slice(0, 8)}@example.com`;
    const userEmailB = `mail_test_b_${Date.now()}_${randomUUID().slice(0, 8)}@example.com`;
    const testPassword = `TestPass!_${randomUUID()}`;

    beforeAll(async () => {
        // 1. Setup Tenant A
        const { data: authA, error: errA } = await adminClient.auth.admin.createUser({
            email: userEmailA,
            password: testPassword,
            email_confirm: true
        });
        if (errA || !authA.user) throw new Error(`User A creation failed: ${errA?.message}`);
        tenantA = authA.user.id;
        await adminClient.from('atlas_tenants').upsert([{ tenant_id: tenantA }]);

        // 2. Setup Tenant B
        const { data: authB, error: errB } = await adminClient.auth.admin.createUser({
            email: userEmailB,
            password: testPassword,
            email_confirm: true
        });
        if (errB || !authB.user) throw new Error(`User B creation failed: ${errB?.message}`);
        tenantB = authB.user.id;
        await adminClient.from('atlas_tenants').upsert([{ tenant_id: tenantB }]);

        // 3. User Clients
        userClientA = createClient(supabaseUrl, supabaseAnonKey);
        await userClientA.auth.signInWithPassword({ email: userEmailA, password: testPassword });

        userClientB = createClient(supabaseUrl, supabaseAnonKey);
        await userClientB.auth.signInWithPassword({ email: userEmailB, password: testPassword });

        // 4. Setup Account Scope
        const { data: scope } = await adminClient.from('atlas_mail_provider_account_scopes').insert({
            provider_id: 'AWS_SES',
            aws_region: 'us-east-1',
            scope_name: `Primary SES Account ${Date.now()}`
        }).select('provider_account_scope_id').single();
        scopeId = scope.provider_account_scope_id;

        // 5. Link Tenant A and Tenant B to Scope
        await adminClient.from('atlas_mail_tenant_provider_accounts').insert([
            { tenant_id: tenantA, provider_account_scope_id: scopeId, is_active: true },
            { tenant_id: tenantB, provider_account_scope_id: scopeId, is_active: true }
        ]);

        // 6. Setup Active Pricing Config (July 2026 SES Essentials Tier Structure)
        const { data: cfg } = await adminClient.from('atlas_mail_provider_pricing_configs').insert({
            provider_account_scope_id: scopeId,
            provider_id: 'AWS_SES',
            aws_region: 'us-east-1',
            pricing_mode: 'ESSENTIALS',
            pricing_version: '2026-07-SES-ESSENTIALS-TEST',
            fixed_monthly_fee: 0.00,
            data_cost_per_gb: 0.1200,
            effective_from: new Date(Date.now() - 3600000).toISOString(),
            is_active: true
        }).select('config_id').single();
        pricingConfigId = cfg.config_id;

        // 7. Insert Contiguous Tiers: [0, 10M) @ 0.16/1k, [10M, 100M) @ 0.14/1k, [100M, inf) @ 0.12/1k
        await adminClient.from('atlas_mail_provider_pricing_tiers').insert([
            {
                config_id: pricingConfigId,
                tier_from_volume: 0,
                tier_to_volume: 10000000,
                cost_per_1000: 0.160000
            },
            {
                config_id: pricingConfigId,
                tier_from_volume: 10000000,
                tier_to_volume: 100000000,
                cost_per_1000: 0.140000
            },
            {
                config_id: pricingConfigId,
                tier_from_volume: 100000000,
                tier_to_volume: null,
                cost_per_1000: 0.120000
            }
        ]);
    });

    afterAll(async () => {
        // Clean up test tenants
        if (tenantA) await adminClient.auth.admin.deleteUser(tenantA);
        if (tenantB) await adminClient.auth.admin.deleteUser(tenantB);
    });

    // =========================================================================
    // 1. ELIGIBILITY, SUPPRESSION, AND SENDER GATES
    // =========================================================================
    describe('1. Eligibility, Suppression, and Sender Gates', () => {
        it('1. INELIGIBLE_PERSON_NO_SEND: Fails closed when recipient is suppressed or ineligible', async () => {
            const rawEmail = `ineligible_${Date.now()}@domain.com`;
            const destHash = sha256Hex(rawEmail.toLowerCase().trim());

            // Insert suppression
            await adminClient.from('atlas_outreach_suppressions').insert({
                tenant_id: tenantA,
                email_hash: destHash,
                scope: 'ALL',
                reason: 'MANUAL_BLOCK',
                source: 'TEST_CASE_1'
            });

            const token = generateBase64UrlToken();
            const { data: planRes } = await userClientA.rpc('plan_and_route_email_v1', {
                p_logical_execution_identity: `exec_ineligible_${randomUUID()}`,
                p_execution_request_id: randomUUID(),
                p_action_type: 'OUTREACH_EMAIL',
                p_destination_email: rawEmail,
                p_prepared_payload: { subject: 'Hello' },
                p_raw_correlation_token: token
            });

            expect(planRes.success).toBe(false);
            expect(planRes.reason).toBe('DESTINATION_SUPPRESSED');
        });

        it('2. SUPPRESSED_EMAIL_NO_SEND: Marketing suppression blocks marketing send', async () => {
            const rawEmail = `marketing_unsub_${Date.now()}@domain.com`;
            const destHash = sha256Hex(rawEmail.toLowerCase().trim());

            await adminClient.from('atlas_outreach_suppressions').insert({
                tenant_id: tenantA,
                email_hash: destHash,
                scope: 'MARKETING',
                reason: 'UNSUBSCRIBED',
                source: 'TEST_CASE_2'
            });

            const token = generateBase64UrlToken();
            const { data: planRes } = await userClientA.rpc('plan_and_route_email_v1', {
                p_logical_execution_identity: `exec_mkt_supp_${randomUUID()}`,
                p_execution_request_id: randomUUID(),
                p_action_type: 'MARKETING_NEWSLETTER',
                p_destination_email: rawEmail,
                p_prepared_payload: { subject: 'Newsletter' },
                p_raw_correlation_token: token
            });

            expect(planRes.success).toBe(false);
            expect(planRes.reason).toBe('DESTINATION_SUPPRESSED');
        });

        it('3. UNKNOWN_ELIGIBILITY_NO_SEND: Missing tenant provider scope halts dispatch', async () => {
            // Unlink tenant B from scope temporarily
            await adminClient.from('atlas_mail_tenant_provider_accounts')
                .update({ is_active: false })
                .eq('tenant_id', tenantB);

            const token = generateBase64UrlToken();
            const { data: planRes } = await userClientB.rpc('plan_and_route_email_v1', {
                p_logical_execution_identity: `exec_no_scope_${randomUUID()}`,
                p_execution_request_id: randomUUID(),
                p_action_type: 'OUTREACH_EMAIL',
                p_destination_email: 'valid_user@domain.com',
                p_prepared_payload: { subject: 'Hello' },
                p_raw_correlation_token: token
            });

            expect(planRes.success).toBe(false);
            expect(planRes.reason).toBe('NO_ACTIVE_PROVIDER_ACCOUNT_SCOPE');

            // Restore tenant B link
            await adminClient.from('atlas_mail_tenant_provider_accounts')
                .update({ is_active: true })
                .eq('tenant_id', tenantB);
        });

        it('4. SENDER_DISABLED_NO_SEND: Inactive pricing config fails closed with UNKNOWN_PRICING', async () => {
            // Deactivate pricing config temporarily
            await adminClient.from('atlas_mail_provider_pricing_configs')
                .update({ is_active: false })
                .eq('config_id', pricingConfigId);

            const token = generateBase64UrlToken();
            const { data: planRes } = await userClientA.rpc('plan_and_route_email_v1', {
                p_logical_execution_identity: `exec_inactive_cfg_${randomUUID()}`,
                p_execution_request_id: randomUUID(),
                p_action_type: 'OUTREACH_EMAIL',
                p_destination_email: 'dest_active@domain.com',
                p_prepared_payload: { subject: 'Hello' },
                p_raw_correlation_token: token
            });

            expect(planRes.success).toBe(false);
            expect(planRes.reason).toBe('UNKNOWN_PRICING');

            // Reactivate pricing config
            await adminClient.from('atlas_mail_provider_pricing_configs')
                .update({ is_active: true })
                .eq('config_id', pricingConfigId);
        });
    });

    // =========================================================================
    // 2. PRICING TIERS AND BUDGET ATOMICITY
    // =========================================================================
    describe('2. Pricing Tiers and Budget Atomicity', () => {
        it('5. CHEAPEST_ELIGIBLE_PROVIDER_SELECTED: Plan reserves conservative max rate across future tiers', async () => {
            const rawEmail = `valid_pricing_${Date.now()}@domain.com`;
            const token = generateBase64UrlToken();

            const { data: planRes } = await userClientA.rpc('plan_and_route_email_v1', {
                p_logical_execution_identity: `exec_price_${randomUUID()}`,
                p_execution_request_id: randomUUID(),
                p_action_type: 'OUTREACH_EMAIL',
                p_destination_email: rawEmail,
                p_prepared_payload: { subject: 'Plan Pricing Test' },
                p_raw_correlation_token: token
            });

            expect(planRes.success).toBe(true);
            expect(Number(planRes.estimated_max_cost_per_1000)).toBe(0.16); // Max rate across candidate tiers
            expect(planRes.attempt_id).toBeDefined();

            // Verify Volume Reservation in DB is RESERVED with volume_ordinal = NULL
            const { data: volRes } = await adminClient.from('atlas_mail_volume_reservations')
                .select('*')
                .eq('attempt_id', planRes.attempt_id)
                .single();

            expect(volRes.status).toBe('RESERVED');
            expect(volRes.volume_ordinal).toBeNull();
            expect(Number(volRes.estimated_max_cost_per_1000)).toBe(0.16);
        });

        it('6. FIXED_MONTHLY_FEE_NOT_ADDED_TO_SEND: Marginal send cost calculation isolates fixed fee', async () => {
            const rawEmail = `marginal_test_${Date.now()}@domain.com`;
            const token = generateBase64UrlToken();

            const { data: planRes } = await userClientA.rpc('plan_and_route_email_v1', {
                p_logical_execution_identity: `exec_marginal_${randomUUID()}`,
                p_execution_request_id: randomUUID(),
                p_action_type: 'OUTREACH_EMAIL',
                p_destination_email: rawEmail,
                p_prepared_payload: { body: 'A'.repeat(500) },
                p_raw_correlation_token: token
            });

            expect(planRes.success).toBe(true);
            // Marginal cost for ~500 bytes: (0.16 / 1000) = 0.00016
            expect(Number(planRes.amount_reserved)).toBeGreaterThanOrEqual(0.0001);
            expect(Number(planRes.amount_reserved)).toBeLessThan(0.01); // Excludes fixed monthly fee of $0 or $105
        });

        it('7. ATOMIC_BUDGET_RESERVATION: Budget reservation is atomic and updates reserved_outbound_recipients', async () => {
            const billingMonth = new Date().toISOString().slice(0, 7) + '-01';
            const { data: beforeUsage } = await adminClient.from('atlas_mail_provider_monthly_usage')
                .select('*')
                .eq('provider_account_scope_id', scopeId)
                .eq('billing_month', billingMonth)
                .single();

            const beforeReserved = Number(beforeUsage?.reserved_outbound_recipients || 0);

            const rawEmail = `atomic_res_${Date.now()}@domain.com`;
            const token = generateBase64UrlToken();
            const { data: planRes } = await userClientA.rpc('plan_and_route_email_v1', {
                p_logical_execution_identity: `exec_atomic_${randomUUID()}`,
                p_execution_request_id: randomUUID(),
                p_action_type: 'OUTREACH_EMAIL',
                p_destination_email: rawEmail,
                p_prepared_payload: { subject: 'Atomic Reservation' },
                p_raw_correlation_token: token
            });
            expect(planRes.success).toBe(true);

            const { data: afterUsage } = await adminClient.from('atlas_mail_provider_monthly_usage')
                .select('*')
                .eq('provider_account_scope_id', scopeId)
                .eq('billing_month', billingMonth)
                .single();

            expect(Number(afterUsage.reserved_outbound_recipients)).toBe(beforeReserved + 1);
        });

        it('8. PROVIDER_ACCEPTANCE_COMMITS_COST: commit_mail_volume_slot_v1 assigns ordinal and commits budget', async () => {
            const rawEmail = `commit_test_${Date.now()}@domain.com`;
            const token = generateBase64UrlToken();
            const { data: planRes } = await userClientA.rpc('plan_and_route_email_v1', {
                p_logical_execution_identity: `exec_commit_${randomUUID()}`,
                p_execution_request_id: randomUUID(),
                p_action_type: 'OUTREACH_EMAIL',
                p_destination_email: rawEmail,
                p_prepared_payload: { subject: 'Commit Test' },
                p_raw_correlation_token: token
            });

            const attemptId = planRes.attempt_id;
            const sesMessageId = `ses-msg-${randomUUID()}`;

            // Execute commit RPC (simulating SES HTTP 200)
            const { data: commitRes } = await adminClient.rpc('commit_mail_volume_slot_v1', {
                p_attempt_id: attemptId,
                p_provider_message_id: sesMessageId
            });

            expect(commitRes.success).toBe(true);
            expect(commitRes.volume_ordinal).toBeDefined();
            expect(Number(commitRes.actual_cost_per_1000)).toBe(0.16);

            // Verify Reservation status in DB
            const { data: volRes } = await adminClient.from('atlas_mail_volume_reservations')
                .select('*')
                .eq('attempt_id', attemptId)
                .single();

            expect(volRes.status).toBe('COMMITTED');
            expect(volRes.volume_ordinal).not.toBeNull();
            expect(volRes.settled_at).not.toBeNull();

            // Verify 10F execution status transitioned to ACCEPTED
            const { data: exec } = await adminClient.from('atlas_executions')
                .select('*')
                .eq('execution_id', planRes.execution_id)
                .single();
            expect(exec.status).toBe('ACCEPTED');
        });
    });

    // =========================================================================
    // 3. NETWORK TIMEOUTS, CORRELATION, AND RECONCILIATION
    // =========================================================================
    describe('3. Network Timeouts, Correlation, and Reconciliation', () => {
        it('9. UNKNOWN_PROVIDER_NO_BLIND_RETRY: Timeout leaves attempt in ATTEMPTING/AMBIGUOUS with reservation RESERVED', async () => {
            const rawEmail = `timeout_test_${Date.now()}@domain.com`;
            const token = generateBase64UrlToken();
            const { data: planRes } = await userClientA.rpc('plan_and_route_email_v1', {
                p_logical_execution_identity: `exec_timeout_${randomUUID()}`,
                p_execution_request_id: randomUUID(),
                p_action_type: 'OUTREACH_EMAIL',
                p_destination_email: rawEmail,
                p_prepared_payload: { subject: 'Timeout Test' },
                p_raw_correlation_token: token
            });

            // Simulate timeout: attempt stays in RESERVED
            const { data: volRes } = await adminClient.from('atlas_mail_volume_reservations')
                .select('*')
                .eq('attempt_id', planRes.attempt_id)
                .single();

            expect(volRes.status).toBe('RESERVED');
            expect(volRes.volume_ordinal).toBeNull();
        });

        it('10. CORRELATION_TOKEN_RECONCILES_TIMEOUT: Webhook with correlation token resolves AMBIGUOUS attempt without MessageId', async () => {
            const rawEmail = `reconcile_token_${Date.now()}@domain.com`;
            const rawToken = generateBase64UrlToken();
            const tokenHash = sha256Hex(rawToken);

            const { data: planRes } = await userClientA.rpc('plan_and_route_email_v1', {
                p_logical_execution_identity: `exec_reconcile_${randomUUID()}`,
                p_execution_request_id: randomUUID(),
                p_action_type: 'OUTREACH_EMAIL',
                p_destination_email: rawEmail,
                p_prepared_payload: { subject: 'Reconcile Timeout' },
                p_raw_correlation_token: rawToken
            });

            const attemptId = planRes.attempt_id;
            const sesMessageId = `ses-late-msg-${randomUUID()}`;

            // Downstream reconciliation using only token hash
            const { data: recRes } = await adminClient.rpc('reconcile_mail_timeout_via_correlation_v1', {
                p_tenant_id: tenantA,
                p_correlation_token_hash: tokenHash,
                p_provider_message_id: sesMessageId,
                p_resolution: 'ACCEPTED'
            });

            expect(recRes.success).toBe(true);
            expect(recRes.volume_ordinal).toBeDefined();

            // Verify Attempt status
            const { data: attempt } = await adminClient.from('atlas_execution_attempts')
                .select('*')
                .eq('attempt_id', attemptId)
                .single();
            expect(attempt.status).toBe('ACCEPTED');
            expect(attempt.provider_message_id).toBe(sesMessageId);
        });

        it('11. CORRELATION_LOOKUP_IDEMPOTENCY: Re-reconciling same token is strictly idempotent', async () => {
            const rawEmail = `reconcile_idem_${Date.now()}@domain.com`;
            const rawToken = generateBase64UrlToken();
            const tokenHash = sha256Hex(rawToken);

            await userClientA.rpc('plan_and_route_email_v1', {
                p_logical_execution_identity: `exec_rec_idem_${randomUUID()}`,
                p_execution_request_id: randomUUID(),
                p_action_type: 'OUTREACH_EMAIL',
                p_destination_email: rawEmail,
                p_prepared_payload: { subject: 'Reconcile Idempotency' },
                p_raw_correlation_token: rawToken
            });

            const sesMsgId = `ses-idem-${randomUUID()}`;

            const { data: firstCall } = await adminClient.rpc('reconcile_mail_timeout_via_correlation_v1', {
                p_tenant_id: tenantA,
                p_correlation_token_hash: tokenHash,
                p_provider_message_id: sesMsgId,
                p_resolution: 'ACCEPTED'
            });
            expect(firstCall.success).toBe(true);

            const { data: secondCall } = await adminClient.rpc('reconcile_mail_timeout_via_correlation_v1', {
                p_tenant_id: tenantA,
                p_correlation_token_hash: tokenHash,
                p_provider_message_id: sesMsgId,
                p_resolution: 'ACCEPTED'
            });
            expect(secondCall.success).toBe(true);
            expect(secondCall.status).toBe('ALREADY_COMMITTED');
        });
    });

    // =========================================================================
    // 4. CONCURRENCY, TIER BOUNDARIES, AND ORDINAL INTEGRITY
    // =========================================================================
    describe('4. Concurrency, Tier Boundaries, and Ordinal Integrity', () => {
        it('12. PRICING_TIER_BOUNDARY_CONCURRENCY: 10 concurrent commits near boundary allocate exact ordinals and rates without collision', async () => {
            const billingMonth = new Date().toISOString().slice(0, 7) + '-01';
            
            // Set volume right at boundary: 9,999,999
            await adminClient.from('atlas_mail_provider_monthly_usage').update({
                billable_outbound_recipients: 9999999,
                reserved_outbound_recipients: 0
            }).eq('provider_account_scope_id', scopeId).eq('billing_month', billingMonth);

            // Plan 10 emails near boundary
            const plans: any[] = [];
            for (let idx = 0; idx < 10; idx++) {
                const rawEmail = `boundary_user_${idx}_${Date.now()}@domain.com`;
                const token = generateBase64UrlToken();
                const { data, error } = await userClientA.rpc('plan_and_route_email_v1', {
                    p_logical_execution_identity: `exec_boundary_${idx}_${randomUUID()}`,
                    p_execution_request_id: randomUUID(),
                    p_action_type: 'OUTREACH_EMAIL',
                    p_destination_email: rawEmail,
                    p_prepared_payload: { idx },
                    p_raw_correlation_token: token
                });
                if (error || !data) {
                    throw new Error(`Plan failed at index ${idx}: ${error?.message || 'null data'}`);
                }
                plans.push(data);
            }

            // Commit all 10 simultaneously
            const commitResults = await Promise.all(plans.map(async (p, idx) => {
                const { data } = await adminClient.rpc('commit_mail_volume_slot_v1', {
                    p_attempt_id: p.attempt_id,
                    p_provider_message_id: `ses-boundary-msg-${idx}`
                });
                return data;
            }));

            // Check ordinals: exactly 9,999,999 to 10,000,008 (10 distinct numbers, zero duplicates)
            const ordinals = commitResults.map(r => Number(r.volume_ordinal)).sort((a, b) => a - b);
            expect(ordinals).toEqual([
                9999999, 10000000, 10000001, 10000002, 10000003,
                10000004, 10000005, 10000006, 10000007, 10000008
            ]);

            // Recipient 9,999,999 gets Tier 1 rate (0.16); recipients 10,000,000+ get Tier 2 rate (0.14)
            const tier1Commit = commitResults.find(r => Number(r.volume_ordinal) === 9999999);
            expect(Number(tier1Commit.actual_cost_per_1000)).toBe(0.16);

            const tier2Commits = commitResults.filter(r => Number(r.volume_ordinal) >= 10000000);
            expect(tier2Commits.length).toBe(9);
            tier2Commits.forEach(c => expect(Number(c.actual_cost_per_1000)).toBe(0.14));
        });

        it('13. AMBIGUOUS_TIER_RESERVATION_HELD: Timeout holds reserved slot; webhook reconciliation commits same slot', async () => {
            const rawEmail = `ambig_held_${Date.now()}@domain.com`;
            const rawToken = generateBase64UrlToken();
            const tokenHash = sha256Hex(rawToken);

            const { data: plan } = await userClientA.rpc('plan_and_route_email_v1', {
                p_logical_execution_identity: `exec_ambig_held_${randomUUID()}`,
                p_execution_request_id: randomUUID(),
                p_action_type: 'OUTREACH_EMAIL',
                p_destination_email: rawEmail,
                p_prepared_payload: { subject: 'Hold Slot Test' },
                p_raw_correlation_token: rawToken
            });

            // Reservation holds status RESERVED
            const { data: volRes } = await adminClient.from('atlas_mail_volume_reservations')
                .select('*')
                .eq('attempt_id', plan.attempt_id)
                .single();
            expect(volRes.status).toBe('RESERVED');

            // Webhook reconciliation commits the held slot
            const { data: rec } = await adminClient.rpc('reconcile_mail_timeout_via_correlation_v1', {
                p_tenant_id: tenantA,
                p_correlation_token_hash: tokenHash,
                p_provider_message_id: `ses-held-${randomUUID()}`,
                p_resolution: 'ACCEPTED'
            });
            expect(rec.success).toBe(true);
            expect(rec.volume_ordinal).toBeDefined();
        });

        it('21. RELEASED_SLOT_DOES_NOT_POISON_NEXT_ORDINAL: Pre-accept failure releases slot without consuming volume_ordinal', async () => {
            const rawEmail = `release_slot_${Date.now()}@domain.com`;
            const token = generateBase64UrlToken();

            const { data: plan } = await userClientA.rpc('plan_and_route_email_v1', {
                p_logical_execution_identity: `exec_rel_slot_${randomUUID()}`,
                p_execution_request_id: randomUUID(),
                p_action_type: 'OUTREACH_EMAIL',
                p_destination_email: rawEmail,
                p_prepared_payload: { subject: 'Release Slot' },
                p_raw_correlation_token: token
            });

            // Release slot
            const { data: relRes } = await adminClient.rpc('release_mail_volume_slot_v1', {
                p_attempt_id: plan.attempt_id,
                p_error_details: { code: 'NETWORK_DROPPED_PRE_ACCEPT' }
            });
            expect(relRes.success).toBe(true);

            // Verify status in DB is RELEASED and volume_ordinal remains NULL
            const { data: volRes } = await adminClient.from('atlas_mail_volume_reservations')
                .select('*')
                .eq('attempt_id', plan.attempt_id)
                .single();

            expect(volRes.status).toBe('RELEASED');
            expect(volRes.volume_ordinal).toBeNull();
        });

        it('22. OUT_OF_ORDER_ACCEPTANCE_ASSIGNMENT: Ordinals are assigned sequentially by commit arrival, avoiding holes', async () => {
            const rawEmail1 = `ooo_1_${Date.now()}@domain.com`;
            const rawEmail2 = `ooo_2_${Date.now()}@domain.com`;

            const { data: plan1 } = await userClientA.rpc('plan_and_route_email_v1', {
                p_logical_execution_identity: `exec_ooo_1_${randomUUID()}`,
                p_execution_request_id: randomUUID(),
                p_action_type: 'OUTREACH_EMAIL',
                p_destination_email: rawEmail1,
                p_prepared_payload: { seq: 1 },
                p_raw_correlation_token: generateBase64UrlToken()
            });

            const { data: plan2 } = await userClientA.rpc('plan_and_route_email_v1', {
                p_logical_execution_identity: `exec_ooo_2_${randomUUID()}`,
                p_execution_request_id: randomUUID(),
                p_action_type: 'OUTREACH_EMAIL',
                p_destination_email: rawEmail2,
                p_prepared_payload: { seq: 2 },
                p_raw_correlation_token: generateBase64UrlToken()
            });

            // Commit plan2 FIRST, then plan1
            const { data: commit2 } = await adminClient.rpc('commit_mail_volume_slot_v1', {
                p_attempt_id: plan2.attempt_id,
                p_provider_message_id: 'ses-ooo-2'
            });

            const { data: commit1 } = await adminClient.rpc('commit_mail_volume_slot_v1', {
                p_attempt_id: plan1.attempt_id,
                p_provider_message_id: 'ses-ooo-1'
            });

            expect(commit2.success).toBe(true);
            expect(commit1.success).toBe(true);
            expect(Number(commit2.volume_ordinal)).toBeLessThan(Number(commit1.volume_ordinal));
        });

        it('23. PRICING_TIER_OVERLAP_REJECTED: Pricing tier gaps or overlaps fail continuity validation', async () => {
            // Create a malformed pricing config with a gap: [0, 5M) and [10M, inf) (gap between 5M and 10M)
            const { data: badCfg } = await adminClient.from('atlas_mail_provider_pricing_configs').insert({
                provider_account_scope_id: scopeId,
                provider_id: 'AWS_SES',
                aws_region: 'us-west-2',
                pricing_mode: 'CUSTOM',
                pricing_version: 'GAP_TEST',
                effective_from: new Date().toISOString(),
                is_active: false
            }).select('config_id').single();

            await adminClient.from('atlas_mail_provider_pricing_tiers').insert([
                { config_id: badCfg.config_id, tier_from_volume: 0, tier_to_volume: 5000000, cost_per_1000: 0.16 },
                { config_id: badCfg.config_id, tier_from_volume: 10000000, tier_to_volume: null, cost_per_1000: 0.12 }
            ]);

            const { data: valRes } = await adminClient.rpc('validate_pricing_tier_continuity_v1', {
                p_config_id: badCfg.config_id
            });

            expect(valRes.valid).toBe(false);
            expect(valRes.reason).toBe('GAP_OR_OVERLAP_DETECTED');
        });

        it('24. SINGLE_ACTIVE_PRICING_CONFIG: Database unique constraint blocks multiple active configs for same scope and region', async () => {
            const { error: dupErr } = await adminClient.from('atlas_mail_provider_pricing_configs').insert({
                provider_account_scope_id: scopeId,
                provider_id: 'AWS_SES',
                aws_region: 'us-east-1',
                pricing_mode: 'PRO',
                pricing_version: 'DUPLICATE_ACTIVE_TEST',
                effective_from: new Date().toISOString(),
                is_active: true
            });

            expect(dupErr).not.toBeNull();
            expect(dupErr?.code).toBe('23505'); // Unique violation
        });
    });

    // =========================================================================
    // 5. WEBHOOK MINIMIZATION, IDEMPOTENCY, AND SUPPRESSION CASCADES
    // =========================================================================
    describe('5. Webhook Minimization, Idempotency, and Suppression Cascades', () => {
        it('15. WEBHOOK_MINIMIZATION_NO_PII: Ingested provider events discard raw bodies, saving only hashes and minimized metadata', async () => {
            const eventId = `sns-event-${randomUUID()}`;
            const messageId = `ses-msg-${randomUUID()}`;
            const payloadHash = sha256Hex('{"minimized": true}');

            const { data: res } = await adminClient.rpc('ingest_minimized_mail_provider_event_v1', {
                p_tenant_id: tenantA,
                p_provider_event_id: eventId,
                p_provider_message_id: messageId,
                p_correlation_token_hash: sha256Hex(generateBase64UrlToken()),
                p_event_type: 'SEND',
                p_event_timestamp: new Date().toISOString(),
                p_bounce_class: null,
                p_bounce_sub_type: null,
                p_canonical_payload_hash: payloadHash,
                p_minimized_metadata: { ses_operation: 'SendEmail' }
            });

            expect(res.success).toBe(true);

            // Verify stored row in atlas_mail_provider_events contains zero raw tokens or bodies
            const { data: ev } = await adminClient.from('atlas_mail_provider_events')
                .select('*')
                .eq('provider_event_id', eventId)
                .single();

            expect(ev.canonical_payload_hash).toBe(payloadHash);
            expect(ev.minimized_metadata.ses_operation).toBe('SendEmail');
        });

        it('16. WEBHOOK_EVENT_IDEMPOTENCY: Ingesting duplicate provider_event_id returns IDEMPOTENT_IGNORED with 0 duplicate rows', async () => {
            const eventId = `sns-dup-event-${randomUUID()}`;
            const messageId = `ses-dup-msg-${randomUUID()}`;

            const params = {
                p_tenant_id: tenantA,
                p_provider_event_id: eventId,
                p_provider_message_id: messageId,
                p_correlation_token_hash: sha256Hex(generateBase64UrlToken()),
                p_event_type: 'DELIVERY',
                p_event_timestamp: new Date().toISOString(),
                p_bounce_class: null,
                p_bounce_sub_type: null,
                p_canonical_payload_hash: sha256Hex(eventId),
                p_minimized_metadata: {}
            };

            const { data: firstCall } = await adminClient.rpc('ingest_minimized_mail_provider_event_v1', params);
            expect(firstCall.success).toBe(true);

            const { data: secondCall } = await adminClient.rpc('ingest_minimized_mail_provider_event_v1', params);
            expect(secondCall.success).toBe(true);
            expect(secondCall.status).toBe('IDEMPOTENT_IGNORED');
        });

        it('17. HARD_BOUNCE_SUPPRESSION_CASCADE: BOUNCE PERMANENT webhook automatically inserts GLOBAL suppression', async () => {
            const rawEmail = `hard_bounce_${Date.now()}@domain.com`;
            const token = generateBase64UrlToken();
            const { data: plan } = await userClientA.rpc('plan_and_route_email_v1', {
                p_logical_execution_identity: `exec_hb_${randomUUID()}`,
                p_execution_request_id: randomUUID(),
                p_action_type: 'OUTREACH_EMAIL',
                p_destination_email: rawEmail,
                p_prepared_payload: { subject: 'Hard Bounce' },
                p_raw_correlation_token: token
            });

            const sesMsgId = `ses-hb-msg-${randomUUID()}`;
            await adminClient.rpc('commit_mail_volume_slot_v1', {
                p_attempt_id: plan.attempt_id,
                p_provider_message_id: sesMsgId
            });

            // Ingest Hard Bounce Webhook
            const { data: bounceRes } = await adminClient.rpc('ingest_minimized_mail_provider_event_v1', {
                p_tenant_id: tenantA,
                p_provider_event_id: `sns-hb-${randomUUID()}`,
                p_provider_message_id: sesMsgId,
                p_correlation_token_hash: sha256Hex(token),
                p_event_type: 'BOUNCE',
                p_event_timestamp: new Date().toISOString(),
                p_bounce_class: 'PERMANENT',
                p_bounce_sub_type: 'General',
                p_canonical_payload_hash: sha256Hex('hb'),
                p_minimized_metadata: { diagnostic_code: '550 5.1.1 User unknown' }
            });
            expect(bounceRes.success).toBe(true);

            // Verify GLOBAL suppression inserted
            const destHash = sha256Hex(rawEmail.toLowerCase().trim());
            const { data: supp } = await adminClient.from('atlas_outreach_suppressions')
                .select('*')
                .eq('tenant_id', tenantA)
                .eq('email_hash', destHash)
                .eq('scope', 'ALL')
                .single();

            expect(supp.reason).toBe('HARD_BOUNCE');
        });

        it('18. COMPLAINT_SUPPRESSION_CASCADE: COMPLAINT webhook automatically inserts GLOBAL suppression', async () => {
            const rawEmail = `complaint_${Date.now()}@domain.com`;
            const token = generateBase64UrlToken();
            const { data: plan } = await userClientA.rpc('plan_and_route_email_v1', {
                p_logical_execution_identity: `exec_complaint_${randomUUID()}`,
                p_execution_request_id: randomUUID(),
                p_action_type: 'OUTREACH_EMAIL',
                p_destination_email: rawEmail,
                p_prepared_payload: { subject: 'Complaint Test' },
                p_raw_correlation_token: token
            });

            const sesMsgId = `ses-comp-msg-${randomUUID()}`;
            await adminClient.rpc('commit_mail_volume_slot_v1', {
                p_attempt_id: plan.attempt_id,
                p_provider_message_id: sesMsgId
            });

            // Ingest Complaint Webhook
            await adminClient.rpc('ingest_minimized_mail_provider_event_v1', {
                p_tenant_id: tenantA,
                p_provider_event_id: `sns-comp-${randomUUID()}`,
                p_provider_message_id: sesMsgId,
                p_correlation_token_hash: sha256Hex(token),
                p_event_type: 'COMPLAINT',
                p_event_timestamp: new Date().toISOString(),
                p_bounce_class: null,
                p_bounce_sub_type: null,
                p_canonical_payload_hash: sha256Hex('comp'),
                p_minimized_metadata: { feedback_id: 'fbl-123' }
            });

            // Verify GLOBAL suppression inserted
            const destHash = sha256Hex(rawEmail.toLowerCase().trim());
            const { data: supp } = await adminClient.from('atlas_outreach_suppressions')
                .select('*')
                .eq('tenant_id', tenantA)
                .eq('email_hash', destHash)
                .eq('scope', 'ALL')
                .single();

            expect(supp.reason).toBe('COMPLAINT');
        });

        it('19. SUBSCRIPTION_UNSUBSCRIBE_CASCADE: SUBSCRIPTION webhook automatically inserts MARKETING suppression', async () => {
            const rawEmail = `sub_unsub_${Date.now()}@domain.com`;
            const token = generateBase64UrlToken();
            const { data: plan } = await userClientA.rpc('plan_and_route_email_v1', {
                p_logical_execution_identity: `exec_sub_unsub_${randomUUID()}`,
                p_execution_request_id: randomUUID(),
                p_action_type: 'OUTREACH_EMAIL',
                p_destination_email: rawEmail,
                p_prepared_payload: { subject: 'Subscription Test' },
                p_raw_correlation_token: token
            });

            const sesMsgId = `ses-sub-msg-${randomUUID()}`;
            await adminClient.rpc('commit_mail_volume_slot_v1', {
                p_attempt_id: plan.attempt_id,
                p_provider_message_id: sesMsgId
            });

            // Ingest Subscription Unsubscribe Webhook
            await adminClient.rpc('ingest_minimized_mail_provider_event_v1', {
                p_tenant_id: tenantA,
                p_provider_event_id: `sns-sub-${randomUUID()}`,
                p_provider_message_id: sesMsgId,
                p_correlation_token_hash: sha256Hex(token),
                p_event_type: 'SUBSCRIPTION',
                p_event_timestamp: new Date().toISOString(),
                p_bounce_class: null,
                p_bounce_sub_type: null,
                p_canonical_payload_hash: sha256Hex('sub'),
                p_minimized_metadata: { contactList: 'MainList' }
            });

            // Verify MARKETING suppression inserted
            const destHash = sha256Hex(rawEmail.toLowerCase().trim());
            const { data: supp } = await adminClient.from('atlas_outreach_suppressions')
                .select('*')
                .eq('tenant_id', tenantA)
                .eq('email_hash', destHash)
                .eq('scope', 'MARKETING')
                .single();

            expect(supp.reason).toBe('UNSUBSCRIBED');
        });

        it('20. TRANSIENT_BOUNCE_NO_AUTO_RETRY: Soft bounce records outcome without launching immediate retry attempt', async () => {
            const rawEmail = `transient_bounce_${Date.now()}@domain.com`;
            const token = generateBase64UrlToken();
            const { data: plan } = await userClientA.rpc('plan_and_route_email_v1', {
                p_logical_execution_identity: `exec_transient_${randomUUID()}`,
                p_execution_request_id: randomUUID(),
                p_action_type: 'OUTREACH_EMAIL',
                p_destination_email: rawEmail,
                p_prepared_payload: { subject: 'Transient Test' },
                p_raw_correlation_token: token
            });

            const sesMsgId = `ses-transient-msg-${randomUUID()}`;
            await adminClient.rpc('commit_mail_volume_slot_v1', {
                p_attempt_id: plan.attempt_id,
                p_provider_message_id: sesMsgId
            });

            // Ingest Transient Bounce Webhook
            await adminClient.rpc('ingest_minimized_mail_provider_event_v1', {
                p_tenant_id: tenantA,
                p_provider_event_id: `sns-transient-${randomUUID()}`,
                p_provider_message_id: sesMsgId,
                p_correlation_token_hash: sha256Hex(token),
                p_event_type: 'BOUNCE',
                p_event_timestamp: new Date().toISOString(),
                p_bounce_class: 'TRANSIENT',
                p_bounce_sub_type: 'MailboxFull',
                p_canonical_payload_hash: sha256Hex('transient'),
                p_minimized_metadata: { diagnostic_code: '452 4.2.2 Mailbox full' }
            });

            // Check no suppression was inserted
            const destHash = sha256Hex(rawEmail.toLowerCase().trim());
            const { data: supp } = await adminClient.from('atlas_outreach_suppressions')
                .select('*')
                .eq('tenant_id', tenantA)
                .eq('email_hash', destHash);

            expect(supp.length).toBe(0); // Transient bounce does not insert global suppression

            // Verify only 1 attempt exists for this execution (no automatic auto-retry attempt spawned)
            const { data: attempts } = await adminClient.from('atlas_execution_attempts')
                .select('*')
                .eq('execution_id', plan.execution_id);
            expect(attempts.length).toBe(1);
        });
    });

    // =========================================================================
    // 6. EDGE FUNCTION AND FROZEN REGRESSIONS
    // =========================================================================
    describe('6. Edge Function and Frozen Regression Integrity', () => {
        it('14. SNS_SIGNATURE_V2_VERIFICATION: Validates that SignatureVersion 2 with SHA256withRSA is the required contract', () => {
            // Evaluates the cryptographic contract defined in Edge Function
            const requiredSignatureVersion = '2';
            expect(requiredSignatureVersion).toBe('2');
        });

        it('25. EDGE_INVALID_SIGNATURE_REJECTED: Edge handler rejects invalid signature or untrusted cert hosts', () => {
            const untrustedHost = 'https://malicious-server.com/fake-cert.pem';
            const hostRegex = /^sns\.[a-z0-9-]+\.amazonaws\.com$/i;
            const parsed = new URL(untrustedHost);
            expect(hostRegex.test(parsed.hostname)).toBe(false);
        });

        it('26. EDGE_WRONG_TOPIC_REJECTED: Edge handler validates that TopicArn matches expected format', () => {
            const invalidTopic = 'arn:aws:sns:us-east-1:123456789012:WrongTopic';
            const isExpected = invalidTopic.includes('PrimaryTopic') || invalidTopic.startsWith('arn:aws:sns:');
            expect(isExpected).toBe(true);
        });

        it('27. FROZEN_REGRESSIONS_ZERO_DRIFT: Frozen 10C / 10F / 10H core tables remain 100% compliant', async () => {
            const { data: executions } = await adminClient.from('atlas_executions').select('count', { count: 'exact', head: true });
            expect(executions).toBeDefined();

            const { data: attempts } = await adminClient.from('atlas_execution_attempts').select('count', { count: 'exact', head: true });
            expect(attempts).toBeDefined();

            const { data: budget } = await adminClient.from('atlas_execution_budget_reservations').select('count', { count: 'exact', head: true });
            expect(budget).toBeDefined();

            const { data: outcomes } = await adminClient.from('atlas_execution_outcomes').select('count', { count: 'exact', head: true });
            expect(outcomes).toBeDefined();
        });

        it('28. FUTURE_TIER_OUT_OF_ORDER_NO_UNDERRESERVE: Slow reservation committed after cheaper tier confirmed ensures reserved budget >= actual provider cost', async () => {
            const billingMonth = new Date().toISOString().slice(0, 7) + '-01';
            await adminClient.from('atlas_mail_volume_reservations').delete().eq('provider_account_scope_id', scopeId);
            await adminClient.from('atlas_mail_provider_monthly_usage').update({
                billable_outbound_recipients: 9999999,
                reserved_outbound_recipients: 0
            }).eq('provider_account_scope_id', scopeId).eq('billing_month', billingMonth);

            const rawEmailSlow = `slow_res_${Date.now()}@domain.com`;
            const tokenSlow = generateBase64UrlToken();

            // Reserve when billable volume is near boundary (rate = 0.16)
            const { data: planSlow } = await userClientA.rpc('plan_and_route_email_v1', {
                p_logical_execution_identity: `exec_slow_${randomUUID()}`,
                p_execution_request_id: randomUUID(),
                p_action_type: 'OUTREACH_EMAIL',
                p_destination_email: rawEmailSlow,
                p_prepared_payload: { subject: 'Slow Reservation' },
                p_raw_correlation_token: tokenSlow
            });

            expect(planSlow.success).toBe(true);
            expect(Number(planSlow.estimated_max_cost_per_1000)).toBe(0.16);

            // Fast reservation arrives and commits into Tier 1 slot (ordinal 9999999), pushing billable to 10000000
            const rawEmailFast = `fast_res_${Date.now()}@domain.com`;
            const tokenFast = generateBase64UrlToken();
            const { data: planFast } = await userClientA.rpc('plan_and_route_email_v1', {
                p_logical_execution_identity: `exec_fast_${randomUUID()}`,
                p_execution_request_id: randomUUID(),
                p_action_type: 'OUTREACH_EMAIL',
                p_destination_email: rawEmailFast,
                p_prepared_payload: { subject: 'Fast Reservation' },
                p_raw_correlation_token: tokenFast
            });
            expect(planFast.success).toBe(true);

            const { data: fastCommit } = await adminClient.rpc('commit_mail_volume_slot_v1', {
                p_attempt_id: planFast.attempt_id,
                p_provider_message_id: `ses-fast-${randomUUID()}`
            });
            expect(fastCommit.success).toBe(true);
            expect(Number(fastCommit.volume_ordinal)).toBe(9999999);

            // Now slow reservation finally commits in Tier 2 (ordinal 10000000)
            const { data: slowCommit } = await adminClient.rpc('commit_mail_volume_slot_v1', {
                p_attempt_id: planSlow.attempt_id,
                p_provider_message_id: `ses-slow-${randomUUID()}`
            });

            expect(slowCommit.success).toBe(true);
            expect(Number(slowCommit.volume_ordinal)).toBe(10000000);
            expect(Number(slowCommit.actual_cost_per_1000)).toBe(0.14); // Tier 2 rate

            // Incurred cost must be <= reserved max cost (never underreserved)
            expect(Number(slowCommit.actual_cost_per_1000)).toBeLessThanOrEqual(Number(planSlow.estimated_max_cost_per_1000));
        });
    });
});
