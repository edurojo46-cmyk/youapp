import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testFilters() {
  const start = Date.now();
  
  // 1. Canonical count
  const { count: canCount } = await supabase
    .from('atlas_argentina_people_search_projection_v1')
    .select('*', { count: 'exact', head: true });
  console.log('Canonical in DB:', canCount);

  // 2. Recent count
  const { count: recCount } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true })
    .eq('source_id', 'OPENALEX_CABA')
    .eq('location_relation_type', 'CABA_INSTITUTION_ASSOCIATED')
    .eq('current_activity_state', 'ACTIVE');
  console.log('Recent in DB:', recCount);

  // 3. Historical count
  const { count: histCount } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true })
    .eq('current_activity_state', 'HISTORICAL');
  console.log('Historical in DB:', histCount);

  console.log('Total check time:', Date.now() - start, 'ms');
}

testFilters().catch(console.error);
