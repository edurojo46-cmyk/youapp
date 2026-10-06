import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/["']/g, '');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = line.split('=')[1].trim().replace(/["']/g, '');
}

const supabase = createClient(url, key);

async function run() {
  const { data: rowsDesc, error } = await supabase
    .from('atlas_person_identity_map')
    .select('id, source_id, atlas_person_id, identifier_type, identifier_value, evidence_id, confidence, observed_at')
    .order('id', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  console.log('Most recent 20 rows in atlas_person_identity_map:');
  const recentSources = {};
  for (const r of rowsDesc) {
    recentSources[r.source_id] = (recentSources[r.source_id] || 0) + 1;
  }
  console.log('Recent sources count:', recentSources);
  console.log('First 3 sample records:', rowsDesc.slice(0, 3));
}

run();
