import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { count: disc } = await sb.from('atlas_people_discovery_candidates').select('*', { count: 'exact', head: true });
const { data: sample } = await sb.from('atlas_people_discovery_candidates').select('source_id, display_name, evidence_strength').limit(5);
const { count: obs } = await sb.from('atlas_observation_subjects').select('*', { count: 'exact', head: true });
const { count: proj } = await sb.from('atlas_argentina_people_search_projection_v1').select('*', { count: 'exact', head: true });

console.log(JSON.stringify({
  discovery_candidates_count: disc,
  observation_subjects_count: obs,
  search_projection_count: proj,
  sample_candidates: sample
}, null, 2));
