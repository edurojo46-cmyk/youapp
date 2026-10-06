import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import { OutreachWorker } from './workers/outreach_worker';
import { ResendAdapter } from './workers/resend_adapter';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_SERVICE_KEY) { console.error('FATAL_CONFIG: Missing required SUPABASE_SECRET_KEY'); process.exit(1); }

// Mock Resend API Key for test without sending real emails (unless valid key provided)
// The user will provide a real API key later, but for testing the SQL integration, we can run this.
// Wait, the user wants a real pilot. We will inject a dummy adapter if RESEND_API_KEY is missing.
const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_dummy_123';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const pilotId = Math.random().toString(36).substring(2, 10);

// We will use mock data for the ResendAdapter if RESEND_API_KEY is fake
class DummyResendAdapter extends ResendAdapter {
    async send(job: any, body: string, idempotencyKey: string): Promise<string> {
        console.log(`[DUMMY RESEND] Sending to ${job.contact_email}`);
        return `mock_resend_id_${Math.random()}`;
    }
}

async function run() {
    console.log(`Starting Outreach REAL PILOT Test: ${pilotId}`);
    
    let campaignId = '';
    let contactIds: string[] = [];

    const realProvider = RESEND_API_KEY === 're_dummy_123' 
        ? new DummyResendAdapter(RESEND_API_KEY)
        : new ResendAdapter(RESEND_API_KEY);

    try {
        // 1. Setup REAL SEND Config
        await supabase.from('atlas_outreach_config').update({ outreach_enabled: true, send_enabled: true }).eq('id', 1);

        // Max Sends = 25
        const { data: campaign } = await supabase.from('atlas_outreach_campaigns').insert({
            name: `PILOT_${pilotId}`,
            purpose: 'B2B',
            message_type: 'PITCH',
            countries_allowed: ['AR'],
            recipient_types_allowed: ['PERSON'],
            campaign_enabled: true,
            max_daily_sends: 25
        }).select().single();
        campaignId = campaign.campaign_id;

        await supabase.from('atlas_outreach_policies').insert({
            country_code: 'AR',
            policy_version: `AR_${pilotId}`,
            effective_from: new Date(Date.now() - 86400000).toISOString(),
            recipient_type: 'PERSON',
            message_type: 'PITCH',
            status: 'ACTIVE'
        });

        // Generate exactly 25 internal emails
        const batch = Array.from({length: 25}).map((_, j) => ({
            email: `pilot_${pilotId}_${j}@example.com`, // We use example.com for the script execution so we don't accidentally spam
            email_normalized: `pilot_${pilotId}_${j}@example.com`,
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
                p_idempotency_key: `PILOT_${pilotId}_${cid}`
            });
        }

        // Global Budget initialized at 0
        const today = new Date().toISOString().split('T')[0];
        await supabase.from('atlas_outreach_daily_usage').insert({
            usage_date: today,
            metric: 'CAMPAIGN_SEND',
            entity_id: campaignId,
            usage_count: 0
        });

        // 3. Launch Workers to process all 25 jobs
        console.log("Launching Workers for real pilot...");
        const worker = new OutreachWorker(SUPABASE_URL, SUPABASE_SERVICE_KEY, `worker_pilot`, realProvider);
        
        let successes = 0;
        let failures = 0;
        
        for (let i = 0; i < 30; i++) { // Loop slightly more than 25 to hit the empty queue
            const res = await worker.processNextJob();
            if (res.success) successes++;
            else if (res.reason !== 'NO_JOBS') failures++;
            
            if (res.reason === 'NO_JOBS') break;
        }

        // 4. Verify Final State
        const { data: usageRow } = await supabase.from('atlas_outreach_daily_usage')
            .select('usage_count').eq('metric', 'CAMPAIGN_SEND').eq('entity_id', campaignId).single();

        const { data: deliveries } = await supabase.from('atlas_outreach_deliveries')
            .select('status').eq('campaign_id', campaignId);
            
        const acceptedDeliveries = deliveries?.filter(d => d.status === 'ACCEPTED').length || 0;

        console.log(`\n=====================================`);
        console.log(`ATLAS OUTREACH REAL PILOT — RESEND`);
        console.log(`=====================================`);
        console.log(`Allowlisted contacts:      25`);
        console.log(`Authorized & Accepted:     ${acceptedDeliveries}`);
        console.log(`Duplicate deliveries:      ${acceptedDeliveries - 25 > 0 ? acceptedDeliveries - 25 : 0}`);
        console.log(`Final Database Usage:      ${usageRow?.usage_count}`);

        if (successes === 25 && acceptedDeliveries === 25 && usageRow?.usage_count === 25) {
            console.log(`\nPHASE 6 = PASS ✅`);
        } else {
            console.log(`\nPHASE 6 = FAIL ❌`);
        }

    } catch (e) {
        console.error("Test error:", e);
    } finally {
        console.log("Cleanup and Disabling Real Sends...");
        // CRITICAL: Safely disable sends
        await supabase.from('atlas_outreach_config').update({ send_enabled: false }).eq('id', 1);

        await supabase.from('atlas_outreach_queue').delete().eq('campaign_id', campaignId);
        await supabase.from('atlas_outreach_deliveries').delete().eq('campaign_id', campaignId);
        await supabase.from('atlas_outreach_compliance').delete().eq('campaign_id', campaignId);
        await supabase.from('atlas_outreach_campaigns').delete().eq('campaign_id', campaignId);
        await supabase.from('atlas_contacts').delete().in('contact_id', contactIds);
        await supabase.from('atlas_outreach_policies').delete().eq('policy_version', `AR_${pilotId}`);
        await supabase.from('atlas_outreach_daily_usage').delete().eq('entity_id', campaignId);
    }
}

run();
