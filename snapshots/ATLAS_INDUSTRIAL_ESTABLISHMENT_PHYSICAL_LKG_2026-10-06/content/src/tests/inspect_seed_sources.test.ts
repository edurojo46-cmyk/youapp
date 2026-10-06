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

describe('Observations Inspection', () => {
  it('inspects observations and tenant IDs', async () => {
    const { data: obs, error: obsErr } = await supabase.from('atlas_entity_source_observations').select('observation_id, tenant_id, source_name, observed_name').limit(10);
    console.log('Obs error:', obsErr);
    console.log('Sample observations:', JSON.stringify(obs, null, 2));

    const { data: entities, error: entErr } = await supabase.from('atlas_canonical_entities').select('canonical_entity_id, tenant_id, canonical_name').limit(10);
    console.log('Entities error:', entErr);
    console.log('Sample entities:', JSON.stringify(entities, null, 2));
  });
});
