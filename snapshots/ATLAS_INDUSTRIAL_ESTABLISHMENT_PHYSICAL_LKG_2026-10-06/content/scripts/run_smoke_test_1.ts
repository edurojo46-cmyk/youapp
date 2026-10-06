import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import { randomUUID } from 'crypto';
import { AtlasWorker } from '../src/lib/atlasHarvester/worker.js';

const SUPABASE_URL = 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const SUPABASE_SERVICE_KEY = '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const smokeRunId = `SMOKE1-20260904-${randomUUID()}`;

// Parameterized test channel
const TEST_CHANNEL_ID = 'UCcEuKqA1-561pLd96l-T54Q'; // e.g. some public channel

async function runSmokeTest() {
    console.log(`Starting Smoke Test 1: ${smokeRunId}`);
    console.log(`Channel used: ${TEST_CHANNEL_ID}`);
    const results = {
        sourceId: null as string | null,
        candidatesDiscovered: 0,
        queueDuplicateJobs: 0,
        duplicateProviderAssets: 0,
        duplicateIdenticalSnapshots: 0,
        lostDiscoveryProvenance: 0,
        rightsFailCreatedAsset: 0,
        oldLeaseCompletionAccepted: 0,
        killSwitchBypass: 0,
        unhandledDbErrors: 0,
    };

    try {
        // 1. Initial Teardown / Cleanup
        await supabase.from('atlas_harvester_config').update({
            harvester_enabled: false,
            youtube_harvester_enabled: false,
            user_discovery_enabled: false,
            backfill_enabled: false,
            semantic_auto_process_enabled: false
        }).eq('id', 1);
        
        // 2. Register Source (PROPOSED -> ACTIVE)
        const { data: source, error: sourceErr } = await supabase.from('atlas_sources').insert({
            provider: 'youtube',
            source_type: 'YOUTUBE_CHANNEL',
            provider_source_id: TEST_CHANNEL_ID,
            status: 'ACTIVE', // Promote immediately for test
            discovery_method: 'SMOKE_TEST'
        }).select('source_id').single();
        if (sourceErr) throw sourceErr;
        results.sourceId = source.source_id;

        // 3. Enable Harvester and YouTube features
        await supabase.from('atlas_harvester_config').update({
            harvester_enabled: true,
            youtube_harvester_enabled: true
        }).eq('id', 1);

        // 4. Generate 12 Candidates (10 normal, 1 synthetic FAIL, 1 duplicate)
        const candidates = [];
        for (let i = 0; i < 10; i++) {
            candidates.push({
                provider: 'youtube',
                providerContentId: `smoke_vid_${i}_${randomUUID()}`,
                discoveryUrl: `https://youtube.com/watch?v=smoke_vid_${i}`,
                discoveredVia: 'YOUTUBE_WATCHER',
                sourceId: results.sourceId,
                rawTitle: `Smoke Video ${i}`,
                rawDescription: `Description ${i}`,
                rawPayloadHash: `hash_${i}_${randomUUID()}`,
                publishedAt: new Date().toISOString(),
                providerChannelId: TEST_CHANNEL_ID,
                smokeRunId
            });
        }
        
        // Synthetic FAIL candidate
        candidates.push({
            ...candidates[0],
            providerContentId: `smoke_vid_fail_${randomUUID()}`,
            rawPayloadHash: `hash_fail_${randomUUID()}`,
            syntheticFail: true
        });

        // 5. Enqueue candidates
        for (const c of candidates) {
            const { error: eqErr } = await supabase.rpc('enqueue_atlas_job', {
                p_queue_type: 'DISCOVERY',
                p_idempotency_key: c.providerContentId,
                p_payload: c,
                p_source_id: results.sourceId,
                p_metric: 'GLOBAL_CANDIDATES'
            });
            if (eqErr) throw eqErr;
            results.candidatesDiscovered++;
        }

        // Test IDEMPOTENCY: Enqueue the exact same candidates again
        for (const c of candidates) {
            const { error: eqErr } = await supabase.rpc('enqueue_atlas_job', {
                p_queue_type: 'DISCOVERY',
                p_idempotency_key: c.providerContentId,
                p_payload: c,
                p_source_id: results.sourceId,
                p_metric: 'GLOBAL_CANDIDATES'
            });
            if (eqErr) throw eqErr; // Should succeed implicitly without creating new jobs
        }

        // Verify Idempotency in DB
        const { count: jobCount } = await supabase.from('atlas_queues')
            .select('*', { count: 'exact', head: true })
            .eq('queue_type', 'DISCOVERY')
            .in('idempotency_key', candidates.map(c => c.providerContentId));
        if (jobCount !== candidates.length) {
            results.queueDuplicateJobs = (jobCount || 0) - candidates.length;
        }

        // 6. Test Lease Protection (Stale Lock)
        // Insert a dummy job
        await supabase.rpc('enqueue_atlas_job', {
            p_queue_type: 'DISCOVERY',
            p_idempotency_key: 'stale_test_' + randomUUID(),
            p_payload: { dummy: true },
        });
        
        // Worker A acquires
        const { data: jobA } = await supabase.rpc('get_next_atlas_job', {
            p_queue_type: 'DISCOVERY',
            p_worker_id: 'worker-A',
            p_lock_duration_seconds: 60
        });
        
        if (jobA && jobA.length > 0) {
            const staleJob = jobA[0];
            // Expire lock manually
            await supabase.from('atlas_queues').update({ lock_expires_at: new Date(Date.now() - 10000).toISOString() }).eq('job_id', staleJob.job_id);
            
            // Worker B acquires
            await supabase.rpc('get_next_atlas_job', {
                p_queue_type: 'DISCOVERY',
                p_worker_id: 'worker-B',
                p_lock_duration_seconds: 60
            });

            // Worker A tries to complete
            const { data: completeA } = await supabase.rpc('complete_atlas_job', {
                p_job_id: staleJob.job_id,
                p_lock_token: staleJob.lock_token
            });
            
            if (completeA === true) {
                results.oldLeaseCompletionAccepted = 1;
            }
        }

        // 7. Process Queue using Real Worker
        const worker = new AtlasWorker(supabase, 'smoke-worker-1');
        await worker.processDiscoveryQueue(20);

        // 8. Test Provider Asset and Snapshot Deduplication
        // Force ingest the first candidate again manually to see if Provider Asset Deduplicates
        const ingestor = (worker as any).ingestor;
        const rightsGate = (worker as any).rightsGate;
        const c0 = candidates[0];
        await ingestor.ingestCandidate(c0, rightsGate.evaluateYouTubeVideo(c0.providerContentId, false), 'smoke-worker-2');

        const { count: providerCount } = await supabase.from('atlas_provider_assets')
            .select('*', { count: 'exact', head: true })
            .eq('provider_content_id', c0.providerContentId);
        if (providerCount && providerCount > 1) {
            results.duplicateProviderAssets = providerCount - 1;
        }

        const { count: snapCount } = await supabase.from('atlas_raw_metadata_snapshots')
            .select('*', { count: 'exact', head: true })
            .eq('raw_payload_hash', c0.rawPayloadHash);
        if (snapCount && snapCount > 1) {
            results.duplicateIdenticalSnapshots = snapCount - 1;
        }

        // 9. Check Provenance & Semantic Status
        const { data: prov } = await supabase.from('atlas_discovery_events')
            .select('provider_asset_id, event_status')
            .in('provider_content_id', candidates.map(c => c.providerContentId));
        
        const syntheticEvent = prov?.find(p => p.event_status === 'RIGHTS_REJECTED');
        if (syntheticEvent && syntheticEvent.provider_asset_id !== null) {
            results.rightsFailCreatedAsset = 1;
        }
        if (!prov || prov.length < candidates.length) {
            results.lostDiscoveryProvenance = candidates.length - (prov?.length || 0);
        }

        // 10. Test Kill Switch
        await supabase.from('atlas_harvester_config').update({ harvester_enabled: false }).eq('id', 1);
        const { data: killSwitchCheck } = await supabase.rpc('enqueue_atlas_job', {
            p_queue_type: 'DISCOVERY',
            p_idempotency_key: 'killswitch_test_' + randomUUID(),
            p_payload: {},
        });
        if (killSwitchCheck === true) {
            results.killSwitchBypass = 1;
        }

        console.log("\nATLAS HARVESTER V0 — SMOKE TEST 1");
        console.log(`Candidates: \t\t\t${results.candidatesDiscovered}`);
        console.log(`Queue duplicate jobs: \t\t${results.queueDuplicateJobs}`);
        console.log(`Duplicate provider assets: \t${results.duplicateProviderAssets}`);
        console.log(`Duplicate identical snapshots: \t${results.duplicateIdenticalSnapshots}`);
        console.log(`Lost discovery provenance: \t${results.lostDiscoveryProvenance}`);
        console.log(`Rights FAIL created asset: \t${results.rightsFailCreatedAsset}`);
        console.log(`Old lease completion accepted: \t${results.oldLeaseCompletionAccepted}`);
        console.log(`Kill-switch bypass: \t\t${results.killSwitchBypass}`);
        console.log(`Unhandled DB errors: \t\t${results.unhandledDbErrors}`);

    } catch (e) {
        results.unhandledDbErrors++;
        console.error("SMOKE TEST ENCOUNTERED AN ERROR:", e);
    } finally {
        // ALWAYS RESET FLAGS TO FALSE
        await supabase.from('atlas_harvester_config').update({
            harvester_enabled: false,
            youtube_harvester_enabled: false,
            user_discovery_enabled: false,
            backfill_enabled: false,
            semantic_auto_process_enabled: false
        }).eq('id', 1);
        console.log("\nFINAL FEATURE FLAGS: ALL FALSE");
    }
}

runSmokeTest().catch(console.error);
