import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import { OutreachWorker } from './workers/outreach_worker';
import { ResendAdapter } from './workers/resend_adapter';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_SERVICE_KEY) { console.error('FATAL_CONFIG: Missing required SUPABASE_SECRET_KEY'); process.exit(1); }

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ATLAS_UNSUBSCRIBE_BASE = process.env.ATLAS_UNSUBSCRIBE_BASE || 'http://localhost:3000'; // For testing Model B

if (!RESEND_API_KEY) {
    console.error("FATAL: RESEND_API_KEY is not set in .env");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const pilotId = Math.random().toString(36).substring(2, 10);

async function run() {
    console.log(`Starting Phase 6B REAL PILOT Test: ${pilotId}`);
    
    let campaignId = '';
    let contactIds: string[] = [];

    const realProvider = new ResendAdapter(RESEND_API_KEY!);

    // TEST CASES (Exactly 3)
    const testCases = [
        { email: 'delivered@resend.dev', label: 'DELIVERED_TEST' },
        { email: 'bounced@resend.dev', label: 'BOUNCE_TEST' },
        // IMPORTANT: Replace this 3rd email in your DB or memory if you want to click the link!
        // For automation, we just send it to a real inbox of yours so you can click the Unsubscribe link.
        { email: 'eduardo@youapp.ai', label: 'UNSUBSCRIBE_TEST' } 
    ];

    try {
        // 1. Setup REAL SEND Config for EXACTLY 3 SENDS
        await supabase.from('atlas_outreach_config').update({ outreach_enabled: true, send_enabled: true }).eq('id', 1);

        const { data: campaign } = await supabase.from('atlas_outreach_campaigns').insert({
            name: `PHASE_6B_${pilotId}`,
            purpose: 'B2B',
            message_type: 'PITCH',
            countries_allowed: ['AR'],
            recipient_types_allowed: ['PERSON'],
            campaign_enabled: true,
            max_daily_sends: 3
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

        const batch = testCases.map(tc => {
            const normalized = tc.email.trim().toLowerCase();
            return {
                email: tc.email,
                email_normalized: normalized,
                email_hash: crypto.createHash('sha256').update(normalized).digest('hex'),
                country_code: 'AR',
                recipient_type: 'PERSON',
                status: 'ACTIVE'
            };
        });
        
        const { data: contacts, error: contactErr } = await supabase.from('atlas_contacts').upsert(batch, { onConflict: 'email_hash' }).select('contact_id, email, email_hash');
        if (contactErr) throw contactErr;

        for (const contact of contacts!) {
            const unsubscribeLink = `${ATLAS_UNSUBSCRIBE_BASE}/unsubscribe/${campaignId}/${contact.contact_id}/${contact.email_hash}`;
            console.log(`[TEST DATA] Contact ${contact.email} unsubscribe link: ${unsubscribeLink}`);

            await supabase.rpc('enqueue_outreach_job', {
                p_campaign_id: campaignId,
                p_contact_id: contact.contact_id,
                p_idempotency_key: `PHASE6B_${pilotId}_${contact.contact_id}`
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

        // 3. Launch Workers
        console.log("Launching Worker for Phase 6B...");
        const worker = new OutreachWorker(SUPABASE_URL, SUPABASE_SERVICE_KEY, `worker_6B`, realProvider);
        
        let successes = 0;
        
        for (let i = 0; i < 5; i++) {
            const res = await worker.processNextJob();
            if (res.success) successes++;
            if (res.reason === 'NO_JOBS') break;
        }

        console.log(`\n=====================================`);
        console.log(`ATLAS OUTREACH PHASE 6B (DISPATCHED)`);
        console.log(`=====================================`);
        console.log(`Real API requests:         ${successes}`);
        console.log(`\nEmails have been handed off to Resend.`);
        console.log(`Check your Webhook Server logs for incoming DELIVERED / BOUNCED events.`);
        console.log(`To test the UNSUBSCRIBE cascade, click the link logged above for your test email.`);
        
        // Wait gracefully so user can observe webhooks (for test automation purposes we could poll, but we'll leave it up to the user)
        console.log(`\n(The script will not automatically verify the webhooks because they arrive asynchronously. You can query atlas_outreach_deliveries and atlas_outreach_suppressions to verify).`);

    } catch (e) {
        console.error("Test error:", e);
    } finally {
        console.log("\nDisabling Real Sends (Kill Switch)...");
        // CRITICAL: Safely disable sends
        await supabase.from('atlas_outreach_config').update({ send_enabled: false }).eq('id', 1);
    }
}

run();
