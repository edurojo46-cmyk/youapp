/**
 * scripts/diagnose_gemini_429.ts
 *
 * Step 4 — Gemini 429 Root-Cause Diagnosis
 *
 * Fires EXACTLY ONE grounded request through the Atlas Edge Function
 * and captures the full error metadata to identify the quota layer.
 *
 * Does NOT retry. Does NOT log secrets.
 *
 * Run: npx tsx scripts/diagnose_gemini_429.ts
 */
import 'dotenv/config';
import { supabaseAdmin as db } from '../src/lib/supabaseAdmin';

const EDGE_FN = 'atlas-gemini-person-search';

// A representative subject query with strong context
const TEST_QUERY = 'Horacio Rodriguez Larreta Jefe de Gobierno Ciudad de Buenos Aires LinkedIn';

async function run() {
  console.log('=== GEMINI 429 ROOT-CAUSE DIAGNOSIS ===\n');
  console.log('Making ONE grounded request — no retries.\n');

  const startMs = Date.now();
  let httpStatus: number | null = null;
  let errorCode: string | null = null;
  let errorCategory: string | null = null;
  let retryAfter: string | null = null;
  let model: string | null = null;
  let groundingRequested = true;
  let responseBody: any = null;
  let origin429: string = 'UNKNOWN';

  try {
    // We use raw fetch to capture response headers that supabase-js may swallow
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
    const SERVICE_KEY  = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/${EDGE_FN}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Use service key as API key per Supabase's current recommendation
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'apikey': SERVICE_KEY,
        },
        body: JSON.stringify({ action: 'DISCOVERY', query: TEST_QUERY }),
      }
    );

    httpStatus = res.status;
    retryAfter = res.headers.get('Retry-After') || res.headers.get('x-ratelimit-reset');

    try {
      responseBody = await res.json();
    } catch {
      responseBody = await res.text().catch(() => null);
    }

    if (httpStatus === 429) {
      // Parse error details
      errorCode     = responseBody?.error_code || responseBody?.code || null;
      errorCategory = responseBody?.status || responseBody?.error || null;

      // Classify origin
      if (errorCategory === 'QUOTA_EXHAUSTED') {
        origin429 = 'ATLAS_INTERNAL_BUDGET';
      } else if (responseBody?.error?.includes('quota') || responseBody?.error?.includes('limit')) {
        origin429 = 'GEMINI_PROJECT_QUOTA_OR_MODEL_QUOTA';
      } else if (retryAfter) {
        origin429 = 'TEMPORARY_RATE_LIMIT';
      } else {
        origin429 = 'UNKNOWN — inspect response body';
      }

      // Detect if this came from Atlas internal budget RPC
      if (errorCategory === 'QUOTA_EXHAUSTED') {
        origin429 = 'ATLAS_BUDGET (reserve_and_increment_gemini_usage returned false)';
      }
    } else if (httpStatus === 200) {
      const candidates = responseBody?.candidates?.length || 0;
      const groundingUrls = responseBody?.groundingMetadata?.citations || [];
      const searchQueries = responseBody?.groundingMetadata?.searchEntryPoint || [];
      console.log('HTTP_STATUS = 200');
      console.log('SINGLE_GEMINI_GROUNDED_CALL = PASS');
      console.log(`CANDIDATES = ${candidates}`);
      console.log(`GROUNDING_URLS = ${JSON.stringify(groundingUrls)}`);
      console.log(`SEARCH_QUERIES = ${JSON.stringify(searchQueries)}`);
      console.log('REAL_GOOGLE_SEARCH_GROUNDING =', groundingUrls.length > 0 ? 'PASS' : 'FAIL (no grounding URLs returned)');
      return;
    } else if (httpStatus === 403) {
      console.log('HTTP_STATUS = 403');
      console.log('SECURITY_AUTH_TEST: Backend secret key was REJECTED by Edge Function.');
      console.log('→ Check that SUPABASE_SECRET_KEY env var is correct and the Edge Function is deployed with current auth logic.');
      return;
    }
  } catch (err: any) {
    console.error('Network or invocation error:', err?.message || err);
    return;
  }

  const elapsedMs = Date.now() - startMs;

  // Report
  console.log(`HTTP_STATUS              = ${httpStatus}`);
  console.log(`ERROR_CODE               = ${errorCode ?? 'null'}`);
  console.log(`ERROR_CATEGORY           = ${errorCategory ?? 'null'}`);
  console.log(`RETRY_AFTER              = ${retryAfter ?? 'null'}`);
  console.log(`MODEL                    = (set in edge function env; default: gemini-3.8-flash)`);
  console.log(`GROUNDING_REQUESTED      = ${groundingRequested}`);
  console.log(`ELAPSED_MS               = ${elapsedMs}`);
  console.log('');
  console.log(`HTTP_429_ORIGIN          = ${origin429}`);
  console.log('');

  if (httpStatus === 429) {
    if (origin429.includes('ATLAS_BUDGET')) {
      console.log('RECOMMENDATION:');
      console.log('  The Atlas internal budget (reserve_and_increment_gemini_usage) is exhausted for today.');
      console.log('  Action: Check the atlas_gemini_usage table for today\'s DISCOVERY calls.');
      console.log('  If usage is 0, the RPC may be returning false due to a misconfigured maxCalls threshold.');
      console.log('  RETRY_POLICY = FAIL_FAST (quota exhaustion, not temporary rate limit)');
    } else if (origin429.includes('TEMPORARY_RATE_LIMIT')) {
      console.log('RECOMMENDATION:');
      console.log('  Temporary rate limit. Bounded backoff + jitter is appropriate.');
      console.log('  RETRY_POLICY = EXPONENTIAL_BACKOFF');
    } else {
      console.log('RECOMMENDATION:');
      console.log('  Unknown 429 source. Full response body below:');
      console.log(JSON.stringify(responseBody, null, 2));
      console.log('  Check Gemini API project quota at: https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas');
      console.log('  RETRY_POLICY = FAIL_FAST until root cause is identified');
    }
  }

  // Also check the atlas internal budget table
  console.log('\n--- Atlas Internal Budget Check ---');
  const today = new Date().toISOString().slice(0, 10);
  const { data: budgetRows, error: budgetErr } = await db
    .from('atlas_gemini_usage')
    .select('model, purpose, call_count, date')
    .gte('date', today)
    .order('call_count', { ascending: false })
    .limit(10);

  if (budgetErr) {
    console.log('Could not query atlas_gemini_usage:', budgetErr.message);
    console.log('(Table may not exist or RLS may block service key — check schema)');
  } else if (!budgetRows || budgetRows.length === 0) {
    console.log('atlas_gemini_usage: No rows for today. Budget should be available.');
    console.log('→ If 429 is coming from Atlas budget, the RPC function may have a bug.');
  } else {
    console.log('Today\'s usage:');
    for (const row of budgetRows) {
      console.log(`  model=${row.model} purpose=${row.purpose} call_count=${row.call_count}`);
    }
  }

  console.log('\nSINGLE_GEMINI_GROUNDED_CALL =', httpStatus === 200 ? 'PASS' : 'FAIL');
  console.log('GEMINI_429_ROOT_CAUSE =', origin429);
}

run().catch(e => { console.error(e); process.exit(1); });
