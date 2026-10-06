import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveEntityV2 } from '../atlasBootstrap/entityResolverV2.js';
import { exactWorkSearchGate } from '../search/exactWorkSearchGate.js';

export type SemanticPayload = {
    providerAssetId: string;
    semanticVersion: number;
    classifierVersion: string;
};

export class SemanticWorker {
    constructor(private supabase: SupabaseClient, private workerId: string) {}

    async processSemanticQueue(limit: number = 10) {
        let processedCount = 0;
        let running = true;

        while (running && processedCount < limit) {
            const { data: jobs, error: fetchErr } = await this.supabase
                .rpc('get_next_atlas_job', {
                    p_queue_type: 'SEMANTIC',
                    p_worker_id: this.workerId,
                    p_lock_duration_seconds: 60,
                    p_limit: 1
                });

            if (fetchErr) {
                console.error("Failed to fetch SEMANTIC job", fetchErr);
                break;
            }
            if (!jobs || jobs.length === 0) {
                running = false;
                break;
            }

            const job = jobs[0];
            const payload = job.payload as SemanticPayload;
            
            try {
                // 1. Fetch metadata snapshot
                const { data: snapshot, error: snapErr } = await this.supabase
                    .from('atlas_raw_metadata_snapshots')
                    .select('raw_title, raw_description')
                    .eq('provider_asset_id', payload.providerAssetId)
                    .order('captured_at', { ascending: false })
                    .limit(1)
                    .single();
                
                if (snapErr) throw snapErr;
                
                const title = snapshot.raw_title;
                const desc = snapshot.raw_description || '';
                
                // 2. Atlas V2 Semantic Prediction
                const entityResult = resolveEntityV2(title, desc);
                const workResult = exactWorkSearchGate.detectExactWork(title, desc);
                
                const combinedScore = (entityResult.confidence || 0) * 0.5 + (workResult.confidence || 0) * 0.5;
                
                // 3. Insert into asset_semantic_annotations (ALWAYS PROPOSED or UNKNOWN for Harvester)
                // Semantic idempotency relies on `UNIQUE(provider_asset_id)` for ACTIVE, but these are PROPOSED so multiple versions can exist!
                const annotationStatus = combinedScore > 0.3 ? 'PROPOSED' : 'UNKNOWN';
                
                const { error: insertErr } = await this.supabase
                    .from('asset_semantic_annotations')
                    .insert({
                        provider_asset_id: payload.providerAssetId,
                        annotation_status: annotationStatus,
                        semantic_entity_id: entityResult.entityId,
                        semantic_work_id: workResult.workId,
                        content_type: workResult.contentType || 'MUSIC_TRACK',
                        performance_mode: workResult.performanceMode || 'STUDIO',
                        content_role: workResult.contentRole || 'PRIMARY',
                        overall_confidence: combinedScore,
                        semantic_version: payload.semanticVersion,
                        evidence: {} // required by NOT NULL constraint
                    });
                    
                if (insertErr) throw insertErr;
                
                // 4. Update provider asset status
                await this.supabase
                    .from('atlas_provider_assets')
                    .update({ semantic_status: annotationStatus })
                    .eq('provider_asset_id', payload.providerAssetId);
                
                // 5. Complete Job
                const { error: completeErr } = await this.supabase
                    .rpc('complete_atlas_job', {
                        p_job_id: job.job_id,
                        p_lock_token: job.lock_token
                    });
                
                if (completeErr) throw completeErr;
                processedCount++;
                
            } catch (err: any) {
                console.error(`SEMANTIC Job failed: ${job.job_id}`, err);
                await this.supabase.rpc('fail_atlas_job', {
                    p_job_id: job.job_id,
                    p_lock_token: job.lock_token,
                    p_error: err.message
                });
                
                // Set provider asset to FAILED if we fail to process
                await this.supabase
                    .from('atlas_provider_assets')
                    .update({ semantic_status: 'FAILED' })
                    .eq('provider_asset_id', payload.providerAssetId);
            }
        }
        return processedCount;
    }
}
