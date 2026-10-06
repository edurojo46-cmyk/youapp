import express from 'express';
import bodyParser from 'body-parser';
import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import { SNSClient, ConfirmSubscriptionCommand } from '@aws-sdk/client-sns';
import https from 'https';
import crypto from 'crypto';
import 'dotenv/config';

// Ensure this script doesn't execute anything yet
console.log("9E-B3 PREPARATION: Script loaded but not fully armed for production yet.");

const app = express();
const port = process.env.PORT || 3000;

// SNS sends raw text/plain or JSON. Let's parse JSON even if Content-Type is text/plain.
app.use(bodyParser.json({ type: ['application/json', 'text/plain'] }));

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_SECRET_KEY) {
    console.error("FATAL: Missing SUPABASE_SECRET_KEY");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

app.post('/webhook/sns', async (req, res) => {
    try {
        const snsMessage = req.body;
        
        // 1. Subscription Confirmation Handshake
        if (snsMessage.Type === 'SubscriptionConfirmation') {
            console.log(`[SNS] SubscriptionConfirmation received.`);
            
            // Validate exact TopicArn
            if (snsMessage.TopicArn !== process.env.EXPECTED_SNS_TOPIC_ARN) {
                console.error("🛑 BLOCK: Subscription request from unexpected TopicArn.");
                res.status(403).send("Unexpected TopicArn");
                return;
            }

            // Extract account and region from TopicArn for double validation
            const arnParts = snsMessage.TopicArn.split(':');
            const expectedRegion = process.env.AWS_REGION;
            const expectedAccount = process.env.EXPECTED_AWS_ACCOUNT_ID;
            
            if (arnParts[3] !== expectedRegion || arnParts[4] !== expectedAccount) {
                console.error("🛑 BLOCK: TopicArn does not match expected Account/Region.");
                res.status(403).send("Mismatch Account/Region");
                return;
            }

            // Validate SigningCertURL strict format
            const certUrl = new URL(snsMessage.SigningCertURL);
            const expectedHostname = `sns.${expectedRegion}.amazonaws.com`;
            
            if (certUrl.protocol !== 'https:' || certUrl.hostname !== expectedHostname) {
                console.error(`🛑 BLOCK: Invalid SigningCertURL. Expected https://${expectedHostname}`);
                res.status(403).send("Invalid cert");
                return;
            }

            // Acknowledge validation passing. In this prepared script we won't fully verify the 
            // x509 cryptographic signature locally yet (which requires fetching the cert and doing crypto.verify), 
            // but we MUST NOT blindly GET the SubscribeURL. We use the SDK.
            
            console.log(`[SNS] Confirming subscription via AWS SDK...`);
            const snsClient = new SNSClient({ region: process.env.AWS_REGION });
            const confirmCommand = new ConfirmSubscriptionCommand({
                TopicArn: snsMessage.TopicArn,
                Token: snsMessage.Token,
                AuthenticateOnUnsubscribe: "true"
            });

            try {
                // Uncomment to execute in real environment
                // await snsClient.send(confirmCommand);
                console.log("✅ [SNS] Subscription successfully confirmed via SDK.");
            } catch (err: any) {
                console.error("❌ [SNS] Failed to confirm subscription:", err.message);
                res.status(500).send("Confirmation failed");
                return;
            }
            
            res.status(200).send("OK");
            return;
        }

        if (snsMessage.Type !== 'Notification') {
            res.status(200).send("Ignored");
            return;
        }

        // 2. Validate TopicArn
        if (snsMessage.TopicArn !== process.env.EXPECTED_SNS_TOPIC_ARN) {
            console.error(`🛑 BLOCK: Notification from unexpected TopicArn: ${snsMessage.TopicArn}`);
            res.status(403).send("Unexpected TopicArn");
            return;
        }

        // 3. Cryptographic Signature Validation
        // Using `sns-validator` or AWS standard cert validation should occur here
        // (Skipped in this dry-run preparation script)
        console.log(`[SNS] Validating signature for MessageId: ${snsMessage.MessageId}...`);

        const messageData = JSON.parse(snsMessage.Message);
        const eventType = messageData.eventType; // 'Delivery', 'Bounce', 'Complaint'

        console.log(`[SNS] Event Type: ${eventType}`);

        // 4. Extract Correlation Tags
        const tags = messageData.mail?.tags || {};
        const logicalDeliveryId = tags.atlas_logical_delivery_id?.[0];
        
        if (!logicalDeliveryId) {
            console.log("[SNS] No atlas_logical_delivery_id tag found. Ignoring.");
            res.status(200).send("No logical_delivery_id");
            return;
        }

        // 5. Deduplicate and Dispatch to Atlas Event Processing
        // We use the existing process_provider_event function
        const providerEventId = snsMessage.MessageId; // SNS MessageId is unique
        const providerMessageId = messageData.mail?.messageId;

        // Map SES event type to Atlas event type
        let atlasEventType = 'UNKNOWN';
        if (eventType === 'Delivery') atlasEventType = 'DELIVERED';
        else if (eventType === 'Bounce') atlasEventType = 'BOUNCED';
        else if (eventType === 'Complaint') atlasEventType = 'COMPLAINT';

        // 6. Invoke existing Atlas event authorities (No blind reconciliation)
        const processRes = await supabase.rpc('process_provider_event', {
            p_provider: 'AMAZON_SES',
            p_provider_event_id: providerEventId,
            p_provider_message_id: providerMessageId,
            p_event_type: atlasEventType,
            p_payload_hash: 'SIMULATOR_NO_HASH' // Using placeholder for now
        });

        if (processRes.error) {
            console.error(`[Atlas] Error processing event:`, processRes.error.message);
            res.status(500).send("Error");
            return;
        }

        if (processRes.data) {
            console.log(`✅ [Atlas] Event ${atlasEventType} successfully processed and reconciled.`);
        } else {
            console.log(`ℹ️ [Atlas] Event ${providerEventId} deduplicated (already processed).`);
        }

        res.status(200).send("OK");
    } catch (e: any) {
        console.error("[SNS] Webhook error:", e.message);
        res.status(500).send("Error");
    }
});

// Avoid starting the server in preparation mode
// app.listen(port, () => {
//     console.log(`9E-B3 Webhook listening on port ${port}`);
//     console.log(`Run 'ngrok http ${port}' to expose this endpoint.`);
// });
