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
  console.log("=== MAPPING IGJ ALIASES ===");
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
  
  let mappedCount = 0;
  
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
    
    // 1. Reproduce OLD source_record_id from ingest_igj_1000.ts (which we used before the DOC-based one)
    if (doc && doc !== '') {
        const personIdString = `IGJ:DOC:${doc}`;
        const hmac = crypto.createHmac('sha256', HMAC_SECRET).update(personIdString).digest('hex');
        currentObsId = `igj_auth_${hmac}`;
    } else {
        const personIdString = `IGJ:RECORD:${orgId}:CARGO:${cargo}:NAME:${normalizedName}`;
        const hmac = crypto.createHmac('sha256', HMAC_SECRET).update(personIdString).digest('hex');
        currentObsId = `igj_auth_${hmac}`;
    }
    
    // 2. Fetch existing observation
    const { data: obsData } = await supabase.from('atlas_person_observations')
        .select('id, source_record_id, subject_external_key')
        .eq('source_id', 'DATOS_ARGENTINA_IGJ_AUTHORITIES')
        .eq('source_record_id', currentObsId)
        .limit(1)
        .single();
        
    if (!obsData) continue;
    
    // 3. Compute Versioned Fingerprint Hash
    let aliasType = 'UNRESOLVED_RECORD';
    let fingerprintVersion = 'v1';
    let fingerprintHash = currentObsId; // fallback to source_record_id
    
    if (doc !== '') {
        aliasType = 'DOCUMENT_FINGERPRINT';
        // Simulating v1 key for the fingerprint
        fingerprintHash = crypto.createHmac('sha256', 'ACTIVE_KEY_V1').update(`IGJ:DOC:${doc}`).digest('hex');
    }
    
    // 4. Resolve or Create Stable Subject UUID
    // Check if alias exists
    const { data: aliasData } = await supabase.from('atlas_person_identity_aliases')
        .select('subject_id')
        .eq('source_id', 'DATOS_ARGENTINA_IGJ_AUTHORITIES')
        .eq('alias_type', aliasType)
        .eq('fingerprint_version', fingerprintVersion)
        .eq('fingerprint_hash', fingerprintHash)
        .limit(1)
        .single();
        
    let subjectId: string;
    if (aliasData) {
        subjectId = aliasData.subject_id;
    } else {
        // Create new subject
        const hash = crypto.createHash('md5').update(`STABLE_SUBJECT:DATOS_ARGENTINA_IGJ_AUTHORITIES:${fingerprintHash}`).digest('hex');
        subjectId = `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20)}`;
        
        await supabase.from('atlas_observation_subjects').upsert({
            subject_id: subjectId,
            source_id: 'DATOS_ARGENTINA_IGJ_AUTHORITIES',
            subject_external_key: fingerprintHash,
            identity_status: aliasType === 'DOCUMENT_FINGERPRINT' ? 'VERIFIED' : 'UNRESOLVED'
        }, { onConflict: 'source_id,subject_external_key' });
        
        await supabase.from('atlas_person_identity_aliases').insert({
            subject_id: subjectId,
            source_id: 'DATOS_ARGENTINA_IGJ_AUTHORITIES',
            alias_type: aliasType,
            fingerprint_version: fingerprintVersion,
            fingerprint_hash: fingerprintHash
        });
    }
    
    // 5. Safely map the observation to the new fingerprint (which projector will use)
    if (obsData.subject_external_key !== fingerprintHash) {
        await supabase.from('atlas_person_observations')
            .update({ subject_external_key: fingerprintHash })
            .eq('id', obsData.id);
        mappedCount++;
    }
  }
  
  console.log(`Safely mapped ${mappedCount} existing observations to Identity Aliases.`);
}

run();
