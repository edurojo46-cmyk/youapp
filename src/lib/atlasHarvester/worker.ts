import type { SupabaseClient } from '@supabase/supabase-js';
import { RightsGate } from './rightsGate';
import { Ingestor, type IngestPayload } from './ingestor';

export class AtlasWorker {
    private rightsGate: RightsGate;
    private ingestor: Ingestor;
    
    constructor(private supabase: SupabaseClient, private workerId: string) {
        this.rightsGate = new RightsGate();
        this.ingestor = new Ingestor(supabase);
    }

    async processDiscoveryQueue(limit: number = 10) {
        let processedCount = 0;
        let running = true;

        while (running && processedCount < limit) {
            // Fetch next job securely using RPC
            const { data: jobs, error: fetchErr } = await this.supabase
                .rpc('get_next_atlas_job', {
                    p_queue_type: 'DISCOVERY',
                    p_worker_id: this.workerId,
                    p_lock_duration_seconds: 60,
                    p_limit: 1
                });

            if (fetchErr) {
                console.error("Failed to fetch job", fetchErr);
                break;
            }

            if (!jobs || jobs.length === 0) {
                running = false;
                break;
            }

            const job = jobs[0];
            const payload = job.payload as IngestPayload;

            try {
                // 1. Rights Gate evaluation (skip if invalid URL)
                const rightsDecision = payload.invalidUrl 
                    ? null 
                    : this.rightsGate.evaluateYouTubeVideo(payload.providerContentId, payload.syntheticFail);

                // 2. Ingestion
                const ingestResult = await this.ingestor.ingestCandidate(payload, rightsDecision, this.workerId);

                // 2b. Source Proposal for Channel ID (Only if valid URL and PASS/REJECTED)
                if (payload.channelId && !payload.invalidUrl) {
                    const { error: srcErr } = await this.supabase.from('atlas_sources').insert({
                        provider: 'youtube',
                        source_type: 'YOUTUBE_CHANNEL',
                        provider_source_id: payload.channelId,
                        status: 'PROPOSED', // NEVER ACTIVE AUTOMATICALLY
                        discovery_method: payload.discoveredVia || 'UNKNOWN'
                    });
                    if (srcErr && srcErr.code !== '23505') throw srcErr;
                }

                // 3. Complete Job
                const { data: completeOk, error: completeErr } = await this.supabase
                    .rpc('complete_atlas_job', {
                        p_job_id: job.job_id,
                        p_lock_token: job.lock_token
                    });
                
                if (completeErr || !completeOk) {
                    throw completeErr || new Error("Lock token rejected by complete_atlas_job");
                }
                
                processedCount++;
            } catch (err: any) {
                console.error(`Job failed: ${job.job_id}`, err);
                await this.supabase.rpc('fail_atlas_job', {
                    p_job_id: job.job_id,
                    p_lock_token: job.lock_token,
                    p_error: err.message
                });
            }
        }
        return processedCount;
    }
}
