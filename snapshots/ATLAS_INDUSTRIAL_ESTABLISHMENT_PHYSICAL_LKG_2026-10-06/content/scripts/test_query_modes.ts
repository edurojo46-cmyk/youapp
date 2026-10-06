import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testQueryModes() {
  console.log('Testing query modes against Supabase PostgreSQL:');

  // 1. Test Canonical search
  const { data: can, count: canCount } = await supabase
    .from('atlas_argentina_people_search_projection_v1')
    .select('subject_id, display_name, organization, role, source_id', { count: 'exact' })
    .ilike('display_name', '%Llanos%')
    .range(0, 4);
  console.log('Canonical search Llanos:', canCount, can);

  // 2. Test Recent search
  const { data: rec, count: recCount } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('discovery_id, display_name, organization, role, source_id, location_relation_type', { count: 'exact' })
    .eq('source_id', 'OPENALEX_CABA')
    .eq('location_relation_type', 'CABA_INSTITUTION_ASSOCIATED')
    .eq('current_activity_state', 'ACTIVE')
    .range(0, 4);
  console.log('Recent search count:', recCount, 'first:', rec?.[0]?.display_name);

  // 3. Test Current search
  const { data: curr, count: currCount } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('discovery_id, display_name, organization, role, source_id, location_relation_type', { count: 'exact' })
    .eq('source_id', 'OPENALEX_CABA')
    .eq('location_relation_type', 'WORKS_IN')
    .eq('current_activity_state', 'ACTIVE')
    .range(0, 4);
  console.log('Current OpenAlex count:', currCount, 'first:', curr?.[0]?.display_name);

  // 4. Test Wikidata Stale search
  const { data: wiki, count: wikiCount } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('discovery_id, display_name, organization, role, source_id, location_relation_type', { count: 'exact' })
    .eq('source_id', 'WIKIDATA_CABA_PERSONS')
    .eq('current_activity_state', 'STALE')
    .range(0, 4);
  console.log('Wikidata Stale count:', wikiCount, 'first:', wiki?.[0]?.display_name);
}

testQueryModes().catch(console.error);
