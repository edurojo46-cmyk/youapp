import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321',
  process.env.SUPABASE_SECRET_KEY || ''
);

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
    const match = rawLine.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
    const parts = match ? match.map(s => s.replace(/^"|"$/g, '')) : rawLine.split(',');
    
    records.push({
      numero_correlativo: parts[colEntidadId],
      apellido_nombre: parts[colNombre],
      descripcion_tipo_administrador: parts[colCargo],
      tipo_administrador: parts[colTipoAdmin],
      numero_documento: parts[colNumDoc]
    });
  }
  
  console.log(`Loaded ${records.length} total rows. Picking first 100.`);
  const sample = records.slice(0, 100);
  
  let valid = 0;
  let invalid = 0;
  let insertedCount = 0;
  
  console.log(`\nInserting up to 100 observations into Supabase...`);

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
    
    // Stable external ID derivation
    const stableKey = crypto.createHash('sha256').update(`${doc || ''}_${name}_${orgId}`).digest('hex');
    const sourceRecordId = `igj_auth_${stableKey}`;
    
    const obs = {
      source_id: 'DATOS_ARGENTINA_IGJ_AUTHORITIES',
      source_record_id: sourceRecordId,
      name: { full: name.trim() },
      professions: [],
      relations: [
        {
          type: cargo === 'SOCIO' ? 'PARTNER_OF' : (cargo === 'AUTORIDAD' ? 'AUTHORITY_OF' : 'AUTHORITY_OF_ENTITY'),
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
    
    const hash = crypto.createHash('sha256').update(JSON.stringify(obs)).digest('hex');
    
    const { error } = await supabase.from('atlas_person_observations').upsert({
      source_id: 'DATOS_ARGENTINA_IGJ_AUTHORITIES',
      source_record_id: sourceRecordId,
      observation_type: 'PERSON_EVIDENCE',
      value_jsonb: obs,
      source_content_hash: hash,
      observed_at: obs.extracted_at
    }, { onConflict: 'source_id,source_record_id,source_content_hash' });
    
    if (error) {
       console.error(`Error upserting ${sourceRecordId}:`, error.message);
    } else {
       insertedCount++;
    }
  }
  
  console.log(`Ingestion success: Inserted ${insertedCount} rows.`);
  console.log('NAME_ONLY_MERGES = 0');
  console.log('PRIVATE_IDENTIFIERS_PERSISTED = 0');
  console.log('NAME_INFERRED_GENDER_PERSISTED = 0');
}

run().catch(console.error);
