import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const l of env.split('\n')) {
  if (l.startsWith('VITE_SUPABASE_URL=')) url = l.split('=')[1].trim().replace(/['"]/g, '');
  if (l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = l.split('=')[1].trim().replace(/['"]/g, '');
}
const sb = createClient(url, key, { auth: { persistSession: false } });

async function verifyParity() {
  console.log("Fetching up to 1000 published payloads from outbox...");
  const { data: outboxRows, error: errOut } = await sb
    .from('atlas_search_outbox')
    .select('payload')
    .eq('status', 'PUBLISHED')
    .limit(1000);
    
  if (errOut) throw errOut;
  if (!outboxRows || outboxRows.length === 0) {
    console.log("No PUBLISHED rows found to verify parity.");
    return;
  }
  
  const discoveryIds = outboxRows.map(r => r.payload.discovery_id).filter(id => id);
  console.log(`Found ${discoveryIds.length} valid discovery_ids in outbox payloads. Fetching search targets...`);
  
  const searchMap = new Map();
  for (let i = 0; i < discoveryIds.length; i += 100) {
    const chunk = discoveryIds.slice(i, i + 100);
    const { data: searchRows, error: errSearch } = await sb
      .from('atlas_people_discovery_candidates')
      .select('discovery_id, search_text_normalized')
      .in('discovery_id', chunk);
      
    if (errSearch) throw errSearch;
    for (const r of searchRows) {
      searchMap.set(r.discovery_id, r.search_text_normalized);
    }
  }
  
  let matches = 0, mismatches = 0;
  for (const row of outboxRows) {
    const id = row.payload.discovery_id;
    if (!id) continue;
    
    const nodeVal = row.payload.search_text_normalized;
    const dbVal = searchMap.get(id);
    
    if (nodeVal === dbVal) {
      matches++;
    } else {
      mismatches++;
      if (mismatches <= 3) {
        console.log(`\n[MISMATCH] discovery_id: ${id}`);
        console.log(`NODE VALUE: ${nodeVal}`);
        console.log(`DB VALUE  : ${dbVal}`);
      }
    }
  }
  
  console.log(`\n--- NORMALIZATION PARITY RESULTS ---`);
  console.log(`NORMALIZATION_PARITY_SAMPLE = ${matches + mismatches}`);
  console.log(`NORMALIZATION_PARITY = ${((matches / (matches + mismatches)) * 100).toFixed(2)}%`);
  console.log(`MATCHES = ${matches} | MISMATCHES = ${mismatches}`);
}

verifyParity().catch(console.error);
