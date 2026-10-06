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

async function countDistinctAtlasPersonId() {
  console.log('Fetching distinct atlas_person_id from atlas_person_identity_map...');
  const distinctIds = new Set();
  let offset = 0;
  const BATCH = 50000;

  // Let's sample or fetch in batches of 1000
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('atlas_person_identity_map')
      .select('atlas_person_id')
      .range(page * 1000, (page + 1) * 1000 - 1);

    if (error) {
      console.error('Error:', error);
      break;
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      distinctIds.add(row.atlas_person_id);
    }
    page++;
    if (page % 25 === 0) {
      console.log(`Processed ${page * 1000} rows... Distinct IDs so far: ${distinctIds.size}`);
    }
    if (page >= 50) {
      // Let's check the ratio from the first 50,000 rows
      console.log(`Sample of 50,000 rows yielded: ${distinctIds.size} unique IDs (${((distinctIds.size / 50000) * 100).toFixed(2)}%)`);
      break;
    }
  }

  // Let's check total rows
  const { count: totalRows } = await supabase
    .from('atlas_person_identity_map')
    .select('*', { count: 'exact', head: true });

  console.log(`Total rows in atlas_person_identity_map: ${totalRows}`);
}

countDistinctAtlasPersonId().catch(console.error);
