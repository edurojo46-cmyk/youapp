import 'dotenv/config';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env', 'utf8');
let url = '', key = '', dbUrl = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/["']/g, '');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = line.split('=')[1].trim().replace(/["']/g, '');
  if (line.startsWith('DATABASE_URL=')) dbUrl = line.split('=')[1].trim().replace(/["']/g, '');
}
if (!key) {
  for (const line of envContent.split('\n')) {
    if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim().replace(/["']/g, '');
  }
}

console.log('VITE_SUPABASE_URL:', url ? 'FOUND' : 'MISSING');
console.log('SERVICE_ROLE_KEY:', key ? 'FOUND' : 'MISSING');
console.log('DATABASE_URL:', dbUrl ? 'FOUND' : 'MISSING');

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function checkTables() {
  const tables = [
    'atlas_person_identity_map',
    'atlas_canonical_entities',
    'atlas_people_resolution_ledger',
    'atlas_people_live_metrics',
    'atlas_people_discovery_candidates',
    'atlas_person_observations',
    'argentina_people_unified'
  ];

  for (const t of tables) {
    const { data, count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`Table [${t}]: ERROR -> ${error.message}`);
    } else {
      console.log(`Table [${t}]: EXISTS, COUNT(*) = ${count}`);
    }
  }
}

checkTables().catch(console.error);
