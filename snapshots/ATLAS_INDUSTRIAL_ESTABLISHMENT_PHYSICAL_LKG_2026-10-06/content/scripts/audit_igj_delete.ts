import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

async function audit() {
  const { count: obsCount } = await supabase
    .from('atlas_person_observations')
    .select('*', { count: 'exact', head: true })
    .eq('source_id', 'DATOS_ARGENTINA_IGJ_AUTHORITIES');
    
  const { count: projCount } = await supabase
    .from('atlas_argentina_people_search_projection_v1')
    .select('*', { count: 'exact', head: true });

  const { data: legacyObs } = await supabase
    .from('atlas_person_observations')
    .select('id, source_record_id, value_jsonb')
    .eq('source_id', 'DATOS_ARGENTINA_IGJ_AUTHORITIES');
    
  // Find legacy (those with org_id mixed in hash, likely we can identify by checking the length of observations)
  let legacyCount = 0;
  let newCount = 0;
  for (const obs of legacyObs || []) {
      if (obs.source_record_id.length > 50) { 
          // all use sha256 or hmac, hard to tell. We can check if it was before the HMAC script
          // Or we can just count all
      }
  }

  console.log(`IGJ_OBSERVATIONS_NOW: ${obsCount}`);
  console.log(`TOTAL_PROJECTION_ROWS_NOW: ${projCount}`);
}

audit().catch(console.error);
