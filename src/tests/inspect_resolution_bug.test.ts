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

describe('Inspect the 3 false merges', () => {
  it('finds the 3 observations where raw_name != canonical_name', async () => {
    const { data: observations } = await supabase
      .from('atlas_entity_source_observations')
      .select('observation_id, source_name, source_record_id, raw_name, entity_type, canonical_entity_id, resolution_decision');

    for (const obs of observations || []) {
      const { data: entity } = await supabase
        .from('atlas_canonical_entities')
        .select('canonical_name, entity_type')
        .eq('canonical_entity_id', obs.canonical_entity_id)
        .maybeSingle();

      const raw = obs.raw_name.trim().toLowerCase();
      const can = (entity?.canonical_name || '').trim().toLowerCase();

      if (raw !== can) {
        console.log(`MISMATCH: ObsID=${obs.observation_id} | Raw="${obs.raw_name}" | Can="${entity?.canonical_name}" | Decision=${obs.resolution_decision} | EntityID=${obs.canonical_entity_id}`);
      }
    }
  });
});
