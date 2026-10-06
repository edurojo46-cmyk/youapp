import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkTables() {
  const candidateTables = [
    'atlas_people_discovery_candidates',
    'atlas_person_attribute_evidence',
    'creator_entities',
    'atlas_products',
    'atlas_ingestion_runs',
    'atlas_person_observations',
    'atlas_person_social_profiles'
  ];

  for (const t of candidateTables) {
    const { data, error } = await supabase.from(t).select('*').limit(1);
    if (error) {
      console.log(`Table "${t}": NOT FOUND (${error.message})`);
    } else {
      console.log(`Table "${t}": EXISTS (${data.length} rows sample)`);
    }
  }
}

checkTables();
