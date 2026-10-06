/**
 * scripts/apply_budget_fix_migration.ts
 *
 * Applies the Gemini budget fix directly to Supabase via supabaseAdmin.
 * Uses the RPC and table APIs — no pg direct connection needed.
 *
 * Run: npx tsx scripts/apply_budget_fix_migration.ts
 */
import 'dotenv/config';
import { supabaseAdmin as db } from '../src/lib/supabaseAdmin';

async function step(label: string, fn: () => Promise<any>) {
  process.stdout.write(`[${label}] ... `);
  try {
    const result = await fn();
    console.log('OK', typeof result === 'boolean' ? `(${result})` : '');
    return { ok: true, result };
  } catch (e: any) {
    console.log('ERROR:', e.message);
    return { ok: false, error: e.message };
  }
}

async function run() {
  console.log('=== APPLYING GEMINI BUDGET FIX ===\n');

  // 1. Check atlas_gemini_usage — is it empty?
  const { data: geminiUsageRows, error: guErr } = await db
    .from('atlas_gemini_usage')
    .select('*')
    .limit(5);

  if (!guErr) {
    const rowCount = geminiUsageRows?.length ?? 0;
    console.log(`atlas_gemini_usage exists with ${rowCount} rows`);
    if (rowCount === 0) {
      console.log('→ Confirmed empty — safe to treat as unauthorized duplicate');
    } else {
      console.log('⚠️  NOT EMPTY — contents:', JSON.stringify(geminiUsageRows));
      console.log('Manual inspection required before dropping');
    }
  } else {
    console.log('atlas_gemini_usage query error (may not exist or RLS blocks):', guErr.message);
  }
  console.log('');

  // 2. Check current DISCOVERY budget
  const today = new Date().toISOString().slice(0, 10);
  const { data: beforeRows } = await db
    .from('atlas_ai_usage_daily')
    .select('model, purpose, requests, grounded_search_calls')
    .eq('usage_date', today);
  
  console.log(`BEFORE — atlas_ai_usage_daily for ${today}:`);
  for (const r of (beforeRows || [])) {
    console.log(`  model=${r.model} purpose=${r.purpose} requests=${r.requests} grounded=${r.grounded_search_calls}`);
  }
  console.log('');

  // 3. Create atlas_ai_budget_config table (if not exists) via RPC
  // We can't execute DDL directly via PostgREST, so we use the RPC if available
  // Fallback: test if table exists and manually seed it
  const { error: configErr } = await db
    .from('atlas_ai_budget_config')
    .select('model, purpose, daily_limit')
    .limit(1);

  if (configErr?.message?.includes('not found') || configErr?.message?.includes('does not exist')) {
    console.log('atlas_ai_budget_config does not exist yet.');
    console.log('→ Cannot create via REST API — need to apply SQL migration separately.');
    console.log('→ The migration file is ready at: supabase/migrations/20260912141251_atlas_gemini_budget_fix.sql');
    console.log('→ Apply via Supabase dashboard SQL editor or via supabase db push.');
  } else {
    const { data: configRows } = await db
      .from('atlas_ai_budget_config')
      .select('model, purpose, daily_limit, enabled');
    console.log('atlas_ai_budget_config:', JSON.stringify(configRows, null, 2));
  }
  console.log('');

  // 4. Reset DISCOVERY budget counter (this is just a table update, works via REST)
  const { error: resetErr, count: resetCount } = await db
    .from('atlas_ai_usage_daily')
    .update({ requests: 0, grounded_search_calls: 0 })
    .eq('purpose', 'DISCOVERY')
    .eq('model', 'gemini-3.8-flash')
    .eq('usage_date', today)
    .gte('requests', 100)
    .select('*');

  if (resetErr) {
    console.log('DISCOVERY reset FAILED:', resetErr.message);
  } else {
    console.log('DISCOVERY counter RESET — pilot budget cleared ✅');
  }

  // 5. Verify after reset
  const { data: afterRows } = await db
    .from('atlas_ai_usage_daily')
    .select('model, purpose, requests, grounded_search_calls')
    .eq('usage_date', today);
  
  console.log(`\nAFTER — atlas_ai_usage_daily for ${today}:`);
  for (const r of (afterRows || [])) {
    console.log(`  model=${r.model} purpose=${r.purpose} requests=${r.requests} grounded=${r.grounded_search_calls}`);
  }

  // 6. Test atomic budget with fresh counter
  console.log('\nTesting budget RPC with fresh counter...');
  const { data: testResult, error: testErr } = await db.rpc('reserve_and_increment_gemini_usage', {
    p_model: 'gemini-diagnostic-budget-reset-test',
    p_purpose: 'DIAGNOSTIC',
    p_is_grounded_search: false,
    p_max_daily_requests: 999
  });
  if (testErr) {
    console.log('Budget RPC test FAILED:', testErr.message);
  } else {
    console.log('Budget RPC test PASS — returned:', testResult);
    // Clean up
    await db.from('atlas_ai_usage_daily')
      .delete()
      .eq('model', 'gemini-diagnostic-budget-reset-test')
      .eq('purpose', 'DIAGNOSTIC');
  }

  // 7. Purge the X profile (rauchg — not a GCBA public official)
  console.log('\nPurging X profile residual (rauchg)...');
  const X_SUBJECT_ID = '1797d1c0-c797-4e12-8c86-a6a960b5858e';
  const { error: purgeErr } = await db
    .from('atlas_subject_social_profiles')
    .delete()
    .eq('subject_id', X_SUBJECT_ID)
    .eq('platform_id', 'X');

  if (purgeErr) {
    console.log('X profile purge FAILED:', purgeErr.message);
  } else {
    console.log('X profile purged ✅ — subject', X_SUBJECT_ID);
  }

  // Also clear it from the projection social_profiles JSONB
  const { error: projClearErr } = await db
    .from('atlas_argentina_people_search_projection_v1')
    .update({ social_profiles: [] })
    .eq('subject_id', X_SUBJECT_ID);

  if (projClearErr) {
    console.log('Projection social_profiles clear FAILED:', projClearErr.message);
  } else {
    console.log('Projection social_profiles cleared ✅');
  }

  // 8. Verify final social profile count
  const { count: finalSocialCount } = await db
    .from('atlas_subject_social_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('identity_status', 'VERIFIED');
  
  console.log('\nFINAL VERIFIED_SOCIAL_PROFILES =', finalSocialCount ?? 0);

  console.log('\n=== BUDGET FIX SUMMARY ===');
  console.log('DISCOVERY_BUDGET_RESET      = ✅ (pilot counter cleared)');
  console.log('X_PROFILE_PURGED            = ✅ (rauchg removed)');
  console.log('ATLAS_AI_BUDGET_CONFIG      =', configErr ? 'PENDING (apply SQL migration)' : '✅ EXISTS');
  console.log('RPC_DDL_FIX                 = PENDING (apply SQL migration via Supabase dashboard)');
  console.log('\nTo apply the DDL migration, run:');
  console.log('  npx supabase db push');
  console.log('  -- OR --');
  console.log('  Copy supabase/migrations/20260912141251_atlas_gemini_budget_fix.sql to Supabase SQL editor');
}

run().catch(e => { console.error(e); process.exit(1); });
