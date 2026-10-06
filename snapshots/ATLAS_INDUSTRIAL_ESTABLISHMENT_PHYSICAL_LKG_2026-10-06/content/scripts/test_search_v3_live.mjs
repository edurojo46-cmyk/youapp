import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

console.log('Testing atlas_search_people_engine_v3...');
const t0 = performance.now();
const { data: singleRes, error: err1 } = await sb.rpc('atlas_search_people_engine_v3', {
  p_query: 'JUAN CARLOS',
  p_evidence_state: 'ALL_ARGENTINA',
  p_limit: 5
});
const t1 = performance.now();
console.log(`Single Search V3 (JUAN CARLOS): ${(t1 - t0).toFixed(1)}ms | Matches: ${singleRes?.length || 0} | Error:`, err1);

console.log('\nTesting atlas_search_people_batch_v3...');
const t2 = performance.now();
const { data: batchRes, error: err2 } = await sb.rpc('atlas_search_people_batch_v3', {
  p_queries: [
    { query_id: 'q1', query: 'JUAN CARLOS', limit: 5 },
    { query_id: 'q2', query: 'GERENTE', limit: 5 },
    { query_id: 'q3', query: 'SOCIEDAD ANONIMA', limit: 5 },
    { query_id: 'q4', query: 'BUENOS AIRES', limit: 5 },
    { query_id: 'q5', query: 'ZZZZNONEXISTENTXZQ999', limit: 5 }
  ]
});
const t3 = performance.now();
console.log(`Batch Search V3 (5 queries in 1 RPC): ${(t3 - t2).toFixed(1)}ms | Batch Result Count: ${batchRes?.length || 0} | Error:`, err2);
if (batchRes) {
  for (const b of batchRes) {
    console.log(`  -> ${b.query_id}: ${b.count} results`);
  }
}
