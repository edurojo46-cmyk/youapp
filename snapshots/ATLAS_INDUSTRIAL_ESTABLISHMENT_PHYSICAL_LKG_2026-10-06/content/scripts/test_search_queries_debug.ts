import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testQueries() {
  console.log('Testing SQL queries for states...');

  // 1. RECENT count
  const { count: recentCount, error: errRecent } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true })
    .eq('source_id', 'OPENALEX_CABA')
    .eq('location_relation_type', 'CABA_INSTITUTION_ASSOCIATED')
    .eq('current_activity_state', 'ACTIVE');

  console.log('RECENT SQL count:', recentCount, 'Error:', errRecent);

  // 2. HISTORICAL count
  const { count: histCount, error: errHist } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true })
    .eq('current_activity_state', 'HISTORICAL');

  console.log('HISTORICAL SQL count:', histCount, 'Error:', errHist);

  // 3. CANONICAL count
  const { count: canCount, error: errCan } = await supabase
    .from('atlas_argentina_people_search_projection_v1')
    .select('*', { count: 'exact', head: true });

  console.log('CANONICAL SQL count:', canCount, 'Error:', errCan);

  // 4. CURRENT count
  // In classifyCandidateRow:
  // - state === 'ACTIVE'
  // - NOT 'PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE'
  // - NOT 'radicada fuera de CABA'
  // - NOT OpenAlex RECENT (rel === 'CABA_INSTITUTION_ASSOCIATED')
  // - NOT WIKIDATA (Wikidata state ACTIVE? Let's check what states Wikidata has)
  const { count: currSqlCount, error: errCurr } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true })
    .eq('current_activity_state', 'ACTIVE')
    .neq('location_relation_type', 'PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE')
    .neq('location_relation_type', 'CABA_INSTITUTION_ASSOCIATED')
    .not('location_evidence', 'ilike', '%radicada fuera de CABA%');

  console.log('CURRENT SQL (excl recent):', currSqlCount, 'Error:', errCurr);

  // 5. Check what Wikidata rows have
  const { count: wdActive } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true })
    .eq('source_id', 'WIKIDATA_CABA_PERSONS')
    .eq('current_activity_state', 'ACTIVE');
  console.log('WIKIDATA ACTIVE count:', wdActive);

  // 6. Check ALL_CABA
  const { count: allCabaSql } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true })
    .neq('current_activity_state', 'HISTORICAL')
    .neq('location_relation_type', 'PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE')
    .not('location_evidence', 'ilike', '%radicada fuera de CABA%');
  console.log('ALL_CABA living rows count:', allCabaSql);

  // 7. Check total discovery rows
  const { count: totalDisc } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true });
  console.log('TOTAL DISCOVERY ROWS:', totalDisc);
}

testQueries().catch(console.error);
