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

async function checkAllTimestamps() {
  const tables = [
    { name: 'atlas_person_identity_map', tsCol: 'created_at' },
    { name: 'atlas_canonical_entities', tsCol: 'created_at' },
    { name: 'atlas_people', tsCol: 'created_at' },
    { name: 'atlas_person_observations', tsCol: 'observed_at' },
    { name: 'atlas_people_discovery_candidates', tsCol: 'discovered_at' },
    { name: 'atlas_people_live_metrics', tsCol: 'updated_at' }
  ];

  for (const t of tables) {
    const { data: latest, error: latErr } = await supabase
      .from(t.name)
      .select(t.tsCol)
      .order(t.tsCol, { ascending: false })
      .limit(1);

    const { count, error: cErr } = await supabase
      .from(t.name)
      .select('*', { count: 'exact', head: true });

    console.log(`Table [${t.name}]:`);
    console.log(`  Count: ${count}`);
    console.log(`  Latest ${t.tsCol}: ${latest?.[0]?.[t.tsCol]}`);
  }
}

checkAllTimestamps().catch(console.error);
