import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/['"]/g, '');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = line.split('=')[1].trim().replace(/['"]/g, '');
}

const supabase = createClient(url, key);

async function check() {
  const { count: mapCount, error: mapErr } = await supabase
    .from('atlas_person_identity_map')
    .select('*', { count: 'exact', head: true });

  const { count: canCount, error: canErr } = await supabase
    .from('atlas_argentina_people_search_projection_v1')
    .select('*', { count: 'exact', head: true });

  const { data: metrics, error: metErr } = await supabase
    .from('atlas_people_live_metrics')
    .select('*')
    .eq('id', 'current')
    .single();

  console.log('atlas_person_identity_map:', mapCount, mapErr);
  console.log('atlas_argentina_people_search_projection_v1:', canCount, canErr);
  console.log('atlas_people_live_metrics unique_people:', metrics?.unique_people);
}

check();
