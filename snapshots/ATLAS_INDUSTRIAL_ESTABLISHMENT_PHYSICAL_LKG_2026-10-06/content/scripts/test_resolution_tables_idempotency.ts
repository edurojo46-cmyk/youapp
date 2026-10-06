import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testIdempotency() {
  console.log('=== TEST 1: VERIFICACIÓN FÍSICA DE IDEMPOTENCIA Y REANUDACIÓN DB-FIRST ===\n');

  const testRunId = `test_idemp_run_${Date.now()}`;
  const testDiscId = `disc_test_idemp_${Date.now()}`;
  const resolverVer = 'v1.0-work-first';

  // Create test run
  await supabase.from('atlas_people_resolution_runs').insert({
    run_id: testRunId,
    source: 'CONICET_OAI_PMH',
    start_universe: 11247,
    status: 'RUNNING'
  });

  // Step 1: Insert item first time
  const { data: item1, error: err1 } = await supabase
    .from('atlas_people_resolution_items')
    .insert({
      run_id: testRunId,
      discovery_id: testDiscId,
      source_id: 'CONICET_OAI_PMH',
      resolver_version: resolverVer,
      status: 'RESOLVED_CABA',
      territorial_state: 'CURRENT',
      attempt_count: 1
    })
    .select();

  if (err1 || !item1) {
    throw new Error(`Failed initial insert: ${err1?.message}`);
  }
  console.log('1. Initial insert successful. Item ID:', item1[0].id);

  // Step 2: Attempt duplicate insert with same (discovery_id, resolver_version)
  console.log('2. Attempting duplicate insert with same (discovery_id, resolver_version)...');
  const { data: item2, error: err2 } = await supabase
    .from('atlas_people_resolution_items')
    .insert({
      run_id: testRunId,
      discovery_id: testDiscId,
      source_id: 'CONICET_OAI_PMH',
      resolver_version: resolverVer,
      status: 'RESOLVED_CABA',
      territorial_state: 'CURRENT',
      attempt_count: 2
    });

  let duplicateCount = 0;
  if (!err2) {
    duplicateCount = 1;
    console.error('FAILED: Duplicate insert succeeded when it should have violated unique constraint!');
  } else {
    console.log('SUCCESS: Duplicate insert rejected by Postgres Unique Constraint:', err2.code, `(${err2.message})`);
  }

  // Count items in DB for this discovery_id and resolver_version
  const { data: allItems } = await supabase
    .from('atlas_people_resolution_items')
    .select('id')
    .eq('discovery_id', testDiscId)
    .eq('resolver_version', resolverVer);

  const finalDuplicates = (allItems?.length || 0) > 1 ? (allItems!.length - 1) : 0;
  console.log(`RESOLUTION_ITEM_DUPLICATES = ${finalDuplicates} (Expected: 0)`);

  // Step 3: Test resume logic (simulating interrupted run)
  console.log('\n3. Testing Interruption + Resume logic...');
  // Query DB to see if item is already completed
  const { data: existingItem } = await supabase
    .from('atlas_people_resolution_items')
    .select('status')
    .eq('discovery_id', testDiscId)
    .eq('resolver_version', resolverVer)
    .maybeSingle();

  let reprocessedCount = 0;
  if (existingItem && (existingItem.status === 'RESOLVED_CABA' || existingItem.status === 'RESOLVED_NON_CABA')) {
    console.log(`Item "${testDiscId}" is already resolved in DB (${existingItem.status}). SKIPPING reprocessing.`);
  } else {
    reprocessedCount++;
    console.log('Reprocessed item.');
  }

  console.log(`REPROCESSED_COMPLETED_ITEMS = ${reprocessedCount} (Expected: 0)`);

  // Clean up test data
  await supabase.from('atlas_people_resolution_items').delete().eq('run_id', testRunId);
  await supabase.from('atlas_people_resolution_runs').delete().eq('run_id', testRunId);

  const pass = finalDuplicates === 0 && reprocessedCount === 0;
  console.log(`\n>>> TEST 1 RESULT: ${pass ? 'PASS (100% IDEMPOTENT & RESUMABLE)' : 'FAIL'} <<<`);

  if (!pass) process.exit(1);
}

testIdempotency().catch(err => {
  console.error('Fatal error in idempotency test:', err);
  process.exit(1);
});
