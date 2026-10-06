import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

async function checkGemini() {
  const { data } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('discovery_id, display_name, created_at')
    .eq('source_id', 'GEMINI_WEB_DISCOVERY')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('Recent GEMINI_WEB_DISCOVERY:', data);
}

checkGemini().catch(console.error);
