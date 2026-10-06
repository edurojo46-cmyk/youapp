import 'dotenv/config';
import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import crypto from 'crypto';

function assert(condition: boolean, message: string) {
    if (!condition) {
        console.error(`❌ FATAL_CONFIG: ${message}`);
        process.exit(1);
    }
}

async function runSimulatorPilot() {
    console.log("\n==================================================");
    console.log("9E-B2: ATLAS CONTROLLED SIMULATOR PILOT");
    console.log("==================================================");

    // 1. Require ATLAS_9E_B2_ARMED
    assert(process.env.ATLAS_9E_B2_ARMED === 'true', "Missing ATLAS_9E_B2_ARMED=true");

    // 2. Require AWS_PROFILE
    assert(process.env.AWS_PROFILE === 'atlas-ses-pilot', "Missing AWS_PROFILE=atlas-ses-pilot");

    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
    const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
    assert(SUPABASE_SECRET_KEY !== undefined, "Missing SUPABASE_SECRET_KEY");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY!);

    // Check pre-existing state
    const { data: config, error: configErr } = await supabase.from('atlas_outreach_config').select('send_enabled').eq('id', 1).single();
    if (configErr) throw configErr;
    assert(config.send_enabled === false, "send_enabled must be FALSE before starting the pilot");

    // Retrieve active pilot run if any
    // Wait, the pilot must be ARMED in the DB, and preflight must be PASS
    const { data: pilotRun, error: pilotErr } = await supabase.from('atlas_pilot_runs')
        .select('*')
        .eq('status', 'ARMED')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
    
    assert(!pilotErr && pilotRun, "No ARMED pilot run found with a PASS preflight result");
    assert(pilotRun.preflight_status === 'PASS', "Preflight status is not PASS in DB");

    // Validate STS constraints
    const stsClient = new STSClient({ region: process.env.AWS_REGION });
    const stsRes = await stsClient.send(new GetCallerIdentityCommand({}));
    
    assert(stsRes.Account === pilotRun.aws_account_id, "STS Account mismatch against preflight record");
    assert(process.env.AWS_REGION === pilotRun.aws_region, "AWS_REGION mismatch against preflight record");
    assert(process.env.SES_FROM_ADDRESS === pilotRun.sender_identity, "SES_FROM_ADDRESS mismatch");
    assert(process.env.SES_CONFIGURATION_SET === pilotRun.configuration_set, "SES_CONFIGURATION_SET mismatch");

    console.log("\n[PILOT FACTS]");
    console.log(`AWS Account: ***${stsRes.Account!.slice(-4)}`);
    console.log(`Region: ${process.env.AWS_REGION}`);
    console.log(`Sender: ${process.env.SES_FROM_ADDRESS}`);
    console.log(`Config Set: ${process.env.SES_CONFIGURATION_SET}`);
    console.log(`Recipients: SES SIMULATOR ONLY`);
    console.log(`Planned sends: ${pilotRun.planned_sends}`);

    // Retrieve the 3 specific delivery rows
    const { data: deliveries, error: delErr } = await supabase.from('atlas_pilot_run_deliveries')
        .select('*')
        .eq('pilot_run_id', pilotRun.id)
        .eq('status', 'PENDING');
    
    if (delErr) throw delErr;
    assert(deliveries.length === 3, "Expected exactly 3 PENDING deliveries in pilot");

    // Move to RUNNING
    console.log("\n[ACTIVATING PILOT]");
    const activateRes = await supabase.rpc('activate_pilot_run', { p_pilot_run_id: pilotRun.id });
    assert(!activateRes.error && activateRes.data?.success, `Failed to activate pilot: ${activateRes.error?.message || activateRes.data?.reason}`);


    const sesClient = new SESv2Client({ region: process.env.AWS_REGION });

    let attempted = 0;
    let accepted = 0;
    let preAcceptFailures = 0;
    let unexpectedRecipients = 0;
    let duplicateEffects = 0;

    console.log("\n[OPENING SEND WINDOW]");
    const openRes = await supabase.rpc('open_pilot_send_window', { p_pilot_run_id: pilotRun.id });
    assert(!openRes.error && openRes.data?.success, `Failed to open send window: ${openRes.error?.message || openRes.data?.reason}`);
    console.log("[SEND WINDOW OPEN - GLOBALLY ACTIVE]");

    try {
        for (const delivery of deliveries) {
            if (attempted >= 3) {
                console.log("🛑 BLOCK: Hard maximum of 3 sends reached. Aborting.");
                break;
            }

            // Map purpose to recipient
            const recipientMap: Record<string, string> = {
                'SUCCESS_SIMULATOR': 'success@simulator.amazonses.com',
                'BOUNCE_SIMULATOR': 'bounce@simulator.amazonses.com',
                'COMPLAINT_SIMULATOR': 'complaint@simulator.amazonses.com'
            };

            const recipient = recipientMap[delivery.purpose];
            if (!recipient) {
                unexpectedRecipients++;
                console.log(`🛑 BLOCK: Unexpected purpose ${delivery.purpose}`);
                continue;
            }

            const hashedRecipient = crypto.createHash('sha256').update(recipient).digest('hex');

            // 1. Authorize Pilot Delivery (Atomic DB Gate)
            const authRes = await supabase.rpc('authorize_pilot_delivery', {
                p_pilot_run_id: pilotRun.id,
                p_logical_delivery_id: delivery.logical_delivery_id,
                p_recipient_hash: hashedRecipient,
                p_account: stsRes.Account,
                p_region: process.env.AWS_REGION,
                p_config: process.env.SES_CONFIGURATION_SET
            });

            if (authRes.error || !authRes.data?.success) {
                console.log(`🛑 BLOCK: DB authorization failed for ${delivery.purpose}: ${authRes.error?.message || authRes.data?.reason}`);
                continue;
            }

            // 2. Reserve Economics (Traverse existing Atlas logic)
            // Assumes a dummy campaign and provider exist for the pilot test setup
            // This relies on PILOT_ONLY execution scope in reserve_delivery_economics
            const reserveRes = await supabase.rpc('reserve_delivery_economics', {
                p_logical_delivery_id: delivery.logical_delivery_id,
                p_campaign_id: '00000000-0000-0000-0000-000000000000', // Mock campaign ID for test
                p_provider_id: '00000000-0000-0000-0000-000000000000',
                p_units: 1,
                p_incremental_cost: 0.0001
            });

            if (reserveRes.error || !reserveRes.data?.success) {
                console.log(`🛑 BLOCK: Economics reservation failed for ${delivery.purpose}: ${reserveRes.error?.message || reserveRes.data?.reason}`);
                continue;
            }

            attempted++;

            // 3. AWS SendEmail
            const payload = {
                FromEmailAddress: process.env.SES_FROM_ADDRESS,
                Destination: { ToAddresses: [recipient], CcAddresses: [], BccAddresses: [] },
                Content: {
                    Simple: {
                        Subject: { Data: `Atlas Pilot: ${delivery.purpose}` },
                        Body: { Text: { Data: "This is a controlled simulator test." } }
                    }
                },
                ConfigurationSetName: process.env.SES_CONFIGURATION_SET,
                EmailTags: [
                    { Name: "atlas_logical_delivery_id", Value: delivery.logical_delivery_id },
                    { Name: "atlas_pilot_run_id", Value: pilotRun.id }
                ]
            };

            try {
                console.log(`   -> Sending to ${recipient}...`);
                // Uncomment to execute SES send
                // const sendRes = await sesClient.send(new SendEmailCommand(payload));
                // accepted++;
                // console.log(`      ACCEPTED: ${sendRes.MessageId}`);
                
                // 4. Record Acceptance
                // await supabase.rpc('record_provider_acceptance', { ... });
                
                // For safety in this PREPARATION script, we throw to simulate a dry run
                throw new Error("AWS sends are disabled in PREPARATION script.");
            } catch (err: any) {
                preAcceptFailures++;
                console.log(`      FAILED: ${err.message}`);
                // 5. Release Economics
                await supabase.rpc('release_delivery_economics', {
                    p_logical_delivery_id: delivery.logical_delivery_id
                });
            }
        }
    } finally {
        console.log("\n[CLOSING SEND WINDOW]");
        const closeRes = await supabase.rpc('close_pilot_run', { p_pilot_run_id: pilotRun.id });
        if (closeRes.error || !closeRes.data?.success) {
            console.error("CRITICAL: Failed to close pilot cleanly via RPC! Falling back to raw abort.");
            await supabase.rpc('abort_pilot_run', { p_pilot_run_id: pilotRun.id });
        }

        const { data: finalConfig } = await supabase.from('atlas_outreach_config').select('send_enabled').eq('id', 1).single();

        console.log("\n[EXPECTED SAFE END]");
        console.log(`planned sends                 ${pilotRun.planned_sends}`);
        console.log(`attempted sends               ${attempted}`);
        console.log(`accepted                      ${accepted}`);
        console.log(`pre-accept failures           ${preAcceptFailures}`);
        console.log(`unexpected recipients         ${unexpectedRecipients}`);
        console.log(`duplicate logical effects     ${duplicateEffects}`);
        console.log(`send_enabled final state      ${finalConfig?.send_enabled ? 'TRUE ❌' : 'FALSE ✅'}`);
    }
}

runSimulatorPilot().catch(e => {
    console.error("CRITICAL ERROR", e);
    process.exit(1);
});
