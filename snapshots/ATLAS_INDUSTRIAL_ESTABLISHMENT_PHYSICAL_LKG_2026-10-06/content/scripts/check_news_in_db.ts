import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

async function checkExistingNewsCandidates() {
  const { data: allCandidates } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('discovery_id, display_name, source_id');

  const newsSources = ['NEWS_MEDIA', 'LOCAL_NEWS', 'SPECIALIZED_MEDIA', 'INSTITUTIONAL_NEWS'];
  const newsCandidates = (allCandidates || []).filter(c => newsSources.includes(c.source_id));

  console.log(`CURRENT NEWS CANDIDATES IN DB: ${newsCandidates.length}`);
}

checkExistingNewsCandidates().catch(console.error);
