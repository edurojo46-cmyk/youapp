import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const envContent = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/["']/g, '');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = line.split('=')[1].trim().replace(/["']/g, '');
}
const sb = createClient(url, key, { auth: { persistSession: false } });

async function run() {
  console.log('Fetching quarantined rows via Supabase client (using btree range condition)...');
  const futureIso = new Date(Date.now() + 365*24*3600*1000).toISOString();
  const { data: rows, error } = await sb
    .from('atlas_search_outbox')
    .select('outbox_id, atlas_person_id, source_id, source_record_id, payload_version, attempt_count, last_error, created_at, quarantined_at')
    .eq('status', 'QUARANTINED')
    .lte('next_retry_at', futureIso);

  if (error) {
    console.error('Error fetching quarantined:', error);
    return;
  }
  console.log(`Fetched ${rows?.length || 0} quarantined rows.`);
  if (!rows || rows.length === 0) return;

  // Insert into dead letter
  const deadLetters = rows.map(r => ({
    outbox_id: r.outbox_id,
    atlas_person_id: r.atlas_person_id,
    source_id: r.source_id,
    source_record_id: r.source_record_id,
    payload_version: r.payload_version || 1,
    attempt_count: r.attempt_count || 0,
    reason: r.last_error || 'QUARANTINED_MISSING_CANONICAL',
    created_at: r.created_at,
    quarantined_at: r.quarantined_at || new Date().toISOString(),
    logical_event_id: `${r.source_id}:${r.source_record_id}:v${r.payload_version || 1}`,
    metadata: { migrated_from: 'atlas_search_outbox_quarantine' }
  }));

  const { error: insErr } = await sb
    .from('atlas_search_delivery_dead_letter')
    .upsert(deadLetters, { onConflict: 'dead_letter_id' });

  if (insErr) {
    console.error('Error inserting into dead letter:', insErr);
  } else {
    console.log(`Successfully persisted ${deadLetters.length} rows to atlas_search_delivery_dead_letter.`);
  }
}

run().catch(console.error);
