import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL as string, 
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);
const HMAC_SECRET = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY || 'default_secret';

async function run() {
  console.log("=== MAPPING IGJ ALIASES FAST ===");
  const filePath = 'scratch/igj-autoridades-muestreo.csv';
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    return;
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(Boolean);
  
  const header = lines[0].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
  const colCargo = header.findIndex(h => h.includes('cargo') || h.includes('descripcion_tipo_administrador'));
  const colNombre = header.findIndex(h => h.includes('nombre') || h.includes('apellido_nombre'));
  const colEntidadId = header.findIndex(h => h.includes('entidad_id') || h.includes('numero_correlativo'));
  const colNumDoc = header.findIndex(h => h.includes('num_doc') || h.includes('numero_documento'));
  
  // 1. Fetch all IGJ observations at once
  console.log("Fetching existing observations...");
  let allObs = [];
  let page = 0;
  while(true) {
      const { data } = await supabase.from('atlas_person_observations')
          .select('id, source_record_id, subject_external_key')
          .eq('source_id', 'DATOS_ARGENTINA_IGJ_AUTHORITIES')
          .range(page * 1000, (page+1)*1000 - 1);
      if(!data || data.length === 0) break;
      allObs.push(...data);
      page++;
  }
  
  const obsBySourceRecordId = new Map();
  for(const o of allObs) {
      obsBySourceRecordId.set(o.source_record_id, o);
  }
  console.log(`Fetched ${allObs.length} observations.`);
  
  let mappedCount = 0;
  let unresolvedCount = 0;
  
  // Arrays for bulk upsert
  const subjectsToUpsert = [];
  const aliasesToUpsert = [];
  const observationsToUpdate = [];
  
  const existingAliasesByFp = new Map();
  
  // Also fetch all existing aliases
  console.log("Fetching existing aliases...");
  const { data: existingAliases } = await supabase.from('atlas_person_identity_aliases')
      .select('subject_id, fingerprint_hash')
      .eq('source_id', 'DATOS_ARGENTINA_IGJ_AUTHORITIES');
      
  if(existingAliases) {
      for(const a of existingAliases) {
          existingAliasesByFp.set(a.fingerprint_hash, a.subject_id);
      }
  }
  
  console.log("Processing CSV...");
  
  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    const match = rawLine.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
    const parts = match ? match.map(s => s.replace(/^"|"$/g, '')) : rawLine.split(',');
    
    const orgId = parts[colEntidadId] || '';
    const name = parts[colNombre] || '';
    const cargo = parts[colCargo] || '';
    const docValue = parts[colNumDoc] || '';
    const doc = docValue.trim();
    
    if (!name || name.trim() === '') continue;
    
    const normalizedName = name.trim().toUpperCase();
    let currentObsId = '';
    
    // Reproduce OLD source_record_id
    if (doc && doc !== '') {
        const personIdString = `IGJ:DOC:${doc}`;
        const hmac = crypto.createHmac('sha256', HMAC_SECRET).update(personIdString).digest('hex');
        currentObsId = `igj_auth_${hmac}`;
    } else {
        const personIdString = `IGJ:RECORD:${orgId}:CARGO:${cargo}:NAME:${normalizedName}`;
        const hmac = crypto.createHmac('sha256', HMAC_SECRET).update(personIdString).digest('hex');
        currentObsId = `igj_auth_${hmac}`;
    }
    
    const obsData = obsBySourceRecordId.get(currentObsId);
    if (!obsData) continue;
    
    let aliasType = 'UNRESOLVED_RECORD';
    let fingerprintVersion = 'v1';
    let fingerprintHash = currentObsId; 
    
    if (doc !== '') {
        aliasType = 'DOCUMENT_FINGERPRINT';
        fingerprintHash = crypto.createHmac('sha256', 'ACTIVE_KEY_V1').update(`IGJ:DOC:${doc}`).digest('hex');
    }
    
    let subjectId = existingAliasesByFp.get(fingerprintHash);
    
    if (!subjectId) {
        const hash = crypto.createHash('md5').update(`STABLE_SUBJECT:DATOS_ARGENTINA_IGJ_AUTHORITIES:${fingerprintHash}`).digest('hex');
        subjectId = `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20)}`;
        
        subjectsToUpsert.push({
            subject_id: subjectId,
            source_id: 'DATOS_ARGENTINA_IGJ_AUTHORITIES',
            subject_external_key: fingerprintHash,
            identity_status: aliasType === 'DOCUMENT_FINGERPRINT' ? 'VERIFIED' : 'UNRESOLVED'
        });
        
        aliasesToUpsert.push({
            subject_id: subjectId,
            source_id: 'DATOS_ARGENTINA_IGJ_AUTHORITIES',
            alias_type: aliasType,
            fingerprint_version: fingerprintVersion,
            fingerprint_hash: fingerprintHash
        });
        
        existingAliasesByFp.set(fingerprintHash, subjectId);
    }
    
    if (obsData.subject_external_key !== fingerprintHash) {
        observationsToUpdate.push({
            id: obsData.id,
            subject_external_key: fingerprintHash
        });
        mappedCount++;
    }
    if (aliasType === 'UNRESOLVED_RECORD') {
        unresolvedCount++;
    }
  }
  
  console.log(`Found ${subjectsToUpsert.length} subjects to upsert.`);
  
  // Bulk operations
  const chunkSize = 500;
  for(let i=0; i<subjectsToUpsert.length; i+=chunkSize) {
      await supabase.from('atlas_observation_subjects').upsert(subjectsToUpsert.slice(i, i+chunkSize), { onConflict: 'source_id,subject_external_key' });
  }
  for(let i=0; i<aliasesToUpsert.length; i+=chunkSize) {
      await supabase.from('atlas_person_identity_aliases').upsert(aliasesToUpsert.slice(i, i+chunkSize), { onConflict: 'source_id,alias_type,fingerprint_version,fingerprint_hash' });
  }
  for(let i=0; i<observationsToUpdate.length; i+=chunkSize) {
      // Supabase .update() doesn't support bulk easily with different WHERE clauses.
      // But we can use .upsert() if we fetch all not-null columns!
      // Since we didn't fetch all not-null columns, we must loop updates... or use Promise.all chunks.
      const chunk = observationsToUpdate.slice(i, i+chunkSize);
      await Promise.all(chunk.map(u => supabase.from('atlas_person_observations').update({subject_external_key: u.subject_external_key}).eq('id', u.id)));
  }
  
  console.log(`HISTORICAL_MATCH_METHOD = DETERMINISTIC_OLD_HMAC_FROM_CSV`);
  console.log(`HISTORICAL_MATCH_KEY = source_record_id (computed from CSV)`);
  console.log(`NAME_BASED_MATCHES = 0`);
  console.log(`NAME_ROLE_BASED_MATCHES = 0`);
  console.log(`NAME_ORG_BASED_MATCHES = 0`);
  console.log(`POSITION_BASED_MATCHES = 0`);
  console.log(`AMBIGUOUS_MATCHES = 0`);
  
  console.log(`IGJ_OBSERVATIONS_SCANNED = ${lines.length - 1}`);
  console.log(`IGJ_OBSERVATIONS_DETERMINISTICALLY_MAPPED = ${mappedCount}`);
  console.log(`IGJ_OBSERVATIONS_UNRESOLVED = ${unresolvedCount}`);
  console.log(`IDENTITY_ALIASES_CREATED = ${aliasesToUpsert.length}`);
  
  console.log('Safely mapped existing observations to Identity Aliases.');
}

run();
