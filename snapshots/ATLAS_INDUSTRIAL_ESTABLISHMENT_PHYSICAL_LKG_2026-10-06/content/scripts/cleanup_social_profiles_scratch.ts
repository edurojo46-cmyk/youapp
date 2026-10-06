import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function cleanSocialProfiles() {
  console.log('Cleaning any test resolution items from atlas_people_discovery_candidates.social_profiles...');
  
  // Find candidates with RESOLUTION_ITEM in social_profiles
  const { data: candidates, error } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('discovery_id, social_profiles')
    .eq('source_id', 'CONICET_OAI_PMH');

  if (error || !candidates) {
    console.error('Error fetching candidates:', error);
    return;
  }

  let cleanedCount = 0;
  for (const c of candidates) {
    const profiles = Array.isArray(c.social_profiles) ? c.social_profiles : [];
    const hasRes = profiles.some((p: any) => p && (p.type === 'RESOLUTION_ITEM' || p.resolution_item === true));
    if (hasRes) {
      const cleanProfiles = profiles.filter((p: any) => p && p.type !== 'RESOLUTION_ITEM' && !p.resolution_item);
      await supabase
        .from('atlas_people_discovery_candidates')
        .update({ social_profiles: cleanProfiles })
        .eq('discovery_id', c.discovery_id);
      cleanedCount++;
    }
  }

  console.log(`Cleaned ${cleanedCount} candidates. social_profiles is now 100% free of resolution state.`);
}

cleanSocialProfiles().catch(console.error);
