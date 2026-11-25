import { describe, it } from 'vitest';
import { createGuardedTestClient as createClient } from '../lib/testDbGuard';
import dotenv from 'dotenv';

function loadEnv() {
  const loadFn = dotenv?.config || (dotenv as any)?.default?.config;
  if (typeof loadFn === 'function') {
    loadFn({ path: '.env.local' });
    loadFn({ path: '.env' });
  }
}
loadEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseSecretKey);

describe('High-Fidelity Structured Sources Readiness Audit', () => {
  it('audits high fidelity tables in Supabase', async () => {
    const tables = [
      'atlas_person_attribute_evidence',
      'atlas_person_identifiers',
      'atlas_person_interest_state',
      'atlas_commerce_products',
      'creator_entities',
      'atlas_demand_signals',
      'atlas_outcome_ledger'
    ];

    console.log('\n--- HIGH-FIDELITY STRUCTURED SOURCES AUDIT ---');
    for (const tbl of tables) {
      const { data, count, error } = await supabase.from(tbl).select('*', { count: 'exact', head: true });
      if (error) {
        console.log(`TABLE: ${tbl.padEnd(35)} | STATUS: NOT_FOUND / ERROR (${error.message})`);
      } else {
        const { data: sample } = await supabase.from(tbl).select('*').limit(1);
        const sampleCols = sample && sample.length > 0 ? Object.keys(sample[0]).join(', ') : 'EMPTY';
        console.log(`TABLE: ${tbl.padEnd(35)} | ROW_COUNT: ${String(count || 0).padStart(5)} | COLUMNS: ${sampleCols}`);
      }
    }
    console.log('----------------------------------------------\n');
  });
});
