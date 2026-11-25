import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

async function count() {
  const { count, error } = await supabase.from('atlas_person_observations').select('*', { count: 'exact', head: true });
  if (error) console.error(error);
  console.log('Total snapshots:', count);
}

count();
