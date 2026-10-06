import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

async function verifySchema() {
  console.log('Inspecting Remote Staging Schema Parity...');

  const expectedTables = [
    'atlas_mail_provider_account_scopes',
    'atlas_mail_tenant_provider_accounts',
    'atlas_mail_provider_pricing_configs',
    'atlas_mail_provider_pricing_tiers',
    'atlas_mail_provider_monthly_usage',
    'atlas_mail_volume_reservations',
    'atlas_mail_execution_correlations',
    'atlas_mail_provider_events',
    'atlas_outreach_suppressions'
  ];

  for (const table of expectedTables) {
    const { data, error } = await supabase.from(table).select('count').limit(0);
    if (error) {
      console.error(`❌ Table ${table} check failed:`, error.message);
    } else {
      console.log(`✅ Table ${table} exists and is accessible.`);
    }
  }

  // Check RPC availability
  const rpcTests: { name: string; params: any }[] = [
    { name: 'validate_pricing_tier_continuity_v1', params: { p_config_id: '00000000-0000-0000-0000-000000000000' } },
    { name: 'reconcile_mail_timeout_via_correlation_v1', params: { p_tenant_id: '00000000-0000-0000-0000-000000000000', p_correlation_token_hash: 'dummy', p_provider_message_id: 'msg-1', p_resolution: 'ACCEPTED' } },
    { name: 'release_mail_volume_slot_v1', params: { p_attempt_id: '00000000-0000-0000-0000-000000000000', p_error_details: null } },
    { name: 'commit_mail_volume_slot_v1', params: { p_attempt_id: '00000000-0000-0000-0000-000000000000', p_provider_message_id: 'msg-1' } },
    { name: 'plan_and_route_email_v1', params: { p_logical_execution_identity: 'id', p_execution_request_id: '00000000-0000-0000-0000-000000000000', p_action_type: 'EMAIL_SEND', p_destination_email: 'test@example.com', p_prepared_payload: {}, p_raw_correlation_token: 'token' } },
    { name: 'ingest_minimized_mail_provider_event_v1', params: { p_tenant_id: '00000000-0000-0000-0000-000000000000', p_provider_event_id: 'evt-1', p_provider_message_id: 'msg-1', p_correlation_token_hash: null, p_event_type: 'DELIVERY', p_event_timestamp: '2026-09-09T00:00:00Z', p_bounce_class: null, p_bounce_sub_type: null, p_canonical_payload_hash: 'hash', p_minimized_metadata: {} } }
  ];

  for (const { name, params } of rpcTests) {
    const { data, error } = await supabase.rpc(name as any, params);
    if (error && error.message.includes('Could not find the function')) {
      console.error(`❌ RPC ${name} NOT FOUND:`, error.message);
    } else {
      console.log(`✅ RPC ${name} is live, recognized, and callable on remote staging (returned: ${JSON.stringify(data ?? error?.message)}).`);
    }
  }

  console.log('Schema parity inspection complete.');
}

verifySchema().catch(console.error);
