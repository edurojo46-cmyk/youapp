import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

async function checkSchema() {
  const { data, error } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('neighborhood, geography_id, source_id')
    .eq('geography_id', 'caba')
    .limit(10);

  if (error) {
    console.error('Error selecting:', error);
    return;
  }

  console.log('Neighborhood sample values:');
  console.log(data);
}

checkSchema().catch(console.error);
