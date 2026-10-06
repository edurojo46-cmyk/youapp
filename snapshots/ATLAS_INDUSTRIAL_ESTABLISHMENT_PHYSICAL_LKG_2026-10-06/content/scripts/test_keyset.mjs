import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

const t0 = performance.now();
const { data, error } = await s.from('atlas_person_identity_map')
  .select('atlas_person_id')
  .order('atlas_person_id')
  .limit(1000);

console.log('Limit 1000 order by atlas_person_id ms:', (performance.now() - t0).toFixed(1), 'Rows:', data?.length, 'Error:', error);
if (data && data.length > 0) {
  console.log('First ID:', data[0].atlas_person_id, 'Last ID:', data[data.length - 1].atlas_person_id);
}
