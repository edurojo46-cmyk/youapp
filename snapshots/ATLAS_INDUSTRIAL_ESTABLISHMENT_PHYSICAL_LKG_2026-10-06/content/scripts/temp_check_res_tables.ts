import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkTables() {
  const { data: runs, error: errRuns } = await supabase.from('atlas_people_resolution_runs').select('*').limit(1);
  console.log('atlas_people_resolution_runs error:', errRuns?.message || 'EXISTS');
  
  const { data: items, error: errItems } = await supabase.from('atlas_people_resolution_items').select('*').limit(1);
  console.log('atlas_people_resolution_items error:', errItems?.message || 'EXISTS');
}

checkTables();
