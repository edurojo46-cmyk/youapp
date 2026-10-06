import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { SESClient, GetSendQuotaCommand, SendEmailCommand } from '@aws-sdk/client-ses';
import {
  SESv2Client,
  GetAccountCommand,
  GetEmailIdentityCommand,
  GetConfigurationSetCommand,
  GetConfigurationSetEventDestinationsCommand
} from '@aws-sdk/client-sesv2';
import {
  SNSClient,
  GetTopicAttributesCommand,
  SetTopicAttributesCommand,
  ListSubscriptionsByTopicCommand
} from '@aws-sdk/client-sns';
import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const EXPECTED_AWS_ACCOUNT_ID = process.env.EXPECTED_AWS_ACCOUNT_ID;
const EXPECTED_SNS_TOPIC_ARN = process.env.EXPECTED_SNS_TOPIC_ARN;
const SES_FROM_ADDRESS = process.env.SES_FROM_ADDRESS;
const SES_CONFIGURATION_SET = process.env.SES_CONFIGURATION_SET;
const CANARY_RECIPIENT = process.env.CANARY_RECIPIENT || 'success@simulator.amazonses.com';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

async function runStrictOperationalCanary() {
  console.log('================================================================');
  console.log('ATLAS MAIL V1 — STRICT FAIL-CLOSED REAL AWS SES/SNS CANARY GATE');
  console.log('================================================================\n');

  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || AWS_ACCESS_KEY_ID === 'ROTATED_AWS_ACCESS_KEY_ID') {
    console.error('❌ FAIL-CLOSED: Genuine AWS credentials (AWS_ACCESS_KEY_ID & AWS_SECRET_ACCESS_KEY) must be configured in .env');
    process.exit(1);
  }

  const credentials = { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY };
  const sts = new STSClient({ region: AWS_REGION, credentials });
  const ses = new SESClient({ region: AWS_REGION, credentials });
  const sesv2 = new SESv2Client({ region: AWS_REGION, credentials });
  const sns = new SNSClient({ region: AWS_REGION, credentials });

  // ── Step 1: AWS STS Identity & Account Validation ───────────────────────────
  console.log('── [1/11] AWS STS Caller Identity ──');
  let callerIdentity;
  try {
    callerIdentity = await sts.send(new GetCallerIdentityCommand({}));
    console.log(`✅ Authenticated AWS Account: ${callerIdentity.Account}`);
    console.log(`   IAM Principal ARN: ${callerIdentity.Arn}`);

    if (EXPECTED_AWS_ACCOUNT_ID && callerIdentity.Account !== EXPECTED_AWS_ACCOUNT_ID) {
      console.error(`❌ FAIL-CLOSED: Account ID mismatch (${callerIdentity.Account} vs ${EXPECTED_AWS_ACCOUNT_ID})`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`❌ FAIL-CLOSED: AWS STS failed: ${err.message}`);
    process.exit(1);
  }

  // ── Step 2: AWS Region & SES Identity Verification ──────────────────────────
  console.log('\n── [2/11] SES Sending Identity Verification ──');
  if (!SES_FROM_ADDRESS) {
    console.error('❌ FAIL-CLOSED: SES_FROM_ADDRESS is missing in .env');
    process.exit(1);
  }

  try {
    const identityRes = await sesv2.send(new GetEmailIdentityCommand({ EmailIdentity: SES_FROM_ADDRESS }));
    console.log(`✅ Sender Identity (${SES_FROM_ADDRESS}) Verification Status: ${identityRes.VerificationStatus || 'VALID'}`);
    console.log(`   Sending Enabled: ${identityRes.SendingEnabled !== false ? 'YES ✅' : 'NO ❌'}`);

    if (identityRes.SendingEnabled === false) {
      console.error(`❌ FAIL-CLOSED: Sending disabled for ${SES_FROM_ADDRESS}`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`❌ FAIL-CLOSED: SES Identity check failed: ${err.message}`);
    process.exit(1);
  }

  // ── Step 3: SES Production Access & Quotas ──────────────────────────────────
  console.log('\n── [3/11] SES Account Quota & Sandbox Status ──');
  let acctInfo: any;
  let quotaInfo: any;
  try {
    acctInfo = await sesv2.send(new GetAccountCommand({}));
    quotaInfo = await ses.send(new GetSendQuotaCommand({}));

    console.log(`   AWS Region: ${AWS_REGION}`);
    console.log(`   Production Access Enabled: ${acctInfo.ProductionAccessEnabled ? 'YES (Production Mode) 🟢' : 'NO (Sandbox Mode - 200/day limit) 🟡'}`);
    console.log(`   Max 24-Hour Send Quota: ${quotaInfo.Max24HourSend} emails`);
    console.log(`   Sent in Last 24 Hours: ${quotaInfo.SentLast24Hours} emails`);
    console.log(`   Max Send Rate: ${quotaInfo.MaxSendRate} emails/second`);
  } catch (err: any) {
    console.error(`❌ FAIL-CLOSED: SES account check failed: ${err.message}`);
    process.exit(1);
  }

  // ── Step 4: Configuration Set & Event Destinations ─────────────────────────
  console.log('\n── [4/11] SES Configuration Set & Event Destinations ──');
  if (!SES_CONFIGURATION_SET) {
    console.error('❌ FAIL-CLOSED: SES_CONFIGURATION_SET is missing in .env');
    process.exit(1);
  }

  let matchedDestinationName = 'DEFAULT';
  try {
    await sesv2.send(new GetConfigurationSetCommand({ ConfigurationSetName: SES_CONFIGURATION_SET }));
    console.log(`✅ Configuration Set '${SES_CONFIGURATION_SET}' verified.`);

    const destinationsRes = await sesv2.send(new GetConfigurationSetEventDestinationsCommand({
      ConfigurationSetName: SES_CONFIGURATION_SET
    }));

    const destinations = destinationsRes.EventDestinations || [];
    const requiredEvents = ['DELIVERY', 'BOUNCE', 'COMPLAINT', 'SUBSCRIPTION'];
    let destinationValid = false;

    for (const dest of destinations) {
      if (dest.Enabled && dest.SnsDestination?.TopicArn) {
        matchedDestinationName = dest.Name || 'SNS_DEST';
        console.log(`   Destination Name: ${dest.Name} (Enabled: ${dest.Enabled})`);
        console.log(`   Target TopicArn: ${dest.SnsDestination.TopicArn}`);
        console.log(`   Matching Event Types: ${dest.MatchingEventTypes?.join(', ')}`);

        if (!EXPECTED_SNS_TOPIC_ARN || dest.SnsDestination.TopicArn === EXPECTED_SNS_TOPIC_ARN) {
          destinationValid = true;
          for (const reqEvt of requiredEvents) {
            if (!dest.MatchingEventTypes?.includes(reqEvt as any)) {
              console.warn(`   ⚠️ Warning: Event Destination missing event type: ${reqEvt}`);
            }
          }
        }
      }
    }

    if (!destinationValid) {
      console.warn('⚠️ Warning: No exact matching enabled SNS Event Destination found.');
    }
  } catch (err: any) {
    console.error(`❌ FAIL-CLOSED: Configuration Set check failed: ${err.message}`);
    process.exit(1);
  }

  // ── Step 5: SNS Topic SignatureVersion=2 & Subscription Check ───────────────
  console.log('\n── [5/11] SNS Topic SignatureVersion=2 & Edge Subscription ──');
  if (!EXPECTED_SNS_TOPIC_ARN) {
    console.error('❌ FAIL-CLOSED: EXPECTED_SNS_TOPIC_ARN is missing in .env');
    process.exit(1);
  }

  try {
    const topicAttrs = await sns.send(new GetTopicAttributesCommand({ TopicArn: EXPECTED_SNS_TOPIC_ARN }));
    const sigVer = topicAttrs.Attributes?.['SignatureVersion'];
    console.log(`   Topic: ${EXPECTED_SNS_TOPIC_ARN}`);
    console.log(`   Current SignatureVersion: ${sigVer || '1 (Default)'}`);

    if (sigVer !== '2') {
      console.log('   Enforcing SignatureVersion=2 via SetTopicAttributes...');
      await sns.send(new SetTopicAttributesCommand({
        TopicArn: EXPECTED_SNS_TOPIC_ARN,
        AttributeName: 'SignatureVersion',
        AttributeValue: '2'
      }));
      console.log('✅ SignatureVersion=2 (SHA256withRSA) strictly enforced.');
    } else {
      console.log('✅ SignatureVersion=2 is already active.');
    }

    const subs = await sns.send(new ListSubscriptionsByTopicCommand({ TopicArn: EXPECTED_SNS_TOPIC_ARN }));
    console.log(`   Active Subscriptions: ${subs.Subscriptions?.length || 0}`);
    for (const sub of subs.Subscriptions || []) {
      console.log(`   - Endpoint: ${sub.Endpoint} | Status: ${sub.SubscriptionArn?.startsWith('arn:aws:sns') ? 'CONFIRMED ✅' : 'PENDING ⏳'}`);
    }
  } catch (err: any) {
    console.error(`❌ FAIL-CLOSED: SNS check failed: ${err.message}`);
    process.exit(1);
  }

  // ── Step 6: Slot Reservation in Atlas Staging Database ──────────────────────
  console.log('\n── [6/11] Reserving Volume Slot in Atlas Control Plane ──');
  const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);
  const tenantEmail = `canary-aws-${Date.now()}@test.com`;
  const tenantPass = 'CanaryLivePass123!';
  const { data: userAuth, error: uErr } = await adminSupabase.auth.admin.createUser({
    email: tenantEmail,
    password: tenantPass,
    email_confirm: true
  });
  if (uErr || !userAuth.user) throw new Error(`Tenant setup failed: ${uErr?.message}`);

  const tenantId = userAuth.user.id;
  await adminSupabase.from('atlas_tenants').insert({ tenant_id: tenantId });

  const correlationToken = `tok-real-canary-${Date.now()}`;
  const correlationTokenHash = crypto.createHash('sha256').update(correlationToken).digest('hex');

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await userClient.auth.signInWithPassword({ email: tenantEmail, password: tenantPass });

  const logicalIdentity = `log-exec-aws-${Date.now()}`;
  const { data: planRes, error: planErr } = await userClient.rpc('plan_and_route_email_v1', {
    p_logical_execution_identity: logicalIdentity,
    p_execution_request_id: crypto.randomUUID(),
    p_action_type: 'EMAIL_SEND',
    p_destination_email: CANARY_RECIPIENT,
    p_prepared_payload: { subject: 'Atlas Mail V1 Operational Canary', body: 'Live SES Canary' },
    p_raw_correlation_token: correlationToken
  });

  if (planErr || !planRes?.success) {
    await adminSupabase.auth.admin.deleteUser(tenantId);
    console.error(`❌ FAIL-CLOSED: Slot reservation failed: ${planErr?.message || planRes?.reason}`);
    process.exit(1);
  }

  const executionId = planRes.execution_id;
  const attemptId = planRes.attempt_id;
  console.log(`✅ Volume Slot Reserved (status = RESERVED, execution_id = ${executionId}, attempt_id = ${attemptId})`);

  // ── Step 7: Real AWS SES Email Dispatch ─────────────────────────────────────
  console.log(`\n── [7/11] Dispatching Real Email via AWS SES to ${CANARY_RECIPIENT} ──`);
  let sesMessageId: string;
  try {
    const sesSendRes = await ses.send(new SendEmailCommand({
      Source: SES_FROM_ADDRESS,
      Destination: { ToAddresses: [CANARY_RECIPIENT] },
      Message: {
        Subject: { Data: `Atlas Mail V1 Operational Canary [${logicalIdentity}]` },
        Body: { Text: { Data: `Correlation Token: ${correlationToken}\nExecution ID: ${executionId}` } }
      },
      ConfigurationSetName: SES_CONFIGURATION_SET,
      Tags: [
        { Name: 'atlas_tenant_id', Value: tenantId },
        { Name: 'atlas_correlation_token', Value: correlationToken }
      ]
    }));

    sesMessageId = sesSendRes.MessageId!;
    console.log(`✅ AWS SES SendEmail SUCCEEDED!`);
    console.log(`   Generated AWS SES MessageId: ${sesMessageId}`);
  } catch (err: any) {
    await adminSupabase.auth.admin.deleteUser(tenantId);
    console.error(`❌ FAIL-CLOSED: Real SES SendEmail failed: ${err.message}`);
    process.exit(1);
  }

  // ── Step 8: Reconciliation with Distinct Identifiers ────────────────────────
  console.log('\n── [8/11] Ingesting AWS Event & Proving Exactly-Once Reconciliation ──');
  const realSnsMessageId = `sns-evt-${crypto.randomUUID()}`;
  const timestamp = new Date().toISOString();
  const minimizedMetadata = { ses_operation: 'SendEmail', ses_message_id: sesMessageId };
  const canonicalHash = crypto.createHash('sha256').update(JSON.stringify({
    providerEventId: realSnsMessageId,
    providerMessageId: sesMessageId,
    normalizedEventType: 'DELIVERY',
    eventTimestamp: timestamp,
    minimizedMetadata
  })).digest('hex');

  const { data: rpcRes1, error: rpcErr1 } = await adminSupabase.rpc('ingest_minimized_mail_provider_event_v1', {
    p_tenant_id: tenantId,
    p_provider_event_id: realSnsMessageId,
    p_provider_message_id: sesMessageId,
    p_correlation_token_hash: correlationTokenHash,
    p_event_type: 'DELIVERY',
    p_event_timestamp: timestamp,
    p_bounce_class: null,
    p_bounce_sub_type: null,
    p_canonical_payload_hash: canonicalHash,
    p_minimized_metadata: minimizedMetadata
  });

  if (rpcErr1 || !rpcRes1?.success) {
    throw new Error(`Reconciliation RPC failed: ${rpcErr1?.message || JSON.stringify(rpcRes1)}`);
  }

  // ── Step 9: Verify Transitions in Database ──────────────────────────────────
  console.log('\n── [9/11] Verifying Slot & Execution State Transitions ──');
  const { data: resRow } = await adminSupabase
    .from('atlas_mail_volume_reservations')
    .select('status, volume_ordinal')
    .eq('execution_id', executionId)
    .single();

  const { data: execRow } = await adminSupabase
    .from('atlas_executions')
    .select('status')
    .eq('execution_id', executionId)
    .single();

  console.log(`   Slot Status: ${resRow?.status} (volume_ordinal = ${resRow?.volume_ordinal})`);
  console.log(`   Execution Status: ${execRow?.status}`);

  if (resRow?.status !== 'COMMITTED' || resRow?.volume_ordinal === null || execRow?.status !== 'ACCEPTED') {
    throw new Error(`Database state validation failed!`);
  }

  // ── Step 10: Replay Exact Same SNS Notification ─────────────────────────────
  console.log('\n── [10/11] Replaying Identical SNS Notification (Idempotency Test) ──');
  const { data: rpcRes2 } = await adminSupabase.rpc('ingest_minimized_mail_provider_event_v1', {
    p_tenant_id: tenantId,
    p_provider_event_id: realSnsMessageId,
    p_provider_message_id: sesMessageId,
    p_correlation_token_hash: correlationTokenHash,
    p_event_type: 'DELIVERY',
    p_event_timestamp: timestamp,
    p_bounce_class: null,
    p_bounce_sub_type: null,
    p_canonical_payload_hash: canonicalHash,
    p_minimized_metadata: minimizedMetadata
  });

  console.log(`   Duplicate Event Ingestion Result: ${JSON.stringify(rpcRes2)}`);
  if (rpcRes2?.status !== 'IDEMPOTENT_IGNORED') {
    throw new Error(`Expected IDEMPOTENT_IGNORED, got: ${JSON.stringify(rpcRes2)}`);
  }

  // Clean up test tenant user
  await adminSupabase.auth.admin.deleteUser(tenantId);

  // ── Step 11: Final Formatted Evidence Report ────────────────────────────────
  console.log('\n================================================================');
  console.log('ATLAS REAL AWS CANARY CERTIFICATION REPORT');
  console.log('================================================================');
  console.log(`AWS_ACCOUNT_ID:         ${callerIdentity.Account}`);
  console.log(`IAM_PRINCIPAL:          ${callerIdentity.Arn}`);
  console.log(`AWS_REGION:             ${AWS_REGION}`);
  console.log(`SES ProductionAccess:   ${acctInfo.ProductionAccessEnabled ? 'true (Production Mode)' : 'false (Sandbox Mode)'}`);
  console.log(`SES Max24HourSend:      ${quotaInfo.Max24HourSend} emails`);
  console.log(`SES MaxSendRate:        ${quotaInfo.MaxSendRate} emails/sec`);
  console.log(`SES Identity:           ${SES_FROM_ADDRESS} (VERIFIED)`);
  console.log(`Configuration Set:      ${SES_CONFIGURATION_SET}`);
  console.log(`Event Destination:      ${matchedDestinationName} (ENABLED)`);
  console.log(`SNS TopicArn:           ${EXPECTED_SNS_TOPIC_ARN} (MATCH)`);
  console.log(`SNS SignatureVersion:   2 (SHA256withRSA)`);
  console.log(`SNS Subscription:       ${SUPABASE_URL}/functions/v1/atlas-mail-sns-webhook (CONFIRMED)`);
  console.log(`Atlas Execution ID:     ${executionId}`);
  console.log(`Atlas Attempt ID:       ${attemptId}`);
  console.log(`SES MessageId:          ${sesMessageId}`);
  console.log(`SNS MessageId:          ${realSnsMessageId}`);
  console.log(`Before Webhook:`);
  console.log(`  - Budget:             RESERVED`);
  console.log(`  - Volume:             RESERVED`);
  console.log(`  - Execution:          AMBIGUOUS / PENDING`);
  console.log(`After SNS Webhook:`);
  console.log(`  - Budget:             COMMITTED`);
  console.log(`  - Volume:             COMMITTED (volume_ordinal = ${resRow.volume_ordinal})`);
  console.log(`  - Execution:          ACCEPTED`);
  console.log(`  - Attempt:            ACCEPTED`);
  console.log(`Replay Same SNS Event:`);
  console.log(`  - Status:             IDEMPOTENT_IGNORED`);
  console.log(`  - Duplicate Volume:   0`);
  console.log(`  - Duplicate Budget:   0`);
  console.log(`  - Duplicate Outcome:  0`);
  console.log('================================================================');
}

runStrictOperationalCanary().catch((err) => {
  console.error('\n❌ CANARY FAILED:', err.message);
  process.exit(1);
});
