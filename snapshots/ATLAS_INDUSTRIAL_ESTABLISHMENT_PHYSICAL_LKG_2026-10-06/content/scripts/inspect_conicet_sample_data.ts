import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function inspectConicet() {
  const { data, count } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('discovery_id, display_name, organization, role, location_relation_type, location_evidence, location_source_url, source_record_id, person_source_url', { count: 'exact' })
    .eq('source_id', 'CONICET_OAI_PMH')
    .eq('location_relation_type', 'PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE')
    .limit(10);

  console.log(`Total unresolved CONICET candidates: ${count}`);
  console.log('Sample rows:');
  console.log(JSON.stringify(data, null, 2));
}

inspectConicet().catch(console.error);
