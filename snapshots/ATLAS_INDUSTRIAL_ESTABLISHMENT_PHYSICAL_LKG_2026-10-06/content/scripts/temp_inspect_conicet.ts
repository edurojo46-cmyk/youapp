import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const { data, error } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*')
    .eq('source_id', 'CONICET_OAI_PMH')
    .limit(2);

  if (error) {
    console.error(error);
    return;
  }
  console.log('Keys of atlas_people_discovery_candidates:');
  console.log(Object.keys(data[0]));
  console.log('Sample row:');
  console.log(JSON.stringify(data[0], null, 2));
}

run();
