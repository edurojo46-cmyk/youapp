import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data, count, error } = await supabase
    .from('atlas_people_resolution_items')
    .select('discovery_id, status', { count: 'exact' })
    .eq('resolver_version', 'v1.0-work-first');

  if (error) {
    console.error('Error:', error);
    return;
  }
  console.log('Total V1 items in atlas_people_resolution_items:', count);
}

main();
