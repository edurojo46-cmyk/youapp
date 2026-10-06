import { generateKeyPairSync, createSign } from 'crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const EDGE_FUNCTION_URL = 'https://jtnurafmngaxdwlzpvxv.supabase.co/functions/v1/atlas-mail-sns-webhook';

async function testLiveEdgeEndpoint() {
  console.log('Testing deployed Edge Function URL:', EDGE_FUNCTION_URL);

  // Test 1: Missing tenant_id context -> 400
  const res1 = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Type: 'Notification' })
  });
  const data1 = await res1.json();
  console.log('[1] Missing tenant_id response (expected 400):', res1.status, data1);
  if (res1.status !== 400) throw new Error('Expected 400 for missing tenant_id');

  // Test 2: Invalid Topic ARN -> rejected (400 / Invalid TopicArn)
  const res2 = await fetch(`${EDGE_FUNCTION_URL}?tenant_id=00000000-0000-0000-0000-000000000000`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Type: 'Notification',
      TopicArn: 'arn:aws:sns:us-east-1:999999999999:unauthorized-topic',
      SignatureVersion: '2'
    })
  });
  const data2 = await res2.json();
  console.log('[2] Unauthorized TopicArn response (expected 400):', res2.status, data2);
  if (res2.status !== 400) throw new Error('Expected 400 for unauthorized TopicArn');

  // Test 3: SignatureVersion != 2 -> rejected (400 / Unsupported SignatureVersion)
  const res3 = await fetch(`${EDGE_FUNCTION_URL}?tenant_id=00000000-0000-0000-0000-000000000000`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Type: 'Notification',
      TopicArn: 'arn:aws:sns:us-east-1:123456789012:atlas-mail-events-staging',
      SignatureVersion: '1'
    })
  });
  const data3 = await res3.json();
  console.log('[3] SignatureVersion=1 response (expected 400):', res3.status, data3);
  if (res3.status !== 400) throw new Error('Expected 400 for SignatureVersion=1');

  console.log('LIVE EDGE FUNCTION HTTP SECURITY TESTS PASSED 🟢');
}

testLiveEdgeEndpoint().catch((err) => {
  console.error('Edge Function test failed:', err);
  process.exit(1);
});
