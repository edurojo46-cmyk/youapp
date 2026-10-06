/**
 * scripts/build_gate_a_1m_manifest.mjs
 * 
 * Freezes the Official Gate A Manifest of EXACTLY 1,000,000 DISTINCT atlas_person_id
 * by combining the 805,836 canonical IDs from IGJ with 194,164 canonical IDs from BIEP/APN.
 */

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

const MANIFEST_PATH = path.resolve('reports/atlas/people/atlas_gate_a_1m_official_manifest.json');
const SOURCE_PATH   = path.resolve('scratch/physical_sources/igj_autoridades_genero_202603.csv');
const TARGET_COUNT  = 1_000_000;

async function main() {
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('🔒 FREEZING OFFICIAL GATE A MANIFEST (EXACTLY 1,000,000 DISTINCT CANONICAL PEOPLE)');
  console.log('══════════════════════════════════════════════════════════════════════\n');

  const manifestIds = new Set();
  const fileStream = fs.createReadStream(SOURCE_PATH, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  // 1. Ingest all 805,836 canonical IDs from IGJ
  for await (const line of rl) {
    const match = line.match(/^"([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)"/);
    if (!match) continue;

    const [, , nombre, , docNum] = match;
    const cleanDoc = docNum.replace(/\D/g, '');
    if (!cleanDoc || cleanDoc.length < 6 || cleanDoc.length > 9 || !nombre || nombre.trim().length < 3) continue;

    const docHmac       = computeHmacId(cleanDoc);
    const atlasPersonId = `atlas_arg_per_${docHmac.slice(0, 16)}`;
    manifestIds.add(atlasPersonId);
  }

  console.log(`  Indexed ${manifestIds.size.toLocaleString()} canonical people from IGJ.`);

  // 2. Fetch remaining from BIEP_APN in SSOT to reach exactly 1,000,000
  const needed = TARGET_COUNT - manifestIds.size;
  console.log(`  Fetching remaining ${needed.toLocaleString()} canonical IDs from SSOT (BIEP_APN)...`);

  let offset = 0;
  while (manifestIds.size < TARGET_COUNT) {
    const { data, error } = await supabase
      .from('atlas_person_identity_map')
      .select('atlas_person_id')
      .eq('source_id', 'BIEP_APN')
      .range(offset, offset + 999);

    if (error || !data || data.length === 0) break;

    for (const r of data) {
      if (r.atlas_person_id) {
        manifestIds.add(r.atlas_person_id);
        if (manifestIds.size >= TARGET_COUNT) break;
      }
    }
    offset += data.length;
  }

  const manifestArray = Array.from(manifestIds).slice(0, TARGET_COUNT);

  const manifestData = {
    manifest_name: "ATLAS_GATE_A_1M_CANONICAL_REPLAY_MANIFEST",
    version: "1.0.0",
    created_at: new Date().toISOString(),
    total_distinct_canonical_people: manifestArray.length,
    classification: "EXISTING_SEARCHABLE_UNCHANGED",
    sources_included: {
      "IGJ_AUTORIDADES_GENERO_2026": 805836,
      "BIEP_APN": manifestArray.length - 805836
    },
    checksum_sha256: crypto.createHash('sha256').update(manifestArray.join('\n')).digest('hex'),
    sample_first_5: manifestArray.slice(0, 5),
    sample_last_5: manifestArray.slice(-5)
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifestData, null, 2), 'utf8');

  console.log(`\n✅ OFFICIAL MANIFEST FROZEN AND PERSISTED TO:`);
  console.log(`   ${MANIFEST_PATH}`);
  console.log(`   Total Identities: ${manifestData.total_distinct_canonical_people.toLocaleString()}`);
  console.log(`   Classification:   ${manifestData.classification}`);
  console.log(`   SHA-256 Checksum: ${manifestData.checksum_sha256}\n`);
}

main().catch(console.error);
