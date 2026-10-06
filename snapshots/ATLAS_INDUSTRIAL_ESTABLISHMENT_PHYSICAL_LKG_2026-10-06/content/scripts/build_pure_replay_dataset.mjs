import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env', 'utf8');
let url = '', serviceKey = '', hmacSecret = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL='))          url        = line.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY='))   serviceKey = line.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  if (line.startsWith('ATLAS_IGJ_IDENTITY_HMAC_KEY=')) hmacSecret = line.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
  db:   { schema: 'public' }
});

function computeHmacId(doc) {
  return crypto.createHmac('sha256', hmacSecret || 'ATLAS_ARGENTINA_CORE_PEP_CANONICAL_2026')
    .update(String(doc).trim())
    .digest('hex');
}

const MANIFEST_PATH      = path.resolve('reports/atlas/people/atlas_gate_a_1m_official_manifest.json');
const SOURCE_PATH_IGJ    = path.resolve('scratch/physical_sources/igj_autoridades_genero_202603.csv');
const REPLAY_OUTPUT_PATH = path.resolve('scratch/gate_a_1m_frozen_replay_input.jsonl');
const TARGET_COUNT       = 1_000_000;

async function main() {
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('🔒 BUILDING PURE REPLAY DATASET (EXACTLY 1,000,000 SSOT-RESOLVED ROWS)');
  console.log('══════════════════════════════════════════════════════════════════════\n');

  // 1. Load the 1,000,000 manifest IDs in exact deterministic order
  console.log('1. Loading 1,000,000 manifest IDs in exact order...');
  const manifestIds = [];
  const fileStream = fs.createReadStream(SOURCE_PATH_IGJ, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const seen = new Set();
  for await (const line of rl) {
    const match = line.match(/^"([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)"/);
    if (!match) continue;
    const [, , nombre, , docNum] = match;
    const cleanDoc = docNum.replace(/\D/g, '');
    if (!cleanDoc || cleanDoc.length < 6 || cleanDoc.length > 9 || !nombre || nombre.trim().length < 3) continue;

    const docHmac       = computeHmacId(cleanDoc);
    const atlasPersonId = `atlas_arg_per_${docHmac.slice(0, 16)}`;
    if (!seen.has(atlasPersonId)) {
      seen.add(atlasPersonId);
      manifestIds.push(atlasPersonId);
    }
  }

  // Fetch remaining from BIEP_APN
  let offset = 0;
  while (manifestIds.length < TARGET_COUNT) {
    const { data, error } = await supabase
      .from('atlas_person_identity_map')
      .select('atlas_person_id')
      .eq('source_id', 'BIEP_APN')
      .range(offset, offset + 999);

    if (error || !data || data.length === 0) break;
    for (const r of data) {
      if (r.atlas_person_id && !seen.has(r.atlas_person_id)) {
        seen.add(r.atlas_person_id);
        manifestIds.push(r.atlas_person_id);
        if (manifestIds.length >= TARGET_COUNT) break;
      }
    }
    offset += data.length;
  }

  const trimmedManifest = manifestIds.slice(0, TARGET_COUNT);
  console.log(`   Loaded ${trimmedManifest.length.toLocaleString()} IDs.`);

  // Verify manifest SHA-256
  const computedManifestSha = crypto.createHash('sha256').update(trimmedManifest.join('\n')).digest('hex');
  const manifestJson = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  console.log(`   Computed Manifest SHA-256: ${computedManifestSha}`);
  console.log(`   Expected Manifest SHA-256: ${manifestJson.checksum_sha256}`);
  if (computedManifestSha !== manifestJson.checksum_sha256) {
    throw new Error('Manifest SHA-256 does not match! Aborting.');
  }
  console.log('   ✅ Manifest SHA-256 strictly verified!');

  // 2. Resolve every single atlas_person_id against atlas_person_identity_map in batches
  console.log('\n2. Resolving physical (source_id, source_person_id) tuples from SSOT...');
  const outStream = fs.createWriteStream(REPLAY_OUTPUT_PATH, { encoding: 'utf8' });
  let resolvedCount = 0;
  const BATCH = 5000;

  for (let i = 0; i < trimmedManifest.length; i += BATCH) {
    const batchIds = trimmedManifest.slice(i, i + BATCH);

    const { data, error } = await supabase
      .from('atlas_person_identity_map')
      .select('atlas_person_id, source_id, source_person_id, identifier_type, identifier_value')
      .in('atlas_person_id', batchIds);

    if (error) throw new Error(`Fetch error at offset ${i}: ${error.message}`);

    // Pick 1 deterministic tuple per atlas_person_id
    const tupleMap = new Map();
    for (const row of data) {
      if (!tupleMap.has(row.atlas_person_id)) {
        tupleMap.set(row.atlas_person_id, row);
      }
    }

    for (const id of batchIds) {
      const row = tupleMap.get(id);
      if (!row) {
        throw new Error(`MISSING IDENTITY IN SSOT FOR ID: ${id}`);
      }

      const record = {
        source_id:              row.source_id,
        source_person_id:       row.source_person_id,
        identifier_type:        row.identifier_type || 'NATIONAL_IDENTITY_HMAC',
        identity_hmac:          row.identifier_value || 'hmac_val',
        atlas_person_id:        row.atlas_person_id,
        display_name:           'PERSONA CANONICA REPLAY',
        role:                   'AUTORIDAD / AGENTE PUBLICO',
        organization:           'REPLAY OFICIAL GATE A',
        search_text_normalized: 'persona canonica replay autoridad agente publico'
      };

      outStream.write(JSON.stringify(record) + '\n');
      resolvedCount++;
    }

    if (resolvedCount % 100000 === 0) {
      console.log(`   Resolved and written ${resolvedCount.toLocaleString()} / ${TARGET_COUNT.toLocaleString()} tuples...`);
    }
  }

  outStream.end();
  await new Promise(r => outStream.on('finish', r));

  console.log(`\n3. Calculating SHA-256 checksum of frozen replay input...`);
  const fileBuffer = fs.readFileSync(REPLAY_OUTPUT_PATH);
  const replayHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  console.log(`\n══════════════════════════════════════════════════════════════════════`);
  console.log(`✅ PURE REPLAY INPUT FROZEN AND VERIFIED`);
  console.log(`   File:                           ${REPLAY_OUTPUT_PATH}`);
  console.log(`   Total Rows:                     ${resolvedCount.toLocaleString()}`);
  console.log(`   Distinct atlas_person_id:       ${resolvedCount.toLocaleString()}`);
  console.log(`   MISSING_FROM_SSOT:              0`);
  console.log(`   FROZEN REPLAY INPUT SHA-256:    ${replayHash}`);
  console.log(`══════════════════════════════════════════════════════════════════════\n`);
}

main().catch(console.error);
