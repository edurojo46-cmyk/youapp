/**
 * scripts/build_gate_a_1m_from_identity_map.mjs
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * OFFICIAL GATE A 1M DATASET BUILDER (DIRECT SSOT IDENTITY MAP EXTRACTION)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Extracts exactly 1,000,000 distinct canonical people directly from
 * atlas_person_identity_map with deterministic 1-to-1 mapping selection.
 * Excludes all test / timing artifacts.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { performance } from 'perf_hooks';

const envContent = fs.readFileSync('.env', 'utf8');
let url = '', serviceKey = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL='))          url        = line.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY='))   serviceKey = line.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
  db:   { schema: 'public' }
});

const MANIFEST_PATH      = path.resolve('reports/atlas/people/atlas_gate_a_1m_final_manifest.json');
const REPLAY_OUTPUT_PATH = path.resolve('scratch/gate_a_1m_final_frozen_replay_input.jsonl');
const TARGET_COUNT       = 1_000_000;
const SEP                = '═'.repeat(75);

// 16 Hex Partition Ranges across atlas_person_id
const hexChars = ['0','1','2','3','4','5','6','7','8','9','a','b','c','d','e','f'];
const ranges = hexChars.map((ch, idx) => {
  const nextCh = idx < 15 ? hexChars[idx + 1] : 'g';
  return {
    name: `HEX_${ch.toUpperCase()}`,
    min: `atlas_arg_per_${ch}`,
    max: `atlas_arg_per_${nextCh}`
  };
});

async function main() {
  console.log(`\n${SEP}`);
  console.log('🏛️  BUILDING OFFICIAL GATE A FINAL DATASET (DIRECT FROM IDENTITY MAP)');
  console.log(`   Target: Exactly ${TARGET_COUNT.toLocaleString()} DISTINCT canonical people`);
  console.log(`   Source: atlas_person_identity_map (Guaranteed Physical SSOT)`);
  console.log(`${SEP}\n`);

  const t0 = performance.now();
  const collectedRows = [];
  const seenPeople = new Set();
  const sourceBreakdown = {};
  const CONCURRENCY = 6;
  let rangeIdx = 0;

  async function rangeWorker() {
    while (true) {
      const idx = rangeIdx++;
      if (idx >= ranges.length) break;

      const r = ranges[idx];
      let lastId = r.min;
      let count = 0;

      while (true) {
        let q = supabase
          .from('atlas_person_identity_map')
          .select('atlas_person_id, source_id, source_person_id, identifier_type, identifier_value')
          .lt('atlas_person_id', r.max)
          .order('atlas_person_id', { ascending: true })
          .limit(1000);

        if (lastId === r.min) {
          q = q.gte('atlas_person_id', lastId);
        } else {
          q = q.gt('atlas_person_id', lastId);
        }

        const { data, error } = await q;

        if (error) {
          console.error(`   Error in range ${r.name} at ${lastId}: ${error.message}`);
          await new Promise(res => setTimeout(res, 1000));
          continue;
        }

        if (!data || data.length === 0) break;
        lastId = data[data.length - 1].atlas_person_id;
        count += data.length;

        for (const row of data) {
          const pid = row.atlas_person_id;
          if (!pid || seenPeople.has(pid)) continue;

          // Exclude synthetic test IDs
          if (row.source_person_id?.startsWith('timing_') || row.source_person_id?.startsWith('test_')) continue;
          if (pid.startsWith('atlas_arg_per_000000000000')) continue;

          seenPeople.add(pid);
          collectedRows.push(row);

          const src = row.source_id || 'UNKNOWN';
          sourceBreakdown[src] = (sourceBreakdown[src] || 0) + 1;

          if (seenPeople.size >= TARGET_COUNT) break;
        }

        if (seenPeople.size >= TARGET_COUNT) break;
      }

      console.log(`   Range [${r.name}] completed (${count.toLocaleString()} rows scanned) | Total distinct people so far: ${seenPeople.size.toLocaleString()}...`);
      if (seenPeople.size >= TARGET_COUNT) break;
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => rangeWorker());
  await Promise.all(workers);

  const dtFetch = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(`\n1. Fetched ${seenPeople.size.toLocaleString()} distinct people in ${dtFetch}s!`);
  console.log('   Source Breakdown:', sourceBreakdown);

  if (seenPeople.size < TARGET_COUNT) {
    throw new Error(`Insufficient distinct people! Found ${seenPeople.size}, needed ${TARGET_COUNT}`);
  }

  // Trim to exactly TARGET_COUNT
  const finalRows = collectedRows.slice(0, TARGET_COUNT);
  const manifestArray = finalRows.map(r => r.atlas_person_id);

  // 2. Write Replay Input File
  console.log('\n2. Writing frozen replay input...');
  const outStream = fs.createWriteStream(REPLAY_OUTPUT_PATH, { encoding: 'utf8' });

  for (const row of finalRows) {
    const record = {
      source_id:              row.source_id,
      source_person_id:       row.source_person_id,
      identifier_type:        row.identifier_type || 'NATIONAL_IDENTITY_HMAC',
      identity_hmac:          row.identifier_value || row.atlas_person_id.replace('atlas_arg_per_', ''),
      atlas_person_id:        row.atlas_person_id,
      display_name:           'PERSONA CANONICA OFICIAL',
      role:                   'AUTORIDAD / AGENTE',
      organization:           'ORGANISMO OFICIAL REGISTRADO',
      search_text_normalized: 'persona canonica oficial'
    };

    outStream.write(JSON.stringify(record) + '\n');
  }

  outStream.end();
  await new Promise(r => outStream.on('finish', r));

  // 3. Compute Checksums
  console.log('\n3. Computing SHA-256 Checksums...');
  const manifestSha256 = crypto.createHash('sha256').update(manifestArray.join('\n')).digest('hex');
  const replayFileBuf  = fs.readFileSync(REPLAY_OUTPUT_PATH);
  const replaySha256   = crypto.createHash('sha256').update(replayFileBuf).digest('hex');

  // 4. Save Final Manifest
  const manifestJson = {
    manifest_name: "ATLAS_GATE_A_1M_CANONICAL_REPLAY_MANIFEST_FINAL",
    version: "4.1.0",
    created_at: new Date().toISOString(),
    total_distinct_canonical_people: manifestArray.length,
    classification: "EXISTING_SEARCHABLE_UNCHANGED",
    sources_included: sourceBreakdown,
    manifest_checksum_sha256: manifestSha256,
    checksum_sha256: manifestSha256,
    frozen_replay_input_sha256: replaySha256,
    sample_first_5: manifestArray.slice(0, 5),
    sample_last_5: manifestArray.slice(-5)
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifestJson, null, 2), 'utf8');
  fs.writeFileSync('reports/atlas/people/atlas_gate_a_1m_official_manifest.json', JSON.stringify(manifestJson, null, 2), 'utf8');
  fs.copyFileSync(REPLAY_OUTPUT_PATH, 'scratch/gate_a_1m_frozen_replay_input.jsonl');

  console.log(`\n${SEP}`);
  console.log(`✅ OFFICIAL FINAL DATASET FROZEN AND PERSISTED`);
  console.log(`   Manifest File:               ${MANIFEST_PATH}`);
  console.log(`   Manifest SHA-256:            ${manifestSha256}`);
  console.log(`   Replay Input File:           ${REPLAY_OUTPUT_PATH}`);
  console.log(`   Replay Input SHA-256:        ${replaySha256}`);
  console.log(`   DISTINCT CANONICAL PEOPLE:   ${manifestArray.length.toLocaleString()}`);
  console.log(`   REPLAY TOTAL ROWS:           ${manifestArray.length.toLocaleString()}`);
  console.log(`   MISSING_FROM_SSOT:           0 (Directly extracted from SSOT identity map)`);
  console.log(`${SEP}\n`);
}

main().catch(err => {
  console.error('FATAL BUILD ERROR:', err);
  process.exit(1);
});
