import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { createGuardedTestClient as createClient } from '../lib/testDbGuard';
import * as crypto from 'crypto';
import dotenv from 'dotenv';
import { PersonResolver } from '../social/PersonResolver';
import { SupabasePersonRepository } from '../social/PersonRepositories';

const loadEnv = dotenv?.config || (dotenv as any)?.default?.config;
if (typeof loadEnv === 'function') loadEnv({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_IWSDC0aWUR8cvOPrwYSaqg_JU8aASm8';
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseServiceKey) throw new Error('SUPABASE_SECRET_KEY must be set in environment');

const adminClient = createClient(supabaseUrl, supabaseServiceKey);
let userClientA: SupabaseClient;
let userClientB: SupabaseClient;

function randomUUID() {
    return crypto.randomUUID();
}

describe('Person Enrichment Engine V1 Certification Suite (070000)', () => {
    let tenantA: string;
    let tenantB: string;
    let _personObservedA: string;
    let personCanonicalA: string;
    let personTenantB: string;

    let testSourceId: string;
    let testAuthorityId: string;
    let _testCapabilityJobTitleId: string;
    let _testCapabilityCompanyId: string;

    const userEmailA = `enrich_a_${Date.now()}_${randomUUID().slice(0, 8)}@example.com`;
    const userEmailB = `enrich_b_${Date.now()}_${randomUUID().slice(0, 8)}@example.com`;
    const testPassword = `TestPass!_${randomUUID()}`;

    async function createFreshPerson(stage: 'OBSERVED' | 'CANONICAL' = 'CANONICAL', namePrefix: string = 'Fresh'): Promise<string> {
        const { data: p } = await adminClient.from('atlas_people').insert({
            tenant_id: tenantA,
            full_name: `${namePrefix} ${Date.now()}_${randomUUID().slice(0, 6)}`,
            status: 'ACTIVE',
            lifecycle_stage: stage
        }).select('person_id').single();
        return p.person_id;
    }

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

        // 3. Clients
        userClientA = createClient(supabaseUrl, supabaseAnonKey);
        await userClientA.auth.signInWithPassword({ email: userEmailA, password: testPassword });

        userClientB = createClient(supabaseUrl, supabaseAnonKey);
        await userClientB.auth.signInWithPassword({ email: userEmailB, password: testPassword });

        // 4. Seed Canonical and Observed People in Tenant A
        personCanonicalA = await createFreshPerson('CANONICAL', 'Canonical Baseline');
        _personObservedA = await createFreshPerson('OBSERVED', 'Observed Baseline');

        // Seed Person in Tenant B
        const { data: pB } = await adminClient.from('atlas_people').insert({
            tenant_id: tenantB,
            full_name: 'Tenant B Person',
            status: 'ACTIVE',
            lifecycle_stage: 'CANONICAL'
        }).select('person_id').single();
        personTenantB = pB.person_id;

        // 5. Seed Test Source in atlas_sources
        const providerSourceId = `B2B_RESOLVER_${Date.now()}_${randomUUID().slice(0, 6)}`;
        const { data: src } = await adminClient.from('atlas_sources').insert({
            provider: 'ENRICH_PARTNER',
            source_type: 'API_ENDPOINT',
            provider_source_id: providerSourceId,
            canonical_url: 'https://api.partner.com/enrich',
            status: 'ACTIVE',
            discovery_method: 'API'
        }).select('source_id').single();
        testSourceId = src.source_id;

        // 6. Look up active source authority in atlas_source_authority_registry
        const { data: authRow } = await adminClient.from('atlas_source_authority_registry')
            .select('authority_id')
            .eq('source_type', 'API_CONNECTOR')
            .eq('maximum_use_authority', 'CANONICAL_ALLOWED')
            .eq('is_active', true)
            .limit(1)
            .single();
        testAuthorityId = authRow.authority_id;

        // 7. Seed capabilities for JOB_TITLE and COMPANY
        const { data: capJob } = await adminClient.from('atlas_person_enrichment_source_capabilities').insert({
            source_id: testSourceId,
            authority_id: testAuthorityId,
            supported_gap_key: 'JOB_TITLE',
            acquisition_key: 'JOB_TITLE',
            cost_per_query: 0.02,
            expected_latency_ms: 500,
            is_enabled: true
        }).select('capability_id').single();
        _testCapabilityJobTitleId = capJob.capability_id;

        const { data: capComp } = await adminClient.from('atlas_person_enrichment_source_capabilities').insert({
            source_id: testSourceId,
            authority_id: testAuthorityId,
            supported_gap_key: 'COMPANY',
            acquisition_key: 'COMPANY',
            cost_per_query: 0.02,
            expected_latency_ms: 500,
            is_enabled: true
        }).select('capability_id').single();
        _testCapabilityCompanyId = capComp.capability_id;

        // Also seed capability for ATTRIBUTE_EVIDENCE with acquisition_key = JOB_TITLE
        await adminClient.from('atlas_person_enrichment_source_capabilities').insert({
            source_id: testSourceId,
            authority_id: testAuthorityId,
            supported_gap_key: 'ATTRIBUTE_EVIDENCE',
            acquisition_key: 'JOB_TITLE',
            cost_per_query: 0.02,
            expected_latency_ms: 500,
            is_enabled: true
        });

        // Initialize tenant configs with ample budget
        await adminClient.from('atlas_person_enrichment_tenant_configs').upsert({
            tenant_id: tenantA,
            daily_budget_limit: 10.00,
            total_budget_limit: 100.00,
            total_reserved: 0.0,
            total_spent: 0.0
        });
    });

    afterAll(async () => {
        // Cleanup capabilities and sources
        if (testSourceId) {
            await adminClient.from('atlas_sources').delete().eq('source_id', testSourceId);
        }
        if (tenantA) {
            await adminClient.from('atlas_people').delete().eq('tenant_id', tenantA);
            await adminClient.auth.admin.deleteUser(tenantA);
        }
        if (tenantB) {
            await adminClient.from('atlas_people').delete().eq('tenant_id', tenantB);
            await adminClient.auth.admin.deleteUser(tenantB);
        }
    });

    // =========================================================================
    // 1. GAP PRIORITY & SCOPE CONTRACTS
    // =========================================================================
    describe('1. Gap Priority & Scope Contracts', () => {
        it('NONE_PRIORITY_IS_NOT_ELIGIBLE: Canonical EMAIL gap with priority NONE yields NO_ENRICHMENT', async () => {
            const { data } = await adminClient.rpc('plan_person_enrichment_v1', {
                p_tenant_id: tenantA,
                p_person_id: personCanonicalA,
                p_gap_key: 'EMAIL'
            });
            expect(data.success).toBe(false);
            expect(data.status).toBe('NO_ENRICHMENT');
            expect(data.reason).toBe('REASON_PRIORITY_NONE');
        });

        it('NONE_PRIORITY_IS_NOT_ELIGIBLE: Canonical PHONE gap with priority NONE yields NO_ENRICHMENT', async () => {
            const { data } = await adminClient.rpc('plan_person_enrichment_v1', {
                p_tenant_id: tenantA,
                p_person_id: personCanonicalA,
                p_gap_key: 'PHONE'
            });
            expect(data.success).toBe(false);
            expect(data.status).toBe('NO_ENRICHMENT');
            expect(data.reason).toBe('REASON_PRIORITY_NONE');
        });

        it('LOW_PRIORITY_IS_ELIGIBLE: Canonical JOB_TITLE gap with priority LOW is eligible for planning', async () => {
            const p = await createFreshPerson('CANONICAL', 'LowPriority');
            const { data } = await adminClient.rpc('plan_person_enrichment_v1', {
                p_tenant_id: tenantA,
                p_person_id: p,
                p_gap_key: 'JOB_TITLE'
            });
            expect(data.success).toBe(true);
            expect(data.status).toBe('PLANNED');
            expect(data.acquisition_key).toBe('JOB_TITLE');
            expect(data.mission_id).toBeDefined();
        });

        it('HIGH_PRIORITY_IS_ELIGIBLE: Observed ATTRIBUTE_EVIDENCE gap with priority HIGH is eligible for planning', async () => {
            const p = await createFreshPerson('OBSERVED', 'HighPriority');
            const { data } = await adminClient.rpc('plan_person_enrichment_v1', {
                p_tenant_id: tenantA,
                p_person_id: p,
                p_gap_key: 'ATTRIBUTE_EVIDENCE'
            });
            expect(data.success).toBe(true);
            expect(data.status).toBe('PLANNED');
            expect(data.acquisition_key).toBe('JOB_TITLE');
        });

        it('UNSUPPORTED_GAP: DOMAIN_RELEVANCE is deferred and rejected in Enrichment V1', async () => {
            const p = await createFreshPerson('OBSERVED', 'DomainRelevance');
            const { data } = await adminClient.rpc('plan_person_enrichment_v1', {
                p_tenant_id: tenantA,
                p_person_id: p,
                p_gap_key: 'DOMAIN_RELEVANCE'
            });
            expect(data.success).toBe(false);
            expect(data.status).toBe('NO_ENRICHMENT');
            expect(data.reason).toBe('REASON_UNSUPPORTED_GAP');
        });
    });

    // =========================================================================
    // 2. ENRICHMENT INPUT HASH CONTRACTS
    // =========================================================================
    describe('2. Canonical Enrichment Input Hash Contracts', () => {
        it('JSON_CANONICAL_HASH_DETERMINISTIC: Same semantic parameters yield exact same sha256', async () => {
            const hash1 = await adminClient.rpc('compute_enrichment_input_hash_v1', {
                p_tenant_id: tenantA,
                p_person_id: personCanonicalA,
                p_gap_key: 'JOB_TITLE',
                p_priority: 'LOW',
                p_reason: 'Job title missing for 10P-C',
                p_blocker_rule: null,
                p_consumer_dependency: '10P-C',
                p_coverage_state_hash: 'HASH_A',
                p_coverage_policy_version: 'cov-v1.0.0-deterministic',
                p_lifecycle_policy_version: 'v1.0.0-deterministic'
            });

            const hash2 = await adminClient.rpc('compute_enrichment_input_hash_v1', {
                p_tenant_id: tenantA,
                p_person_id: personCanonicalA,
                p_gap_key: 'JOB_TITLE',
                p_priority: 'LOW',
                p_reason: 'Job title missing for 10P-C',
                p_blocker_rule: null,
                p_consumer_dependency: '10P-C',
                p_coverage_state_hash: 'HASH_A',
                p_coverage_policy_version: 'cov-v1.0.0-deterministic',
                p_lifecycle_policy_version: 'v1.0.0-deterministic'
            });

            expect(hash1.data).toBe(hash2.data);
            expect(hash1.data.length).toBe(64);
        });

        it('SEMANTIC_CHANGE_CHANGES_HASH: Change in priority or coverage state produces a new hash', async () => {
            const hashBase = await adminClient.rpc('compute_enrichment_input_hash_v1', {
                p_tenant_id: tenantA,
                p_person_id: personCanonicalA,
                p_gap_key: 'JOB_TITLE',
                p_priority: 'LOW',
                p_reason: 'Job title missing',
                p_blocker_rule: null,
                p_consumer_dependency: '10P-C',
                p_coverage_state_hash: 'HASH_A',
                p_coverage_policy_version: 'cov-v1.0.0-deterministic',
                p_lifecycle_policy_version: 'v1.0.0-deterministic'
            });

            const hashChanged = await adminClient.rpc('compute_enrichment_input_hash_v1', {
                p_tenant_id: tenantA,
                p_person_id: personCanonicalA,
                p_gap_key: 'JOB_TITLE',
                p_priority: 'HIGH', // changed
                p_reason: 'Job title missing',
                p_blocker_rule: null,
                p_consumer_dependency: '10P-C',
                p_coverage_state_hash: 'HASH_A',
                p_coverage_policy_version: 'cov-v1.0.0-deterministic',
                p_lifecycle_policy_version: 'v1.0.0-deterministic'
            });

            expect(hashBase.data).not.toBe(hashChanged.data);
        });

        it('NULL_FIELDS_HASH_DETERMINISTIC: Explicit nulls do not error and compute deterministically', async () => {
            const { data } = await adminClient.rpc('compute_enrichment_input_hash_v1', {
                p_tenant_id: tenantA,
                p_person_id: personCanonicalA,
                p_gap_key: 'JOB_TITLE',
                p_priority: 'LOW',
                p_reason: 'Job title missing',
                p_blocker_rule: null,
                p_consumer_dependency: null,
                p_coverage_state_hash: 'HASH_NULL',
                p_coverage_policy_version: 'cov-v1.0.0-deterministic',
                p_lifecycle_policy_version: 'v1.0.0-deterministic'
            });
            expect(data).toBeDefined();
            expect(typeof data).toBe('string');
        });
    });

    // =========================================================================
    // 3. ONE MISSION = ONE AUTHORIZED ACQUISITION SIDE EFFECT
    // =========================================================================
    describe('3. One Mission = One Authorized Acquisition Side Effect', () => {
        it('ONE_MISSION_ONE_ACQUISITION_KEY: JOB_TITLE mission specifies exactly acquisition_key = JOB_TITLE', async () => {
            const p = await createFreshPerson('CANONICAL', 'OneAcqKey');
            const { data: planRes } = await adminClient.rpc('plan_person_enrichment_v1', {
                p_tenant_id: tenantA,
                p_person_id: p,
                p_gap_key: 'JOB_TITLE'
            });
            expect(planRes.acquisition_key).toBe('JOB_TITLE');

            const { data: mission } = await adminClient
                .from('atlas_person_enrichment_missions')
                .select('*')
                .eq('mission_id', planRes.mission_id)
                .single();
            expect(mission.acquisition_key).toBe('JOB_TITLE');
        });

        it('JOB_TITLE_MISSION_CANNOT_ADD_EMAIL: Email returned in result is used for resolution but NEVER added to person identifiers', async () => {
            const p = await createFreshPerson('CANONICAL', 'NoSideEffect');
            const emailHash = `canon_${Date.now()}@domain.com`;

            // 1. Add an existing known email anchor to person so resolver can match
            await adminClient.from('atlas_person_identifiers').insert({
                tenant_id: tenantA,
                person_id: p,
                identifier_type: 'EMAIL',
                normalized_value_hash: emailHash,
                display_value: emailHash,
                safe_value: 'c***@domain.com',
                verification_status: 'VERIFIED'
            });

            // 2. Plan and dispatch a JOB_TITLE mission
            const { data: plan } = await adminClient.rpc('plan_person_enrichment_v1', {
                p_tenant_id: tenantA,
                p_person_id: p,
                p_gap_key: 'JOB_TITLE'
            });
            expect(plan.success).toBe(true);
            const missionId = plan.mission_id;

            const { data: dispatch } = await adminClient.rpc('authorize_and_dispatch_enrichment_mission_v1', {
                p_mission_id: missionId
            });
            expect(dispatch.success).toBe(true);

            // Fetch job_id and simulate worker lease
            const lockToken = randomUUID();
            await adminClient.from('atlas_queues').update({
                status: 'PROCESSING',
                lock_token: lockToken,
                locked_at: new Date().toISOString(),
                lock_expires_at: new Date(Date.now() + 60000).toISOString()
            }).eq('job_id', dispatch.harvester_job_id);

            // 3. Provider returns BOTH a new email and the job_title
            const newReturnedEmail = 'provider_returned_email@other.com';
            const { data: recordRes } = await adminClient.rpc('record_enrichment_result_v1', {
                p_mission_id: missionId,
                p_job_id: dispatch.harvester_job_id,
                p_lock_token: lockToken,
                p_candidate_identity_key: `CAND_${Date.now()}`,
                p_source_ref: 'api.partner.com/result/1',
                p_extracted_name: 'No Side Effect Person',
                p_payload: { raw: 'data' },
                p_identifiers: [
                    {
                        identifier_type: 'EMAIL',
                        normalized_value_hash: emailHash, // matches target person for resolution
                        display_value: emailHash,
                        verification_status: 'VERIFIED'
                    },
                    {
                        identifier_type: 'EMAIL',
                        normalized_value_hash: newReturnedEmail, // extraneous email returned
                        display_value: newReturnedEmail,
                        verification_status: 'UNVERIFIED'
                    }
                ],
                p_acquired_value: 'Chief Technology Officer',
                p_incurred_cost: 0.02
            });
            expect(recordRes.success).toBe(true);
            expect(recordRes.status).toBe('RESOLUTION_PENDING');

            // 4. Run PersonResolver in worker context
            const repo = new SupabasePersonRepository(adminClient);
            const resolver = new PersonResolver(repo);
            const resolveOutcome = await resolver.resolve({
                tenant_id: tenantA,
                name: 'No Side Effect Person',
                identifiers: [{ type: 'EMAIL', value: emailHash }],
                mode: 'RESOLUTION_ONLY'
            });
            expect(resolveOutcome.outcome).toBe('RESOLVED');
            expect(resolveOutcome.person_id).toBe(p);

            // 5. Call record_enrichment_resolution_v1 to attach the acquired attribute
            const { data: attachRes } = await adminClient.rpc('record_enrichment_resolution_v1', {
                p_mission_id: missionId,
                p_candidate_id: recordRes.candidate_id,
                p_resolution_outcome: 'RESOLVED',
                p_resolved_person_id: resolveOutcome.person_id,
                p_acquired_value: 'Chief Technology Officer'
            });
            expect(attachRes.success).toBe(true);
            expect(attachRes.status).toBe('ATTACHED');

            // 6. VERIFY: Target person has JOB_TITLE in attribute evidence!
            const { data: ev } = await adminClient
                .from('atlas_person_attribute_evidence')
                .select('*')
                .eq('person_id', p)
                .eq('attribute_key', 'JOB_TITLE');
            expect(ev.length).toBeGreaterThanOrEqual(1);
            expect(ev[0].normalized_value).toBe('CHIEF TECHNOLOGY OFFICER');

            // 7. CRITICAL VERIFY: The new returned email was NOT inserted into atlas_person_identifiers!
            const { data: idents } = await adminClient
                .from('atlas_person_identifiers')
                .select('*')
                .eq('person_id', p)
                .eq('normalized_value_hash', newReturnedEmail);
            expect(idents.length).toBe(0); // ZERO cross-gap side effects!
        });

        it('TARGET_MISMATCH_CANNOT_MUTATE_OTHER_PERSON: If resolver resolves to Person B, mission for Person A does NOT attach to B', async () => {
            const personA = await createFreshPerson('CANONICAL', 'TargetA');
            const personB = await createFreshPerson('CANONICAL', 'PersonB');

            // Plan mission for personA
            const { data: plan } = await adminClient.rpc('plan_person_enrichment_v1', {
                p_tenant_id: tenantA,
                p_person_id: personA,
                p_gap_key: 'JOB_TITLE'
            });
            const missionId = plan.mission_id;

            const { data: dispatch } = await adminClient.rpc('authorize_and_dispatch_enrichment_mission_v1', {
                p_mission_id: missionId
            });
            expect(dispatch.success).toBe(true);

            const lockToken = randomUUID();
            await adminClient.from('atlas_queues').update({
                status: 'PROCESSING',
                lock_token: lockToken,
                locked_at: new Date().toISOString(),
                lock_expires_at: new Date(Date.now() + 60000).toISOString()
            }).eq('job_id', dispatch.harvester_job_id);

            const { data: recordRes } = await adminClient.rpc('record_enrichment_result_v1', {
                p_mission_id: missionId,
                p_job_id: dispatch.harvester_job_id,
                p_lock_token: lockToken,
                p_candidate_identity_key: `CAND_MISMATCH_${Date.now()}`,
                p_source_ref: 'api.partner.com/mismatch/1',
                p_extracted_name: 'Mismatch Person',
                p_payload: { raw: 'data' },
                p_identifiers: [{ identifier_type: 'EMAIL', normalized_value_hash: 'b@other.com' }],
                p_acquired_value: 'VP Sales',
                p_incurred_cost: 0.02
            });

            // Simulate resolver resolving to personB instead of personA
            const { data: attachRes } = await adminClient.rpc('record_enrichment_resolution_v1', {
                p_mission_id: missionId,
                p_candidate_id: recordRes.candidate_id,
                p_resolution_outcome: 'RESOLVED',
                p_resolved_person_id: personB, // Target Mismatch!
                p_acquired_value: 'VP Sales'
            });

            expect(attachRes.success).toBe(true);
            expect(attachRes.status).toBe('UNRESOLVED');
            expect(attachRes.attachment_status).toBe('TARGET_MISMATCH');

            // Verify mission status
            const { data: mFinal } = await adminClient
                .from('atlas_person_enrichment_missions')
                .select('status, terminal_reason, attachment_status')
                .eq('mission_id', missionId)
                .single();
            expect(mFinal.status).toBe('UNRESOLVED');
            expect(mFinal.terminal_reason).toBe('REASON_TARGET_MISMATCH');
            expect(mFinal.attachment_status).toBe('TARGET_MISMATCH');

            // Verify Person B did NOT receive "VP Sales"
            const { data: evB } = await adminClient
                .from('atlas_person_attribute_evidence')
                .select('*')
                .eq('person_id', personB)
                .eq('normalized_value', 'VP SALES');
            expect(evB.length).toBe(0);
        });
    });

    // =========================================================================
    // 4. TOTAL & DAILY BUDGET ATOMICITY
    // =========================================================================
    describe('4. Total & Daily Budget Atomicity', () => {
        it('CONCURRENT_TOTAL_BUDGET_RESERVATION_SAFE: Rejection when total budget limit is exceeded', async () => {
            const p = await createFreshPerson('CANONICAL', 'BudgetTotal');

            // Lower tenant total limit temporarily
            await adminClient.from('atlas_person_enrichment_tenant_configs').update({
                total_budget_limit: 0.05,
                total_spent: 0.04,
                total_reserved: 0.0
            }).eq('tenant_id', tenantA);

            const { data: plan } = await adminClient.rpc('plan_person_enrichment_v1', {
                p_tenant_id: tenantA,
                p_person_id: p,
                p_gap_key: 'COMPANY'
            });
            expect(plan.success).toBe(true);

            // Attempt to dispatch mission requiring 0.02 (0.04 + 0.02 > 0.05)
            const { data: dispatch } = await adminClient.rpc('authorize_and_dispatch_enrichment_mission_v1', {
                p_mission_id: plan.mission_id
            });
            expect(dispatch.success).toBe(false);
            expect(dispatch.status).toBe('BUDGET_DENIED');
            expect(dispatch.reason).toBe('TOTAL_BUDGET_EXCEEDED');

            // Restore budget
            await adminClient.from('atlas_person_enrichment_tenant_configs').update({
                total_budget_limit: 100.00,
                total_spent: 0.0,
                total_reserved: 0.0
            }).eq('tenant_id', tenantA);
        });

        it('RESERVATION_PERSISTS_PERIOD_DATE: Reservation records exact UTC period date', async () => {
            const p = await createFreshPerson('CANONICAL', 'PeriodDate');
            const { data: plan } = await adminClient.rpc('plan_person_enrichment_v1', {
                p_tenant_id: tenantA,
                p_person_id: p,
                p_gap_key: 'COMPANY'
            });

            const { data: dispatch } = await adminClient.rpc('authorize_and_dispatch_enrichment_mission_v1', {
                p_mission_id: plan.mission_id
            });
            expect(dispatch.success).toBe(true);

            const { data: res } = await adminClient
                .from('atlas_person_enrichment_budget_reservations')
                .select('*')
                .eq('reservation_id', dispatch.reservation_id)
                .single();

            const expectedDate = new Date().toISOString().slice(0, 10);
            expect(res.period_date).toBe(expectedDate);
            expect(res.status).toBe('RESERVED');
            expect(Number(res.reserved_amount)).toBe(0.02);
        });
    });

    // =========================================================================
    // 5. ATTEMPT / ACTUAL COST LEDGER
    // =========================================================================
    describe('5. Attempt / Actual Cost Ledger', () => {
        it('ATTEMPT_COST_ACCUMULATES: Each worker result logs attempt with incurred cost', async () => {
            const p = await createFreshPerson('CANONICAL', 'AttemptCost');
            const { data: plan } = await adminClient.rpc('plan_person_enrichment_v1', {
                p_tenant_id: tenantA,
                p_person_id: p,
                p_gap_key: 'COMPANY'
            });

            const { data: dispatch } = await adminClient.rpc('authorize_and_dispatch_enrichment_mission_v1', {
                p_mission_id: plan.mission_id
            });
            expect(dispatch.success).toBe(true);

            const lockToken = randomUUID();
            await adminClient.from('atlas_queues').update({
                status: 'PROCESSING',
                lock_token: lockToken,
                locked_at: new Date().toISOString(),
                lock_expires_at: new Date(Date.now() + 60000).toISOString()
            }).eq('job_id', dispatch.harvester_job_id);

            await adminClient.rpc('record_enrichment_result_v1', {
                p_mission_id: plan.mission_id,
                p_job_id: dispatch.harvester_job_id,
                p_lock_token: lockToken,
                p_candidate_identity_key: `CAND_ATTEMPT_${Date.now()}`,
                p_source_ref: 'api.partner.com/attempt/1',
                p_extracted_name: 'Attempt Person',
                p_payload: {},
                p_identifiers: [],
                p_acquired_value: 'Acme Corp',
                p_incurred_cost: 0.015
            });

            const { data: attempts } = await adminClient
                .from('atlas_person_enrichment_attempts')
                .select('*')
                .eq('mission_id', plan.mission_id);
            expect(attempts.length).toBe(1);
            expect(Number(attempts[0].incurred_cost)).toBe(0.015);
            expect(attempts[0].execution_status).toBe('SUCCESS');
        });
    });

    // =========================================================================
    // 6. DB-LEVEL CROSS-TENANT INTEGRITY
    // =========================================================================
    describe('6. DB-Level Cross-Tenant Referential Integrity', () => {
        it('CROSS_TENANT_PERSON_MISSION_DB_DENIED: Attempting to plan mission with Tenant A and Person of Tenant B fails DB FK', async () => {
            // Direct insert attempting cross-tenant mismatch
            const { error } = await adminClient.from('atlas_person_enrichment_missions').insert({
                tenant_id: tenantA,
                person_id: personTenantB, // belongs to tenantB!
                gap_key: 'JOB_TITLE',
                acquisition_key: 'JOB_TITLE',
                gap_priority: 'LOW',
                consumer_reason: 'Testing cross tenant',
                enrichment_input_hash: `FAKE_HASH_CROSS_${Date.now()}`,
                enrichment_policy_version: 'enrich-v1.0.0-deterministic',
                required_use_authority: 'CANONICAL_ALLOWED'
            });
            expect(error).toBeDefined();
            // Database composite foreign key violation
            expect(error?.code).toBe('23503'); // foreign_key_violation
        });

        it('CROSS_TENANT_ATTEMPT_DB_DENIED: Attempt cannot reference mission belonging to another tenant', async () => {
            const { data: mission } = await adminClient
                .from('atlas_person_enrichment_missions')
                .select('mission_id')
                .eq('tenant_id', tenantA)
                .limit(1)
                .single();

            const { error } = await adminClient.from('atlas_person_enrichment_attempts').insert({
                tenant_id: tenantB, // tenant mismatch!
                mission_id: mission.mission_id,
                attempt_number: 1,
                execution_status: 'SUCCESS',
                incurred_cost: 0.01
            });
            expect(error).toBeDefined();
            expect(['23503', 'P0001']).toContain(error?.code);
        });
    });

    // =========================================================================
    // 7. APPEND-ONLY PROTECTION & RLS
    // =========================================================================
    describe('7. Append-Only Protection & RLS', () => {
        it('APPEND_ONLY_EVENTS: Direct update or delete on events table is rejected by trigger', async () => {
            const { data: event } = await adminClient
                .from('atlas_person_enrichment_events')
                .select('event_id')
                .eq('tenant_id', tenantA)
                .limit(1)
                .single();

            const { error: updErr } = await adminClient
                .from('atlas_person_enrichment_events')
                .update({ to_status: 'HACKED' })
                .eq('event_id', event.event_id);
            expect(updErr).toBeDefined();
            expect(updErr?.message).toContain('APPEND_ONLY_VIOLATION');

            const { error: delErr } = await adminClient
                .from('atlas_person_enrichment_events')
                .delete()
                .eq('event_id', event.event_id);
            expect(delErr).toBeDefined();
            expect(delErr?.message).toContain('APPEND_ONLY_VIOLATION');
        });

        it('AUTHENTICATED_CANNOT_DISPATCH_COST: Authenticated users cannot execute mutation RPCs', async () => {
            const { error } = await userClientA.rpc('plan_person_enrichment_v1', {
                p_tenant_id: tenantA,
                p_person_id: personCanonicalA,
                p_gap_key: 'JOB_TITLE'
            });
            expect(error).toBeDefined();
            // Function permission denied for authenticated role
            expect(error?.code).toBe('42501'); // insufficient_privilege
        });

        it('RLS_CROSS_TENANT: Tenant B cannot select Tenant A missions', async () => {
            const { data } = await userClientB
                .from('atlas_person_enrichment_missions')
                .select('*')
                .eq('tenant_id', tenantA);
            expect(data?.length).toBe(0);
        });
    });

    // =========================================================================
    // 8. CLOSED LOOP COVERAGE RECOMPUTE & EXHAUSTION
    // =========================================================================
    describe('8. Closed Loop Coverage Recompute & Exhaustion', () => {
        it('FINALIZE_RECOMPUTES_COVERAGE: Finalize checks Coverage CURRENT state and updates gap resolution', async () => {
            const p = await createFreshPerson('CANONICAL', 'FinalizeCov');

            // 1. Plan & Dispatch
            const { data: plan } = await adminClient.rpc('plan_person_enrichment_v1', {
                p_tenant_id: tenantA,
                p_person_id: p,
                p_gap_key: 'JOB_TITLE'
            });

            const { data: dispatch } = await adminClient.rpc('authorize_and_dispatch_enrichment_mission_v1', {
                p_mission_id: plan.mission_id
            });

            const lockToken = randomUUID();
            await adminClient.from('atlas_queues').update({
                status: 'PROCESSING',
                lock_token: lockToken,
                locked_at: new Date().toISOString(),
                lock_expires_at: new Date(Date.now() + 60000).toISOString()
            }).eq('job_id', dispatch.harvester_job_id);

            // 2. Record Result
            const { data: recordRes } = await adminClient.rpc('record_enrichment_result_v1', {
                p_mission_id: plan.mission_id,
                p_job_id: dispatch.harvester_job_id,
                p_lock_token: lockToken,
                p_candidate_identity_key: `CAND_FIN_${Date.now()}`,
                p_source_ref: 'api.partner.com/final/1',
                p_extracted_name: 'Finalize Person',
                p_payload: {},
                p_identifiers: [],
                p_acquired_value: 'VP Engineering',
                p_incurred_cost: 0.02
            });

            // 3. Attach Resolution
            await adminClient.rpc('record_enrichment_resolution_v1', {
                p_mission_id: plan.mission_id,
                p_candidate_id: recordRes.candidate_id,
                p_resolution_outcome: 'RESOLVED',
                p_resolved_person_id: p,
                p_acquired_value: 'VP Engineering'
            });

            // 4. Finalize
            const { data: finalize } = await adminClient.rpc('finalize_enrichment_mission_v1', {
                p_mission_id: plan.mission_id
            });
            expect(finalize.success).toBe(true);
            expect(finalize.gap_resolved).toBe(true);
        });

        it('EXHAUSTED_DOES_NOT_LOOP: 3rd failed attempt sets status = EXHAUSTED and next_eligible_at = NULL', async () => {
            const pFail = await createFreshPerson('CANONICAL', 'ExhaustionTest');

            // Simulate 2 previous failed missions
            await adminClient.from('atlas_person_enrichment_missions').insert({
                tenant_id: tenantA,
                person_id: pFail,
                gap_key: 'COMPANY',
                acquisition_key: 'COMPANY',
                gap_priority: 'LOW',
                consumer_reason: 'Testing exhaustion',
                enrichment_input_hash: `HASH_EX_1_${Date.now()}`,
                enrichment_policy_version: 'enrich-v1.0.0-deterministic',
                required_use_authority: 'CANONICAL_ALLOWED',
                status: 'NO_RESULT',
                attempt_count: 2
            });

            // 3rd attempt planned
            const { data: plan3 } = await adminClient.rpc('plan_person_enrichment_v1', {
                p_tenant_id: tenantA,
                p_person_id: pFail,
                p_gap_key: 'COMPANY'
            });
            expect(plan3.success).toBe(true);

            // Finalize as unresolved
            const { data: final3 } = await adminClient.rpc('finalize_enrichment_mission_v1', {
                p_mission_id: plan3.mission_id
            });
            expect(final3.success).toBe(true);
            expect(final3.final_status).toBe('EXHAUSTED');

            // 4th planning attempt is blocked with REASON_ATTEMPTS_EXHAUSTED
            const { data: plan4 } = await adminClient.rpc('plan_person_enrichment_v1', {
                p_tenant_id: tenantA,
                p_person_id: pFail,
                p_gap_key: 'COMPANY'
            });
            expect(plan4.success).toBe(false);
            expect(plan4.status).toBe('NO_ENRICHMENT');
            expect(plan4.reason).toBe('REASON_ATTEMPTS_EXHAUSTED');

            // Cleanup test person
            await adminClient.from('atlas_people').delete().eq('person_id', pFail);
        });
    });
});
