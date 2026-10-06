import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_SERVICE_KEY) { console.error('FATAL_CONFIG: Missing required SUPABASE_SECRET_KEY'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const smokeId = Math.random().toString(36).substring(2, 10);

async function run() {
    console.log(`Starting Outreach Smoke Test 3 (Suppression Race): ${smokeId}`);
    
    let campaignId = '';
    let contactId = '';
    let emailHash = '';
    
    try {
        await supabase.from('atlas_outreach_config').update({ outreach_enabled: true, send_enabled: false }).eq('id', 1);

        const { data: campaign } = await supabase.from('atlas_outreach_campaigns').insert({
            name: `SMOKE_3_${smokeId}`, purpose: 'B2B', message_type: 'PITCH', countries_allowed: ['AR'], recipient_types_allowed: ['PERSON'], campaign_enabled: true, max_daily_sends: 100
        }).select().single();
        campaignId = campaign.campaign_id;

        await supabase.from('atlas_outreach_policies').insert({
            country_code: 'AR', policy_version: `AR_${smokeId}`, effective_from: new Date(Date.now() - 86400000).toISOString(), recipient_type: 'PERSON', message_type: 'PITCH', status: 'ACTIVE'
        });

        const { data: contact } = await supabase.from('atlas_contacts').insert({
            email: `smoke3_${smokeId}@example.com`, email_normalized: `smoke3_${smokeId}@example.com`, email_hash: 'dummy', country_code: 'AR', recipient_type: 'PERSON', status: 'ACTIVE'
        }).select().single();
        contactId = contact.contact_id;
        emailHash = contact.email_hash;

        await supabase.rpc('enqueue_outreach_job', { p_campaign_id: campaignId, p_contact_id: contactId, p_idempotency_key: `OUTR3_${smokeId}` });

        // 1. Worker gets lease
        const { data: jobs } = await supabase.rpc('get_next_outreach_job', { p_worker_id: 'test3', p_limit: 1 });
        const job = jobs[0];

        // 2. Suppression Race: User unsubscribes RIGHT NOW
        console.log("Simulating concurrent UNSUBSCRIBE webhook...");
        await supabase.from('atlas_outreach_suppressions').insert({
            email_hash: emailHash,
            contact_id: contactId,
            scope: 'ALL',
            reason: 'UNSUBSCRIBED'
        });

        // 3. Worker invokes final_can_dispatch
        console.log("Worker checks final_can_dispatch...");
        const { data: canDispatch } = await supabase.rpc('final_can_dispatch', {
            p_job_id: job.job_id,
            p_worker_id: 'test3',
            p_lock_token: job.lock_token
        });

        // 4. Check results
        const { data: jobRow } = await supabase.from('atlas_outreach_queue').select('status').eq('job_id', job.job_id).single();
        const { data: simDeliveries } = await supabase.from('atlas_outreach_simulated_deliveries').select('*').eq('job_id', job.job_id);

        console.log(`\n=====================================`);
        console.log(`ATLAS OUTREACH SHADOW TEST 3`);
        console.log(`=====================================`);
        console.log(`final_can_dispatch result:    ${canDispatch}`);
        console.log(`Queue job status:             ${jobRow?.status}`);
        console.log(`Simulated Deliveries:         ${simDeliveries?.length || 0}`);

        if (canDispatch === false && jobRow?.status === 'BLOCKED' && (!simDeliveries || simDeliveries.length === 0)) {
            console.log(`\nSHADOW TEST 3 = PASS ✅`);
        } else {
            console.log(`\nSHADOW TEST 3 = FAIL ❌`);
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
        await supabase.from('atlas_outreach_suppressions').delete().eq('email_hash', emailHash);
    }
}
run();
