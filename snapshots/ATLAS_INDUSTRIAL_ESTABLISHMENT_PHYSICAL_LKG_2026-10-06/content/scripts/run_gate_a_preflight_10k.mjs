/**
 * scripts/run_gate_a_preflight_10k.mjs
 * 
 * PREFLIGHT 10K: Verifies that replaying the first 10,000 rows of the frozen replay dataset
 * produces STRICTLY ZERO new canonical people, ZERO outbox events, and ZERO pipeline errors.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { performance } from 'perf_hooks';
import { createClient } from '@supabase/supabase-js';

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

const { AtlasPeopleSearchV2 } = await import('../src/lib/search/AtlasPeopleSearchV2.ts');

const REPLAY_FILE = path.resolve('scratch/gate_a_1m_frozen_replay_input.jsonl');
const BLOCK_SIZE  = 2500;
const TEST_ROWS   = 10000;
const SEP         = '═'.repeat(70);

async function main() {
  console.log(`\n${SEP}`);
  console.log(`🧪 ATLAS GATE A — PREFLIGHT 10K VERIFICATION`);
  console.log(`   Source: ${REPLAY_FILE}`);
  console.log(`   Testing 10,000 frozen rows for 0 new canonical / 0 outbox`);
  console.log(`${SEP}\n`);

  // Clean staging before
  await supabase.rpc('atlas_reconcile_and_commit_staging_v3', { p_run_id: 'preflight_10k', p_block_id: 0 });
  await supabase.rpc('atlas_reconcile_and_commit_staging_v3', { p_run_id: 'preflight_10k', p_block_id: 1 });

  const fileStream = fs.createReadStream(REPLAY_FILE, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let blockId = 0;
  let currentBlock = [];
  let totalRows = 0;
  let newCanonicalTotal = 0;
  let outboxCreatedTotal = 0;
  let pipelineErrors = 0;
  const blockDurations = [];

  const t0 = performance.now();

  for await (const line of rl) {
    if (!line.trim()) continue;
    const record = JSON.parse(line);
    currentBlock.push(record);
    totalRows++;

    if (currentBlock.length >= BLOCK_SIZE) {
      blockId++;
      const stageRows = currentBlock;
      currentBlock = [];

      const t0B = performance.now();
      const { error: stageErr } = await supabase.rpc('atlas_stage_people_bulk_v2', {
        p_run_id: 'preflight_10k',
        p_block_id: blockId,
        p_rows: stageRows
      });

      if (stageErr) {
        pipelineErrors++;
        console.error(`  Stage Error B${blockId}: ${stageErr.message}`);
      }

      const { data: recData, error: recErr } = await supabase.rpc('atlas_reconcile_and_commit_staging_v3', {
        p_run_id: 'preflight_10k',
        p_block_id: blockId
      });

      if (recErr) {
        pipelineErrors++;
        console.error(`  Reconcile Error B${blockId}: ${recErr.message}`);
      } else {
        const dtB = performance.now() - t0B;
        blockDurations.push(dtB);
        const insNew = recData?.inserted_new || 0;
        const outbox = recData?.outbox_produced || 0;
        newCanonicalTotal += insNew;
        outboxCreatedTotal += outbox;

        console.log(`  [Block ${blockId}] Staged: ${stageRows.length} | Duration: ${dtB.toFixed(1)}ms | New Canonical: ${insNew} | Outbox Produced: ${outbox}`);
      }

      if (totalRows >= TEST_ROWS) break;
    }
  }

  const elapsedSec = (performance.now() - t0) / 1000;
  const uniqueRate = Number((totalRows / elapsedSec).toFixed(1));
  const avgBlockMs = Number((blockDurations.reduce((a, b) => a + b, 0) / blockDurations.length).toFixed(1));

  // Test search probe
  const searchRes = await AtlasPeopleSearchV2.search({ query: 'FERNANDEZ', limit: 5 });
  console.log(`\n  Search Probe Latency: ${searchRes.db_query_ms}ms (DB), ${searchRes.api_total_ms}ms (Total) | Results: ${searchRes.results.length}`);

  const pass = (newCanonicalTotal === 0 && outboxCreatedTotal === 0 && pipelineErrors === 0);

  console.log(`\n${SEP}`);
  console.log(`🏁 PREFLIGHT 10K RESULTS:`);
  console.log(`   Total Rows Processed:   ${totalRows.toLocaleString()}`);
  console.log(`   Elapsed Time:           ${elapsedSec.toFixed(2)}s`);
  console.log(`   Throughput:             ${uniqueRate.toLocaleString()} people/s`);
  console.log(`   Avg Block Duration:     ${avgBlockMs}ms`);
  console.log(`   New Canonical People:   ${newCanonicalTotal} [Requirement = 0]`);
  console.log(`   Outbox Events Created:  ${outboxCreatedTotal} [Requirement = 0]`);
  console.log(`   Pipeline Errors:        ${pipelineErrors} [Requirement = 0]`);
  console.log(`   Preflight Status:       ${pass ? '✅ PASS — READY FOR GATE A ATTEMPT 2' : '❌ FAIL — HARD STOP'}`);
  console.log(`${SEP}\n`);

  if (!pass) process.exit(1);
}

main().catch(err => {
  console.error('FATAL PREFLIGHT ERROR:', err);
  process.exit(1);
});
