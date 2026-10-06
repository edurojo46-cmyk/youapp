import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function cleanAll() {
  let offset = 0;
  let totalCleaned = 0;
  while (true) {
    const { data, error } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('discovery_id, social_profiles')
      .eq('source_id', 'CONICET_OAI_PMH')
      .range(offset, offset + 999);

    if (error || !data || data.length === 0) break;

    for (const r of data) {
      const p = Array.isArray(r.social_profiles) ? r.social_profiles : [];
      if (p.length > 0) {
        await supabase
          .from('atlas_people_discovery_candidates')
          .update({ social_profiles: [] })
          .eq('discovery_id', r.discovery_id);
        totalCleaned++;
      }
    }
    offset += data.length;
    if (data.length < 1000) break;
  }
  console.log(`Finished: total cleaned = ${totalCleaned}`);
}

cleanAll().catch(console.error);
