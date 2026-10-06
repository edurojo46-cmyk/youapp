import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { performance } from 'perf_hooks';

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

const SOURCE_PATH_IGJ    = path.resolve('scratch/physical_sources/igj_autoridades_genero_202603.csv');
const MANIFEST_PATH      = path.resolve('reports/atlas/people/atlas_gate_a_1m_official_manifest.json');
const REPLAY_OUTPUT_PATH = path.resolve('scratch/gate_a_1m_frozen_replay_input.jsonl');
const TARGET_COUNT       = 1_000_000;

async function main() {
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('🔒 BUILDING EXACT MANIFEST REPLAY INPUT DIRECTLY FROM SSOT MAP');
  console.log('══════════════════════════════════════════════════════════════════════\n');

  // 1. Rebuild exact 1,000,000 manifest array
  console.log('1. Loading exact 1,000,000 manifest IDs...');
  const manifestIds = [];
  const manifestSet = new Set();
  const fileStream = fs.createReadStream(SOURCE_PATH_IGJ, { encoding: 'utf8', highWaterMark: 64 * 1024 });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    const match = line.match(/^"([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)"/);
    if (!match) continue;
    const [, , nombre, , docNum] = match;
    const cleanDoc = docNum.replace(/\D/g, '');
    if (!cleanDoc || cleanDoc.length < 6 || cleanDoc.length > 9 || !nombre || nombre.trim().length < 3) continue;

    const docHmac       = computeHmacId(cleanDoc);
    const atlasPersonId = `atlas_arg_per_${docHmac.slice(0, 16)}`;
    if (!manifestSet.has(atlasPersonId)) {
      manifestSet.add(atlasPersonId);
      manifestIds.push(atlasPersonId);
    }
  }

  // Fetch remaining from BIEP_APN using exact offset range as original manifest
  let offset = 0;
  while (manifestIds.length < TARGET_COUNT) {
    const { data, error } = await supabase
      .from('atlas_person_identity_map')
      .select('atlas_person_id')
      .eq('source_id', 'BIEP_APN')
      .range(offset, offset + 999);

    if (error || !data || data.length === 0) break;
    for (const r of data) {
      if (r.atlas_person_id && !manifestSet.has(r.atlas_person_id)) {
        manifestSet.add(r.atlas_person_id);
        manifestIds.push(r.atlas_person_id);
        if (manifestIds.length >= TARGET_COUNT) break;
      }
    }
    offset += data.length;
  }

  const finalManifest = manifestIds.slice(0, TARGET_COUNT);
  console.log(`   Manifest IDs in memory: ${finalManifest.length.toLocaleString()}`);

  const computedManifestSha = crypto.createHash('sha256').update(finalManifest.join('\n')).digest('hex');
  const manifestJson = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  console.log(`   Computed SHA-256: ${computedManifestSha}`);
  console.log(`   Expected SHA-256: ${manifestJson.checksum_sha256}`);
  if (computedManifestSha !== manifestJson.checksum_sha256) {
    throw new Error('Manifest SHA-256 mismatch!');
  }
  console.log('   ✅ Manifest SHA-256 strictly verified!');

  // 2. Resolve every manifest ID from atlas_person_identity_map
  // We can query atlas_person_identity_map in parallel batches of 200 IDs using .in('atlas_person_id', batch)
  console.log('\n2. Resolving physical (source_id, source_person_id) mappings from SSOT...');
  const t0 = performance.now();
  const tupleMap = new Map(); // atlas_person_id -> row

  const BATCH_SIZE = 200;
  const CONCURRENCY = 12;
  let batchIdx = 0;
  const totalBatches = Math.ceil(finalManifest.length / BATCH_SIZE);

  async function resolveWorker() {
    while (true) {
      const idx = batchIdx++;
      if (idx >= totalBatches) break;

      const chunk = finalManifest.slice(idx * BATCH_SIZE, (idx + 1) * BATCH_SIZE);
      let attempts = 0;
      while (attempts < 3) {
        attempts++;
        const { data, error } = await supabase
          .from('atlas_person_identity_map')
          .select('atlas_person_id, source_id, source_person_id, identifier_type, identifier_value')
          .in('atlas_person_id', chunk);

        if (error) {
          if (attempts === 3) throw new Error(`Batch ${idx} error: ${error.message}`);
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }

        if (data) {
          for (const row of data) {
            if (!tupleMap.has(row.atlas_person_id)) {
              tupleMap.set(row.atlas_person_id, row);
            }
          }
        }
        break;
      }

      if (idx % 250 === 0) {
        console.log(`   Processed batch ${idx.toLocaleString()} / ${totalBatches.toLocaleString()} | Resolved: ${tupleMap.size.toLocaleString()}...`);
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => resolveWorker());
  await Promise.all(workers);

  const dtResolve = (performance.now() - t0) / 1000;
  console.log(`\nResolution complete in ${dtResolve.toFixed(1)}s! Total resolved: ${tupleMap.size.toLocaleString()}`);

  // 3. Write Frozen Replay Dataset
  console.log('\n3. Writing frozen replay input...');
  const outStream = fs.createWriteStream(REPLAY_OUTPUT_PATH, { encoding: 'utf8' });
  let writtenCount = 0;
  let missing = 0;

  for (const id of finalManifest) {
    const row = tupleMap.get(id);
    if (!row) {
      missing++;
      continue;
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
    writtenCount++;
  }

  outStream.end();
  await new Promise(r => outStream.on('finish', r));

  console.log(`   Written ${writtenCount.toLocaleString()} rows.`);
  console.log(`   MISSING_FROM_SSOT = ${missing}`);

  if (missing > 0 || writtenCount !== TARGET_COUNT) {
    throw new Error(`Incomplete replay input! missing = ${missing}, written = ${writtenCount}`);
  }

  console.log('\n4. Computing SHA-256 of frozen replay input...');
  const fileBuffer = fs.readFileSync(REPLAY_OUTPUT_PATH);
  const replayHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  console.log(`\n══════════════════════════════════════════════════════════════════════`);
  console.log(`✅ PURE REPLAY INPUT FROZEN AND CERTIFIED`);
  console.log(`   File:                           ${REPLAY_OUTPUT_PATH}`);
  console.log(`   Total Rows:                     ${writtenCount.toLocaleString()}`);
  console.log(`   Distinct atlas_person_id:       ${writtenCount.toLocaleString()}`);
  console.log(`   MISSING_FROM_SSOT:              0`);
  console.log(`   FROZEN REPLAY INPUT SHA-256:    ${replayHash}`);
  console.log(`══════════════════════════════════════════════════════════════════════\n`);
}

main().catch(console.error);
