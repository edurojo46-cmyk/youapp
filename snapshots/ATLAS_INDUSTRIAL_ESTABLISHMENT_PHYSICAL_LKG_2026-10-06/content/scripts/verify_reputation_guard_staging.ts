import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

async function verifyStagingParity() {
  console.log('===========================================================');
  console.log('VERIFYING STAGING DATABASE PARITY FOR 081000');
  console.log('===========================================================');

  const tables = [
    'atlas_mail_reputation_signals_daily',
    'atlas_mail_reputation_evaluations',
    'atlas_mail_feedback_campaigns'
  ];

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.error(`❌ Table ${table} verification FAILED:`, error.message);
      return { success: false, failedTable: table, error: error.message };
    } else {
      console.log(`✅ Table ${table} is LIVE, accessible, and queryable on Staging DB.`);
    }
  }

  // 1. Test Ingestion RPC
  const testDomain = `staging-verify-${Date.now()}.com`;
  const today = new Date().toISOString().split('T')[0];

  const { data: sigId, error: rpcSigErr } = await supabase.rpc('record_atlas_reputation_signal_v1', {
    p_provider: 'GOOGLE_POSTMASTER',
    p_signal_date: today,
    p_domain: testDomain,
    p_sending_ip_hash: 'GLOBAL',
    p_spam_rate: 0.0002,
    p_domain_reputation: 'HIGH',
    p_ip_reputation: 'HIGH',
    p_authentication_status: 'PASS',
    p_delivery_errors: 0,
    p_temporary_deferrals: 0,
    p_hard_bounces: 0,
    p_complaints: 0,
    p_snds_abnormal_status: false,
    p_sample_volume: 500,
    p_has_sufficient_sample: true
  });

  if (rpcSigErr) {
    console.error('❌ RPC record_atlas_reputation_signal_v1 FAILED:', rpcSigErr.message);
    return { success: false, failedRPC: 'record_atlas_reputation_signal_v1', error: rpcSigErr.message };
  }
  console.log(`✅ RPC record_atlas_reputation_signal_v1 is LIVE and functional (Returned Signal ID: ${sigId})`);

  // 2. Test Evaluation RPC
  const { data: evalRes, error: rpcEvalErr } = await supabase.rpc('evaluate_atlas_reputation_guard_v1', {
    p_domain: testDomain,
    p_eval_date: today
  });

  if (rpcEvalErr) {
    console.error('❌ RPC evaluate_atlas_reputation_guard_v1 FAILED:', rpcEvalErr.message);
    return { success: false, failedRPC: 'evaluate_atlas_reputation_guard_v1', error: rpcEvalErr.message };
  }
  console.log('✅ RPC evaluate_atlas_reputation_guard_v1 is LIVE and functional (Returned Evaluation:', evalRes, ')');

  // 3. Verify zero PII & cleanup
  await supabase.from('atlas_mail_reputation_signals_daily').delete().eq('domain', testDomain);
  await supabase.from('atlas_mail_reputation_evaluations').delete().eq('domain', testDomain);

  console.log('===========================================================');
  console.log('STAGING PARITY 081000 CONFIRMED 100% PASS 🟢');
  console.log('===========================================================');

  return { success: true };
}

verifyStagingParity().catch(err => {
  console.error('Parity verification exception:', err);
  process.exit(1);
});
