import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

function makeFakeCandidate(i) {
  return {
    discovery_id: `test_bench_${i}_${Date.now()}`,
    display_name: `BENCHMARK TEST PERSON ${i}`,
    role: 'DIRECTOR TEST',
    organization: 'BENCHMARK CORP SA',
    source_id: 'BENCHMARK_SOURCE',
    source_record_id: `rec_${i}`,
    location_relation_type: 'HEADQUARTERS',
    location_evidence: 'BENCHMARK',
    location_source_url: 'https://example.com',
    person_source_url: 'https://example.com'
  };
}

for (const size of [25, 50, 100]) {
  const rows = Array.from({ length: size }, (_, i) => makeFakeCandidate(i));
  const t0 = performance.now();
  const { error } = await s.from('atlas_people_discovery_candidates').upsert(rows, { onConflict: 'source_id,source_record_id' });
  console.log(`Chunk ${size} upsert: ${error ? error.message : 'OK'} in ${(performance.now() - t0).toFixed(1)}ms`);
}

// Cleanup benchmark rows
await s.from('atlas_people_discovery_candidates').delete().eq('source_id', 'BENCHMARK_SOURCE');
console.log('Cleanup done.');
