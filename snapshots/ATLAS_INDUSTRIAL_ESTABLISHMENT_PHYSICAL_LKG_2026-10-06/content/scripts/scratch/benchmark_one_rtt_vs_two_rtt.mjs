import fs from 'node:fs';
import pg from 'pg';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import { streamChunkedCandidates } from '../chunked_source_reader.mjs';
import { IdentityInductionField } from '../lib/identity_field.mjs';

dotenv.config();

const SOURCE_FILE = process.env.SOURCE_FILE_PATH || 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const pool = new pg.Pool({ ...parseDbUrl(), max: 4 });

async function loadBatchCandidates(startLine, count) {
  const cands = [];
  for await (const batch of streamChunkedCandidates(SOURCE_FILE, { startLine, limit: count })) {
    cands.push(...batch);
    if (cands.length >= count) break;
  }
  return cands.slice(0, count);
}

async function benchmark() {
  console.log('================================================================');
  console.log('⚡ ATLAS V1.3: TRUE ONE-RTT VS TWO-CALL BENCHMARK');
  console.log('================================================================\n');

  const field = IdentityInductionField.loadFromFile('cache_gate31d/identity_field_perf_1m30.bin');

  const COHORT_SIZE = 10000;
  const BATCH_SIZE = 2000;

  // 1. Load fresh candidates for OLD test
  const startLineOld = 3250000;
  console.log(`Loading ${COHORT_SIZE} candidates starting at line ${startLineOld} for OLD (2-call) test...`);
  const oldCandidates = await loadBatchCandidates(startLineOld, COHORT_SIZE);

  // 2. Load fresh candidates for NEW test
  const startLineNew = 3260000;
  console.log(`Loading ${COHORT_SIZE} candidates starting at line ${startLineNew} for NEW (1-call) test...`);
  const newCandidates = await loadBatchCandidates(startLineNew, COHORT_SIZE);

  const client = await pool.connect();

  try {
    // -------------------------------------------------------------
    // RUN OLD PATH (2 wire calls per batch)
    // -------------------------------------------------------------
    console.log('\n--- RUNNING OLD PATH (Client Fallback + Ingest RPC: 2 DB calls) ---');
    const oldBatchDbTimes = [];
    const oldFallbackPlusRpcTimes = [];
    let oldNetNew = 0;
    const tOldStart = performance.now();

    for (let i = 0; i < oldCandidates.length; i += BATCH_SIZE) {
      const batch = oldCandidates.slice(i, i + BATCH_SIZE);
      const definitelyAbsent = [];
      const possiblyPresent = [];

      for (const cand of batch) {
        cand.targetAtlasId = `atlas_arg_per_${crypto.randomBytes(8).toString('hex')}`;
        const cls = field.classifyCandidate('W1', {
          source_id: 'ARCA_CONDICION_TRIBUTARIA',
          source_person_id: cand.source_person_id,
          identifier_value: cand.identifier_value
        });
        if (cls === 'DEFINITELY_ABSENT') {
          cand.isNew = true;
          cand.decision = 'NEW';
          definitelyAbsent.push(cand);
        } else {
          possiblyPresent.push(cand);
        }
      }

      const tDb0 = performance.now();
      let fbLookupMs = 0;

      // Call 1: Fallback lookup
      if (possiblyPresent.length > 0) {
        const tFb0 = performance.now();
        const hmacs = possiblyPresent.map(c => c.identifier_value);
        hmacs.sort();
        const exRes = await client.query(`
          SELECT identifier_value, atlas_person_id
          FROM public.atlas_person_identity_map
          WHERE identifier_type = 'NATIONAL_IDENTITY_HMAC'
            AND identifier_value = ANY($1::text[])
        `, [hmacs]);
        fbLookupMs = performance.now() - tFb0;

        const exMap = new Map(exRes.rows.map(r => [r.identifier_value, r.atlas_person_id]));
        for (const cand of possiblyPresent) {
          const matched = exMap.get(cand.identifier_value);
          if (matched) {
            cand.targetAtlasId = matched;
            cand.isNew = false;
            cand.decision = 'MERGE';
          } else {
            cand.isNew = true;
            cand.decision = 'NEW';
          }
        }
      }

      // Call 2: Ingest RPC
      const p_ids = batch.map(c => c.targetAtlasId);
      const p_sources = batch.map(() => 'ARCA_CONDICION_TRIBUTARIA');
      const p_person_ids = batch.map(c => c.source_person_id);
      const p_types = batch.map(() => 'NATIONAL_IDENTITY_HMAC');
      const p_values = batch.map(c => c.identifier_value);
      const p_evidences = batch.map(c => 'ev_' + c.source_person_id);
      const p_confidences = batch.map(() => 1.0);
      const p_resolutions = batch.map(() => 'DETERMINISTIC');
      const p_decisions = batch.map(c => c.decision);

      const p_outbox_ids = p_ids;
      const p_outbox_sources = p_sources;
      const p_outbox_records = p_person_ids;
      const p_outbox_payloads = batch.map(c => JSON.stringify({
        atlas_person_id: c.targetAtlasId,
        display_name: c.raw_name,
        display_name_normalized: c.name_norm,
        search_text_normalized: c.name_norm,
        source_id: 'ARCA_CONDICION_TRIBUTARIA',
        source_record_id: c.source_person_id
      }));
      const p_outbox_versions = batch.map(() => 1);
      const p_outbox_statuses = batch.map(() => 'PENDING');
      const p_outbox_attempts = batch.map(() => 0);

      const tRpc0 = performance.now();
      const rpcRes = await client.query(`
        SELECT * FROM public.atlas_ingest_batch_rpc(
          $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
          $6::text[], $7::numeric[], $8::text[],
          $9::text[], $10::text[], $11::text[], $12::jsonb[],
          $13::int[], $14::text[], $15::int[],
          $16::text[]
        );
      `, [
        p_ids, p_sources, p_person_ids, p_types, p_values,
        p_evidences, p_confidences, p_resolutions,
        p_outbox_ids, p_outbox_sources, p_outbox_records, p_outbox_payloads,
        p_outbox_versions, p_outbox_statuses, p_outbox_attempts,
        p_decisions
      ]);
      const rpcMs = performance.now() - tRpc0;
      const totalBatchDbMs = performance.now() - tDb0;

      oldNetNew += rpcRes.rows[0].new_count;
      oldBatchDbTimes.push(totalBatchDbMs);
      oldFallbackPlusRpcTimes.push(fbLookupMs + rpcMs);

      console.log(`  OLD Batch ${i / BATCH_SIZE + 1}: DB Wall = ${totalBatchDbMs.toFixed(1)} ms (FB=${fbLookupMs.toFixed(1)}ms, RPC=${rpcMs.toFixed(1)}ms)`);
    }

    const oldTotalWallSec = (performance.now() - tOldStart) / 1000;
    const oldNewSec = oldNetNew / oldTotalWallSec;

    // -------------------------------------------------------------
    // RUN NEW PATH (1 wire call per batch)
    // -------------------------------------------------------------
    console.log('\n--- RUNNING NEW PATH (Single Resolve & Ingest RPC: 1 DB call) ---');
    const newBatchDbTimes = [];
    const newResolveRpcTimes = [];
    let newNetNew = 0;
    const tNewStart = performance.now();

    for (let i = 0; i < newCandidates.length; i += BATCH_SIZE) {
      const batch = newCandidates.slice(i, i + BATCH_SIZE);

      for (const cand of batch) {
        cand.targetAtlasId = `atlas_arg_per_${crypto.randomBytes(8).toString('hex')}`;
        const cls = field.classifyCandidate('W1', {
          source_id: 'ARCA_CONDICION_TRIBUTARIA',
          source_person_id: cand.source_person_id,
          identifier_value: cand.identifier_value
        });
        cand.field_classification = (cls === 'DEFINITELY_ABSENT') ? 'DEFINITELY_ABSENT' : 'POSSIBLY_PRESENT';
      }

      const p_source_person_ids = batch.map(c => c.source_person_id);
      const p_identifier_types = batch.map(() => 'NATIONAL_IDENTITY_HMAC');
      const p_identifier_values = batch.map(c => c.identifier_value);
      const p_display_names = batch.map(c => c.raw_name);
      const p_name_norms = batch.map(c => c.name_norm);
      const p_field_classifications = batch.map(c => c.field_classification);
      const p_proposed_atlas_ids = batch.map(c => c.targetAtlasId);
      const p_evidence_ids = batch.map(c => 'ev_' + c.source_person_id);
      const p_confidences = batch.map(() => 1.0);
      const p_resolution_methods = batch.map(() => 'DETERMINISTIC');

      const tDb0 = performance.now();
      const rpcRes = await client.query(`
        SELECT * FROM public.atlas_resolve_and_ingest_batch_rpc(
          $1::text,
          $2::text[],
          $3::text[],
          $4::text[],
          $5::text[],
          $6::text[],
          $7::text[],
          $8::text[],
          $9::text[],
          $10::numeric[],
          $11::text[]
        );
      `, [
        'ARCA_CONDICION_TRIBUTARIA',
        p_source_person_ids,
        p_identifier_types,
        p_identifier_values,
        p_display_names,
        p_name_norms,
        p_field_classifications,
        p_proposed_atlas_ids,
        p_evidence_ids,
        p_confidences,
        p_resolution_methods
      ]);
      const totalBatchDbMs = performance.now() - tDb0;

      newNetNew += rpcRes.rows[0].new_count;
      newBatchDbTimes.push(totalBatchDbMs);
      newResolveRpcTimes.push(totalBatchDbMs);

      console.log(`  NEW Batch ${i / BATCH_SIZE + 1}: DB Wall = ${totalBatchDbMs.toFixed(1)} ms (Single RPC)`);
    }

    const newTotalWallSec = (performance.now() - tNewStart) / 1000;
    const newNewSec = newNetNew / newTotalWallSec;

    const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;

    const oldAvgDbMs = avg(oldBatchDbTimes);
    const newAvgDbMs = avg(newBatchDbTimes);
    const oldAvgFbRpcMs = avg(oldFallbackPlusRpcTimes);
    const newAvgResolveRpcMs = avg(newResolveRpcTimes);
    const speedup = oldAvgDbMs / newAvgDbMs;

    console.log('\n================================================================');
    console.log('ONE-RTT BENCHMARK COMPARISON RESULTS');
    console.log('================================================================');
    console.log(`OLD_TOTAL_DB_CALLS_PER_BATCH : 2`);
    console.log(`NEW_TOTAL_DB_CALLS_PER_BATCH : 1`);
    console.log(`OLD_BATCH_DB_WALL_MS         : ${oldAvgDbMs.toFixed(2)} ms`);
    console.log(`NEW_BATCH_DB_WALL_MS         : ${newAvgDbMs.toFixed(2)} ms`);
    console.log(`OLD_FALLBACK_PLUS_RPC_MS     : ${oldAvgFbRpcMs.toFixed(2)} ms`);
    console.log(`NEW_RESOLVE_RPC_MS           : ${newAvgResolveRpcMs.toFixed(2)} ms`);
    console.log(`SINGLE_RESOLVE_RPC_SPEEDUP   : ${speedup.toFixed(2)}x`);
    console.log(`OLD_NEW_SEC                  : ${oldNewSec.toFixed(2)}`);
    console.log(`NEW_NEW_SEC                  : ${newNewSec.toFixed(2)}`);
    console.log('================================================================\n');

    const result = {
      OLD_TOTAL_DB_CALLS_PER_BATCH: 2,
      NEW_TOTAL_DB_CALLS_PER_BATCH: 1,
      OLD_BATCH_DB_WALL_MS: oldAvgDbMs,
      NEW_BATCH_DB_WALL_MS: newAvgDbMs,
      OLD_FALLBACK_PLUS_RPC_MS: oldAvgFbRpcMs,
      NEW_RESOLVE_RPC_MS: newAvgResolveRpcMs,
      SINGLE_RESOLVE_RPC_SPEEDUP: speedup,
      OLD_NEW_SEC: oldNewSec,
      NEW_NEW_SEC: newNewSec
    };

    fs.writeFileSync('reports/atlas/discovery/atlas_perf_one_rtt_benchmark.json', JSON.stringify(result, null, 2));

  } finally {
    client.release();
    await pool.end();
  }
}

benchmark().catch(console.error);
