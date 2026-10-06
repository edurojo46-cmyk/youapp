import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

async function check() {
  const { count, error } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true });
  console.log('CURRENT DISCOVERY INDEX COUNT IN DB:', count);
}
check();
