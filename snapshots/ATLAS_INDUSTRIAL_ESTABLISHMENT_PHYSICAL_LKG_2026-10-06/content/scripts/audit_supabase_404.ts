import { supabase } from '../src/lib/supabase';

async function auditSupabase() {
  console.log('--- Checking exact_work_coverage_memory ---');
  const res1 = await supabase.from('exact_work_coverage_memory').select('*').limit(5);
  console.log('exact_work_coverage_memory SELECT:', {
    status: (res1 as any).status,
    statusText: (res1 as any).statusText,
    error: res1.error ? { code: res1.error.code, message: res1.error.message, details: res1.error.details, hint: res1.error.hint } : null
  });

  const resUpsert = await supabase.from('exact_work_coverage_memory').upsert({
    work_id: 'test_work_id',
    canonical_title: 'Test Title',
    artist: 'Test Artist'
  }, { onConflict: 'work_id' });
  console.log('exact_work_coverage_memory UPSERT (onConflict=work_id):', {
    status: (resUpsert as any).status,
    statusText: (resUpsert as any).statusText,
    error: resUpsert.error ? { code: resUpsert.error.code, message: resUpsert.error.message, details: resUpsert.error.details } : null
  });

  console.log('\n--- Checking select query limit=50 ---');
  // Check which tables get queried with limit=50
  const tables = ['youapp_index', 'works_ontology', 'canonical_entities', 'knowledge_graph', 'creator_graph', 'query_memory'];
  for (const t of tables) {
    const r = await supabase.from(t).select('*').limit(50);
    console.log(`Table ${t}: status=${(r as any).status || 200}, error=${r.error?.message || 'none'}`);
  }
}

auditSupabase().catch(console.error);
