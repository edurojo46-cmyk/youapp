import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testResolutionTables() {
  const t1 = await supabase.from('atlas_people_resolution_runs').select('*').limit(1);
  console.log('atlas_people_resolution_runs:', t1.error ? t1.error.message : 'EXISTS');

  const t2 = await supabase.from('atlas_people_resolution_items').select('*').limit(1);
  console.log('atlas_people_resolution_items:', t2.error ? t2.error.message : 'EXISTS');

  const t3 = await supabase.from('atlas_ingestion_runs_v1').select('*').limit(1);
  console.log('atlas_ingestion_runs_v1:', t3.error ? t3.error.message : 'EXISTS');
}

testResolutionTables().catch(console.error);
