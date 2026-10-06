import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const HMAC_SECRET = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY || 'default';

async function run() {
  console.log('Fetching all IGJ observations...');
  let allObs = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('atlas_person_observations')
      .select('id, source_record_id, value_jsonb, source_content_hash')
      .eq('source_id', 'DATOS_ARGENTINA_IGJ_AUTHORITIES')
      .range(page * 1000, (page + 1) * 1000 - 1);
      
    if (error) {
       console.error('Error fetching:', error);
       return;
    }
    if (!data || data.length === 0) break;
    allObs = allObs.concat(data);
    page++;
  }
  
  console.log(`Loaded ${allObs.length} observations.`);
  
  let duplicatesIdentified = 0;
  let duplicatesReconciled = 0;
  
  const updates = [];

  for (const obs of allObs) {
     const payload = obs.value_jsonb;
     const doc = payload.raw_payload?.numero_documento || '';
     const name = payload.name?.full || '';
     const orgId = payload.raw_payload?.entity_id || '';
     const cargo = payload.raw_payload?.cargo || '';
     
     const normalizedName = name.trim().toUpperCase();
     let personIdString = '';
     if (doc && doc.trim() !== '') {
         personIdString = `IGJ:DOC:${doc.trim()}`;
     } else {
         personIdString = `IGJ:ENTITY:${orgId}:NAME:${normalizedName}:ROLE:${cargo}`;
     }
     
     const hmacKey = crypto.createHmac('sha256', HMAC_SECRET).update(personIdString).digest('hex');
     const expectedSourceRecordId = `igj_auth_${hmacKey}`;
     
     if (obs.source_record_id !== expectedSourceRecordId) {
         duplicatesIdentified++;
         updates.push(async () => {
             const { error: updateError } = await supabase
                .from('atlas_person_observations')
                .update({ source_record_id: expectedSourceRecordId })
                .eq('id', obs.id);
                
             if (!updateError) {
                 duplicatesReconciled++;
             } else if (updateError.code === '23505') {
                 // Unique constraint violation -> safely delete legacy duplicate
                 await supabase.from('atlas_person_observations').delete().eq('id', obs.id);
                 duplicatesReconciled++;
             }
         });
     }
  }
  
  console.log(`LEGACY_IGJ_DUPLICATES_IDENTIFIED = ${duplicatesIdentified}`);
  
  // Run with concurrency of 20
  const limit = 20;
  for (let i = 0; i < updates.length; i += limit) {
      await Promise.all(updates.slice(i, i + limit).map(fn => fn()));
  }
  
  console.log(`LEGACY_IGJ_DUPLICATES_RECONCILED = ${duplicatesReconciled}`);
  console.log(`ORPHAN_DUPLICATE_SUBJECTS_REMAINING = ${duplicatesIdentified - duplicatesReconciled}`);
}

run().catch(console.error);
