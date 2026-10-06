import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import { randomUUID } from 'crypto';
import { SemanticWorker } from '../src/lib/atlasHarvester/semanticWorker.js';

const SUPABASE_URL = 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const SUPABASE_SERVICE_KEY = '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const semanticRunId = `SEMANTIC-SMOKE-${randomUUID()}`;
const SEMANTIC_VERSION = 20;

async function runSmokeTest2() {
    console.log(`Starting Smoke Test 2: ${semanticRunId}`);
    const results = {
        assetsSubmitted: 0,
        jobsCreated: 0,
        jobsCompleted: 0,
        proposedCount: 0,
        unknownCount: 0,
        reviewCount: 0,
        activeCount: 0,
        duplicateSemanticJobs: 0,
        duplicateEquivalentAnnotations: 0,
        stuckProcessingAssets: 0,
        unhandledDbErrors: 0,
        identityBridgeFailures: 0
    };

    try {
        // 1. Initial Teardown / Cleanup
        await supabase.from('atlas_harvester_config').update({
            harvester_enabled: true,
            youtube_harvester_enabled: false,
            user_discovery_enabled: false,
            backfill_enabled: false,
            semantic_auto_process_enabled: true
        }).eq('id', 1);

        // 2. Fetch the 10 provider assets from Smoke Test 1
        const { data: assets } = await supabase
            .from('atlas_provider_assets')
            .select('provider_asset_id, provider_content_id')
            .like('provider_content_id', 'smoke_vid_%')
            .in('semantic_status', ['PENDING', 'FAILED'])
            .limit(10);
        
        if (!assets || assets.length === 0) {
            throw new Error("No assets found from Smoke Test 1. Run smoke_test_1.ts first!");
        }

        results.assetsSubmitted = assets.length;

        // 3. Queue the assets for Semantic Processing
        for (const asset of assets) {
            const idempotencyKey = `SEMANTIC:${asset.provider_asset_id}:${SEMANTIC_VERSION}`;
            
            const { error: eqErr } = await supabase.rpc('enqueue_atlas_job', {
                p_queue_type: 'SEMANTIC',
                p_idempotency_key: idempotencyKey,
                p_payload: {
                    providerAssetId: asset.provider_asset_id,
                    semanticVersion: SEMANTIC_VERSION,
                    classifierVersion: 'v2.0'
                }
            });
            
            if (eqErr) throw eqErr;
            results.jobsCreated++;
        }

        // Semantic Idempotency Test
        // Enqueue the first one again
        const testAsset = assets[0];
        const { error: idempErr } = await supabase.rpc('enqueue_atlas_job', {
            p_queue_type: 'SEMANTIC',
            p_idempotency_key: `SEMANTIC:${testAsset.provider_asset_id}:${SEMANTIC_VERSION}`,
            p_payload: {
                providerAssetId: testAsset.provider_asset_id,
                semanticVersion: SEMANTIC_VERSION,
                classifierVersion: 'v2.0'
            }
        });
        if (idempErr) throw idempErr;

        // Count jobs in SEMANTIC queue for these assets
        const { count: jobCount } = await supabase.from('atlas_queues')
            .select('*', { count: 'exact', head: true })
            .eq('queue_type', 'SEMANTIC')
            .like('idempotency_key', `%:${SEMANTIC_VERSION}`);
        
        if (jobCount && jobCount > results.jobsCreated) {
            results.duplicateSemanticJobs = jobCount - results.jobsCreated;
        }

        // 4. Run Semantic Worker
        const worker = new SemanticWorker(supabase, 'semantic-worker-1');
        const processed = await worker.processSemanticQueue(20);
        results.jobsCompleted = processed;

        // 5. Check Output Annotations
        const { data: annotations } = await supabase.from('asset_semantic_annotations')
            .select('annotation_status, provider_asset_id, asset_id')
            .in('provider_asset_id', assets.map(a => a.provider_asset_id));
        
        for (const ann of annotations || []) {
            if (ann.annotation_status === 'PROPOSED') results.proposedCount++;
            if (ann.annotation_status === 'UNKNOWN') results.unknownCount++;
            if (ann.annotation_status === 'REVIEW') results.reviewCount++;
            if (ann.annotation_status === 'ACTIVE' || ann.annotation_status === 'VERIFIED') results.activeCount++;
            
            if (ann.provider_asset_id === null && ann.asset_id === null) {
                results.identityBridgeFailures++;
            }
        }

        // 6. Test Versioning/Reprocessing
        // Reprocess testAsset with version 21
        const SEMANTIC_VERSION_B = 21;
        await supabase.rpc('enqueue_atlas_job', {
            p_queue_type: 'SEMANTIC',
            p_idempotency_key: `SEMANTIC:${testAsset.provider_asset_id}:${SEMANTIC_VERSION_B}`,
            p_payload: {
                providerAssetId: testAsset.provider_asset_id,
                semanticVersion: SEMANTIC_VERSION_B,
                classifierVersion: 'v2.0'
            }
        });

        // Run worker just for this 1 job
        await worker.processSemanticQueue(1);

        // Verify that two annotations exist for this provider_asset_id
        const { data: dupAnnotations } = await supabase.from('asset_semantic_annotations')
            .select('semantic_version')
            .eq('provider_asset_id', testAsset.provider_asset_id);
        
        if (dupAnnotations?.length === 2) {
            // Expected! Two versions.
            if (dupAnnotations[0].semantic_version === dupAnnotations[1].semantic_version) {
                 results.duplicateEquivalentAnnotations = 1;
            }
        } else {
             results.duplicateEquivalentAnnotations = 1; // Something is wrong
        }

        // 7. Check for Stuck PROCESSING assets
        const { count: stuckCount } = await supabase.from('atlas_provider_assets')
            .select('*', { count: 'exact', head: true })
            .eq('semantic_status', 'PROCESSING');
        if (stuckCount) results.stuckProcessingAssets = stuckCount;

        console.log("\nATLAS HARVESTER V0 — SMOKE TEST 2 REPORT");
        console.log(`Assets Submitted: \t\t\t${results.assetsSubmitted}`);
        console.log(`Jobs Created: \t\t\t\t${results.jobsCreated}`);
        console.log(`Jobs Completed: \t\t\t${results.jobsCompleted}`);
        console.log(`PROPOSED Count: \t\t\t${results.proposedCount}`);
        console.log(`UNKNOWN Count: \t\t\t\t${results.unknownCount}`);
        console.log(`ACTIVE Count: \t\t\t\t${results.activeCount}`);
        console.log(`Identity Bridge Failures: \t\t${results.identityBridgeFailures}`);
        console.log(`Duplicate Semantic Jobs: \t\t${results.duplicateSemanticJobs}`);
        console.log(`Duplicate Equivalent Anns: \t\t${results.duplicateEquivalentAnnotations}`);
        console.log(`Stuck Processing Assets: \t\t${results.stuckProcessingAssets}`);
        console.log(`Unhandled DB errors: \t\t\t${results.unhandledDbErrors}`);

    } catch (e) {
        results.unhandledDbErrors++;
        console.error("SMOKE TEST 2 ENCOUNTERED AN ERROR:", e);
    } finally {
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

runSmokeTest2().catch(console.error);
