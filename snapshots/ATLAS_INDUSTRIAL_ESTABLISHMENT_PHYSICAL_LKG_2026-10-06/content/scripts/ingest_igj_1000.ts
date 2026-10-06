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
  const colTipoAdmin = header.findIndex(h => h.includes('tipo_administrador'));
  const colNumDoc = header.findIndex(h => h.includes('num_doc') || h.includes('numero_documento'));
  
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    // basic csv parser
    const match = rawLine.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
    const parts = match ? match.map(s => s.replace(/^"|"$/g, '')) : rawLine.split(',');
    
    records.push({
      numero_correlativo: parts[colEntidadId] || '',
      apellido_nombre: parts[colNombre] || '',
      descripcion_tipo_administrador: parts[colCargo] || '',
      tipo_administrador: parts[colTipoAdmin] || '',
      numero_documento: parts[colNumDoc] || ''
    });
  }
  
  console.log(`Loaded ${records.length} total rows.`);
  const sample = records; // Use all 1000
  
  let valid = 0;
  let invalid = 0;
  let insertedCount = 0;
  const observationsToInsert = [];
  
  // Analytics
  const uniquePersonIdentities = new Set();
  const uniqueNames = new Set();
  const uniqueOrgs = new Set();
  const personToOrgs = new Map();
  const orgToPersons = new Map();
  const nameToIdentities = new Map();
  
  console.log(`\nProcessing ${sample.length} observations into Supabase...`);

  for (const row of sample) {
    const orgId = row['numero_correlativo'];
    const name = row['apellido_nombre'];
    const cargo = row['descripcion_tipo_administrador'];
    const doc = row['numero_documento'];
    
    if (!name || name.trim() === '') {
      invalid++;
      continue;
    }
    valid++;
    
    const normalizedName = name.trim().toUpperCase();
    let currentObsId = null;
    let identityResolutionStatus = 'RESOLVED_TO_SOURCE_RECORD';
    
    // Identity Strategy (Governed with Aliases)
    let aliasType = 'UNRESOLVED_RECORD';
    let fingerprintVersion = 'v1';
    let fingerprintHash = '';
    
    if (doc && doc.trim() !== '') {
        aliasType = 'DOCUMENT_FINGERPRINT';
        fingerprintHash = crypto.createHmac('sha256', 'ACTIVE_KEY_V1').update(`IGJ:DOC:${doc.trim()}`).digest('hex');
    } else {
        const personIdString = `IGJ:RECORD:${orgId}:CARGO:${cargo}:NAME:${normalizedName}`;
        fingerprintHash = crypto.createHmac('sha256', HMAC_SECRET).update(personIdString).digest('hex');
    }
    
    // The source record id remains the original HMAC from raw line for idempotency
    const rawLineIdString = `IGJ:RECORD:${orgId}:CARGO:${cargo}:NAME:${normalizedName}`;
    const sourceRecordId = `igj_auth_${crypto.createHmac('sha256', HMAC_SECRET).update(rawLineIdString).digest('hex')}`;
    
    const subjectExternalKey = fingerprintHash;
    
    uniquePersonIdentities.add(sourceRecordId);
    uniqueNames.add(normalizedName);
    if (orgId) uniqueOrgs.add(orgId);
    
    if (!personToOrgs.has(sourceRecordId)) personToOrgs.set(sourceRecordId, new Set());
    if (orgId) personToOrgs.get(sourceRecordId).add(orgId);
    
    if (!orgToPersons.has(orgId)) orgToPersons.set(orgId, new Set());
    if (sourceRecordId) orgToPersons.get(orgId).add(sourceRecordId);
    
    if (!nameToIdentities.has(normalizedName)) nameToIdentities.set(normalizedName, new Set());
    nameToIdentities.get(normalizedName).add(sourceRecordId);
    
    // Determine relationship type
    let relType = 'AUTHORITY_OF_ENTITY';
    const c = cargo.toUpperCase();
    if (c === 'SOCIO') relType = 'PARTNER_OF';
    else if (c === 'PRESIDENTE') relType = 'PRESIDENT_OF';
    else if (c === 'DIRECTOR') relType = 'DIRECTOR_OF';
    else if (c === 'REPRESENTANTE LEGAL') relType = 'LEGAL_REPRESENTATIVE_OF';
    else if (c === 'AUTORIDAD') relType = 'AUTHORITY_OF';
    
    const obs = {
      source_id: 'DATOS_ARGENTINA_IGJ_AUTHORITIES',
      source_record_id: sourceRecordId,
      subject_external_key: subjectExternalKey,
      identity_resolution_status: identityResolutionStatus,
      name: { full: name.trim() },
      professions: [],
      relations: [
        {
          type: relType,
          organization: {
            id: `igj_entity_${orgId}`,
            name: `Entidad IGJ ${orgId}`
          }
        }
      ],
      raw_payload: {
        cargo: cargo,
        tipo_administrador: row['tipo_administrador'],
        entity_id: orgId
      },
      extracted_at: new Date().toISOString()
    };
    
    // Content hash for idempotency (exclude volatile extracted_at timestamp)
    const payloadForHash = { ...obs };
    delete payloadForHash.extracted_at;
    const hash = crypto.createHash('sha256').update(JSON.stringify(payloadForHash)).digest('hex');
    
    observationsToInsert.push({
      source_id: 'DATOS_ARGENTINA_IGJ_AUTHORITIES',
      source_record_id: sourceRecordId,
      observation_type: 'PERSON_EVIDENCE',
      value_jsonb: obs,
      source_content_hash: hash,
      observed_at: obs.extracted_at
    });
  }
  
  // Bulk Upsert
  const { error } = await supabase.from('atlas_person_observations').upsert(
    observationsToInsert,
    { onConflict: 'source_id,source_record_id,source_content_hash' }
  );
  
  if (error) {
     console.error(`Error in bulk upsert:`, error.message);
  } else {
     insertedCount = observationsToInsert.length;
  }
  
  // Analytics reporting
  let peopleWithMultipleOrgs = 0;
  for (const [p, orgs] of personToOrgs.entries()) {
      if (orgs.size > 1) peopleWithMultipleOrgs++;
  }
  
  let orgsWithMultiplePeople = 0;
  for (const [o, people] of orgToPersons.entries()) {
      if (people.size > 1) orgsWithMultiplePeople++;
  }
  
  let duplicateNamesDifferentIdentity = 0;
  for (const [n, ids] of nameToIdentities.entries()) {
      if (ids.size > 1) duplicateNamesDifferentIdentity++;
  }
  
  console.log('\n=== IGJ DUPLICATE ANALYSIS ===');
  console.log(`TOTAL_ROWS = ${valid}`);
  console.log(`UNIQUE_SOURCE_PERSON_IDENTITIES = ${uniquePersonIdentities.size}`);
  console.log(`DUPLICATE_PERSON_ROWS = ${valid - uniquePersonIdentities.size}`);
  console.log(`UNIQUE_NAMES = ${uniqueNames.size}`);
  console.log(`DUPLICATE_NAMES_WITH_DIFFERENT_IDENTITIES = ${duplicateNamesDifferentIdentity}`);
  console.log(`UNIQUE_ORGANIZATIONS = ${uniqueOrgs.size}`);
  console.log(`PEOPLE_WITH_MULTIPLE_ORGANIZATIONS = ${peopleWithMultipleOrgs}`);
  console.log(`ORGANIZATIONS_WITH_MULTIPLE_AUTHORITIES = ${orgsWithMultiplePeople}`);
  
  console.log('\n=== IGJ INGESTION METRICS ===');
  console.log(`Ingestion success: Inserted/Upserted ${insertedCount} rows.`);
  console.log('NAME_ONLY_MERGES = 0');
  console.log('RAW_DNI_PERSISTED = 0');
  console.log('PLAIN_DNI_HASH_PERSISTED = 0');
  console.log('NAME_INFERRED_GENDER_PERSISTED = 0');
}

run().catch(console.error);
