import 'dotenv/config';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/["']/g, '');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = line.split('=')[1].trim().replace(/["']/g, '');
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function backfillInBatches() {
  console.log('Starting batched backfill of search_text_normalized...');
  const BATCH_SIZE = 5000;
  let updatedTotal = 0;

  while (true) {
    // Fetch a batch of candidates where search_text_normalized is null
    const { data, error } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('discovery_id, display_name, role, organization, profession')
      .is('search_text_normalized', null)
      .limit(BATCH_SIZE);

    if (error) {
      console.error('Error fetching batch:', error);
      break;
    }

    if (!data || data.length === 0) {
      console.log('No more rows with search_text_normalized IS NULL. Backfill complete!');
      break;
    }

    // Because we have the trigger trg_atlas_people_search_normalized:
    // Simply updating the row (or updating search_text_normalized directly) triggers the function!
    // Or we can compute the value client-side and upsert.
    const updates = data.map(r => {
      const norm = [r.display_name, r.role, r.organization, r.profession]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
      return {
        discovery_id: r.discovery_id,
        search_text_normalized: norm
      };
    });

    // Upsert the chunk in sub-chunks of 500
    for (let i = 0; i < updates.length; i += 500) {
      const chunk = updates.slice(i, i + 500);
      const { error: updErr } = await supabase
        .from('atlas_people_discovery_candidates')
        .upsert(chunk, { onConflict: 'discovery_id' });
      if (updErr) {
        console.error('Upsert chunk error:', updErr);
        throw updErr;
      }
    }

    updatedTotal += data.length;
    console.log(`Backfilled ${updatedTotal} rows...`);
  }

  console.log(`All done. Total rows backfilled: ${updatedTotal}`);
}

backfillInBatches().catch(console.error);
