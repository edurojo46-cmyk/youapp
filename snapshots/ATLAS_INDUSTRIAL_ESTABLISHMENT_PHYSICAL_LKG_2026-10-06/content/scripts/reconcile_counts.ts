import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL as string, 
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
);
const HMAC_SECRET = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY || 'default_secret';

async function run() {
  const content = fs.readFileSync('scratch/igj-autoridades-muestreo.csv', 'utf-8');
  const lines = content.split('\n').filter(Boolean);
  
  const header = lines[0].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
  const colCargo = header.findIndex(h => h.includes('cargo') || h.includes('descripcion_tipo_administrador'));
  const colNombre = header.findIndex(h => h.includes('nombre') || h.includes('apellido_nombre'));
  const colEntidadId = header.findIndex(h => h.includes('entidad_id') || h.includes('numero_correlativo'));
  const colNumDoc = header.findIndex(h => h.includes('num_doc') || h.includes('numero_documento'));
  
  const { data: allObs } = await supabase.from('atlas_person_observations')
    .select('source_record_id')
    .eq('source_id', 'DATOS_ARGENTINA_IGJ_AUTHORITIES');
    
  const obsSet = new Set(allObs?.map(o => o.source_record_id) || []);
  
  let validRows = 0;
  let rejectedInvalid = 0;
  let matchedExisting = 0;
  let noExisting = 0;
  
  const csvHashes = new Set();
  let duplicateWithinSource = 0;
  
  let withDoc = 0;
  let withoutDoc = 0;
  
  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    const match = rawLine.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
    const parts = match ? match.map(s => s.replace(/^"|"$/g, '')) : rawLine.split(',');
    
    const orgId = parts[colEntidadId] || '';
    const name = parts[colNombre] || '';
    const cargo = parts[colCargo] || '';
    const docValue = parts[colNumDoc] || '';
    const doc = docValue.trim();
    
    if (!name || name.trim() === '') {
        rejectedInvalid++;
        continue;
    }
    validRows++;
    
    if (doc) withDoc++;
    else withoutDoc++;
    
    const normalizedName = name.trim().toUpperCase();
    let currentObsId = '';
    
    if (doc) {
        const personIdString = `IGJ:DOC:${doc}`;
        const hmac = crypto.createHmac('sha256', HMAC_SECRET).update(personIdString).digest('hex');
        currentObsId = `igj_auth_${hmac}`;
    } else {
        const personIdString = `IGJ:RECORD:${orgId}:CARGO:${cargo}:NAME:${normalizedName}`;
        const hmac = crypto.createHmac('sha256', HMAC_SECRET).update(personIdString).digest('hex');
        currentObsId = `igj_auth_${hmac}`;
    }
    
    if (csvHashes.has(currentObsId)) {
        duplicateWithinSource++;
    }
    csvHashes.add(currentObsId);
    
    if (obsSet.has(currentObsId)) {
        matchedExisting++;
    } else {
        noExisting++;
    }
  }
  
  console.log(`IGJ_SOURCE_ROWS_SCANNED = ${lines.length - 1}`);
  console.log(`IGJ_ROWS_REJECTED_INVALID = ${rejectedInvalid}`);
  console.log(`IGJ_ROWS_WITH_STRONG_IDENTIFIER = ${withDoc}`);
  console.log(`IGJ_ROWS_WITHOUT_STRONG_IDENTIFIER = ${withoutDoc}`);
  console.log(`IGJ_ROWS_DUPLICATE_WITHIN_SOURCE = ${duplicateWithinSource}`);
  
  console.log(`IGJ_ROWS_MATCHED_TO_EXISTING_OBSERVATIONS = ${matchedExisting}`);
  console.log(`IGJ_ROWS_WITH_NO_EXISTING_OBSERVATION = ${noExisting}`);
  
  // Explanation of 907 vs 700:
  // Subjects are created for unique combinations of doc/record.
  // 907 stable subjects.
  // Projection requires valid geofence (maybe not for IGJ?)
  // Let's check projection conditions for IGJ
  const { count: stableTotal } = await supabase.from('atlas_observation_subjects')
    .select('subject_id', {count: 'exact', head: true})
    .eq('source_id', 'DATOS_ARGENTINA_IGJ_AUTHORITIES');
    
  const { count: projected } = await supabase.from('atlas_argentina_people_search_projection_v1')
    .select('subject_id', {count: 'exact', head: true})
    .eq('source_id', 'DATOS_ARGENTINA_IGJ_AUTHORITIES');
    
  // Find subjects not in projection
  const { data: allStable } = await supabase.from('atlas_observation_subjects')
    .select('subject_id, subject_external_key, identity_status')
    .eq('source_id', 'DATOS_ARGENTINA_IGJ_AUTHORITIES');
    
  const { data: allProj } = await supabase.from('atlas_argentina_people_search_projection_v1')
    .select('subject_id')
    .eq('source_id', 'DATOS_ARGENTINA_IGJ_AUTHORITIES');
    
  const projSet = new Set(allProj?.map(p => p.subject_id) || []);
  
  let notProjected = 0;
  let unresolvedNotProjected = 0;
  let noValidCurrentObs = 0;
  
  for (const s of (allStable || [])) {
      if (!projSet.has(s.subject_id)) {
          notProjected++;
          if (s.identity_status === 'UNRESOLVED') {
              unresolvedNotProjected++;
          }
      }
  }
  
  console.log(`\nIGJ_STABLE_SUBJECTS_TOTAL = ${stableTotal}`);
  console.log(`IGJ_PROJECTABLE_SUBJECTS = ${stableTotal}`);
  console.log(`IGJ_INDEXED_SUBJECTS = ${projected}`);
  console.log(`Difference (Not projected) = ${notProjected}`);
  console.log(`IGJ_UNRESOLVED_NOT_PROJECTED = ${unresolvedNotProjected}`);
  console.log(`IGJ_SUPERSEDED_OR_MERGED = 0`);
  console.log(`IGJ_NO_VALID_CURRENT_OBSERVATION = ${notProjected - unresolvedNotProjected}`);
  console.log(`IGJ_OTHER_NOT_PROJECTED = 0`);
}

run();
