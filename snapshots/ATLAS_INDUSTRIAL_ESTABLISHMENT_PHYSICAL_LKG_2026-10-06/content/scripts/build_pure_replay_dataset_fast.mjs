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
  console.log('🔒 BUILDING PURE REPLAY DATASET VIA FAST KEYSET RESOLUTION');
  console.log('══════════════════════════════════════════════════════════════════════\n');

  // 1. Reconstitute exact 1,000,000 manifest IDs
  console.log('1. Loading exact 1,000,000 manifest IDs in order...');
  const manifestIds = [];
  const manifestSet = new Set();
  const fileStream = fs.createReadStream(SOURCE_PATH_IGJ, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    const match = line.match(/^"([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)"/);
    if (!match) continue;
    const [, , nombre, , docNum] = match;
    const cleanDoc = docNum.replace(/\D/g, '');
    if (!cleanDoc || cleanDoc.length < 6 || cleanDoc.length > 9 || !nombre || nombre.trim().length < 3) continue;

    const docHmac = computeHmacId(cleanDoc);
    const atlasPersonId = `atlas_arg_per_${docHmac.slice(0, 16)}`;
    if (!manifestSet.has(atlasPersonId)) {
      manifestSet.add(atlasPersonId);
      manifestIds.push(atlasPersonId);
    }
  }

  // Fetch remaining from BIEP_APN
  let lastBiepId = '';
  while (manifestIds.length < TARGET_COUNT) {
    let q = supabase
      .from('atlas_person_identity_map')
      .select('source_person_id, atlas_person_id')
      .eq('source_id', 'BIEP_APN')
      .order('source_person_id', { ascending: true })
      .limit(1000);

    if (lastBiepId) q = q.gt('source_person_id', lastBiepId);
    const { data, error } = await q;
    if (error || !data || data.length === 0) break;

    lastBiepId = data[data.length - 1].source_person_id;
    for (const r of data) {
      if (r.atlas_person_id && !manifestSet.has(r.atlas_person_id)) {
        manifestSet.add(r.atlas_person_id);
        manifestIds.push(r.atlas_person_id);
        if (manifestIds.length >= TARGET_COUNT) break;
      }
    }
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

  // 2. Keyset stream atlas_person_identity_map
  console.log('\n2. Keyset streaming atlas_person_identity_map across all partitions...');
  const t0 = performance.now();
  const identityTupleMap = new Map();

  const sources = [
    'IGJ_AUTORIDADES_GENERO_2026',
    'BIEP_APN',
    'CONICET_OAI_PMH',
    'OPENALEX',
    'GCBA',
    'CANONICAL_ATLAS',
    'WIKIDATA'
  ];

  for (const src of sources) {
    console.log(`   Scanning source: ${src}...`);
    let lastSrcPersonId = '';
    let srcCount = 0;

    while (true) {
      let q = supabase
        .from('atlas_person_identity_map')
        .select('source_person_id, atlas_person_id, source_id, identifier_type, identifier_value')
        .eq('source_id', src)
        .order('source_person_id', { ascending: true })
        .limit(1000);

      if (lastSrcPersonId) q = q.gt('source_person_id', lastSrcPersonId);

      const { data, error } = await q;
      if (error) {
        console.error(`   Error in ${src} at ${lastSrcPersonId}: ${error.message}`);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      if (!data || data.length === 0) break;

      lastSrcPersonId = data[data.length - 1].source_person_id;
      srcCount += data.length;

      for (const row of data) {
        if (manifestSet.has(row.atlas_person_id) && !identityTupleMap.has(row.atlas_person_id)) {
          identityTupleMap.set(row.atlas_person_id, row);
        }
      }

      if (srcCount % 100000 === 0) {
        console.log(`     Scanned ${srcCount.toLocaleString()} rows from ${src} | Total Mapped: ${identityTupleMap.size.toLocaleString()} / ${TARGET_COUNT.toLocaleString()}...`);
      }
    }
    console.log(`   Finished ${src} (${srcCount.toLocaleString()} rows). Total mapped so far: ${identityTupleMap.size.toLocaleString()}`);
  }

  const dtScan = (performance.now() - t0) / 1000;
  console.log(`\nScan finished in ${dtScan.toFixed(1)}s! Mapped ${identityTupleMap.size.toLocaleString()} / ${TARGET_COUNT.toLocaleString()}`);

  // 3. Write Frozen Replay Dataset
  console.log('\n3. Writing frozen replay input in manifest order...');
  const outStream = fs.createWriteStream(REPLAY_OUTPUT_PATH, { encoding: 'utf8' });
  let writtenCount = 0;
  let missing = 0;

  for (const id of finalManifest) {
    const row = identityTupleMap.get(id);
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
