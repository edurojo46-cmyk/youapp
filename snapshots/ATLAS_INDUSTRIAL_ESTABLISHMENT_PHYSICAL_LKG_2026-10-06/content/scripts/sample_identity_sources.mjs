import 'dotenv/config';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/["']/g, '');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = line.split('=')[1].trim().replace(/["']/g, '');
}
if (!key) {
  for (const line of envContent.split('\n')) {
    if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim().replace(/["']/g, '');
  }
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function checkSources() {
  console.log('Sampling sources in atlas_person_identity_map...');
  const { data, error } = await supabase
    .from('atlas_person_identity_map')
    .select('source_id')
    .limit(1000);
  
  if (error) {
    console.error(error);
    return;
  }
  const sources = new Set(data.map(d => d.source_id));
  console.log('Sample sources in atlas_person_identity_map:', Array.from(sources));
}

checkSources().catch(console.error);
