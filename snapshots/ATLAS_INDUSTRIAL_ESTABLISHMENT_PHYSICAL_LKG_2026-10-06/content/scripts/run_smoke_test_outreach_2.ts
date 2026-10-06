import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import { OutreachWorker } from './workers/outreach_worker';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_SERVICE_KEY) { console.error('FATAL_CONFIG: Missing required SUPABASE_SECRET_KEY'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const smokeId = Math.random().toString(36).substring(2, 10);

async function run() {
    console.log(`Starting Outreach Smoke Test 2 (Concurrency): ${smokeId}`);
    
    let campaignId = '';
    let contactIds: string[] = [];

    try {
        // 1. Setup
        await supabase.from('atlas_outreach_config').update({ outreach_enabled: true, send_enabled: false }).eq('id', 1);

        const { data: campaign } = await supabase.from('atlas_outreach_campaigns').insert({
            name: `SMOKE_2_${smokeId}`,
            purpose: 'B2B',
            message_type: 'PITCH',
            countries_allowed: ['AR'],
            recipient_types_allowed: ['PERSON'],
            campaign_enabled: true,
            max_daily_sends: 100 // Test boundary is exactly 100
        }).select().single();
        campaignId = campaign.campaign_id;

        await supabase.from('atlas_outreach_policies').insert({
            country_code: 'AR',
            policy_version: `AR_${smokeId}`,
            effective_from: new Date(Date.now() - 86400000).toISOString(),
            recipient_type: 'PERSON',
            message_type: 'PITCH',
            status: 'ACTIVE'
        });

        const batch = Array.from({length: 10}).map((_, j) => ({
            email: `smoke2_${smokeId}_${j}@example.com`,
            email_normalized: `smoke2_${smokeId}_${j}@example.com`,
            email_hash: 'dummy',
            country_code: 'AR',
            recipient_type: 'PERSON',
            status: 'ACTIVE'
        }));
        const { data: contacts } = await supabase.from('atlas_contacts').insert(batch).select('contact_id');
        contactIds = contacts!.map(c => c.contact_id);

        for (const cid of contactIds) {
            await supabase.rpc('enqueue_outreach_job', {
                p_campaign_id: campaignId,
                p_contact_id: cid,
                p_idempotency_key: `OUTREACH2_${smokeId}_${cid}`
            });
        }

        // 2. Set budget to 99 manually!
        const today = new Date().toISOString().split('T')[0];
        await supabase.from('atlas_outreach_daily_usage').insert({
            usage_date: today,
            metric: 'CAMPAIGN_SEND',
            entity_id: campaignId,
            usage_count: 99
        });

        // 3. Launch 10 workers concurrently
        console.log("Launching 10 concurrent workers...");
        const workers = Array.from({length: 10}).map((_, i) => new OutreachWorker(SUPABASE_URL, SUPABASE_SERVICE_KEY, `worker_test2_${i}`));
        
        const results = await Promise.all(workers.map(w => w.processNextJob()));

        const successes = results.filter(r => r.success).length;
        const outOfBudget = results.filter(r => !r.success && r.reason === 'BUDGET_EXHAUSTED').length;

        // 4. Verify Final Budget
        const { data: usageRow } = await supabase.from('atlas_outreach_daily_usage')
            .select('usage_count').eq('metric', 'CAMPAIGN_SEND').eq('entity_id', campaignId).single();

        console.log(`\n=====================================`);
        console.log(`ATLAS OUTREACH SHADOW TEST 2`);
        console.log(`=====================================`);
        console.log(`Successful leases & sends:    ${successes}`);
        console.log(`Rejected by budget bounds:    ${outOfBudget}`);
        console.log(`Final Database Usage Count:   ${usageRow?.usage_count}`);

        if (successes === 1 && outOfBudget === 9 && usageRow?.usage_count === 100) {
            console.log(`\nSHADOW TEST 2 = PASS ✅`);
        } else {
            console.log(`\nSHADOW TEST 2 = FAIL ❌`);
        }

    } catch (e) {
        console.error("Test error:", e);
    } finally {
        console.log("Cleanup...");
        await supabase.from('atlas_outreach_queue').delete().eq('campaign_id', campaignId);
        await supabase.from('atlas_outreach_compliance').delete().eq('campaign_id', campaignId);
        await supabase.from('atlas_outreach_campaigns').delete().eq('campaign_id', campaignId);
        await supabase.from('atlas_contacts').delete().in('contact_id', contactIds);
        await supabase.from('atlas_outreach_policies').delete().eq('policy_version', `AR_${smokeId}`);
        await supabase.from('atlas_outreach_daily_usage').delete().eq('entity_id', campaignId);
    }
}

run();
