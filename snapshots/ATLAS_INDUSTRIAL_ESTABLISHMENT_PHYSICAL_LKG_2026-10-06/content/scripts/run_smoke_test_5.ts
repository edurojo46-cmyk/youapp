import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_SERVICE_KEY) { console.error('FATAL_CONFIG: Missing required SUPABASE_SECRET_KEY'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const smoke5RunId = Math.random().toString(36).substring(2, 10);
console.log(`Starting Smoke Test 5: SMOKE5-${smoke5RunId}`);

const report = {
    dailyIsolation: 'FAIL',
    atomicBoundary999: 'FAIL',
    burstBoundary990: 'FAIL',
    volume: 'FAIL',
    doubleLeases: -1,
    staleRecovery: 'FAIL',
    newLockTokens: 'FAIL',
    badOrigins: -1,
    killSwitch: 'FAIL',
    cleanup: 'FAIL'
};

let initialGlobalUsage = 0;
let initialConfig: any = null;

async function run() {
    try {
        // --- 5G. Baseline Capture ---
        const { data: config } = await supabase.from('atlas_harvester_config').select('*').eq('id', 1).single();
        initialConfig = config;

        // Baseline Budget
        const today = new Date().toISOString().split('T')[0];
        const { data: bData } = await supabase.from('atlas_harvester_daily_usage')
            .select('usage_count')
            .eq('metric', 'BACKFILL')
            .is('source_id', null)
            .eq('usage_date', today)
            .maybeSingle();
        initialGlobalUsage = bData?.usage_count || 0;
        console.log(`Baseline Global BACKFILL Usage: ${initialGlobalUsage}`);

        // Increase limits for test: Global 10000 exactly, per_source 2000 to not conflict
        await supabase.from('atlas_harvester_config').update({
            max_backfill_daily: initialGlobalUsage + 10000,
            max_per_source_daily: 2000,
            backfill_enabled: true,
            harvester_enabled: true,
            youtube_harvester_enabled: true
        }).eq('id', 1);

        // --- 5A. Daily Isolation ---
        console.log("5A: Testing Daily Isolation (Mocking D-6 to D-1)...");
        for (let i = 1; i <= 6; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const ds = d.toISOString().split('T')[0];
            await supabase.from('atlas_harvester_daily_usage').insert({
                usage_date: ds,
                metric: 'BACKFILL',
                usage_count: 1000
            });
        }

        const { data: d0Check } = await supabase.rpc('reserve_atlas_budget', {
            p_metric: 'BACKFILL',
            p_source_id: null,
            p_amount: 1
        });
        
        if (d0Check) report.dailyIsolation = 'PASS';
        else console.error("Failed daily isolation check!");

        // --- 5B. Atomic Boundary ---
        console.log("5B: Testing Atomic Boundaries...");
        // 999 + 10 workers
        // Since max_backfill_daily is +10000, we'll configure a fake source limit to 1000 and test the source limit
        const sourceBoundaryId = `00000000-0000-0000-0000-00000000005b`;
        const { error: insErr1 } = await supabase.from('atlas_sources').insert({
            source_id: sourceBoundaryId,
            provider: 'YOUTUBE',
            source_type: 'YOUTUBE_CHANNEL',
            provider_source_id: `SMOKE5_CH_B_${smoke5RunId}`,
            status: 'ACTIVE',
            discovery_method: 'BACKFILL'
        });
        if (insErr1) console.error("Insert source 1 failed:", insErr1);

        // Adjust global budget explicitly for exactly 1000 from current usage
        const { data: b999 } = await supabase.from('atlas_harvester_daily_usage')
            .select('usage_count').eq('metric', 'BACKFILL').is('source_id', null).eq('usage_date', today).single();
        const currentGlobal999 = b999?.usage_count || 0;
        await supabase.from('atlas_harvester_config').update({ max_backfill_daily: currentGlobal999 + 1000 }).eq('id', 1);

        // Use 999
        await supabase.rpc('reserve_atlas_budget', { p_metric: 'BACKFILL', p_source_id: sourceBoundaryId, p_amount: 999 });

        const workers999 = Array.from({ length: 10 }).map(() => supabase.rpc('reserve_atlas_budget', { p_metric: 'BACKFILL', p_source_id: sourceBoundaryId, p_amount: 1 }));
        const res999 = await Promise.all(workers999);
        const trueCount999 = res999.filter(r => r.data === true).length;
        const falseCount999 = res999.filter(r => r.data === false).length;

        if (trueCount999 === 1 && falseCount999 === 9) {
            report.atomicBoundary999 = 'PASS';
        } else {
            console.error(`Boundary 999 failed: ${trueCount999} true, ${falseCount999} false`);
        }

        // 990 + 20 workers
        const sourceBoundaryId2 = `00000000-0000-0000-0000-0000000005b2`;
        const { error: insErr2 } = await supabase.from('atlas_sources').insert({
            source_id: sourceBoundaryId2,
            provider: 'YOUTUBE',
            source_type: 'YOUTUBE_CHANNEL',
            provider_source_id: `SMOKE5_CH_B2_${smoke5RunId}`,
            status: 'ACTIVE',
            discovery_method: 'BACKFILL'
        });
        if (insErr2) console.error("Insert source 2 failed:", insErr2);

        // Adjust global budget explicitly for exactly 1000 from current usage
        const { data: b990 } = await supabase.from('atlas_harvester_daily_usage')
            .select('usage_count').eq('metric', 'BACKFILL').is('source_id', null).eq('usage_date', today).single();
        const currentGlobal990 = b990?.usage_count || 0;
        await supabase.from('atlas_harvester_config').update({ max_backfill_daily: currentGlobal990 + 1000 }).eq('id', 1);

        await supabase.rpc('reserve_atlas_budget', { p_metric: 'BACKFILL', p_source_id: sourceBoundaryId2, p_amount: 990 });

        const workers990 = Array.from({ length: 20 }).map(() => supabase.rpc('reserve_atlas_budget', { p_metric: 'BACKFILL', p_source_id: sourceBoundaryId2, p_amount: 1 }));
        const res990 = await Promise.all(workers990);
        const trueCount990 = res990.filter(r => r.data === true).length;
        const falseCount990 = res990.filter(r => r.data === false).length;

        if (trueCount990 === 10 && falseCount990 === 10) {
            report.burstBoundary990 = 'PASS';
        } else {
            console.error(`Burst 990 failed: ${trueCount990} true, ${falseCount990} false`);
        }

        // Reset global budget to high for the rest of tests
        await supabase.from('atlas_harvester_config').update({ max_backfill_daily: currentGlobal990 + 10000 }).eq('id', 1);

        // --- 5C. Volume (7,000 synthetic jobs) ---
        console.log("5C: Testing 7,000 queue volume (synthetic inserts)...");
        const batchSize = 1000;
        let inserted = 0;
        for (let b = 0; b < 7; b++) {
            const batch = Array.from({ length: batchSize }).map((_, i) => ({
                queue_type: 'DISCOVERY',
                idempotency_key: `SMOKE5:VOL:${b}:${i}:${smoke5RunId}`,
                payload: { providerContentId: `VID_${b}_${i}`, discoveredVia: 'BACKFILL' },
                priority: 5,
                status: 'PENDING'
            }));
            const { error: insertErr } = await supabase.from('atlas_queues').insert(batch);
            if (insertErr) {
                console.error("Batch insert failed:", insertErr);
                break;
            }
            inserted += batchSize;
        }
        
        if (inserted === 7000) {
            // Fast consume with 10 workers
            let consumed = 0;
            const consumeFn = async (wId: string) => {
                while (true) {
                    const { data: jobs } = await supabase.rpc('get_next_atlas_job', { p_queue_type: 'DISCOVERY', p_worker_id: wId });
                    if (!jobs || jobs.length === 0) break;
                    // Mark completed
                    await supabase.from('atlas_queues').update({ status: 'COMPLETED' }).eq('job_id', jobs[0].job_id);
                    consumed++;
                }
            };
            await Promise.all(Array.from({ length: 10 }).map((_, i) => consumeFn(`smoke5-vol-${i}`)));
            
            // Allow some tolerance if previous smoke tests left things, but we expect ~7000
            if (consumed >= 7000) report.volume = 'PASS';
            console.log(`Consumed: ${consumed}`);
        }

        // --- 5D. Lease Concurrency (100 jobs, 10 workers) ---
        console.log("5D: Testing Lease Concurrency...");
        const concBatch = Array.from({ length: 100 }).map((_, i) => ({
            queue_type: 'DISCOVERY',
            idempotency_key: `SMOKE5:CONC:${i}:${smoke5RunId}`,
            payload: { providerContentId: `VID_CONC_${i}`, discoveredVia: 'BACKFILL' },
            priority: 5,
            status: 'PENDING'
        }));
        await supabase.from('atlas_queues').insert(concBatch);
        
        let acquiredJobs = new Set<string>();
        let doubleLeases = 0;
        
        const concWorker = async (wId: string) => {
            while (true) {
                const { data: jobs } = await supabase.rpc('get_next_atlas_job', { p_queue_type: 'DISCOVERY', p_worker_id: wId });
                if (!jobs || jobs.length === 0) break;
                if (acquiredJobs.has(jobs[0].job_id)) doubleLeases++;
                acquiredJobs.add(jobs[0].job_id);
                // DON'T complete them yet, we need some for 5E!
            }
        };
        await Promise.all(Array.from({ length: 10 }).map((_, i) => concWorker(`smoke5-conc-${i}`)));
        report.doubleLeases = doubleLeases;

        // --- 5E. Worker crash & stale recovery ---
        console.log("5E: Testing Stale Recovery...");
        const { data: staleJobs } = await supabase.from('atlas_queues')
            .select('*')
            .like('idempotency_key', `SMOKE5:CONC:%:${smoke5RunId}`)
            .eq('status', 'PROCESSING')
            .limit(5);
            
        if (staleJobs && staleJobs.length === 5) {
            const oldTokens = staleJobs.map(j => j.lock_token);
            const oldLockedBy = staleJobs.map(j => j.locked_by);
            
            // Force expire
            for (const j of staleJobs) {
                await supabase.from('atlas_queues')
                    .update({ lock_expires_at: new Date(Date.now() - 3600000).toISOString() })
                    .eq('job_id', j.job_id);
            }
            
            // Recover
            let recoveredTokens: string[] = [];
            let recoveredLockedBy: string[] = [];
            
            for (let i = 0; i < 5; i++) {
                const { data: rec } = await supabase.rpc('get_next_atlas_job', { p_queue_type: 'DISCOVERY', p_worker_id: 'smoke5-rec' });
                if (rec && rec.length > 0) {
                    recoveredTokens.push(rec[0].lock_token);
                    recoveredLockedBy.push(rec[0].locked_by);
                }
            }
            
            if (recoveredTokens.length === 5) {
                report.staleRecovery = 'PASS';
                
                let tokensDiff = true;
                for (let i=0; i<5; i++) {
                    if (oldTokens.includes(recoveredTokens[i])) tokensDiff = false;
                }
                if (tokensDiff) report.newLockTokens = 'PASS';
            }
        }

        // --- 5F. Fail-closed ---
        console.log("5F: Testing Fail-closed...");
        await supabase.from('atlas_queues').insert([
            { queue_type: 'DISCOVERY', idempotency_key: `SMOKE5:FC1:${smoke5RunId}`, payload: { discovered_via: 'BACKFILL' }, status: 'PENDING' },
            { queue_type: 'DISCOVERY', idempotency_key: `SMOKE5:FC2:${smoke5RunId}`, payload: { discoveredVia: 'UNKNOWN' }, status: 'PENDING' }
        ]);
        
        let badOrigins = 0;
        await supabase.rpc('get_next_atlas_job', { p_queue_type: 'DISCOVERY', p_worker_id: 'badworker' }).then(r => badOrigins += r.data?.length || 0);
        report.badOrigins = badOrigins;

        await supabase.from('atlas_harvester_config').update({ harvester_enabled: false }).eq('id', 1);
        await supabase.from('atlas_queues').insert([
            { queue_type: 'DISCOVERY', idempotency_key: `SMOKE5:FC3:${smoke5RunId}`, payload: { discoveredVia: 'BACKFILL' }, status: 'PENDING' }
        ]);
        let ksLeases = 0;
        await supabase.rpc('get_next_atlas_job', { p_queue_type: 'DISCOVERY', p_worker_id: 'badworker' }).then(r => ksLeases += r.data?.length || 0);
        if (ksLeases === 0) report.killSwitch = 'PASS';

    } catch (err) {
        console.error("FATAL ERROR IN TEST:", err);
    } finally {
        console.log("Performing cleanup...");
        try {
            // Restore config
            if (initialConfig) {
                await supabase.from('atlas_harvester_config').update(initialConfig).eq('id', 1);
            }

            // Cleanup Queues
            await supabase.from('atlas_queues').delete().like('idempotency_key', `SMOKE5:%`);

            // Cleanup Sources
            await supabase.from('atlas_sources').delete().like('provider_source_id', `SMOKE5_%`);

            // Revert D0 Usage (only what was added to test limits)
            const today = new Date().toISOString().split('T')[0];
            const { data: usageAfter } = await supabase.from('atlas_harvester_daily_usage')
                .select('usage_count')
                .eq('metric', 'BACKFILL')
                .is('source_id', null)
                .eq('usage_date', today)
                .maybeSingle();
                
            let diff = (usageAfter?.usage_count || 0) - initialGlobalUsage;
            if (diff > 0) {
                await supabase.from('atlas_harvester_daily_usage')
                    .update({ usage_count: initialGlobalUsage })
                    .eq('metric', 'BACKFILL')
                    .is('source_id', null)
                    .eq('usage_date', today);
                console.log(`Reverted Global BACKFILL Usage by ${diff}`);
            }

            // Cleanup older days simulated
            for (let i = 1; i <= 6; i++) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const ds = d.toISOString().split('T')[0];
                await supabase.from('atlas_harvester_daily_usage')
                    .delete()
                    .eq('usage_date', ds)
                    .eq('metric', 'BACKFILL')
                    .is('source_id', null);
            }

            report.cleanup = 'PASS';
        } catch (cleanupErr) {
            console.error("Error during cleanup:", cleanupErr);
        }

        console.log(`\n====================================`);
        console.log(`ATLAS SMOKE TEST 5`);
        console.log(`====================================\n`);
        console.log(`Daily isolation             ${report.dailyIsolation}`);
        console.log(`999 concurrent boundary     ${report.atomicBoundary999}`);
        console.log(`990 burst boundary          ${report.burstBoundary990}`);
        console.log(`7,000 queue volume          ${report.volume}`);
        console.log(`Double leases:              ${report.doubleLeases}`);
        console.log(`Stale recovery:             ${report.staleRecovery}`);
        console.log(`New lock tokens:            ${report.newLockTokens}`);
        console.log(`Bad origins leased:         ${report.badOrigins}`);
        console.log(`Kill switch:                ${report.killSwitch}`);
        console.log(`Cleanup:                    ${report.cleanup}\n`);

        const allPass = Object.values(report).every(v => v === 'PASS' || v === 0);
        console.log(`SMOKE TEST 5 = ${allPass ? 'PASS ✅' : 'FAIL ❌'}`);
    }
}

run();
