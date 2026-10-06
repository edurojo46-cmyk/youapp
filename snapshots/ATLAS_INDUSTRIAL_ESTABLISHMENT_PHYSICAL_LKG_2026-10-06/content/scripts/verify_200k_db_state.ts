import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const { count: totalMapRows } = await supabase
    .from('atlas_person_identity_map')
    .select('*', { count: 'exact', head: true });

  const { count: biepCount } = await supabase
    .from('atlas_person_identity_map')
    .select('*', { count: 'exact', head: true })
    .eq('source_id', 'BIEP_APN');

  const { count: nonBiepCount } = await supabase
    .from('atlas_person_identity_map')
    .select('*', { count: 'exact', head: true })
    .neq('source_id', 'BIEP_APN');

  console.log('TOTAL_IDENTITY_MAP_ROWS:', totalMapRows);
  console.log('BIEP_MAP_ROWS:', biepCount);
  console.log('NON_BIEP_MAP_ROWS:', nonBiepCount);

  // Invariant check: DNI leak?
  const { data: sampleRows } = await supabase
    .from('atlas_person_identity_map')
    .select('atlas_person_id, identifier_type, identifier_value')
    .limit(50);
  
  let dniLeaks = 0;
  for (const r of sampleRows || []) {
    if (/^\d{7,8}$/.test(r.identifier_value || '')) dniLeaks++;
  }
  console.log('RAW_DNI_LEAKS (sample 50):', dniLeaks);
}

run().catch(console.error);
