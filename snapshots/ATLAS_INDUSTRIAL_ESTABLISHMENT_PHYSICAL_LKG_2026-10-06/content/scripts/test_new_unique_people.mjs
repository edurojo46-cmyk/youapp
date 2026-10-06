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
  console.log('--- 1. CERTIFICAR SEMÁNTICA DE NEW_UNIQUE_PEOPLE_INSERTED ---');
  let testsPassed = 0;

  // Use a completely unique namespace for tests to avoid polluting the DB
  const ts = Date.now();
  
  const p1 = `atlas_test_per_${ts}_1`;
  const p2 = `atlas_test_per_${ts}_2`;
  const p3 = `atlas_test_per_${ts}_3`;
  const p4 = `atlas_test_per_${ts}_4`;

  // Helper
  async function runBatch(identities) {
    const { data, error } = await sb.rpc('commit_canonical_with_search_outbox', {
      p_identity_rows: identities,
      p_outbox_rows: []
    });
    if (error) throw error;
    if (!data.ok) throw new Error(data.error);
    return data.NEW_UNIQUE_PEOPLE_INSERTED;
  }

  try {
    // TEST A: 1 source identity de persona nueva
    const resA = await runBatch([{
      atlas_person_id: p1,
      source_id: 'TEST_A',
      source_person_id: `TEST_A_1_${ts}`,
      identifier_type: 'TEST',
      identifier_value: '1',
      evidence_id: 'ev_1',
      confidence: 1,
      resolution_method: 'TEST',
      observed_at: new Date().toISOString()
    }]);
    if (resA === 1) { console.log('✅ TEST A PASS: 1 persona nueva = 1'); testsPassed++; }
    else { console.error(`❌ TEST A FAIL: expected 1, got ${resA}`); }

    // TEST B: 5 source identities del MISMO atlas_person_id nuevo dentro del mismo batch
    const resB = await runBatch([
      { atlas_person_id: p2, source_id: 'TEST_B', source_person_id: `TEST_B_1_${ts}`, identifier_type: 'TEST', identifier_value: '1', evidence_id: 'ev_1', confidence: 1, resolution_method: 'TEST' },
      { atlas_person_id: p2, source_id: 'TEST_B', source_person_id: `TEST_B_2_${ts}`, identifier_type: 'TEST', identifier_value: '2', evidence_id: 'ev_2', confidence: 1, resolution_method: 'TEST' },
      { atlas_person_id: p2, source_id: 'TEST_B', source_person_id: `TEST_B_3_${ts}`, identifier_type: 'TEST', identifier_value: '3', evidence_id: 'ev_3', confidence: 1, resolution_method: 'TEST' },
      { atlas_person_id: p2, source_id: 'TEST_B', source_person_id: `TEST_B_4_${ts}`, identifier_type: 'TEST', identifier_value: '4', evidence_id: 'ev_4', confidence: 1, resolution_method: 'TEST' },
      { atlas_person_id: p2, source_id: 'TEST_B', source_person_id: `TEST_B_5_${ts}`, identifier_type: 'TEST', identifier_value: '5', evidence_id: 'ev_5', confidence: 1, resolution_method: 'TEST' }
    ]);
    if (resB === 1) { console.log('✅ TEST B PASS: 5 identities de la misma persona nueva en el batch = 1'); testsPassed++; }
    else { console.error(`❌ TEST B FAIL: expected 1, got ${resB}`); }

    // TEST C: persona ya existente + nueva source identity
    const resC = await runBatch([{
      atlas_person_id: p1, // Ya existe del TEST A
      source_id: 'TEST_C',
      source_person_id: `TEST_C_1_${ts}`,
      identifier_type: 'TEST',
      identifier_value: '1',
      evidence_id: 'ev_c1',
      confidence: 1,
      resolution_method: 'TEST',
      observed_at: new Date().toISOString()
    }]);
    if (resC === 0) { console.log('✅ TEST C PASS: Persona existente + nueva identity = 0'); testsPassed++; }
    else { console.error(`❌ TEST C FAIL: expected 0, got ${resC}`); }

    // TEST D: replay exacto
    const resD = await runBatch([{
      atlas_person_id: p1,
      source_id: 'TEST_A', // Exacto replay de TEST A
      source_person_id: `TEST_A_1_${ts}`,
      identifier_type: 'TEST',
      identifier_value: '1',
      evidence_id: 'ev_1',
      confidence: 1,
      resolution_method: 'TEST',
      observed_at: new Date().toISOString()
    }]);
    if (resD === 0) { console.log('✅ TEST D PASS: Replay exacto = 0'); testsPassed++; }
    else { console.error(`❌ TEST D FAIL: expected 0, got ${resD}`); }

    // TEST E: 3 personas nuevas diferentes
    const resE = await runBatch([
      { atlas_person_id: p3, source_id: 'TEST_E', source_person_id: `TEST_E_1_${ts}`, identifier_type: 'TEST', identifier_value: '1', evidence_id: 'ev_1', confidence: 1, resolution_method: 'TEST' },
      { atlas_person_id: p4, source_id: 'TEST_E', source_person_id: `TEST_E_2_${ts}`, identifier_type: 'TEST', identifier_value: '2', evidence_id: 'ev_2', confidence: 1, resolution_method: 'TEST' },
      { atlas_person_id: `atlas_test_per_${ts}_5`, source_id: 'TEST_E', source_person_id: `TEST_E_3_${ts}`, identifier_type: 'TEST', identifier_value: '3', evidence_id: 'ev_3', confidence: 1, resolution_method: 'TEST' }
    ]);
    if (resE === 3) { console.log('✅ TEST E PASS: 3 personas nuevas diferentes = 3'); testsPassed++; }
    else { console.error(`❌ TEST E FAIL: expected 3, got ${resE}`); }

  } catch (e) {
    console.error('Test failed with error:', e.message);
  }

  console.log(`\nNET_NEW_COUNTER_TESTS = ${testsPassed}/5 PASS`);
}
main();
