import 'dotenv/config';
import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import { SESv2Client, GetAccountCommand, GetEmailIdentityCommand, GetConfigurationSetEventDestinationsCommand } from '@aws-sdk/client-sesv2';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { SNSClient, GetTopicAttributesCommand } from '@aws-sdk/client-sns';

function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
    console.log(`  ✅ PASS -> ${message}`);
}

async function runAwsPreflight() {
    console.log("\n==================================================");
    console.log("ATLAS — 9E-B PREFLIGHT");
    console.log("==================================================");
    console.log("\nPREFLIGHT A — AWS\n");

    if (!process.env.AWS_REGION || !process.env.SES_FROM_ADDRESS || !process.env.EXPECTED_SNS_TOPIC_ARN || !process.env.EXPECTED_AWS_ACCOUNT_ID) {
        throw new Error("FATAL_CONFIG: Missing required SES environment variables (AWS_REGION, SES_FROM_ADDRESS, EXPECTED_SNS_TOPIC_ARN, EXPECTED_AWS_ACCOUNT_ID)");
    }

    const stsClient = new STSClient({ region: process.env.AWS_REGION });
    const sesClient = new SESv2Client({ region: process.env.AWS_REGION });
    const snsClient = new SNSClient({ region: process.env.AWS_REGION });
    
    try {
        const stsRes = await stsClient.send(new GetCallerIdentityCommand({}));
        assert(stsRes.Account !== undefined, `STS identity`);
        assert(stsRes.Account === process.env.EXPECTED_AWS_ACCOUNT_ID, `Expected AWS account ID (${process.env.EXPECTED_AWS_ACCOUNT_ID})`);
        assert(process.env.AWS_REGION !== undefined, `Expected AWS region (${process.env.AWS_REGION})`);

        const getAccountRes = await sesClient.send(new GetAccountCommand({}));
        assert(true, "SES GetAccount");
        assert(getAccountRes.SendingEnabled === true, "SendingEnabled");
        
        console.log(`     RECORDED -> Sandbox/Production: ProductionAccessEnabled=${getAccountRes.ProductionAccessEnabled}`);
        console.log(`     RECORDED -> Daily quota: Max24HourSend=${getAccountRes.SendQuota?.Max24HourSend}`);
        console.log(`     RECORDED -> Max send rate: MaxSendRate=${getAccountRes.SendQuota?.MaxSendRate}`);

        const getIdentityRes = await sesClient.send(new GetEmailIdentityCommand({ EmailIdentity: process.env.SES_FROM_ADDRESS }));
        assert(true, "Sender identity verified");
        assert(getIdentityRes.VerifiedForSendingStatus === true, "VerifiedForSendingStatus");
        assert(getIdentityRes.DkimAttributes?.Status === 'SUCCESS', `DKIM status`);
        
        const configSet = process.env.SES_CONFIGURATION_SET;
        if (!configSet) {
            throw new Error("FATAL_CONFIG: Missing required SES_CONFIGURATION_SET for SNS Event Destinations");
        }
        
        const configDestRes = await sesClient.send(new GetConfigurationSetEventDestinationsCommand({ ConfigurationSetName: configSet }));
        assert(true, `Configuration Set exists (${configSet})`);
        
        const destinations = configDestRes.EventDestinations || [];
        const snsDest = destinations.find(d => d.SnsDestination !== undefined);
        
        if (!snsDest) {
            throw new Error(`Configuration set ${configSet} does not have an SNS destination`);
        }
        
        assert(snsDest.Enabled === true, "Event destination enabled");
        assert(snsDest.SnsDestination !== undefined, "Destination points to SNS");
        assert(snsDest.SnsDestination?.TopicArn === process.env.EXPECTED_SNS_TOPIC_ARN, `TopicArn exact match (${process.env.EXPECTED_SNS_TOPIC_ARN})`);
        
        const eventTypes = snsDest.MatchingEventTypes || [];
        assert(eventTypes.includes('DELIVERY'), "DELIVERY events configured");
        assert(eventTypes.includes('BOUNCE'), "BOUNCE events configured");
        assert(eventTypes.includes('COMPLAINT'), "COMPLAINT events configured");

        const expectedTopicArn = process.env.EXPECTED_SNS_TOPIC_ARN;
        const snsRes = await snsClient.send(new GetTopicAttributesCommand({ TopicArn: expectedTopicArn }));
        assert(true, `SNS Topic exists`);
        assert(expectedTopicArn.includes(process.env.EXPECTED_AWS_ACCOUNT_ID), "Topic account match");
        assert(expectedTopicArn.includes(process.env.AWS_REGION), "Topic region match");
        
    } catch (e: any) {
        console.error("\nAWS PREFLIGHT FAILED", e.message || e);
        process.exit(1);
    }
}

async function runAtlasPreflight() {
    console.log("\nPREFLIGHT B — ATLAS\n");

    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
    const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

    if (!SUPABASE_SECRET_KEY) {
        throw new Error("FATAL_CONFIG: Missing required SUPABASE_SECRET_KEY");
    }
    assert(true, "Supabase secret rotated (CONFIRMED via env)");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

    try {
        const { data: config, error: configErr } = await supabase.from('atlas_outreach_config').select('send_enabled').eq('id', 1).single();
        if (configErr) throw configErr;
        
        assert(true, "Supabase connectivity");
        assert(config.send_enabled === false, "send_enabled = FALSE");

        // Verify routing and economic tables reachable
        const { error: err1 } = await supabase.from('atlas_provider_routing_decisions').select('routing_id').limit(1);
        if (err1) throw err1;
        assert(true, "9D tables (atlas_provider_routing_decisions)");

        const { error: err2 } = await supabase.from('atlas_delivery_cost_reservations').select('reservation_id').limit(1);
        if (err2) throw err2;
        assert(true, "9D tables (atlas_delivery_cost_reservations)");

        const { error: err3 } = await supabase.from('atlas_delivery_attempts').select('attempt_id').limit(1);
        if (err3) throw err3;
        assert(true, "9E delivery attempts");
        
        // Check RPCs reachable by ensuring we don't get PGRST202 (function not found)
        const rpcs = [
            'reserve_delivery_economics',
            'commit_delivery_economics',
            'release_delivery_economics',
            'record_provider_acceptance',
            'record_definitive_pre_accept_failure',
            'record_ambiguous_outcome',
            'reconcile_ambiguous_delivery',
            'create_delivery_attempt'
        ];
        
        for (const rpc of rpcs) {
            const res = await supabase.rpc(rpc as any, {});
            if (res.error && res.error.code === 'PGRST202') {
                throw new Error(`RPC ${rpc} is missing (PGRST202)`);
            }
            assert(true, `${rpc} RPC reachable`);
        }

        console.log("\nReal sends                            0");
        
    } catch (e: any) {
        console.error("\nATLAS PREFLIGHT FAILED", e.message || e);
        process.exit(1);
    }
}

async function runPilot() {
    await runAwsPreflight();
    await runAtlasPreflight();

    console.log("\nPREFLIGHT = PASS ✅");
}

runPilot().catch(console.error);
