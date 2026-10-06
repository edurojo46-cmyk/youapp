import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkConicetDetails() {
  const { data: rows } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('discovery_id, display_name, source_id, source_record_id, person_source_url, social_profiles, website')
    .eq('source_id', 'CONICET_OAI_PMH');

  let withOrcid = 0;
  let withSocial = 0;
  for (const r of rows || []) {
    if (r.website?.includes('orcid') || r.person_source_url?.includes('orcid')) withOrcid++;
    if (r.social_profiles && r.social_profiles.length > 0) withSocial++;
  }

  console.log('Total CONICET:', rows?.length);
  console.log('With ORCID:', withOrcid);
  console.log('With Social:', withSocial);
}

checkConicetDetails();
