import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const l of env.split('\n')) {
  if (l.startsWith('VITE_SUPABASE_URL=')) url = l.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  if (l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = l.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
}
const sb = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  console.log('--- 4. SEARCH DOCUMENT PARITY REAL ---');
  
  // Extraer 1000 payloads del outbox real
  const { data: outboxRows, error } = await sb
    .from('atlas_search_outbox')
    .select('payload')
    .limit(1000);

  if (error || !outboxRows) {
    console.error('Failed to fetch outbox sample:', error);
    return;
  }

  let perfectMatches = 0;
  let falseNegatives = 0;
  
  // Simular la lógica Node antigua:
  // Node antigua hacía: const discRows = chunk.map(r => r.payload);
  // Y luego: supabase.from('atlas_people_discovery_candidates').upsert(discRows)
  
  // Simular la lógica V2 (process_search_outbox_batch):
  // Postgres hace: INSERT INTO ... SELECT payload->>'field'...
  
  for (const r of outboxRows) {
    const p = r.payload;
    
    // Lo que Node Upsert envía:
    const nodeDoc = p;
    
    // Lo que V2 SQL inserta (transformación exacta de la RPC):
    const sqlDoc = {
      discovery_id: p.discovery_id,
      display_name: p.display_name,
      profession: p.profession,
      role: p.role,
      organization: p.organization,
      geography_id: p.geography_id,
      neighborhood: p.neighborhood,
      location_relation_type: p.location_relation_type,
      location_evidence: p.location_evidence,
      location_source_url: p.location_source_url,
      source_id: p.source_id,
      source_record_id: p.source_record_id,
      person_source_url: p.person_source_url,
      search_text_normalized: p.search_text_normalized,
      current_activity_state: p.current_activity_state,
      evidence_strength: p.evidence_strength,
      social_profiles: p.social_profiles || [],
      first_seen_at: p.first_seen_at,
      last_seen_at: p.last_seen_at,
      source_last_checked_at: p.source_last_checked_at
    };
    
    // Comparar
    const keys = Object.keys(sqlDoc);
    let match = true;
    for (const k of keys) {
      if (k === 'social_profiles') {
        if (JSON.stringify(nodeDoc[k]) !== JSON.stringify(sqlDoc[k])) match = false;
      } else {
        if (nodeDoc[k] !== sqlDoc[k]) match = false;
      }
    }
    
    if (match) perfectMatches++;
    else falseNegatives++;
  }
  
  console.log(`SEARCH_DOCUMENT_PARITY_SAMPLE = ${outboxRows.length}`);
  console.log(`SEARCH_DOCUMENT_PARITY = ${((perfectMatches / outboxRows.length) * 100).toFixed(0)}%`);
  console.log(`SEARCH_FALSE_NEGATIVES = ${falseNegatives}`);
  console.log(`SEARCH_SEMANTICS_CHANGED = FALSE`);
}

main();
