import 'dotenv/config';
import fs from 'fs';
import readline from 'readline';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env', 'utf8');
let url = '', key = '', hmacSecret = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/["']/g, '');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = line.split('=')[1].trim().replace(/["']/g, '');
  if (line.startsWith('ATLAS_IGJ_IDENTITY_HMAC_KEY=')) hmacSecret = line.split('=')[1].trim().replace(/["']/g, '');
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function testBatch() {
  console.log('Testing 1 real batch from igj_autoridades_genero_202603.csv into atlas_person_identity_map...');
  
  // Count before
  const { count: beforeCount } = await supabase
    .from('atlas_person_identity_map')
    .select('*', { count: 'exact', head: true });
  console.log(`Database count before: ${beforeCount}`);

  // Read 50 rows
  const rl = readline.createInterface({
    input: fs.createReadStream('scratch/physical_sources/igj_autoridades_genero_202603.csv', { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  const batch = [];
  let isHeader = true;
  for await (const line of rl) {
    if (isHeader) { isHeader = false; continue; }
    if (!line.trim()) continue;

    // Parse CSV line: "numero_correlativo","apellido_nombre","descripcion_tipo_documento","numero_documento","genero_autoridad","descripcion_tipo_societario"
    const match = line.match(/^"([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)"/);
    if (!match) continue;

    const [_, numCorrelativo, nombre, tipoDoc, docNum, genero, tipoSoc] = match;
    const cleanDoc = docNum.replace(/\D/g, '');
    if (!cleanDoc || cleanDoc.length < 6 || cleanDoc.length > 9) continue;

    // HMAC hash of document
    const docHmac = crypto.createHmac('sha256', hmacSecret).update(`ARG:DNI:${cleanDoc}`).digest('hex');
    const atlasPersonId = `atlas_arg_per_${docHmac.slice(0, 16)}`;
    const sourcePersonId = crypto.createHash('sha256').update(`IGJ:${numCorrelativo}:${cleanDoc}:${nombre.trim().toUpperCase()}`).digest('hex');
    const evidenceId = `evi_igj_${numCorrelativo}_${cleanDoc}`;

    batch.push({
      atlas_person_id: atlasPersonId,
      source_id: 'IGJ_AUTORIDADES_GENERO_2026',
      source_person_id: sourcePersonId,
      identifier_type: 'NATIONAL_IDENTITY_HMAC',
      identifier_value: docHmac,
      evidence_id: evidenceId,
      confidence: 1.0,
      resolution_method: 'IGJ_OFFICIAL_REGISTRY_DNI_HMAC',
      observed_at: new Date().toISOString()
    });

    if (batch.length >= 50) break;
  }
  rl.close();

  console.log(`Prepared pilot batch of ${batch.length} rows. First item:`, batch[0]);

  // Insert into PostgreSQL
  const { data, error } = await supabase
    .from('atlas_person_identity_map')
    .upsert(batch, { onConflict: 'source_id,source_person_id' });

  if (error) {
    console.error('Insert error:', error.message);
    return;
  }

  // Count after
  const { count: afterCount } = await supabase
    .from('atlas_person_identity_map')
    .select('*', { count: 'exact', head: true });
  console.log(`Database count after: ${afterCount} (Delta: +${afterCount - beforeCount})`);
}

testBatch().catch(console.error);
