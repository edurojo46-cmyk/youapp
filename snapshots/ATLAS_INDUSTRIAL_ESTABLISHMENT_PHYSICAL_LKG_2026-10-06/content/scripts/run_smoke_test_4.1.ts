import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_SERVICE_KEY) { console.error('FATAL_CONFIG: Missing required SUPABASE_SECRET_KEY'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function runSmokeTest41() {
    const smoke41RunId = Math.random().toString(36).substring(2, 10);
    console.log(`Starting Smoke Test 4.1: SMOKE41-${smoke41RunId}`);

    let report = {
        sourceA: { accepted: 0, rejected: 0, total: 11 },
        sourcesB_J: { accepted: 0, rejected: 0, total: 90 },
        sourceK: { accepted: 0, rejected: 0, total: 1 },
        globalTotalUsage: 0,
        killSwitch: { offLeases: -1, onLeases: -1 }
    };

    let originalConfig: any = null;
    const sourceIds: string[] = [];
    let cleanupOffset = 0;
    let baselineDataCount = 0;

    try {
        // 1. Fetch original config
        const { data: oc } = await supabase.from('atlas_harvester_config').select('*').eq('id', 1).single();
        originalConfig = oc;

        // 2. Read BASELINE Global Usage for BACKFILL to avoid destructive deletions
        const { data: baselineData } = await supabase.from('atlas_harvester_daily_usage')
            .select('usage_count')
            .eq('usage_date', new Date().toISOString().split('T')[0])
            .eq('metric', 'BACKFILL')
            .is('source_id', null)
            .maybeSingle();
            
        const baseline = baselineData?.usage_count || 0;
        baselineDataCount = baseline;
        console.log(`Baseline Global BACKFILL Usage: ${baseline}`);

        // 3. Setup strict budget config relative to baseline
        await supabase.from('atlas_harvester_config').update({
            harvester_enabled: true,
            youtube_harvester_enabled: true,
            user_discovery_enabled: false,
            backfill_enabled: true,
            semantic_auto_process_enabled: false,
            max_backfill_daily: baseline + 100,
            max_per_source_daily: 10
        }).eq('id', 1);

        // 4. Create 11 sources
        for(let i=0; i<11; i++) {
            const { data: s, error } = await supabase.from('atlas_sources').insert({
                provider: 'YOUTUBE',
                source_type: 'YOUTUBE_CHANNEL',
                provider_source_id: `SMOKE41_CH_${i}_${smoke41RunId}`,
                status: 'ACTIVE',
                discovery_method: 'SYSTEM_DEFAULT'
            }).select('source_id').single();
            if (error) {
                console.error("Error inserting source:", error);
                throw error;
            }
            sourceIds.push(s!.source_id);
        }

        const sourceA = sourceIds[0];
        const sourcesB_J = sourceIds.slice(1, 10); // 9 sources
        const sourceK = sourceIds[10];

        // 5. Source A: 11 candidates (BACKFILL metric)
        console.log("Testing Source A (11 candidates)...");
        for(let i=0; i<11; i++) {
            const { data: eqA } = await supabase.rpc('enqueue_atlas_job', {
                p_queue_type: 'DISCOVERY',
                p_idempotency_key: `SMOKE41:${sourceA}:VID_${i}`,
                p_payload: { providerContentId: `VID_${i}`, discoveredVia: 'BACKFILL' },
                p_source_id: sourceA,
                p_metric: 'BACKFILL'
            });
            if (eqA === true) { report.sourceA.accepted++; cleanupOffset++; }
            else report.sourceA.rejected++;
        }

        // Verify Source A usage (10) and Global usage (baseline + 10)
        const { data: usageA } = await supabase.from('atlas_harvester_daily_usage').select('usage_count').eq('source_id', sourceA).single();
        const { data: usageGlobalA } = await supabase.from('atlas_harvester_daily_usage')
            .select('usage_count')
            .eq('metric', 'BACKFILL')
            .is('source_id', null)
            .single();
        console.log(`Source A Usage: ${usageA?.usage_count} | Global Usage: ${usageGlobalA?.usage_count}`);

        // 6. Sources B_J: 10 candidates each (90 total)
        console.log("Testing Sources B-J (90 candidates)...");
        for (const sId of sourcesB_J) {
            for(let i=0; i<10; i++) {
                const { data: eq } = await supabase.rpc('enqueue_atlas_job', {
                    p_queue_type: 'DISCOVERY',
                    p_idempotency_key: `SMOKE41:${sId}:VID_${i}`,
                    p_payload: { providerContentId: `VID_${i}`, discoveredVia: 'BACKFILL' },
                    p_source_id: sId,
                    p_metric: 'BACKFILL'
                });
                if (eq === true) { report.sourcesB_J.accepted++; cleanupOffset++; }
                else report.sourcesB_J.rejected++;
            }
        }

        // Global usage should now be baseline + 100
        const { data: usageGlobalB } = await supabase.from('atlas_harvester_daily_usage')
            .select('usage_count')
            .eq('metric', 'BACKFILL')
            .is('source_id', null)
            .single();
        report.globalTotalUsage = usageGlobalB?.usage_count || 0;
        console.log(`Global Usage after B-J: ${report.globalTotalUsage}`);

        // 7. Source K: 1 candidate (should fail globally)
        console.log("Testing Source K (1 candidate)...");
        const { data: eqK } = await supabase.rpc('enqueue_atlas_job', {
            p_queue_type: 'DISCOVERY',
            p_idempotency_key: `SMOKE41:${sourceK}:VID_0`,
            p_payload: { providerContentId: `VID_0`, discoveredVia: 'BACKFILL' },
            p_source_id: sourceK,
            p_metric: 'BACKFILL'
        });
        if (eqK === true) { report.sourceK.accepted++; cleanupOffset++; }
        else report.sourceK.rejected++;

        // 8. KILL SWITCH TEST (Native SQL)
        console.log("Testing Kill Switch Native Enforcement...");
        // Disable global harvester
        await supabase.from('atlas_harvester_config').update({ harvester_enabled: false }).eq('id', 1);
        
        // Attempt to fetch lease (should be 0)
        const { data: offJobs } = await supabase.rpc('get_next_atlas_job', {
            p_queue_type: 'DISCOVERY',
            p_worker_id: 'smoke41-worker'
        });
        console.log("Kill Switch OFF returned:", offJobs);
        report.killSwitch.offLeases = offJobs?.length || 0;

        // Re-enable global harvester
        await supabase.from('atlas_harvester_config').update({ harvester_enabled: true }).eq('id', 1);

        // Attempt to fetch lease (should be 1 because we enqueue a dummy job first)
        
        // We need to enqueue 1 job to fetch since the queue might be empty of backfill jobs!
        await supabase.rpc('enqueue_atlas_job', {
            p_queue_type: 'DISCOVERY',
            p_idempotency_key: `SMOKE41:KILLSWITCH:${smoke41RunId}`,
            p_payload: { providerContentId: `VID_KS`, discoveredVia: 'BACKFILL' }
        });

        const { data: onJobs } = await supabase.rpc('get_next_atlas_job', {
            p_queue_type: 'DISCOVERY',
            p_worker_id: 'smoke41-worker'
        });
        console.log("Kill Switch ON returned:", onJobs);
        report.killSwitch.onLeases = onJobs?.length || 0;

        // Unlock the job acquired
        if (onJobs && onJobs.length > 0) {
            await supabase.from('atlas_queues').update({ status: 'PENDING', locked_by: null }).eq('job_id', onJobs[0].job_id);
        }
    } catch (err) {
        console.error("FATAL ERROR IN TEST:", err);
    } finally {
        console.log("Performing cleanup...");
        // Restore Config
        if (originalConfig) {
            delete originalConfig.updated_at;
            await supabase.from('atlas_harvester_config').update(originalConfig).eq('id', 1);
        }

        // Cleanup Queues explicitly for THIS run only
        await supabase.from('atlas_queues').delete().like('idempotency_key', `SMOKE41:%`);

        // Cleanup Sources
        if (sourceIds.length > 0) {
            // Also cleanup the daily usage for these exact sources
            await supabase.from('atlas_harvester_daily_usage').delete().in('source_id', sourceIds);
            // Delete the sources themselves
            await supabase.from('atlas_sources').delete().in('source_id', sourceIds);
        }

        // Revert global usage offset
        if (cleanupOffset > 0) {
            const { data: endUsage } = await supabase.from('atlas_harvester_daily_usage')
                .select('usage_count')
                .eq('metric', 'BACKFILL')
                .is('source_id', null)
                .maybeSingle();
            
            if (endUsage) {
                await supabase.from('atlas_harvester_daily_usage')
                    .update({ usage_count: Math.max(0, endUsage.usage_count - cleanupOffset) })
                    .eq('metric', 'BACKFILL')
                    .is('source_id', null);
                console.log(`Reverted Global BACKFILL Usage by ${cleanupOffset}`);
            }
        }
    }

    // Generate Final Report
    console.log("\n====================================");
    console.log("SMOKE TEST 4.1 REPORT");
    console.log("====================================\n");

    console.log(`Source A (Max 10)`);
    console.log(`  Accepted: ${report.sourceA.accepted} (Expected 10)`);
    console.log(`  Rejected: ${report.sourceA.rejected} (Expected 1)\n`);

    console.log(`Sources B-J (Total 90)`);
    console.log(`  Accepted: ${report.sourcesB_J.accepted} (Expected 90)`);
    console.log(`  Rejected: ${report.sourcesB_J.rejected} (Expected 0)\n`);

    console.log(`Global Usage Verification`);
    console.log(`  Global Counter: ${report.globalTotalUsage} (Expected baseline + 100)`);
    const isGlobalExpected = report.globalTotalUsage === baselineDataCount + 100;
    console.log(`  Expected matches Actual: ${isGlobalExpected ? 'YES' : 'NO'}\n`);

    console.log(`Source K (Max 10 / Global 100)`);
    console.log(`  Accepted: ${report.sourceK.accepted} (Expected 0)`);
    console.log(`  Rejected: ${report.sourceK.rejected} (Expected 1)\n`);

    console.log(`Kill Switch Verification`);
    console.log(`  Leases when backfill_enabled=FALSE: ${report.killSwitch.offLeases} (Expected 0)`);
    console.log(`  Leases when backfill_enabled=TRUE:  ${report.killSwitch.onLeases} (Expected 1)`);
}

runSmokeTest41();
