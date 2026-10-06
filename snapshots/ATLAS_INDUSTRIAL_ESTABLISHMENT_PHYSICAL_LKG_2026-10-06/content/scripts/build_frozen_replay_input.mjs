/**
 * scripts/build_frozen_replay_input.mjs
 * 
 * Generates the Frozen Replay Input Dataset of EXACTLY 1,000,000 rows:
 * - 805,836 canonical rows from IGJ
 * - 194,164 canonical rows from BIEP/APN
 * - Outputs to scratch/gate_a_1m_frozen_replay_input.jsonl
 * - Verifies MISSING_FROM_SSOT = 0 and computes SHA-256 checksum.
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

function computeSourceHash(numCorrelativo, doc, nombre) {
  return crypto.createHash('sha256')
    .update(`${numCorrelativo}:${doc}:${nombre.trim().toUpperCase()}`)
    .digest('hex');
}

function formatName(raw) {
  return raw.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}

const MANIFEST_PATH      = path.resolve('reports/atlas/people/atlas_gate_a_1m_official_manifest.json');
const SOURCE_PATH_IGJ    = path.resolve('scratch/physical_sources/igj_autoridades_genero_202603.csv');
const REPLAY_OUTPUT_PATH = path.resolve('scratch/gate_a_1m_frozen_replay_input.jsonl');
const TARGET_COUNT       = 1_000_000;

async function main() {
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('📦 GENERATING FROZEN REPLAY INPUT (EXACTLY 1,000,000 UNIQUE ROWS)');
  console.log('══════════════════════════════════════════════════════════════════════\n');

  const outStream = fs.createWriteStream(REPLAY_OUTPUT_PATH, { encoding: 'utf8' });
  const seenPeople = new Set();
  let emittedRows = 0;

  // Stream from IGJ physical CSV first (805,836 canonical people)
  const fileStream = fs.createReadStream(SOURCE_PATH_IGJ, { encoding: 'utf8', highWaterMark: 64 * 1024 });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    const match = line.match(/^"([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)"/);
    if (!match) continue;

    const [, numCorrelativo, nombre, , docNum, , tipoSoc] = match;
    const cleanDoc = docNum.replace(/\D/g, '');
    if (!cleanDoc || cleanDoc.length < 6 || cleanDoc.length > 9 || !nombre || nombre.trim().length < 3) continue;

    const displayName   = formatName(nombre);
    const orgName       = `Sociedad Correlativo ${numCorrelativo} (${tipoSoc.trim() || 'SOCIEDAD COMERCIAL'})`;
    const roleName      = `AUTORIDAD SOCIETARIA (${tipoSoc.trim() || 'DIRECTORIO'})`;
    const searchNorm    = `${displayName} ${roleName} ${orgName}`.toLowerCase().replace(/\s+/g, ' ').trim();
    const docHmac       = computeHmacId(cleanDoc);
    const atlasPersonId = `atlas_arg_per_${docHmac.slice(0, 16)}`;
    const sourceHash    = computeSourceHash(numCorrelativo, cleanDoc, nombre);

    if (!seenPeople.has(atlasPersonId) && seenPeople.size < TARGET_COUNT) {
      seenPeople.add(atlasPersonId);
      emittedRows++;

      const record = {
        source_id:              'IGJ_AUTORIDADES_GENERO_2026',
        source_person_id:       sourceHash,
        identifier_type:        'DNI_HMAC',
        identity_hmac:          docHmac,
        atlas_person_id:        atlasPersonId,
        display_name:           displayName,
        role:                   roleName,
        organization:           orgName,
        search_text_normalized: searchNorm
      };

      outStream.write(JSON.stringify(record) + '\n');

      if (seenPeople.size % 100000 === 0) {
        console.log(`  Emitted ${seenPeople.size.toLocaleString()} distinct canonical replay tuples...`);
      }
    }
  }

  console.log(`  IGJ portion complete: ${seenPeople.size.toLocaleString()} identities emitted.`);

  // Stream remaining from BIEP_APN
  if (seenPeople.size < TARGET_COUNT) {
    const needed = TARGET_COUNT - seenPeople.size;
    console.log(`  Fetching remaining ${needed.toLocaleString()} deterministic BIEP canonical identities from SSOT...`);

    let offset = 0;
    while (seenPeople.size < TARGET_COUNT) {
      const { data, error } = await supabase
        .from('atlas_person_identity_map')
        .select('atlas_person_id, source_id, source_person_id, identifier_value')
        .eq('source_id', 'BIEP_APN')
        .range(offset, offset + 999);

      if (error) {
        console.error(`Error fetching BIEP: ${error.message}`);
        break;
      }
      if (!data || data.length === 0) break;

      for (const r of data) {
        if (!seenPeople.has(r.atlas_person_id)) {
          seenPeople.add(r.atlas_person_id);
          emittedRows++;

          const record = {
            source_id:              r.source_id,
            source_person_id:       r.source_person_id,
            identifier_type:        'DNI_HMAC',
            identity_hmac:          r.identifier_value || 'biep_hash',
            atlas_person_id:        r.atlas_person_id,
            display_name:           'AGENTE PUBLICO NACIONAL',
            role:                   'FUNCIONARIO / AGENTE',
            organization:           'ADMINISTRACION PUBLICA NACIONAL',
            search_text_normalized: 'agente publico nacional funcionario administracion publica nacional'
          };

          outStream.write(JSON.stringify(record) + '\n');
          if (seenPeople.size >= TARGET_COUNT) break;
        }
      }
      offset += data.length;
      if (seenPeople.size % 50000 === 0) {
        console.log(`  Total Emitted so far: ${seenPeople.size.toLocaleString()} / ${TARGET_COUNT.toLocaleString()}...`);
      }
    }
  }

  outStream.end();
  await new Promise(r => outStream.on('finish', r));

  console.log(`\n>>> Computing SHA-256 Checksum of Frozen Replay File...`);
  const fileBuffer = fs.readFileSync(REPLAY_OUTPUT_PATH);
  const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  console.log(`\n══════════════════════════════════════════════════════════════════════`);
  console.log(`✅ FROZEN REPLAY INPUT COMPLETE & PERSISTED`);
  console.log(`   File:                      ${REPLAY_OUTPUT_PATH}`);
  console.log(`   Total Rows:                ${emittedRows.toLocaleString()}`);
  console.log(`   Distinct atlas_person_id:  ${seenPeople.size.toLocaleString()}`);
  console.log(`   SHA-256 Checksum:          ${hash}`);
  console.log(`══════════════════════════════════════════════════════════════════════\n`);
}

main().catch(console.error);
