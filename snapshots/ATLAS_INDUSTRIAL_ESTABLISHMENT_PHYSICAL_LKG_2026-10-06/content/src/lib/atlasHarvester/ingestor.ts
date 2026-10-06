import type { SupabaseClient } from '@supabase/supabase-js';
import type { RightsDecision } from './rightsGate';

export type IngestPayload = {
    provider: string;
    providerContentId: string;
    discoveryUrl: string;
    discoveredVia: string;
    sourceId: string;
    rawTitle: string;
    rawDescription: string;
    rawPayloadHash: string;
    publishedAt: string;
    providerChannelId: string;
    smokeRunId?: string;
    syntheticFail?: boolean;
};

export class Ingestor {
    constructor(private supabase: SupabaseClient) {}

    async ingestCandidate(payload: IngestPayload, rightsDecision: RightsDecision | null, workerId: string) {
        
        let providerAssetId: string | null = null;
        
        // 1. If rights pass, attempt to create/get provider_asset
        if (rightsDecision && rightsDecision.decision === 'PASS' && !payload.invalidUrl) {
            const { data: assetData, error: assetErr } = await this.supabase
                .from('atlas_provider_assets')
                .upsert({
                    provider: payload.provider,
                    provider_content_id: payload.providerContentId,
                    canonical_url: payload.discoveryUrl,
                    current_title: payload.rawTitle,
                    current_description: payload.rawDescription,
                    provider_channel_id: payload.providerChannelId,
                    published_at: payload.publishedAt,
                    semantic_status: 'PENDING',
                    rights_status: 'PASS',
                    metadata_status: 'FRESH'
                }, {
                    onConflict: 'provider, provider_content_id',
                    ignoreDuplicates: false // We want to update and return
                })
                .select('provider_asset_id')
                .single();
                
            if (assetErr) throw assetErr;
            providerAssetId = assetData.provider_asset_id;

            // 2. Insert metadata snapshot (with ON CONFLICT DO NOTHING handled by unique index)
            if (providerAssetId) {
                const { error: snapErr } = await this.supabase
                    .from('atlas_raw_metadata_snapshots')
                    .insert({
                        provider_asset_id: providerAssetId,
                        raw_title: payload.rawTitle,
                        raw_description: payload.rawDescription,
                        raw_payload_hash: payload.rawPayloadHash,
                        metadata_version: 'v0-smoke'
                    });
                
                // Ignore uniqueness violation on snapshot (expected for deduplication)
                if (snapErr && snapErr.code !== '23505') {
                    throw snapErr;
                }
            }
        }

        // 3. Always log discovery event (Provenance)
        const { error: evtErr } = await this.supabase
            .from('atlas_discovery_events')
            .insert({
                provider: payload.provider,
                provider_content_id: payload.providerContentId,
                discovery_url: payload.discoveryUrl,
                source_id: payload.sourceId,
                discovered_via: payload.discoveredVia,
                worker_id: workerId,
                pipeline_version: 'smoke-v0',
                event_status: payload.invalidUrl ? 'INVALID' : (rightsDecision?.decision === 'PASS' ? 'INGESTED' : 'RIGHTS_REJECTED'),
                error_detail: payload.invalidUrl ? 'Invalid URL format' : rightsDecision?.reason,
                rights_profile_id: rightsDecision?.profileId,
                rights_policy_version: rightsDecision?.policyVersion,
                rights_decision: rightsDecision?.decision,
                rights_checked_at: new Date().toISOString(),
                can_discover: rightsDecision?.capabilities?.canDiscover,
                can_index: rightsDecision?.capabilities?.canIndex,
                can_store_metadata: rightsDecision?.capabilities?.canStoreMetadata,
                metadata_ttl_seconds: rightsDecision?.capabilities?.metadataTtlSeconds,
                can_semantic_analyze: rightsDecision?.capabilities?.canSemanticAnalyze,
                can_embed: rightsDecision?.capabilities?.canEmbed,
                can_thumbnail: rightsDecision?.capabilities?.canThumbnail,
                can_cache: rightsDecision?.capabilities?.canCache,
                can_rehost: rightsDecision?.capabilities?.canRehost,
                provider_asset_id: providerAssetId,
            });

        if (evtErr) throw evtErr;

        return { providerAssetId, decision: rightsDecision?.decision || 'INVALID' };
    }
}
