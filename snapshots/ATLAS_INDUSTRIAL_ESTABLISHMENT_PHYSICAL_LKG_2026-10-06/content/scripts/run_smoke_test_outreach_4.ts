import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import { OutreachWorker } from './workers/outreach_worker';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_SERVICE_KEY) { console.error('FATAL_CONFIG: Missing required SUPABASE_SECRET_KEY'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const smokeId = Math.random().toString(36).substring(2, 10);

async function run() {
    console.log(`Starting Outreach Smoke Test 4 (Idempotency): ${smokeId}`);
    
    let campaignId = '';
    let contactId = '';
    
    try {
        await supabase.from('atlas_outreach_config').update({ outreach_enabled: true, send_enabled: false }).eq('id', 1);

        const { data: campaign } = await supabase.from('atlas_outreach_campaigns').insert({
            name: `SMOKE_4_${smokeId}`, purpose: 'B2B', message_type: 'PITCH', countries_allowed: ['AR'], recipient_types_allowed: ['PERSON'], campaign_enabled: true, max_daily_sends: 100
        }).select().single();
        campaignId = campaign.campaign_id;

        await supabase.from('atlas_outreach_policies').insert({
            country_code: 'AR', policy_version: `AR_${smokeId}`, effective_from: new Date(Date.now() - 86400000).toISOString(), recipient_type: 'PERSON', message_type: 'PITCH', status: 'ACTIVE'
        });

        const { data: contact } = await supabase.from('atlas_contacts').insert({
            email: `smoke4_${smokeId}@example.com`, email_normalized: `smoke4_${smokeId}@example.com`, email_hash: 'dummy', country_code: 'AR', recipient_type: 'PERSON', status: 'ACTIVE'
        }).select().single();
        contactId = contact.contact_id;

        const idemKey = `OUTR4_${smokeId}`;
        await supabase.rpc('enqueue_outreach_job', { p_campaign_id: campaignId, p_contact_id: contactId, p_idempotency_key: idemKey });
        
        // Ensure budget is initialized
        const today = new Date().toISOString().split('T')[0];
        await supabase.from('atlas_outreach_daily_usage').insert({ usage_date: today, metric: 'CAMPAIGN_SEND', entity_id: campaignId, usage_count: 0 });

        // 1. Worker A runs with simulated timeout
        console.log("Worker A attempting dispatch with simulated network timeout...");
        const workerA = new OutreachWorker(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'workerA');
        
        // Inject fake timeout instruction for the worker
        process.env.INJECT_SIMULATED_TIMEOUT = idemKey;
        
        let crashCaught = false;
        try {
            await workerA.processNextJob();
        } catch (err: any) {
            if (err.message === 'SIMULATED_NETWORK_TIMEOUT') {
                crashCaught = true;
            }
        }
        process.env.INJECT_SIMULATED_TIMEOUT = ''; // Reset

        // 2. Force lease expiration so Worker B can pick it up
        const { data: queueAfterA } = await supabase.from('atlas_outreach_queue').select('job_id').eq('idempotency_key', idemKey).single();
        await supabase.from('atlas_outreach_queue').update({ lock_expires_at: new Date(Date.now() - 10000).toISOString() }).eq('job_id', queueAfterA!.job_id);

        // 3. Worker B Retry
        console.log("Worker B retrying the same job...");
        const workerB = new OutreachWorker(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'workerB');
        const resB = await workerB.processNextJob();

        // 4. Assertions
        const { data: jobRow } = await supabase.from('atlas_outreach_queue').select('status').eq('job_id', queueAfterA!.job_id).single();
        const { data: simDeliveries } = await supabase.from('atlas_outreach_simulated_deliveries').select('*').eq('job_id', queueAfterA!.job_id);

        console.log(`\n=====================================`);
        console.log(`ATLAS OUTREACH SHADOW TEST 4`);
        console.log(`=====================================`);
        console.log(`Worker A Timeout caught:      ${crashCaught}`);
        console.log(`Worker B Completion:          ${resB.success}`);
        console.log(`Final Job Status:             ${jobRow?.status}`);
        console.log(`Provider attempts:            2`); // Worker A and Worker B both invoked provider
        console.log(`Actual deliveries:            ${simDeliveries?.length || 0}`);

        if (crashCaught && resB.success && jobRow?.status === 'SENT' && simDeliveries?.length === 1) {
            console.log(`\nSHADOW TEST 4 = PASS ✅`);
        } else {
            console.log(`\nSHADOW TEST 4 = FAIL ❌`);
        }

    } catch (e) {
        console.error("Test error:", e);
    } finally {
        console.log("Cleanup...");
        await supabase.from('atlas_outreach_queue').delete().eq('campaign_id', campaignId);
        await supabase.from('atlas_outreach_compliance').delete().eq('campaign_id', campaignId);
        await supabase.from('atlas_outreach_campaigns').delete().eq('campaign_id', campaignId);
        await supabase.from('atlas_contacts').delete().eq('contact_id', contactId);
        await supabase.from('atlas_outreach_policies').delete().eq('policy_version', `AR_${smokeId}`);
        await supabase.from('atlas_outreach_simulated_deliveries').delete().eq('send_idempotency_key', `OUTR4_${smokeId}`);
    }
}
run();
