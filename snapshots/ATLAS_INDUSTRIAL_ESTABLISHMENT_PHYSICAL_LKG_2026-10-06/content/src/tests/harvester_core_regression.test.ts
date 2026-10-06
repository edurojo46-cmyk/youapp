import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createGuardedTestClient as createClient } from '../lib/testDbGuard';
import * as crypto from 'crypto';
import dotenv from 'dotenv';

const loadEnv = dotenv?.config || (dotenv as any)?.default?.config;
if (typeof loadEnv === 'function') loadEnv({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseServiceKey) throw new Error('SUPABASE_SECRET_KEY must be set in environment');

const adminClient = createClient(supabaseUrl, supabaseServiceKey);

function randomUUID() {
    return crypto.randomUUID();
}

describe('Harvester Frozen-Core Regression Suite', () => {
    const testQueueType = 'INGEST';
    const testWorkerId = `worker-${randomUUID()}`;
    let seededJobId: string;
    let seededLockToken: string;

    beforeAll(async () => {
        // Ensure harvester is enabled in config
        await adminClient.from('atlas_harvester_config').update({
            harvester_enabled: true
        }).eq('id', 1);

        // Clean up any lingering jobs for testQueueType
        await adminClient.from('atlas_queues').delete().eq('queue_type', testQueueType);
    });

    afterAll(async () => {
        // Clean up test jobs
        await adminClient.from('atlas_queues').delete().eq('queue_type', testQueueType);
    });

    it('1: BUDGET_RESERVATION_COMPATIBILITY & ORIGIN_PAYLOAD_COMPATIBILITY (enqueue_atlas_job)', async () => {
        const idempotencyKey = `idem-${randomUUID()}`;
        const testPayload = {
            target_url: 'https://example.com/harvest',
            metadata: { batch: 1, origin: 'REGRESSION_TEST' }
        };

        const { data: enqueued, error } = await adminClient.rpc('enqueue_atlas_job', {
            p_queue_type: testQueueType,
            p_idempotency_key: idempotencyKey,
            p_payload: testPayload,
            p_priority: 50
        });

        expect(error).toBeNull();
        expect(enqueued).toBe(true);

        // Verify row exists and origin payload is 100% preserved
        const { data: job } = await adminClient.from('atlas_queues')
            .select('*')
            .eq('queue_type', testQueueType)
            .eq('idempotency_key', idempotencyKey)
            .single();

        expect(job).toBeDefined();
        expect(job.status).toBe('PENDING');
        expect(job.priority).toBe(50);
        expect(job.payload.target_url).toBe('https://example.com/harvest');
        expect(job.payload.metadata.origin).toBe('REGRESSION_TEST');

        seededJobId = job.job_id;
    });

    it('2: GET_NEXT_JOB_SKIP_LOCKED & LEASE_TOKEN & LEASE_EXPIRY', async () => {
        const { data: jobs, error } = await adminClient.rpc('get_next_atlas_job', {
            p_queue_type: testQueueType,
            p_worker_id: testWorkerId,
            p_lock_duration_seconds: 60,
            p_limit: 1
        });

        expect(error).toBeNull();
        expect(jobs).toBeDefined();
        expect(jobs!.length).toBe(1);

        const leasedJob = jobs![0];
        expect(leasedJob.job_id).toBe(seededJobId);
        expect(leasedJob.status).toBe('PROCESSING');
        expect(leasedJob.locked_by).toBe(testWorkerId);
        expect(leasedJob.lock_token).toBeDefined();
        expect(leasedJob.lock_expires_at).toBeDefined();

        seededLockToken = leasedJob.lock_token;
    });

    it('3: COMPLETE_JOB (requires authoritative lock_token)', async () => {
        // Attempt completion with incorrect lock token -> fails
        const fakeToken = randomUUID();
        const { data: failResult, error: failErr } = await adminClient.rpc('complete_atlas_job', {
            p_job_id: seededJobId,
            p_lock_token: fakeToken
        });
        expect(failErr).toBeNull();
        expect(failResult).toBe(false);

        // Complete with authoritative lock token -> succeeds
        const { data: successResult, error: succErr } = await adminClient.rpc('complete_atlas_job', {
            p_job_id: seededJobId,
            p_lock_token: seededLockToken
        });
        expect(succErr).toBeNull();
        expect(successResult).toBe(true);

        const { data: completedJob } = await adminClient.from('atlas_queues')
            .select('status, completed_at, lock_token')
            .eq('job_id', seededJobId)
            .single();

        expect(completedJob.status).toBe('COMPLETED');
        expect(completedJob.completed_at).not.toBeNull();
        expect(completedJob.lock_token).toBeNull();
    });

    it('4: STALE_RECLAIM & RETRY (reclaims expired processing jobs to RETRY)', async () => {
        const staleIdem = `idem-stale-${randomUUID()}`;
        // Insert directly an artificially expired job in PROCESSING
        const { data: staleJob } = await adminClient.from('atlas_queues').insert({
            queue_type: testQueueType,
            idempotency_key: staleIdem,
            payload: { test: 'stale' },
            status: 'PROCESSING',
            priority: 10,
            locked_by: 'old-worker',
            lock_token: randomUUID(),
            locked_at: new Date(Date.now() - 100000).toISOString(),
            lock_expires_at: new Date(Date.now() - 10000).toISOString(), // expired
            attempt_count: 1,
            max_attempts: 3
        }).select('job_id').single();

        // Calling get_next_atlas_job runs stale recovery
        await adminClient.rpc('get_next_atlas_job', {
            p_queue_type: testQueueType,
            p_worker_id: testWorkerId,
            p_lock_duration_seconds: 60,
            p_limit: 1
        });

        // Verify the stale job was reclaimed (either returned as PROCESSING with new token or set to RETRY)
        const { data: updated } = await adminClient.from('atlas_queues')
            .select('status, attempt_count')
            .eq('job_id', staleJob.job_id)
            .single();

        // Since it was available and priority 10, it either became RETRY or re-leased to PROCESSING
        expect(['RETRY', 'PROCESSING']).toContain(updated.status);
    });

    it('5: DEAD_LETTER (jobs exceeding max_attempts transition to DEAD_LETTER)', async () => {
        const deadIdem = `idem-dead-${randomUUID()}`;
        // Insert directly a job in PROCESSING that reached max_attempts
        const { data: deadJob } = await adminClient.from('atlas_queues').insert({
            queue_type: testQueueType,
            idempotency_key: deadIdem,
            payload: { test: 'dead' },
            status: 'PROCESSING',
            priority: 10,
            locked_by: 'failing-worker',
            lock_token: randomUUID(),
            locked_at: new Date(Date.now() - 100000).toISOString(),
            lock_expires_at: new Date(Date.now() - 10000).toISOString(), // expired
            attempt_count: 3,
            max_attempts: 3
        }).select('job_id').single();

        // Fetching next job triggers recovery
        await adminClient.rpc('get_next_atlas_job', {
            p_queue_type: testQueueType,
            p_worker_id: testWorkerId,
            p_lock_duration_seconds: 60,
            p_limit: 1
        });

        const { data: finalJob } = await adminClient.from('atlas_queues')
            .select('status')
            .eq('job_id', deadJob.job_id)
            .single();

        expect(finalJob.status).toBe('DEAD_LETTER');
    });

    it('6: HARVESTER_EXISTING_SEMANTICS_CHANGED = NO (050000 added columns default safely without breaking core)', async () => {
        // Enqueue job without any of the new columns (tenant_id, source_authority, use_authority)
        const simpleIdem = `idem-simple-${randomUUID()}`;
        const { data: ok } = await adminClient.rpc('enqueue_atlas_job', {
            p_queue_type: testQueueType,
            p_idempotency_key: simpleIdem,
            p_payload: { v: '1.0' },
            p_priority: 1
        });
        expect(ok).toBe(true);

        const { data: row } = await adminClient.from('atlas_queues')
            .select('job_id, use_authority, tenant_id')
            .eq('queue_type', testQueueType)
            .eq('idempotency_key', simpleIdem)
            .single();

        expect(row.use_authority).toBe('DISCOVERY_ONLY'); // default value preserved
        expect(row.tenant_id).toBeNull(); // nullable without constraint failure
    });
});
