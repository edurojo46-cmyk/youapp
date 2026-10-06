import express from 'express';
import { Webhook } from 'svix';
import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_SERVICE_KEY) { console.error('FATAL_CONFIG: Missing required SUPABASE_SECRET_KEY'); process.exit(1); }
const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const app = express();
const port = 3000;

app.get('/health', (_req, res) => {
    res.status(200).json({
        ok: true,
        service: 'atlas-outreach-webhook'
    });
});

app.get('/', (_req, res) => {
    res.send('ATLAS OUTREACH WEBHOOK SERVER OK');
});

// Middleware to capture the raw body for Svix verification
app.use('/webhooks/resend', express.raw({ type: 'application/json' }));

app.post('/webhooks/resend', async (req, res) => {
    if (!RESEND_WEBHOOK_SECRET) {
        console.error("Missing RESEND_WEBHOOK_SECRET");
        return res.status(500).send("Webhook secret not configured");
    }

    const payload = req.body.toString();
    const headers = req.headers;

    const wh = new Webhook(RESEND_WEBHOOK_SECRET);
    let msg: any;

    try {
        msg = wh.verify(payload, headers as any);
    } catch (err: any) {
        console.error(`Invalid webhook signature: ${err.message}`);
        return res.status(400).send("Invalid Signature");
    }

    console.log(`[Webhook] Verified event: ${msg.type}`);
    
    // Payload hash to prevent large storage or to dedupe
    const payloadHash = crypto.createHash('sha256').update(payload).digest('hex');
    
    // Parse the event type
    // Resend events: email.delivered, email.bounced, email.complained
    let atlasEventType = '';
    if (msg.type === 'email.delivered') atlasEventType = 'DELIVERED';
    else if (msg.type === 'email.bounced') atlasEventType = 'BOUNCED';
    else if (msg.type === 'email.complained') atlasEventType = 'COMPLAINT';
    else {
        console.log(`[Webhook] Ignored unhandled event type: ${msg.type}`);
        return res.status(200).send("Ignored");
    }

    const emailData = msg.data;
    // Resend includes tags we passed during send
    let jobId = null;
    let campaignId = null;
    if (emailData.tags) {
        const jobTag = emailData.tags.find((t: any) => t.name === 'job_id');
        const campTag = emailData.tags.find((t: any) => t.name === 'campaign_id');
        if (jobTag) jobId = jobTag.value;
        if (campTag) campaignId = campTag.value;
    }

    const providerMessageId = emailData.email_id; // Resend's message ID is email_id in webhooks

    try {
        const { data: processed, error } = await supabase.rpc('process_provider_event', {
            p_provider: 'RESEND',
            p_provider_event_id: msg.id || `${providerMessageId}_${msg.type}`,
            p_provider_message_id: providerMessageId,
            p_event_type: atlasEventType,
            p_payload_hash: payloadHash
        });

        if (error) {
            console.error("[Webhook] RPC error:", error);
            return res.status(500).send("Internal Error");
        }

        if (!processed) {
            console.log(`[Webhook] Event ${msg.id} was already processed (Deduplicated).`);
        } else {
            console.log(`[Webhook] Successfully processed ${atlasEventType} for message ${providerMessageId}`);
        }

    } catch (err) {
        console.error("[Webhook] Error saving event:", err);
        return res.status(500).send("Error saving event");
    }

    res.status(200).send("OK");
});

// MODELO B: Atlas Native Unsubscribe
app.get('/unsubscribe/:campaign_id/:contact_id/:hash', async (req, res) => {
    const { campaign_id, contact_id, hash } = req.params;
    
    // We expect the hash to be the contact's email_hash. 
    // In a real system, we'd use a crypto HMAC of contact_id to verify. 
    // For this pilot, we trust the hash provided if it matches the DB.
    
    try {
        const { data: contact } = await supabase.from('atlas_contacts').select('email_hash').eq('contact_id', contact_id).single();
        
        if (!contact || contact.email_hash !== hash) {
            return res.status(400).send("Invalid unsubscribe link");
        }

        const { error } = await supabase.from('atlas_outreach_suppressions').insert({
            email_hash: hash,
            contact_id: contact_id,
            scope: 'ALL',
            reason: 'UNSUBSCRIBED'
        }).select();

        // Safe cascade to queue
        await supabase.from('atlas_outreach_queue')
            .update({ status: 'BLOCKED', updated_at: new Date().toISOString() })
            .eq('contact_id', contact_id)
            .in('status', ['PENDING', 'RETRY']);

        console.log(`[Unsubscribe] Processed unsubscribe for contact ${contact_id}`);
        res.status(200).send("You have been successfully unsubscribed.");
    } catch (err) {
        console.error("[Unsubscribe] Error:", err);
        res.status(500).send("Error processing request");
    }
});

app.listen(port, () => {
    console.log(`🚀 Atlas Webhook Server listening on port ${port}`);
});
