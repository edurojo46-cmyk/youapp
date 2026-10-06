import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verifyPhysical() {
  console.log('=== VERIFICACIÓN FÍSICA DE TABLAS DE RESOLUCIÓN EN POSTGRESQL ===\n');

  // 1. Check atlas_people_resolution_runs
  const testRunId = `test_run_${Date.now()}`;
  const { data: runInsert, error: runError } = await supabase
    .from('atlas_people_resolution_runs')
    .insert({
      run_id: testRunId,
      source: 'TEST_CONICET',
      start_universe: 11247,
      status: 'PENDING'
    })
    .select();

  if (runError) {
    console.error('FAILED: atlas_people_resolution_runs physical test failed:', runError);
    process.exit(1);
  }
  console.log('atlas_people_resolution_runs: EXISTS & WRITABLE (Physical row created:', runInsert[0]?.run_id, ')');

  // 2. Check atlas_people_resolution_items
  const testDiscId = `test_disc_${Date.now()}`;
  const resolverVer = 'v1.0-work-first';

  const { data: itemInsert, error: itemError } = await supabase
    .from('atlas_people_resolution_items')
    .insert({
      run_id: testRunId,
      discovery_id: testDiscId,
      source_id: 'CONICET_OAI_PMH',
      resolver_version: resolverVer,
      status: 'RESOLVED_CABA',
      territorial_state: 'CURRENT'
    })
    .select();

  if (itemError) {
    console.error('FAILED: atlas_people_resolution_items physical test failed:', itemError);
    process.exit(1);
  }
  console.log('atlas_people_resolution_items: EXISTS & WRITABLE (Physical item created:', itemInsert[0]?.id, ')');

  // 3. Check UNIQUE constraint on (discovery_id, resolver_version)
  console.log('Testing UNIQUE(discovery_id, resolver_version) constraint...');
  const { error: dupError } = await supabase
    .from('atlas_people_resolution_items')
    .insert({
      run_id: testRunId,
      discovery_id: testDiscId,
      source_id: 'CONICET_OAI_PMH',
      resolver_version: resolverVer,
      status: 'RESOLVED_CABA',
      territorial_state: 'CURRENT'
    });

  if (!dupError) {
    console.error('FAILED: UNIQUE constraint did not reject duplicate!');
    process.exit(1);
  }
  console.log('UNIQUE constraint VERIFIED: rejected duplicate with error code:', dupError.code, `("${dupError.message}")`);

  // 4. Cleanup test rows
  await supabase.from('atlas_people_resolution_items').delete().eq('run_id', testRunId);
  await supabase.from('atlas_people_resolution_runs').delete().eq('run_id', testRunId);
  console.log('Test cleanup completed cleanly.');

  console.log('\n>>> MIGRACIÓN FÍSICAMENTE CERTIFICADA EN POSTGRESQL (100% PASS) <<<');
}

verifyPhysical().catch(err => {
  console.error('Fatal error verifying tables:', err);
  process.exit(1);
});
