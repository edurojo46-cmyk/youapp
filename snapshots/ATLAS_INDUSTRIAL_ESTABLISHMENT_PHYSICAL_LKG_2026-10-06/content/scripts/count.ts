import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

async function run() {
  const { count } = await supabase.from('atlas_argentina_people_search_projection_v1').select('*', {count: 'exact', head:true});
  console.log('TOTAL_ATLAS_SUBJECTS_AFTER:', count);
}
run();
