import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const l of env.split('\n')) {
  if (l.startsWith('VITE_SUPABASE_URL=')) url = l.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  if (l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = l.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
}
const sb = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const p1 = `atlas_test_per_${Date.now()}_1`;
  const { data, error } = await sb.rpc('commit_canonical_with_search_outbox', {
    p_identity_rows: [{
      atlas_person_id: p1,
      source_id: 'TEST_A',
      source_person_id: 'TEST_A_1',
      identifier_type: 'TEST',
      identifier_value: '1',
      evidence_id: 'ev_1',
      confidence: 1,
      resolution_method: 'TEST',
      observed_at: new Date().toISOString()
    }],
    p_outbox_rows: []
  });
  console.log('Result A:', data);

  const { data: d2 } = await sb.rpc('commit_canonical_with_search_outbox', {
    p_identity_rows: [{
      atlas_person_id: p1,
      source_id: 'TEST_C',
      source_person_id: 'TEST_C_1',
      identifier_type: 'TEST',
      identifier_value: '1',
      evidence_id: 'ev_c1',
      confidence: 1,
      resolution_method: 'TEST',
      observed_at: new Date().toISOString()
    }],
    p_outbox_rows: []
  });
  console.log('Result C:', d2);
}
main();
