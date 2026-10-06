import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import https from 'https';
import crypto from 'crypto';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SECRET_KEY!; // Service role key
const supabase = createClient(supabaseUrl, supabaseKey);

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseCSV(csv: string) {
  const lines = csv.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map(h => h.toLowerCase().trim());
  
  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    const row: any = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ? values[j].replace(/(^"|"$)/g, '') : '';
    }
    results.push(row);
  }
  return results;
}

function hashSHA256(data: string) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export async function runIngestion(testMode: 'REAL' | 'REPLAY' | 'CHANGE' | 'FAIL' = 'REAL') {
  const SOURCE_ID = 'gcba_open_data_funcionarios';
  
  let runId: string;
  
  try {
    // 1. Acquire Lease
    const { data, error: rpcError } = await supabase.rpc('acquire_atlas_ingestion_run_v1', {
      p_source_id: SOURCE_ID,
      p_lease_duration_seconds: 300
    });
    
    if (rpcError) {
      if (rpcError.message.includes('ALREADY_RUNNING')) {
        console.log('Ingestion rejected: ALREADY_RUNNING');
        return { status: 'REJECTED' };
      }
      throw rpcError;
    }
    
    runId = data;
    console.log(`Acquired lease. Run ID: ${runId}`);
    
    if (testMode === 'FAIL') {
      throw new Error('Controlled Failure Test');
    }
    
    // 2. Fetch Data
    const url = 'https://cdn.buenosaires.gob.ar/datosabiertos/datasets/jefatura-de-gabinete-de-ministros/autoridades-superiores-funcionarios/autoridades-superiores-y-funcionarios.csv';
    const csvData = await fetchUrl(url);
    const rows = parseCSV(csvData);
    
    const observations = [];
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.apellido && !row.nombre) continue;
      
      // If we are in CHANGE mode, modify the first row to simulate a role change
      if (testMode === 'CHANGE' && i === 0) {
        row.escalafon = 'Ministro Intergaláctico';
      }
      
      // Source Record ID: Stable identity (name + ministry/department)
      const stableKey = `${row.ministerio_nombre}|${row.codigo_reparticion}|${row.apellido}|${row.nombre}`;
      const sourceRecordId = hashSHA256(stableKey);
      
      // Canonical representation (excluding raw/dirty/PII fields)
      const canonicalObj = {
        name: `${row.nombre} ${row.apellido}`.trim(),
        role: row.escalafon || row.nivel,
        organization: row.ministerio_nombre || row.dependencia_nombre || row.reparticion_nombre,
        sex: row.sexo || null,
        age: row.edad ? parseInt(row.edad, 10) : null
      };
      
      // Sort keys for deterministic hash
      const sortedKeys = Object.keys(canonicalObj).sort();
      const canonicalString = sortedKeys.map(k => `${k}:${(canonicalObj as any)[k]}`).join('|');
      const sourceContentHash = hashSHA256(canonicalString);
      
      observations.push({
        source_id: SOURCE_ID,
        source_record_id: sourceRecordId,
        source_url: url,
        observation_type: 'PERSON_SNAPSHOT',
        normalized_value: canonicalObj.name,
        value_jsonb: canonicalObj,
        observed_at: new Date().toISOString(),
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        source_content_hash: sourceContentHash,
        ingestion_run_id: runId
      });
    }
    
    // Batch upsert (in chunks of 500)
    const chunkSize = 500;
    let insertedOrUpdated = 0;
    
    for (let i = 0; i < observations.length; i += chunkSize) {
      const chunk = observations.slice(i, i + chunkSize);
      
      const { data: upsertData, error: upsertError } = await supabase
        .from('atlas_person_observations')
        .upsert(chunk, {
          onConflict: 'source_id,source_record_id,source_content_hash',
          ignoreDuplicates: false // We want it to update last_seen_at!
          // Note: In supabase JS, standard upsert updates the row.
        });
        
      if (upsertError) throw upsertError;
      insertedOrUpdated += chunk.length;
    }
    
    // 3. Finalize
    await supabase.rpc('finalize_atlas_ingestion_run_v1', {
      p_run_id: runId,
      p_status: 'SUCCESS',
      p_rows_seen: observations.length,
      p_rows_inserted: observations.length // Since upsert doesn't tell us easily how many were new, we just log total processed
    });
    
    console.log(`Ingestion complete! Processed ${observations.length} observations.`);
    return { status: 'SUCCESS', count: observations.length };
    
  } catch (error: any) {
    console.error('Ingestion failed:', error.message);
    if (runId!) {
      await supabase.rpc('finalize_atlas_ingestion_run_v1', {
        p_run_id: runId,
        p_status: 'FAILED',
        p_error_code: 'INGEST_ERR',
        p_error_message: error.message.substring(0, 200) // Sanitize length
      });
    }
    return { status: 'FAILED' };
  }
}

// If run directly
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] as any || 'REAL';
  runIngestion(mode).then(() => process.exit(0));
}
