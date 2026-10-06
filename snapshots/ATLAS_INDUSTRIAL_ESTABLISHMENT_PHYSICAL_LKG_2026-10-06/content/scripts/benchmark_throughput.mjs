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

async function benchmarkThroughput() {
  console.log('Testing throughput with 500 rows chunk...');
  const rl = readline.createInterface({
    input: fs.createReadStream('scratch/physical_sources/igj_autoridades_genero_202603.csv', { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  const rows = [];
  let isHeader = true;
  let count = 0;
  for await (const line of rl) {
    if (isHeader) { isHeader = false; continue; }
    count++;
    if (count <= 50) continue; // skip first 50 already inserted

    const match = line.match(/^"([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)"/);
    if (!match) continue;

    const [_, numCorrelativo, nombre, tipoDoc, docNum, genero, tipoSoc] = match;
    const cleanDoc = docNum.replace(/\D/g, '');
    if (!cleanDoc || cleanDoc.length < 6 || cleanDoc.length > 9) continue;

    const docHmac = crypto.createHmac('sha256', hmacSecret).update(`ARG:DNI:${cleanDoc}`).digest('hex');
    const atlasPersonId = `atlas_arg_per_${docHmac.slice(0, 16)}`;
    const sourcePersonId = crypto.createHash('sha256').update(`IGJ:${numCorrelativo}:${cleanDoc}:${nombre.trim().toUpperCase()}`).digest('hex');
    const evidenceId = `evi_igj_${numCorrelativo}_${cleanDoc}`;

    rows.push({
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

    if (rows.length >= 500) break;
  }
  rl.close();

  // Intra-batch deduplication to prevent Postgres ON CONFLICT error
  const batchMap = new Map();
  for (const item of rows) {
    const key = `${item.source_id}:${item.source_person_id}`;
    if (!batchMap.has(key)) {
      batchMap.set(key, item);
    }
  }
  const dedupedBatch = Array.from(batchMap.values());
  console.log(`Parsed ${rows.length} rows (${dedupedBatch.length} unique in batch). Committing to PostgreSQL...`);
  const t0 = performance.now();
  const { error } = await supabase
    .from('atlas_person_identity_map')
    .upsert(dedupedBatch, { onConflict: 'source_id,source_person_id' });
  const dt = performance.now() - t0;

  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log(`500 rows inserted in ${dt.toFixed(1)}ms (${(500 / (dt / 1000)).toFixed(0)} rows/sec)`);
  }
}

benchmarkThroughput().catch(console.error);
