import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function inspectConicetSample() {
  console.log('--- Inspecting CONICET Sample from DB ---');
  const { data: sample, error } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*')
    .eq('source_id', 'CONICET_OAI_PMH')
    .limit(10);

  if (error) {
    console.error('Error fetching sample:', error);
    return;
  }

  console.log(`Fetched ${sample?.length} rows.`);
  for (const row of sample || []) {
    console.log({
      discovery_id: row.discovery_id,
      display_name: row.display_name,
      occupation: row.occupation,
      organization: row.organization,
      neighborhood: row.neighborhood,
      location_relation_type: row.location_relation_type,
      location_evidence: row.location_evidence?.slice(0, 120),
      source_record_id: row.source_record_id,
      person_source_url: row.person_source_url
    });
  }
}

inspectConicetSample().catch(console.error);
