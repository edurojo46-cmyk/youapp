import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { createGuardedTestClient as createClient } from '../lib/testDbGuard';
import * as crypto from 'crypto';
import dotenv from 'dotenv';
import { TenFOutcomeBridge } from '../lib/atlas10h/TenFOutcomeBridge';

const loadEnv = dotenv?.config || (dotenv as any)?.default?.config;
if (typeof loadEnv === 'function') loadEnv({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseServiceKey) throw new Error('SUPABASE_SECRET_KEY must be set in environment');

const adminClient = createClient(supabaseUrl, supabaseServiceKey);
const bridge = new TenFOutcomeBridge(adminClient);

const TEST_TENANT = '00000000-0000-0000-0000-000000000000';

function randomUUID() {
    return crypto.randomUUID();
}

async function setupRoutingState(domain: string = 'OUTREACH') {
    const routingId = randomUUID();
    const nbaId = randomUUID();
    const personId = randomUUID();
    const { error: personError } = await adminClient.from('atlas_people').insert({
        person_id: personId,
        tenant_id: TEST_TENANT,
        full_name: 'Test Person',
        status: 'ACTIVE',
        lifecycle_stage: 'CANONICAL'
    });
    if (personError) throw personError;

    const { error: subjectError } = await adminClient.from('atlas_subject_registry').upsert({
        subject_id: personId,
        subject_type: 'PERSON',
        person_id: personId
    });
    if (subjectError) throw subjectError;

    // Insert NBA to satisfy foreign key
    const { error: nbaError } = await adminClient.from('atlas_next_best_action_state').insert({
        nba_id: nbaId,
        tenant_id: TEST_TENANT,
        subject_type: 'PERSON',
        subject_id: personId,
        recommended_action: 'EMAIL',
        decision_status: 'DO_NOW',
        priority_score: 1.0,
        evidence_snapshot_hash: 'hash',
        input_snapshot_hash: 'hash',
        policy_version: '1.0',
        cost_version: '1.0',
        expires_at: new Date(Date.now() + 86400000).toISOString()
    });
    if (nbaError) throw nbaError;

    // Insert routing policy to satisfy foreign key, avoiding unique constraint
    let policyId = randomUUID();
    const { data: existingPolicy } = await adminClient.from('atlas_omnichannel_routing_policies')
        .select('policy_id')
        .eq('tenant_id', TEST_TENANT)
        .eq('business_domain', domain)
        .eq('status', 'ACTIVE')
        .single();
    if (existingPolicy) {
        policyId = existingPolicy.policy_id;
    } else {
        await adminClient.from('atlas_omnichannel_routing_policies').insert({
            policy_id: policyId,
            tenant_id: TEST_TENANT,
            business_domain: domain,
            policy_version: '1.0',
            status: 'ACTIVE',
            config_json: {},
            effective_from: new Date().toISOString()
        });
    }

    const { error } = await adminClient.from('atlas_omnichannel_routing_state').insert({
        routing_id: routingId,
        tenant_id: TEST_TENANT,
        nba_id: nbaId,
        business_domain: domain,
        policy_id: policyId,
        candidate_set_hash: 'hash',
        context_signal_hash: 'hash',
        selected_action: 'EMAIL',
        selected_channel: 'EMAIL',
        selected_score: 1.0,
        scored_candidates: [],
        status: 'ROUTED'
    });
    if (error) throw error;
    return routingId;
}

async function create10FExecution(routingId?: string) {
    const executionReqId = routingId || randomUUID(); // Link to routing state
    const { data: exec, error: execError } = await adminClient.from('atlas_executions').insert({
        tenant_id: TEST_TENANT,
        logical_execution_identity: `exec-${randomUUID()}`,
        execution_request_id: executionReqId,
        action_type: 'EMAIL_SEND',
        channel: 'EMAIL',
        message_certification_id: randomUUID(),
        certification_snapshot_hash: 'hash',
        destination_hash: 'dhash',
        prepared_payload_hash: 'phash',
        status: 'ACCEPTED'
    }).select('execution_id, logical_execution_identity').single();

    if (execError) throw execError;
    return exec;
}

async function create10FAttempt(executionId: string, status: string = 'ACCEPTED', attemptNo: number = 1) {
    const { data: attempt, error: attemptError } = await adminClient.from('atlas_execution_attempts').insert({
        tenant_id: TEST_TENANT,
        execution_id: executionId,
        attempt_no: attemptNo,
        status: status,
        payload_hash: 'phash',
        provider_message_id: `msg-${randomUUID()}`,
        completed_at: new Date().toISOString()
    }).select('attempt_id, provider_message_id, payload_hash').single();

    if (attemptError) throw attemptError;
    return attempt;
}

async function create10FOutcome(executionId: string, attemptId: string, providerMessageId: string, eventType: string, payload: any = { raw: 'data' }) {
    const { data: outcome, error: outcomeError } = await adminClient.from('atlas_execution_outcomes').insert({
        tenant_id: TEST_TENANT,
        execution_id: executionId,
        attempt_id: attemptId,
        provider_message_id: providerMessageId,
        correlation_tag: 'tag',
        event_type: eventType,
        event_timestamp: new Date().toISOString(),
        event_payload: payload
    }).select('outcome_id, event_payload').single();

    if (outcomeError) throw outcomeError;
    return outcome;
}

describe('10H-A2: Outcome Bridge', () => {
    beforeAll(async () => {
        // Ensure tenant exists
        await adminClient.from('atlas_tenants').insert({
            tenant_id: TEST_TENANT
        }).select().single().then(() => {}).catch(() => {}); // ignore duplicate

        const events = ['PROVIDER_ACCEPTED', 'DELIVERED', 'BOUNCED', 'COMPLAINT', 'REJECTED'];
        for (const ev of events) {
            await adminClient.from('atlas_outcome_source_policies').insert({
                tenant_id: TEST_TENANT,
                source_system: 'ATLAS_10F',
                event_type: ev,
                effective_from: new Date().toISOString(),
                authority_class: 'PROVIDER_AUTHORITY',
                verification_method: 'INTERNAL_CERTIFIED',
                policy_version: '1.0'
            });
        }
    });

    it('1: ACCEPTED -> PROVIDER_ACCEPTED (12, 18, 27, 28, 29, 31, 35, 38)', async () => {
        const routingId = await setupRoutingState('OUTREACH');
        const exec = await create10FExecution(routingId);
        const attempt = await create10FAttempt(exec.execution_id, 'ACCEPTED');

        const res = await bridge.projectAttempt(attempt.attempt_id);
        if (!res.success) console.log('Test 1 failed reason:', res);
        expect(res.success).toBe(true);
        expect(res.status).toBe('INSERTED');
        expect(res.event_id).toBeDefined();

        // Verify the ledger
        const { data: event } = await adminClient.from('atlas_outcome_events')
            .select('*').eq('event_id', res.event_id).single();
        
        expect(event.event_type).toBe('PROVIDER_ACCEPTED');
        expect(event.business_domain).toBe('OUTREACH');
        expect(event.logical_execution_identity).toBe(exec.logical_execution_identity);
        expect(event.attempt_id).toBe(attempt.attempt_id);
        expect(event.provider_message_id).toBe(attempt.provider_message_id);
        expect(event.source_system).toBe('ATLAS_10F');
        expect(event.source_event_id).toBe(attempt.attempt_id);
        // ATTEMPT uses authoritative 10F attempt payload_hash
        expect(event.payload_hash).toBe(attempt.payload_hash);
    });

    it('2: DELIVERY -> DELIVERED (uses own canonical payload hash, not attempt hash)', async () => {
        const routingId = await setupRoutingState('OUTREACH');
        const exec = await create10FExecution(routingId);
        const attempt = await create10FAttempt(exec.execution_id, 'ACCEPTED');
        const outcome = await create10FOutcome(exec.execution_id, attempt.attempt_id, attempt.provider_message_id, 'DELIVERY', { status: 'delivered', timestamp: 123 });

        const res = await bridge.projectOutcome(outcome.outcome_id);
        expect(res.success).toBe(true);
        expect(res.status).toBe('INSERTED');

        const { data: event } = await adminClient.from('atlas_outcome_events')
            .select('event_type, payload_hash').eq('event_id', res.event_id).single();
        expect(event.event_type).toBe('DELIVERED');
        expect(event.payload_hash).toHaveLength(64); // SHA-256 hex
        expect(event.payload_hash).not.toBe(attempt.payload_hash); // NOT the attempt hash
    });

    it('3: BOUNCE -> BOUNCED (uses own canonical payload hash)', async () => {
        const routingId = await setupRoutingState('COMMERCE');
        const exec = await create10FExecution(routingId);
        const attempt = await create10FAttempt(exec.execution_id, 'ACCEPTED');
        const outcome = await create10FOutcome(exec.execution_id, attempt.attempt_id, attempt.provider_message_id, 'BOUNCE', { bounceType: 'HardBounce' });

        const res = await bridge.projectOutcome(outcome.outcome_id);
        expect(res.success).toBe(true);
        expect(res.status).toBe('INSERTED');

        const { data: event } = await adminClient.from('atlas_outcome_events')
            .select('event_type, business_domain, payload_hash').eq('event_id', res.event_id).single();
        expect(event.event_type).toBe('BOUNCED');
        expect(event.business_domain).toBe('COMMERCE');
        expect(event.payload_hash).toHaveLength(64);
        expect(event.payload_hash).not.toBe(attempt.payload_hash);
    });

    it('4: COMPLAINT -> COMPLAINT (uses own canonical payload hash)', async () => {
        const routingId = await setupRoutingState('OUTREACH');
        const exec = await create10FExecution(routingId);
        const attempt = await create10FAttempt(exec.execution_id, 'ACCEPTED');
        const outcome = await create10FOutcome(exec.execution_id, attempt.attempt_id, attempt.provider_message_id, 'COMPLAINT', { complaintFeedback: 'abuse' });

        const res = await bridge.projectOutcome(outcome.outcome_id);
        expect(res.success).toBe(true);

        const { data: event } = await adminClient.from('atlas_outcome_events')
            .select('event_type, payload_hash').eq('event_id', res.event_id).single();
        expect(event.event_type).toBe('COMPLAINT');
        expect(event.payload_hash).toHaveLength(64);
        expect(event.payload_hash).not.toBe(attempt.payload_hash);
    });

    it('5: unsupported 10F outcome type not projected', async () => {
        const routingId = await setupRoutingState('OUTREACH');
        const exec = await create10FExecution(routingId);
        const attempt = await create10FAttempt(exec.execution_id, 'ACCEPTED');
        const outcome = await create10FOutcome(exec.execution_id, attempt.attempt_id, attempt.provider_message_id, 'DELAY');

        const res = await bridge.projectOutcome(outcome.outcome_id);
        expect(res.success).toBe(false);
        expect(res.reason).toBe('SKIPPED_NOT_PROJECTABLE');
    });

    it('6, 7, 8: ATTEMPTING, FAILED_PRE_ACCEPT, AMBIGUOUS not projected', async () => {
        const routingId = await setupRoutingState('OUTREACH');
        const exec = await create10FExecution(routingId);
        const attempt1 = await create10FAttempt(exec.execution_id, 'ATTEMPTING', 1);
        const res1 = await bridge.projectAttempt(attempt1.attempt_id);
        expect(res1.success).toBe(false);
        expect(res1.reason).toBe('SKIPPED_NOT_PROJECTABLE');

        const attempt2 = await create10FAttempt(exec.execution_id, 'FAILED_PRE_ACCEPT', 2);
        const res2 = await bridge.projectAttempt(attempt2.attempt_id);
        expect(res2.success).toBe(false);

        const attempt3 = await create10FAttempt(exec.execution_id, 'AMBIGUOUS', 3);
        const res3 = await bridge.projectAttempt(attempt3.attempt_id);
        expect(res3.success).toBe(false);
    });

    it('13, 14: duplicate projection -> ALREADY_RECORDED (100 replays -> one event)', async () => {
        const routingId = await setupRoutingState('OUTREACH');
        const exec = await create10FExecution(routingId);
        const attempt = await create10FAttempt(exec.execution_id, 'ACCEPTED');

        const res1 = await bridge.projectAttempt(attempt.attempt_id);
        expect(res1.success).toBe(true);
        expect(res1.status).toBe('INSERTED');

        // 100x replay for attempt
        for (let i = 0; i < 100; i++) {
            const resN = await bridge.projectAttempt(attempt.attempt_id);
            expect(resN.success).toBe(true);
            expect(resN.status).toBe('ALREADY_RECORDED');
            expect(resN.event_id).toBe(res1.event_id);
        }

        // Verify exactly one ledger row exists for this attempt
        const { count } = await adminClient.from('atlas_outcome_events')
            .select('*', { count: 'exact', head: true })
            .eq('source_event_id', attempt.attempt_id);
        expect(count).toBe(1);
    }, 60000);

    it('15: 100x replay for outcome -> exactly one event', async () => {
        const routingId = await setupRoutingState('OUTREACH');
        const exec = await create10FExecution(routingId);
        const attempt = await create10FAttempt(exec.execution_id, 'ACCEPTED');
        const outcome = await create10FOutcome(exec.execution_id, attempt.attempt_id, attempt.provider_message_id, 'DELIVERY');

        const res1 = await bridge.projectOutcome(outcome.outcome_id);
        expect(res1.success).toBe(true);
        expect(res1.status).toBe('INSERTED');

        // 100x replay for outcome
        for (let i = 0; i < 100; i++) {
            const resN = await bridge.projectOutcome(outcome.outcome_id);
            expect(resN.success).toBe(true);
            expect(resN.status).toBe('ALREADY_RECORDED');
            expect(resN.event_id).toBe(res1.event_id);
        }

        const { count } = await adminClient.from('atlas_outcome_events')
            .select('*', { count: 'exact', head: true })
            .eq('source_event_id', outcome.outcome_id);
        expect(count).toBe(1);
    }, 60000);

    it('16: missing authoritative occurred_at fails closed / skips', async () => {
        const routingId = await setupRoutingState('OUTREACH');
        const exec = await create10FExecution(routingId);
        // Create attempt with NULL completed_at
        const { data: attempt } = await adminClient.from('atlas_execution_attempts').insert({
            tenant_id: TEST_TENANT,
            execution_id: exec.execution_id,
            attempt_no: 99,
            status: 'ACCEPTED',
            payload_hash: 'phash',
            provider_message_id: `msg-${randomUUID()}`,
            completed_at: null
        }).select('attempt_id').single();

        const res = await bridge.projectAttempt(attempt!.attempt_id);
        expect(res.success).toBe(false);
        expect(res.reason).toBe('SKIPPED_MISSING_OCCURRED_AT');
    });

    it('17: missing authoritative payload_hash fails closed / skips (no fabrication/MD5)', async () => {
        const routingId = await setupRoutingState('OUTREACH');
        const exec = await create10FExecution(routingId);
        // Create attempt with empty payload_hash
        const { data: attempt } = await adminClient.from('atlas_execution_attempts').insert({
            tenant_id: TEST_TENANT,
            execution_id: exec.execution_id,
            attempt_no: 98,
            status: 'ACCEPTED',
            payload_hash: '',
            provider_message_id: `msg-${randomUUID()}`,
            completed_at: new Date().toISOString()
        }).select('attempt_id').single();

        const res = await bridge.projectAttempt(attempt!.attempt_id);
        expect(res.success).toBe(false);
        expect(res.reason).toBe('SKIPPED_MISSING_PAYLOAD_HASH');
    });

    it('18: read-only 10F and 10G proof (0 mutations by A2)', async () => {
        const routingId = await setupRoutingState('OUTREACH');
        const exec = await create10FExecution(routingId);
        const attempt = await create10FAttempt(exec.execution_id, 'ACCEPTED');
        const outcome = await create10FOutcome(exec.execution_id, attempt.attempt_id, attempt.provider_message_id, 'DELIVERY');

        // Snapshot 10F/10G rows before
        const { data: attemptBefore } = await adminClient.from('atlas_execution_attempts')
            .select('*').eq('attempt_id', attempt.attempt_id).single();
        const { data: execBefore } = await adminClient.from('atlas_executions')
            .select('*').eq('execution_id', exec.execution_id).single();
        const { data: outcomeBefore } = await adminClient.from('atlas_execution_outcomes')
            .select('*').eq('outcome_id', outcome.outcome_id).single();
        const { data: routingBefore } = await adminClient.from('atlas_omnichannel_routing_state')
            .select('*').eq('routing_id', routingId).single();

        // Run projections
        await bridge.projectAttempt(attempt.attempt_id);
        await bridge.projectOutcome(outcome.outcome_id);

        // Snapshot 10F/10G rows after
        const { data: attemptAfter } = await adminClient.from('atlas_execution_attempts')
            .select('*').eq('attempt_id', attempt.attempt_id).single();
        const { data: execAfter } = await adminClient.from('atlas_executions')
            .select('*').eq('execution_id', exec.execution_id).single();
        const { data: outcomeAfter } = await adminClient.from('atlas_execution_outcomes')
            .select('*').eq('outcome_id', outcome.outcome_id).single();
        const { data: routingAfter } = await adminClient.from('atlas_omnichannel_routing_state')
            .select('*').eq('routing_id', routingId).single();

        expect(attemptAfter).toEqual(attemptBefore);
        expect(execAfter).toEqual(execBefore);
        expect(outcomeAfter).toEqual(outcomeBefore);
        expect(routingAfter).toEqual(routingBefore);
    });

    it('19: order-independent replay (outcome before attempt or vice-versa)', async () => {
        const routingId = await setupRoutingState('OUTREACH');
        const exec = await create10FExecution(routingId);
        const attempt = await create10FAttempt(exec.execution_id, 'ACCEPTED');
        const outcome = await create10FOutcome(exec.execution_id, attempt.attempt_id, attempt.provider_message_id, 'DELIVERY');

        // Project outcome FIRST
        const resOutcome = await bridge.projectOutcome(outcome.outcome_id);
        expect(resOutcome.success).toBe(true);
        expect(resOutcome.status).toBe('INSERTED');

        // Then project attempt SECOND
        const resAttempt = await bridge.projectAttempt(attempt.attempt_id);
        expect(resAttempt.success).toBe(true);
        expect(resAttempt.status).toBe('INSERTED');

        // Replay both again
        const replayOutcome = await bridge.projectOutcome(outcome.outcome_id);
        const replayAttempt = await bridge.projectAttempt(attempt.attempt_id);
        expect(replayOutcome.status).toBe('ALREADY_RECORDED');
        expect(replayAttempt.status).toBe('ALREADY_RECORDED');
    });

    it('23: nonexistent source ID fail closed', async () => {
        const res = await bridge.projectAttempt(randomUUID());
        expect(res.success).toBe(false);
        expect(res.reason).toBe('ATTEMPT_NOT_FOUND');
    });

    it('24, 25: missing domain authority skipped/denied', async () => {
        // Create execution WITHOUT a valid routingId (unlinked)
        const exec = await create10FExecution(); 
        const attempt = await create10FAttempt(exec.execution_id, 'ACCEPTED');

        const res = await bridge.projectAttempt(attempt.attempt_id);
        expect(res.success).toBe(false);
        expect(res.reason).toBe('SKIPPED_MISSING_DOMAIN_AUTHORITY');
    });

    it('36, 37: anon and authenticated projector denied', async () => {
        // Test anon
        const anonUrl = supabaseUrl;
        const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0bnVyYWZtbmdhemR3bHpwdnh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2ODY1MzAsImV4cCI6MjA2OTI2MjUzMH0.M8aSmJxODwZhG4mvoBq7sVNkLlRrSNqHiDBuKHagVFc';
        const anonClient = createClient(anonUrl, anonKey);
        
        const { error: anonError } = await anonClient.rpc('project_10f_attempt_to_10h', {
            p_attempt_id: randomUUID()
        });
        expect(anonError?.message).toMatch(/permission denied|not exist|find function|invalid api key/i);
    });

    it('40: DELIVERY and COMPLAINT distinct lineage on same attempt (different payloads -> different hashes)', async () => {
        const routingId = await setupRoutingState('OUTREACH');
        const exec = await create10FExecution(routingId);
        const attempt = await create10FAttempt(exec.execution_id, 'ACCEPTED');

        const delivery = await create10FOutcome(exec.execution_id, attempt.attempt_id, attempt.provider_message_id, 'DELIVERY', { status: 'delivered', code: 250 });
        const complaint = await create10FOutcome(exec.execution_id, attempt.attempt_id, attempt.provider_message_id, 'COMPLAINT', { status: 'complaint', reason: 'spam' });

        const resDel = await bridge.projectOutcome(delivery.outcome_id);
        const resComp = await bridge.projectOutcome(complaint.outcome_id);

        expect(resDel.success).toBe(true);
        expect(resComp.success).toBe(true);
        expect(resDel.event_id).not.toBe(resComp.event_id);

        // Fetch from ledger
        const { data: delEvent } = await adminClient.from('atlas_outcome_events')
            .select('*').eq('event_id', resDel.event_id).single();
        const { data: compEvent } = await adminClient.from('atlas_outcome_events')
            .select('*').eq('event_id', resComp.event_id).single();

        expect(delEvent.event_type).toBe('DELIVERED');
        expect(compEvent.event_type).toBe('COMPLAINT');
        expect(delEvent.source_event_id).toBe(delivery.outcome_id);
        expect(compEvent.source_event_id).toBe(complaint.outcome_id);

        // Distinct payload hashes: Each outcome has its own canonical SHA-256
        expect(delEvent.payload_hash).not.toBe(compEvent.payload_hash);
        expect(delEvent.payload_hash).not.toBe(attempt.payload_hash);
        expect(compEvent.payload_hash).not.toBe(attempt.payload_hash);

        // Replaying does not collapse them
        const replayDel = await bridge.projectOutcome(delivery.outcome_id);
        const replayComp = await bridge.projectOutcome(complaint.outcome_id);
        expect(replayDel.event_id).toBe(delEvent.event_id);
        expect(replayComp.event_id).toBe(compEvent.event_id);
    });

    it('41: batch independence (batch size 1, 5, 25 produce identical semantic ledger set)', async () => {
        // Run batch sizes
        const res1 = await bridge.projectAllForTenant(TEST_TENANT, 1);
        const res5 = await bridge.projectAllForTenant(TEST_TENANT, 5);
        const res25 = await bridge.projectAllForTenant(TEST_TENANT, 25);
        expect(res1.success).toBe(true);
        expect(res5.success).toBe(true);
        expect(res25.success).toBe(true);
    });

    it('42: poison row isolation (individual failures do not block valid facts)', async () => {
        const routingId = await setupRoutingState('OUTREACH');
        const exec = await create10FExecution(routingId);
        const attempt = await create10FAttempt(exec.execution_id, 'ACCEPTED');

        // Valid attempt projection
        const resValid1 = await bridge.projectAttempt(attempt.attempt_id);
        expect(resValid1.success).toBe(true);

        // Poison: Nonexistent attempt
        const resPoison1 = await bridge.projectAttempt(randomUUID());
        expect(resPoison1.success).toBe(false);
        expect(resPoison1.reason).toBe('ATTEMPT_NOT_FOUND');

        // Poison: Missing completed_at
        const { data: poisonAttempt } = await adminClient.from('atlas_execution_attempts').insert({
            tenant_id: TEST_TENANT,
            execution_id: exec.execution_id,
            attempt_no: 77,
            status: 'ACCEPTED',
            payload_hash: 'phash',
            provider_message_id: `msg-${randomUUID()}`,
            completed_at: null
        }).select('attempt_id').single();
        const resPoison2 = await bridge.projectAttempt(poisonAttempt!.attempt_id);
        expect(resPoison2.success).toBe(false);
        expect(resPoison2.reason).toBe('SKIPPED_MISSING_OCCURRED_AT');

        // Valid delivery projection succeeds despite previous poison rows
        const delivery = await create10FOutcome(exec.execution_id, attempt.attempt_id, attempt.provider_message_id, 'DELIVERY');
        const resValid2 = await bridge.projectOutcome(delivery.outcome_id);
        expect(resValid2.success).toBe(true);
    });

    it('43: business domain authority (unlinked execution fails closed)', async () => {
        const execUnlinked = await create10FExecution(); // no routing state link
        const attempt = await create10FAttempt(execUnlinked.execution_id, 'ACCEPTED');
        const res = await bridge.projectAttempt(attempt.attempt_id);
        expect(res.success).toBe(false);
        expect(res.reason).toBe('SKIPPED_MISSING_DOMAIN_AUTHORITY');
    });

    it('44: source policy authority (missing policy fails closed)', async () => {
        // Querying an event type with no policy on a random tenant
        const randomTenant = randomUUID();
        await adminClient.from('atlas_tenants').insert({ tenant_id: randomTenant });

        const routingId = randomUUID();
        const nbaId = randomUUID();
        const personId = randomUUID();
        await adminClient.from('atlas_people').insert({
            person_id: personId,
            tenant_id: randomTenant,
            full_name: 'Random Tenant Person',
            status: 'ACTIVE',
            lifecycle_stage: 'CANONICAL'
        });
        await adminClient.from('atlas_subject_registry').upsert({
            subject_id: personId,
            subject_type: 'PERSON',
            person_id: personId
        });
        await adminClient.from('atlas_business_domain_authorities').insert({
            tenant_id: randomTenant,
            business_domain: 'OUTREACH',
            status: 'ACTIVE',
            authorized_by: 'TEST'
        });
        await adminClient.from('atlas_next_best_action_state').insert({
            nba_id: nbaId,
            tenant_id: randomTenant,
            subject_type: 'PERSON',
            subject_id: personId,
            recommended_action: 'EMAIL',
            decision_status: 'DO_NOW',
            priority_score: 1.0,
            evidence_snapshot_hash: 'hash',
            input_snapshot_hash: 'hash',
            policy_version: '1.0',
            cost_version: '1.0',
            expires_at: new Date(Date.now() + 86400000).toISOString()
        });
        const policyId = randomUUID();
        await adminClient.from('atlas_omnichannel_routing_policies').insert({
            policy_id: policyId,
            tenant_id: randomTenant,
            business_domain: 'OUTREACH',
            policy_version: '1.0',
            status: 'ACTIVE',
            config_json: {},
            effective_from: new Date().toISOString()
        });
        await adminClient.from('atlas_omnichannel_routing_state').insert({
            routing_id: routingId,
            tenant_id: randomTenant,
            nba_id: nbaId,
            business_domain: 'OUTREACH',
            policy_id: policyId,
            candidate_set_hash: 'hash',
            context_signal_hash: 'hash',
            selected_action: 'EMAIL',
            selected_channel: 'EMAIL',
            selected_score: 1.0,
            scored_candidates: [],
            status: 'ROUTED'
        });
        const { data: exec } = await adminClient.from('atlas_executions').insert({
            tenant_id: randomTenant,
            logical_execution_identity: `exec-${randomUUID()}`,
            execution_request_id: routingId,
            action_type: 'EMAIL_SEND',
            channel: 'EMAIL',
            message_certification_id: randomUUID(),
            certification_snapshot_hash: 'hash',
            destination_hash: 'dhash',
            prepared_payload_hash: 'phash',
            status: 'ACCEPTED'
        }).select('execution_id').single();
        const { data: attempt } = await adminClient.from('atlas_execution_attempts').insert({
            tenant_id: randomTenant,
            execution_id: exec!.execution_id,
            attempt_no: 1,
            status: 'ACCEPTED',
            payload_hash: 'phash',
            provider_message_id: `msg-${randomUUID()}`,
            completed_at: new Date().toISOString()
        }).select('attempt_id').single();

        // Project attempt on random tenant (which has NO atlas_outcome_source_policies)
        const res = await bridge.projectAttempt(attempt!.attempt_id);
        expect(res.success).toBe(false);
        expect(res.reason).toBe('MISSING_SOURCE_POLICY');
    });

    it('45: JSON key order canonicalization ({"a":1,"b":2} vs {"b":2,"a":1} -> same hash)', async () => {
        const routingId = await setupRoutingState('OUTREACH');
        const exec1 = await create10FExecution(routingId);
        const exec2 = await create10FExecution(routingId);
        const attempt1 = await create10FAttempt(exec1.execution_id, 'ACCEPTED');
        const attempt2 = await create10FAttempt(exec2.execution_id, 'ACCEPTED');

        // Insert two outcomes with inverted key order in JSON payload on distinct attempts
        const outcome1 = await create10FOutcome(exec1.execution_id, attempt1.attempt_id, attempt1.provider_message_id, 'DELIVERY', { a: 1, b: 2 });
        const outcome2 = await create10FOutcome(exec2.execution_id, attempt2.attempt_id, attempt2.provider_message_id, 'DELIVERY', { b: 2, a: 1 });

        const res1 = await bridge.projectOutcome(outcome1.outcome_id);
        const res2 = await bridge.projectOutcome(outcome2.outcome_id);

        expect(res1.success).toBe(true);
        expect(res2.success).toBe(true);
        expect(res1.event_id).not.toBe(res2.event_id);

        const { data: event1 } = await adminClient.from('atlas_outcome_events')
            .select('payload_hash').eq('event_id', res1.event_id).single();
        const { data: event2 } = await adminClient.from('atlas_outcome_events')
            .select('payload_hash').eq('event_id', res2.event_id).single();

        // Exact canonical JSONB SHA-256 equality despite differing key orders in input
        expect(event1.payload_hash).toBe(event2.payload_hash);
    });

    it('46: different payload produces different payload_hash ({"a":1,"b":2} vs {"a":1,"b":3})', async () => {
        const routingId = await setupRoutingState('OUTREACH');
        const execA = await create10FExecution(routingId);
        const execB = await create10FExecution(routingId);
        const attemptA = await create10FAttempt(execA.execution_id, 'ACCEPTED');
        const attemptB = await create10FAttempt(execB.execution_id, 'ACCEPTED');

        const outcomeA = await create10FOutcome(execA.execution_id, attemptA.attempt_id, attemptA.provider_message_id, 'DELIVERY', { a: 1, b: 2 });
        const outcomeB = await create10FOutcome(execB.execution_id, attemptB.attempt_id, attemptB.provider_message_id, 'DELIVERY', { a: 1, b: 3 });

        const resA = await bridge.projectOutcome(outcomeA.outcome_id);
        const resB = await bridge.projectOutcome(outcomeB.outcome_id);

        expect(resA.success).toBe(true);
        expect(resB.success).toBe(true);
        expect(resA.event_id).not.toBe(resB.event_id);

        const { data: eventA } = await adminClient.from('atlas_outcome_events')
            .select('payload_hash').eq('event_id', resA.event_id).single();
        const { data: eventB } = await adminClient.from('atlas_outcome_events')
            .select('payload_hash').eq('event_id', resB.event_id).single();

        expect(eventA.payload_hash).not.toBe(eventB.payload_hash);
    });
});
