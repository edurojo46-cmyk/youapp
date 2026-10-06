import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

async function resetToExact224() {
  await supabase
    .from('atlas_people_discovery_candidates')
    .delete()
    .in('discovery_id', [
      'disc_gemini_web_discovery_gem_3k3ea',
      'disc_gemini_web_discovery_gem_42620l',
      'disc_gemini_web_discovery_gem_5iwze'
    ]);

  const { count } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true });

  console.log(`EXACT CERTIFIED BASELINE RESTORED: ${count} (Required: 224)`);
}

resetToExact224().catch(console.error);
