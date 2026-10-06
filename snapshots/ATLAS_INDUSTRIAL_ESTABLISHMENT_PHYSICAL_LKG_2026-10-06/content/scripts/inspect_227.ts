import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

async function check227() {
  const { data } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('source_id, discovery_id, display_name, created_at')
    .order('created_at', { ascending: false });

  console.log(`Total: ${data?.length}`);
  const bySource: Record<string, number> = {};
  for (const r of (data || [])) {
    bySource[r.source_id] = (bySource[r.source_id] || 0) + 1;
  }
  console.log('By source:', bySource);
}

check227().catch(console.error);
