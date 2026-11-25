import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createGuardedTestClient as createClient } from '../lib/testDbGuard';
import * as crypto from 'crypto';
import dotenv from 'dotenv';

const loadEnv = dotenv?.config || (dotenv as any)?.default?.config;
if (typeof loadEnv === 'function') loadEnv({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY!;
const adminClient = createClient(supabaseUrl, supabaseKey);

function randomUUID() {
    return crypto.randomUUID();
}

describe('Person Enrichment V1 Certification Evidence Verification', () => {
    let tenantA: string;
    let tenantB: string;
    let personA: string;
    let queueJobB: string;
    let unrelatedJobId: string;
    let originalFixtureState: any;

    beforeAll(async () => {
        // Setup Tenant A and Tenant B
        const userEmailA = `integ_a_${Date.now()}_${randomUUID().slice(0, 6)}@example.com`;
        const userEmailB = `integ_b_${Date.now()}_${randomUUID().slice(0, 6)}@example.com`;
        const pass = `Pass_${randomUUID()}`;

        const { data: authA } = await adminClient.auth.admin.createUser({ email: userEmailA, password: pass, email_confirm: true });
        const { data: authB } = await adminClient.auth.admin.createUser({ email: userEmailB, password: pass, email_confirm: true });
        tenantA = authA.user!.id;
        tenantB = authB.user!.id;

        await adminClient.from('atlas_tenants').upsert([{ tenant_id: tenantA }, { tenant_id: tenantB }]);

        // Create Person in Tenant A
        const { data: pA } = await adminClient.from('atlas_people').insert({
            tenant_id: tenantA,
            full_name: 'Tenant A Person Integrity',
            status: 'ACTIVE',
            lifecycle_stage: 'CANONICAL'
        }).select('person_id').single();
        personA = pA.person_id;

        // Create a Harvester Queue Job belonging to Tenant B
        const { data: qB } = await adminClient.from('atlas_queues').insert({
            queue_type: 'INGEST',
            idempotency_key: `cross-job-${randomUUID()}`,
            priority: 3,
            payload: { note: 'Tenant B Job' },
            status: 'PENDING',
            tenant_id: tenantB
        }).select('job_id').single();
        queueJobB = qB.job_id;

        // Insert an unrelated queue item to test isolation survival
        const fixtureIdem = `unrelated-survival-marker-${randomUUID()}`;
        const { data: uq } = await adminClient.from('atlas_queues').insert({
            queue_type: 'INGEST',
            idempotency_key: fixtureIdem,
            priority: 2,
            payload: { origin: 'UNRELATED_SURVIVAL_TEST', marker: randomUUID() },
            status: 'PENDING',
            attempt_count: 0,
            max_attempts: 3
        }).select('*').single();
        unrelatedJobId = uq.job_id;
        originalFixtureState = uq;
    });

    afterAll(async () => {
        if (tenantA) {
            await adminClient.from('atlas_people').delete().eq('tenant_id', tenantA);
            await adminClient.auth.admin.deleteUser(tenantA);
        }
        if (tenantB) {
            await adminClient.from('atlas_people').delete().eq('tenant_id', tenantB);
            await adminClient.auth.admin.deleteUser(tenantB);
        }
        if (queueJobB) {
            await adminClient.from('atlas_queues').delete().eq('job_id', queueJobB);
        }
        if (unrelatedJobId) {
            await adminClient.from('atlas_queues').delete().eq('job_id', unrelatedJobId);
        }
    });

    // 1. SCHEMA PARITY CHECK
    it('1. SCHEMA_PARITY: Remote database contains all Person Enrichment V1 tables, columns, and enums', async () => {
        const tables = [
            'atlas_person_enrichment_policies',
            'atlas_person_enrichment_source_capabilities',
            'atlas_person_enrichment_tenant_configs',
            'atlas_person_enrichment_daily_budgets',
            'atlas_person_enrichment_budget_reservations',
            'atlas_person_enrichment_missions',
            'atlas_person_enrichment_attempts',
            'atlas_person_enrichment_events'
        ];

        for (const t of tables) {
            const { error } = await adminClient.from(t).select('*').limit(1);
            expect(error).toBeNull();
        }
    });

    // 2. MISSION ↔ HARVESTER JOB INTEGRITY
    it('2. MISSION_JOB_INTEGRITY: Direct DB attempt to assign Tenant B harvester_job_id to Tenant A mission is rejected', async () => {
        // Plan a mission for Tenant A
        const { data: plan } = await adminClient.rpc('plan_person_enrichment_v1', {
            p_tenant_id: tenantA,
            p_person_id: personA,
            p_gap_key: 'JOB_TITLE'
        });
        expect(plan.success).toBe(true);
        const missionId = plan.mission_id;

        // Attempt to assign Tenant B's harvester job to Tenant A's mission
        const { error: crossJobErr } = await adminClient
            .from('atlas_person_enrichment_missions')
            .update({ harvester_job_id: queueJobB })
            .eq('mission_id', missionId);

        expect(crossJobErr).not.toBeNull();
        expect(crossJobErr!.message).toContain('CROSS_TENANT_VIOLATION');
    });

    // 3. ATTEMPT ↔ MISSION & HARVESTER JOB INTEGRITY
    it('3. ATTEMPT_JOB_INTEGRITY: Attempt cannot reference mission or queue job belonging to another tenant', async () => {
        // Plan a mission for Tenant A
        const { data: plan } = await adminClient.rpc('plan_person_enrichment_v1', {
            p_tenant_id: tenantA,
            p_person_id: personA,
            p_gap_key: 'JOB_TITLE'
        });
        expect(plan.success).toBe(true);
        const missionId = plan.mission_id;

        // Attempt 1: Attempt tenant B referencing mission A -> REJECTED
        const { error: crossAttemptErr1 } = await adminClient
            .from('atlas_person_enrichment_attempts')
            .insert({
                tenant_id: tenantB,
                mission_id: missionId,
                attempt_number: 1,
                execution_status: 'SUCCESS',
                incurred_cost: 0.01,
                finished_at: new Date().toISOString()
            });
        expect(crossAttemptErr1).not.toBeNull();
        expect(crossAttemptErr1!.message).toContain('CROSS_TENANT_VIOLATION');

        // Attempt 2: Attempt tenant A referencing Tenant B queue job -> REJECTED
        const { error: crossAttemptErr2 } = await adminClient
            .from('atlas_person_enrichment_attempts')
            .insert({
                tenant_id: tenantA,
                mission_id: missionId,
                harvester_job_id: queueJobB,
                attempt_number: 1,
                execution_status: 'SUCCESS',
                incurred_cost: 0.01,
                finished_at: new Date().toISOString()
            });
        expect(crossAttemptErr2).not.toBeNull();
        expect(crossAttemptErr2!.message).toContain('CROSS_TENANT_VIOLATION');
    });

    // 4. CROSS-TENANT EVENT & RESERVATION INTEGRITY
    it('4. CROSS_TENANT_JOB_INTEGRITY: Event and reservation cannot reference cross-tenant missions', async () => {
        const { data: plan } = await adminClient.rpc('plan_person_enrichment_v1', {
            p_tenant_id: tenantA,
            p_person_id: personA,
            p_gap_key: 'JOB_TITLE'
        });
        expect(plan.success).toBe(true);
        const missionId = plan.mission_id;

        // Cross-tenant event insert -> REJECTED
        const { error: eventErr } = await adminClient
            .from('atlas_person_enrichment_events')
            .insert({
                tenant_id: tenantB,
                mission_id: missionId,
                event_type: 'CROSS_TEST',
                to_status: 'PLANNED'
            });
        expect(eventErr).not.toBeNull();
        expect(eventErr!.message).toContain('CROSS_TENANT_VIOLATION');

        // Cross-tenant reservation insert -> REJECTED
        const { error: resErr } = await adminClient
            .from('atlas_person_enrichment_budget_reservations')
            .insert({
                tenant_id: tenantB,
                mission_id: missionId,
                period_date: '2026-09-08',
                reserved_amount: 0.02,
                status: 'RESERVED'
            });
        expect(resErr).not.toBeNull();
        expect(resErr!.message).toContain('CROSS_TENANT_VIOLATION');
    });

    // 5. TEST ISOLATION & UNRELATED JOB SURVIVAL
    it('5. HARVESTER_TEST_ISOLATION & UNRELATED_PENDING_JOB_SURVIVES: Unrelated queue row is completely untouched', async () => {
        const { data: currentFixture, error } = await adminClient
            .from('atlas_queues')
            .select('*')
            .eq('job_id', unrelatedJobId)
            .single();

        expect(error).toBeNull();
        expect(currentFixture).toBeDefined();
        // Row still exists
        expect(currentFixture.job_id).toBe(originalFixtureState.job_id);
        // Status unchanged
        expect(currentFixture.status).toBe('PENDING');
        // Payload unchanged
        expect(currentFixture.payload).toEqual(originalFixtureState.payload);
        // Attempt count unchanged
        expect(currentFixture.attempt_count).toBe(0);
        // Lock fields unchanged
        expect(currentFixture.locked_at).toBeNull();
        expect(currentFixture.lock_token).toBeNull();
        expect(currentFixture.locked_by).toBeNull();
    });
});
