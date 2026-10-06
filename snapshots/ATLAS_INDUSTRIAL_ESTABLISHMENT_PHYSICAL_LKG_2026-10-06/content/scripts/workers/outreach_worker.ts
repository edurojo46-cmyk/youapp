import { SupabaseClient } from '@supabase/supabase-js';
import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import { EmailProvider } from './resend_adapter';

export interface OutreachJob {
    job_id: string;
    campaign_id: string;
    contact_id: string;
    contact_email: string;
    lock_token: string;
}

export class OutreachWorker {
    private supabase: SupabaseClient;
    private workerId: string;
    private realProvider?: EmailProvider;

    constructor(supabaseUrl: string, supabaseKey: string, workerId: string = 'default-worker', realProvider?: EmailProvider) {
        this.supabase = createClient(supabaseUrl, supabaseKey);
        this.workerId = workerId;
        this.realProvider = realProvider;
    }

    async processNextJob(): Promise<{ success: boolean, reason?: string, jobId?: string }> {
        // 1. Lease Next Job
        const { data: jobs, error: leaseErr } = await this.supabase.rpc('get_next_outreach_job', {
            p_worker_id: this.workerId,
            p_limit: 1
        });

        if (leaseErr) throw leaseErr;
        if (!jobs || jobs.length === 0) {
            return { success: false, reason: 'NO_JOBS' };
        }

        const job: OutreachJob = jobs[0];

        // 2. Budget Check & Reservation (1 amount)
        // Check budget BEFORE dispatch
        const { data: budgetOk, error: budgetErr } = await this.supabase.rpc('reserve_outreach_budget', {
            p_metric: 'CAMPAIGN_SEND',
            p_entity_id: job.campaign_id,
            p_amount: 1
        });

        if (budgetErr) throw budgetErr;
        if (!budgetOk) {
            // Out of budget, fail it retryable
            await this.supabase.rpc('fail_outreach_job', {
                p_job_id: job.job_id,
                p_worker_id: this.workerId,
                p_lock_token: job.lock_token,
                p_error_code: 'BUDGET_EXHAUSTED',
                p_retryable: true
            });
            return { success: false, reason: 'BUDGET_EXHAUSTED', jobId: job.job_id };
        }

        // 3. Final Can Dispatch Gate
        const { data: canDispatch, error: dispatchErr } = await this.supabase.rpc('final_can_dispatch', {
            p_job_id: job.job_id,
            p_worker_id: this.workerId,
            p_lock_token: job.lock_token
        });

        if (dispatchErr) throw dispatchErr;
        if (!canDispatch) {
            // Already blocked by trigger_block internally in DB if compliance failed, 
            // or we lost the lock. We don't need to do anything else.
            return { success: false, reason: 'FINAL_GATE_REJECTED', jobId: job.job_id };
        }

        // 4. Render Template
        const messageBody = `Hello ${job.contact_email}, this is a simulated message.`;

        // 5. Provider Router (REAL or SIMULATED)
        // Get send_enabled to know where to route
        const { data: config } = await this.supabase.from('atlas_outreach_config').select('send_enabled').eq('id', 1).single();
        const sendEnabled = config?.send_enabled || false;

        let providerAttemptId: string | null = null;

        if (!sendEnabled) {
            // Route to SIMULATED_PROVIDER
            try {
                providerAttemptId = await this.simulatedProviderSend(job, messageBody);
            } catch (err: any) {
                if (err.message === 'SIMULATED_NETWORK_TIMEOUT') {
                    throw err; 
                }
                if (err.message === 'ALREADY_ACCEPTED') {
                    providerAttemptId = err.provider_message_id;
                } else {
                    await this.supabase.rpc('fail_outreach_job', {
                        p_job_id: job.job_id, p_worker_id: this.workerId, p_lock_token: job.lock_token, p_error_code: 'PROVIDER_ERROR', p_retryable: true
                    });
                    return { success: false, reason: 'PROVIDER_ERROR', jobId: job.job_id };
                }
            }
        } else {
            // Route to REAL_PROVIDER (Phase 6)
            if (!this.realProvider) {
                throw new Error("REAL PROVIDER REQUIRED BUT NOT CONFIGURED");
            }

            // A. Final Authorization Gate on Server
            const { data: authResult, error: authErr } = await this.supabase.rpc('authorize_real_send', {
                p_job_id: job.job_id,
                p_worker_id: this.workerId,
                p_lock_token: job.lock_token,
                p_provider: 'RESEND' // Hardcoded to our real provider for now
            });
            
            if (authErr) throw authErr;
            if (!authResult || authResult.length === 0 || !authResult[0].authorized) {
                console.error("Authorization failed:", authResult);
                return { success: false, reason: 'REAL_SEND_UNAUTHORIZED', jobId: job.job_id };
            }

            const { delivery_id, send_idempotency_key, authorization_token } = authResult[0];

            // B. Actual Dispatch
            let providerMessageId = '';
            let dispatchSuccess = false;
            try {
                providerMessageId = await this.realProvider.send(job, messageBody, send_idempotency_key);
                dispatchSuccess = true;
            } catch (err: any) {
                console.error("Real dispatch failed:", err);
            }

            // C. Register Acceptance
            const { data: regOk, error: regErr } = await this.supabase.rpc('register_provider_acceptance', {
                p_authorization_token: authorization_token,
                p_provider_message_id: providerMessageId || null,
                p_success: dispatchSuccess
            });
            
            if (regErr) throw regErr;

            if (!dispatchSuccess) {
                await this.supabase.rpc('fail_outreach_job', {
                    p_job_id: job.job_id, p_worker_id: this.workerId, p_lock_token: job.lock_token, p_error_code: 'PROVIDER_API_ERROR', p_retryable: true
                });
                return { success: false, reason: 'PROVIDER_API_ERROR', jobId: job.job_id };
            }

            providerAttemptId = providerMessageId;
        }

        // 6. Complete Job
        const { data: completed, error: completeErr } = await this.supabase.rpc('complete_outreach_job', {
            p_job_id: job.job_id,
            p_worker_id: this.workerId,
            p_lock_token: job.lock_token,
            p_provider_attempt_id: providerAttemptId
        });

        if (completeErr) throw completeErr;
        if (!completed) {
            return { success: false, reason: 'STALE_WORKER_REJECTED_COMPLETION', jobId: job.job_id };
        }

        return { success: true, jobId: job.job_id };
    }

    private async simulatedProviderSend(job: OutreachJob, body: string): Promise<string> {
        // We simulate the idempotency key being the contact_id + campaign_id to prevent duplicates
        // Actually, the queue has 'idempotency_key'. We must fetch it to give to provider.
        const { data: queueRow } = await this.supabase.from('atlas_outreach_queue').select('idempotency_key').eq('job_id', job.job_id).single();
        if (!queueRow) throw new Error("Job not found");
        const sendIdempotencyKey = queueRow.idempotency_key;

        // Try to insert into simulated deliveries
        const { data: existing } = await this.supabase.from('atlas_outreach_simulated_deliveries')
            .select('provider_message_id')
            .eq('send_idempotency_key', sendIdempotencyKey)
            .maybeSingle();

        if (existing) {
            const err = new Error('ALREADY_ACCEPTED');
            (err as any).provider_message_id = existing.provider_message_id;
            throw err;
        }

        // Check if we should inject a fake timeout for Test 4 (passed via env or global for testing)
        if (process.env.INJECT_SIMULATED_TIMEOUT === sendIdempotencyKey) {
            // We record delivery first (Provider accepted it)
            await this.supabase.from('atlas_outreach_simulated_deliveries').insert({
                send_idempotency_key: sendIdempotencyKey,
                job_id: job.job_id,
                contact_id: job.contact_id,
                campaign_id: job.campaign_id,
                status: 'ACCEPTED'
            });
            // And then crash the worker before returning the ID
            throw new Error('SIMULATED_NETWORK_TIMEOUT');
        }

        const { data: inserted, error } = await this.supabase.from('atlas_outreach_simulated_deliveries').insert({
            send_idempotency_key: sendIdempotencyKey,
            job_id: job.job_id,
            contact_id: job.contact_id,
            campaign_id: job.campaign_id,
            status: 'ACCEPTED'
        }).select('provider_message_id').single();

        if (error) throw error;
        
        return inserted.provider_message_id;
    }
}
