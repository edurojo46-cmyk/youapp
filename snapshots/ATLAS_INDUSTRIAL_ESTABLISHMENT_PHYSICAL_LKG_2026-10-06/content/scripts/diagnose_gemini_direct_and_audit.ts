/**
 * scripts/diagnose_gemini_direct_and_audit.ts
 *
 * 1. Verify BUDGET_DDL_REMOTE_APPLIED
 * 2. Inspect physical atlas_gemini_usage
 * 3. Direct Gemini model/key tests
 * 4. Audit source payloads for email/web/photo/etc.
 * 5. Audit subject provenance
 */
import 'dotenv/config';
import { supabaseAdmin as db } from '../src/lib/supabaseAdmin';

async function run() {
  console.log('=== DIAGNOSTICS & AUDIT ===\n');

  // 1. Verify DDL
  console.log('--- 1. BUDGET DDL VERIFICATION ---');
  const { data: configData, error: configErr } = await db.from('atlas_ai_budget_config').select('model, purpose, daily_limit').limit(1);
  if (configErr) {
    console.log(`BUDGET_DDL_REMOTE_APPLIED = FAIL (${configErr.message})`);
  } else {
    console.log(`BUDGET_DDL_REMOTE_APPLIED = PASS ✅`);
  }
  
  // 2. Inspect physical atlas_gemini_usage
  console.log('\n--- 2. PHYSICAL atlas_gemini_usage ---');
  const { data: pgClassData, error: pgClassErr } = await db.rpc('execute_sql_readonly', { sql_query: "SELECT relname, relowner::regrole, reltuples FROM pg_class WHERE relname = 'atlas_gemini_usage';" });
  
  if (pgClassErr) {
    console.log('Could not query pg_class via RPC, falling back to information_schema via direct query (if possible) or skipping.');
    const { data: infoSchema } = await db.from('information_schema.tables').select('table_name').eq('table_name', 'atlas_gemini_usage');
    if (infoSchema && infoSchema.length > 0) {
      console.log('ATLAS_GEMINI_USAGE_PHYSICAL_TABLE_EXISTS = YES (via information_schema)');
    } else {
      console.log('ATLAS_GEMINI_USAGE_PHYSICAL_TABLE_EXISTS = NO (via information_schema)');
    }
  } else {
     if (pgClassData && pgClassData.length > 0) {
         console.log('ATLAS_GEMINI_USAGE_PHYSICAL_TABLE_EXISTS = YES');
         console.log(JSON.stringify(pgClassData, null, 2));
     } else {
         console.log('ATLAS_GEMINI_USAGE_PHYSICAL_TABLE_EXISTS = NO');
     }
  }

  // 3. Direct Gemini model/key tests
  console.log('\n--- 3. DIRECT GEMINI TESTS ---');
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('GEMINI_KEY_VALID = NO (GEMINI_API_KEY not found in env)');
  } else {
    console.log('GEMINI_KEY_VALID = YES (present)');
    const modelsToTest = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'];
    for (const model of modelsToTest) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: "Return JSON with intent PERSON_SEARCH" }] }] })
        });
        const status = res.status;
        let responseBody: any = {};
        try { responseBody = await res.json(); } catch(e) {}
        
        console.log(`\nTEST: ${model}`);
        console.log(`MODEL = ${model}`);
        console.log(`ENDPOINT = /v1beta/models/${model}:generateContent`);
        console.log(`HTTP_STATUS = ${status}`);
        
        if (status === 200) {
          console.log(`${model.toUpperCase().replace(/-/g, '_')}_DIRECT = PASS ✅`);
          console.log(`REQUEST_REACHED_GOOGLE = YES`);
        } else {
           console.log(`${model.toUpperCase().replace(/-/g, '_')}_DIRECT = FAIL ❌`);
           console.log(`REQUEST_REACHED_GOOGLE = YES`);
           console.log(`PROVIDER_ERROR_CODE = ${responseBody?.error?.code}`);
           console.log(`PROVIDER_ERROR_MESSAGE = ${responseBody?.error?.message}`);
        }
      } catch (err: any) {
        console.log(`\nTEST: ${model}`);
        console.log(`${model.toUpperCase().replace(/-/g, '_')}_DIRECT = FAIL ❌`);
        console.log(`REQUEST_REACHED_GOOGLE = NO (${err.message})`);
      }
    }
  }

  // 4 & 5. Audit source payloads and provenance
  console.log('\n--- 4 & 5. SOURCE AUDIT ---');
  let emailCount = 0;
  let webCount = 0;
  let photoCount = 0;
  
  let gcbaCount = 0;
  let wikidataCount = 0;
  let githubCount = 0;
  let multiSourceCount = 0;

  const { data: obsSubjects, error: osErr } = await db.from('atlas_observation_subjects').select('subject_id, source_id, observation:atlas_person_observations(raw_data)');
  
  if (osErr) {
    console.log('Error fetching observation subjects:', osErr.message);
  } else {
     const subjectSources: Record<string, Set<string>> = {};
     
     for (const row of obsSubjects || []) {
         if (!subjectSources[row.subject_id]) subjectSources[row.subject_id] = new Set();
         subjectSources[row.subject_id].add(row.source_id);
         
         const obsList = Array.isArray(row.observation) ? row.observation : [row.observation];
         for (const obs of obsList) {
             const rawData = obs?.raw_data;
             const raw = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
             
             if (raw) {
                 const strRaw = JSON.stringify(raw).toLowerCase();
                 if (strRaw.includes('email') || strRaw.includes('correo') || strRaw.includes('@')) emailCount++;
                 if (strRaw.includes('website') || strRaw.includes('web') || strRaw.includes('http')) webCount++;
                 if (strRaw.includes('photo') || strRaw.includes('image') || strRaw.includes('avatar') || strRaw.includes('foto') || strRaw.includes('picture')) photoCount++;
             }
         }
     }
     
     for (const [subjectId, sources] of Object.entries(subjectSources)) {
         if (sources.size > 1) multiSourceCount++;
         if (sources.has('GCBA_DIRECTORIO') || sources.has('GCBA') || [...sources].some(s => s.includes('GCBA'))) gcbaCount++;
         if (sources.has('WIKIDATA') || [...sources].some(s => s.includes('WIKIDATA'))) wikidataCount++;
         if (sources.has('GITHUB') || [...sources].some(s => s.includes('GITHUB'))) githubCount++;
     }
  }
  
  console.log(`GCBA_SUBJECTS = ${gcbaCount}`);
  console.log(`WIKIDATA_SUBJECTS = ${wikidataCount}`);
  console.log(`GITHUB_SUBJECTS = ${githubCount}`);
  console.log(`MULTI_SOURCE_SUBJECTS = ${multiSourceCount}`);
  console.log(`SOURCE_EMAIL_FIELDS = ${emailCount}`);
  console.log(`SOURCE_WEB_FIELDS = ${webCount}`);
  console.log(`SOURCE_PHOTO_FIELDS = ${photoCount}`);
}

run().catch(e => { console.error(e); process.exit(1); });
