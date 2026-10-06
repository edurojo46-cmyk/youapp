import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

async function checkCanonicalCounts() {
  const { count: cSubjects } = await supabase.from('atlas_observation_subjects').select('*', { count: 'exact', head: true });
  const { count: cObs } = await supabase.from('atlas_person_observations').select('*', { count: 'exact', head: true });
  const { count: cProj } = await supabase.from('atlas_argentina_people_search_projection_v1').select('*', { count: 'exact', head: true });
  const { count: cDiscovery } = await supabase.from('atlas_people_discovery_candidates').select('*', { count: 'exact', head: true });

  console.log(`CANONICAL SUBJECTS COUNT: ${cSubjects}`);
  console.log(`CANONICAL OBSERVATIONS COUNT: ${cObs}`);
  console.log(`CANONICAL PROJECTION COUNT: ${cProj}`);
  console.log(`DISCOVERY INDEX CANDIDATES COUNT: ${cDiscovery}`);
}

checkCanonicalCounts().catch(console.error);
