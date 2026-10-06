import { SupabaseClient } from '@supabase/supabase-js';
import { EvidenceResolver } from './evidence_resolver';
import { DummyLLMAdapter, LLMAdapter } from './llm_adapter';
import { ClaimValidator } from './claim_validator';
import { CircuitBreaker, CircuitState } from './circuit_breaker';

export class CampaignBrainWorker {
    private resolver: EvidenceResolver;
    private llm: LLMAdapter;
    private validator: ClaimValidator;
    private circuitBreaker: CircuitBreaker;

    constructor(
        private supabase: SupabaseClient,
        private workerId: string,
        llmAdapter?: LLMAdapter,
        circuitBreaker?: CircuitBreaker
    ) {
        this.resolver = new EvidenceResolver(supabase);
        this.llm = llmAdapter || new DummyLLMAdapter();
        this.validator = new ClaimValidator();
        this.circuitBreaker = circuitBreaker || new CircuitBreaker();
    }

    async processNextJob(): Promise<{ success: boolean; reason?: string; generationId?: string }> {
        const now = new Date().toISOString();
        // Fetch next message job (PENDING or eligible RETRY)
        const { data: jobs, error: fetchErr } = await this.supabase
            .from('atlas_message_queue')
            .select('*')
            .or(`status.eq.PENDING,and(status.eq.RETRY,available_at.lte.${now})`)
            .order('created_at', { ascending: true })
            .limit(1);

        if (fetchErr) {
            console.error(`[Brain] Failed to fetch job: ${fetchErr.message}`);
            return { success: false, reason: 'FETCH_ERROR' };
        }

        if (!jobs || jobs.length === 0) {
            return { success: false, reason: 'NO_JOBS' };
        }

        const job = jobs[0];
        console.log(`[Brain] Processing message job for contact ${job.contact_id}`);

        // Lock job
        await this.supabase.from('atlas_message_queue').update({
            status: 'PROCESSING',
            locked_by: this.workerId,
            locked_at: new Date().toISOString()
        }).eq('job_id', job.job_id);

        try {
            // Check Circuit Breaker
            if (!this.circuitBreaker.canExecute()) {
                console.warn(`[Brain] Circuit Breaker is OPEN. Failing fast.`);
                throw { name: 'TransientError', message: 'Circuit Breaker Open', code: 'CIRCUIT_OPEN' };
            }

            // 2. Resolve Evidence into Fact Pack
            const factPack = await this.resolver.resolveFactPack(job.contact_id);

            // 3. LLM Generates Message + Claims
            const llmOutput = await this.llm.generate(factPack, 'dummy_template_1');
            
            // Record Success
            this.circuitBreaker.recordSuccess();

            // 4. Validate Claims
            const validatedClaims = this.validator.validate(llmOutput.claims, factPack);
            const hasUnsupported = validatedClaims.some(c => c.validation_status === 'UNSUPPORTED');
            const finalStatus = hasUnsupported ? 'REJECTED' : 'APPROVED';

            // 5. Save Generation
            const { data: generation, error: genErr } = await this.supabase
                .from('atlas_message_generations')
                .insert({
                    job_id: job.job_id,
                    campaign_id: job.campaign_id,
                    contact_id: job.contact_id,
                    status: finalStatus,
                    subject: llmOutput.subject,
                    body: llmOutput.body,
                    model: llmOutput.model,
                    prompt_version: llmOutput.prompt_version,
                    generation_mode: 'AI',
                    evidence_snapshot: factPack._snapshot,
                    approved_at: finalStatus === 'APPROVED' ? new Date().toISOString() : null
                })
                .select('generation_id')
                .single();

            if (genErr) throw genErr;

            // 6. Save Claims
            if (validatedClaims.length > 0) {
                const claimsData = validatedClaims.map(c => ({
                    generation_id: generation.generation_id,
                    claim_text: c.claim_text,
                    claim_type: c.claim_type,
                    evidence_id: c.evidence_id,
                    confidence: c.confidence,
                    validation_status: c.validation_status
                }));
                await this.supabase.from('atlas_message_claims').insert(claimsData);
            }

            // 7. Update Job Status
            await this.supabase.from('atlas_message_queue').update({
                status: finalStatus === 'APPROVED' ? 'GENERATED' : 'REJECTED',
                locked_by: null,
                locked_at: null
            }).eq('job_id', job.job_id);

            console.log(`[Brain] Job finished. Status: ${finalStatus}`);
            return { success: true, generationId: generation.generation_id, reason: finalStatus };

        } catch (err: any) {
            console.error(`[Brain] Error processing job: ${err.message}`);
            
            const isTransient = err.name === 'TransientError';
            const isFatal = err.name === 'FatalError';
            
            if (isTransient) {
                if (err.code !== 'CIRCUIT_OPEN') {
                    this.circuitBreaker.recordFailure();
                }

                // Calculate next available_at
                const retryCount = (job.retry_count || 0) + 1;
                const maxRetries = job.max_retries || 5;
                
                if (retryCount > maxRetries) {
                    // Max retries exceeded
                    await this.supabase.from('atlas_message_queue').update({
                        status: 'DEAD_LETTER',
                        last_error_code: err.code || 'UNKNOWN_TRANSIENT',
                        last_error_at: new Date().toISOString(),
                        locked_by: null,
                        locked_at: null
                    }).eq('job_id', job.job_id);
                    return { success: false, reason: 'DEAD_LETTER' };
                }

                // Queue level backoff: +30s, +2m, +5m, +15m, +30m
                const delaysMin = [0.5, 2, 5, 15, 30];
                const delayMs = delaysMin[Math.min(retryCount - 1, delaysMin.length - 1)] * 60 * 1000;
                const nextAvailableAt = new Date(Date.now() + delayMs).toISOString();

                await this.supabase.from('atlas_message_queue').update({
                    status: 'RETRY',
                    retry_count: retryCount,
                    available_at: nextAvailableAt,
                    last_error_code: err.code || 'UNKNOWN_TRANSIENT',
                    last_error_at: new Date().toISOString(),
                    locked_by: null,
                    locked_at: null
                }).eq('job_id', job.job_id);

                return { success: false, reason: 'RETRY' };
                
            } else if (isFatal) {
                // Fatal error - no retries
                this.circuitBreaker.recordFailure(); // Optionally record as failure or ignore
                await this.supabase.from('atlas_message_queue').update({
                    status: 'REJECTED',
                    last_error_code: err.code || 'FATAL_ERROR',
                    last_error_at: new Date().toISOString(),
                    locked_by: null,
                    locked_at: null
                }).eq('job_id', job.job_id);
                
                return { success: false, reason: 'FATAL_ERROR' };
            } else {
                // Generic exception
                await this.supabase.from('atlas_message_queue').update({
                    status: 'RETRY', // Default fallback
                    locked_by: null,
                    locked_at: null
                }).eq('job_id', job.job_id);
                return { success: false, reason: 'EXCEPTION' };
            }
        }
    }
}
