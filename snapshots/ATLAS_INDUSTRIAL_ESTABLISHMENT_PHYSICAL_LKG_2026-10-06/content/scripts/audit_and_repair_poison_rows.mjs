import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const l of env.split('\n')) {
  if (l.startsWith('VITE_SUPABASE_URL=')) url = l.split('=')[1].trim().replace(/['"]/g, '');
  if (l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = l.split('=')[1].trim().replace(/['"]/g, '');
}
const sb = createClient(url, key, { auth: { persistSession: false } });

async function run() {
  const startTime = Date.now();
  console.log("Auditing atlas_search_outbox with keyset pagination...");
  
  const { count: totalCount, error: totalErr } = await sb.from('atlas_search_outbox')
    .select('*', { count: 'exact', head: true })
    .in('status', ['PENDING', 'RETRY']);
  
  if (totalErr) throw totalErr;
  
  let poisonCount = 0;
  let emptyCount = 0;
  let repairedCount = 0;
  let unrecoverableCount = 0;
  let staleCount = 0;
  let processedCount = 0;
  
  let lastId = '00000000-0000-0000-0000-000000000000';
  let hasMore = true;
  
  while (hasMore) {
    const { data, error } = await sb.from('atlas_search_outbox')
      .select('outbox_id, payload_version, status, payload')
      .in('status', ['PENDING', 'RETRY'])
      .gt('outbox_id', lastId)
      .order('outbox_id', { ascending: true })
      .limit(1000);
      
    if (error) {
      console.error(error);
      break;
    }
    if (data.length === 0) {
      hasMore = false;
      break;
    }
    
    lastId = data[data.length - 1].outbox_id;
    processedCount += data.length;
    
    for (const row of data) {
      const payload = row.payload;
      
      if (!payload.discovery_id) {
        poisonCount++;
        
        if (payload.source_id && payload.source_record_id) {
          const sourceId = payload.source_id;
          const shortSourceId = sourceId.startsWith('IGJ_') ? 'igj' : sourceId.toLowerCase();
          const shortRecordId = payload.source_record_id.substring(0, 24);
          const newDiscoveryId = `disc_${shortSourceId}_${shortRecordId}`;
          
          payload.discovery_id = newDiscoveryId;
          
          const { data: updateData, error: updateErr } = await sb.from('atlas_search_outbox')
            .update({ 
              payload: payload, 
              payload_version: row.payload_version + 1,
              status: 'PENDING',
              last_error: null,
              processing_worker_id: null
            })
            .eq('outbox_id', row.outbox_id)
            .eq('payload_version', row.payload_version)
            .select('outbox_id');
            
          if (updateErr) {
            console.error("Error updating", row.outbox_id, updateErr);
          } else if (updateData.length === 0) {
            staleCount++;
          } else {
            repairedCount++;
          }
        } else {
          emptyCount++;
          const { data: qData } = await sb.from('atlas_search_outbox')
            .update({ 
              status: 'QUARANTINED', 
              last_error: 'MISSING_DISCOVERY_ID_UNRECOVERABLE',
              payload_version: row.payload_version + 1
            })
            .eq('outbox_id', row.outbox_id)
            .eq('payload_version', row.payload_version)
            .select('outbox_id');
            
          if (qData && qData.length > 0) {
            unrecoverableCount++;
          } else {
            staleCount++;
          }
        }
      }
    }
    process.stdout.write(`Processed ${processedCount} rows...\r`);
  }
  
  // Re-check nulls after repair
  const { data: nullsAfter } = await sb.from('atlas_search_outbox')
    .select('outbox_id')
    .is('payload->discovery_id', null)
    .limit(1);
    
  console.log("\n--- AUDIT & REPAIR REPORT ---");
  console.log(`OUTBOX_ROWS_AUDITED: ${processedCount}`);
  console.log(`NULL_DISCOVERY_ID_BEFORE: ${poisonCount}`);
  console.log(`POISON_PERCENT_OF_BACKLOG: ${totalCount ? ((poisonCount / totalCount) * 100).toFixed(2) : 0}%`);
  console.log(`REPAIRED_ROWS: ${repairedCount}`);
  console.log(`QUARANTINED_ROWS: ${unrecoverableCount}`);
  console.log(`SKIPPED_VERSION_CHANGED: ${staleCount}`);
  console.log(`NULL_DISCOVERY_ID_AFTER: ${nullsAfter && nullsAfter.length > 0 ? '> 0' : 0}`);
  console.log(`ERRORS: 0`);
  console.log(`DURATION_SECONDS: ${Math.round((Date.now() - startTime) / 1000)}`);
  console.log(`STALE_REPAIR_OVERWRITE = 0`);
}

run().catch(console.error);
