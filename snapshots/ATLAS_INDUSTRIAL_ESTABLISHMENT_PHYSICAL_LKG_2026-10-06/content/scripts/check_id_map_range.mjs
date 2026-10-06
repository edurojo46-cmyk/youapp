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

async function checkDates() {
  const { data: earliest } = await supabase
    .from('atlas_person_identity_map')
    .select('created_at')
    .order('created_at', { ascending: true })
    .limit(1);

  const { data: latest } = await supabase
    .from('atlas_person_identity_map')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1);

  console.log('Earliest record in atlas_person_identity_map:', earliest?.[0]?.created_at);
  console.log('Latest record in atlas_person_identity_map:', latest?.[0]?.created_at);
}

checkDates().catch(console.error);
