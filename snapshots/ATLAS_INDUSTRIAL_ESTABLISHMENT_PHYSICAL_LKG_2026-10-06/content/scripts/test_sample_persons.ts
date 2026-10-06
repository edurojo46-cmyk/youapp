import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testSampleSearches() {
  console.log('Testing sample people in discovery and canonical...');

  // 1. OpenAlex Current
  const { data: currSample } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('discovery_id, display_name, source_id, location_relation_type, current_activity_state, organization')
    .eq('source_id', 'OPENALEX_CABA')
    .eq('location_relation_type', 'WORKS_IN')
    .eq('current_activity_state', 'ACTIVE')
    .limit(3);
  console.log('Sample OpenAlex Current:', currSample);

  // 2. OpenAlex Recent
  const { data: recentSample } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('discovery_id, display_name, source_id, location_relation_type, current_activity_state, organization')
    .eq('source_id', 'OPENALEX_CABA')
    .eq('location_relation_type', 'CABA_INSTITUTION_ASSOCIATED')
    .eq('current_activity_state', 'ACTIVE')
    .limit(3);
  console.log('Sample OpenAlex Recent:', recentSample);

  // 3. Wikidata Associated
  const { data: wikiSample } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('discovery_id, display_name, source_id, location_relation_type, current_activity_state, organization')
    .eq('source_id', 'WIKIDATA_CABA_PERSONS')
    .eq('current_activity_state', 'STALE')
    .limit(3);
  console.log('Sample Wikidata Associated:', wikiSample);

  // 4. Canonical baseline
  const { data: canSample } = await supabase
    .from('atlas_argentina_people_search_projection_v1')
    .select('subject_id, display_name, source_id, organization')
    .limit(3);
  console.log('Sample Canonical:', canSample);
}

testSampleSearches().catch(console.error);
