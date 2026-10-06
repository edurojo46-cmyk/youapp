import fs from 'node:fs';
import pg from 'pg';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { IdentityInductionField } from './lib/identity_field.mjs';
import { streamChunkedCandidates, normalizeName } from './chunked_source_reader.mjs';

dotenv.config();

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const BATCH_SIZE = 2000;

async function runMatchedCohort(useRpc, startLine) {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();
  const field = IdentityInductionField.loadFromFile('cache_gate31d/identity_field_perf_1m30.bin');

  let batchData = [];
  for await (const b of streamChunkedCandidates(SOURCE_FILE, { startLine, limit: BATCH_SIZE, batchSize: BATCH_SIZE })) {
    batchData = b;
    break;
  }

  // Precompute / resolve decisions
  const possiblyPresentList = [];
  const definitelyAbsentList = [];

  for (const cand of batchData) {
    const candidatePayload = {
      source_id: cand.source_id,
      source_person_id: cand.source_person_id,
      identifier_value: cand.identifier_value
    };
    field.reserveInFlight('bench_worker', candidatePayload);
    const classification = field.classifyCandidate(candidatePayload, 'bench_worker');
    if (classification.classification === 'DEFINITELY_ABSENT') {
      cand.targetAtlasId = `atlas_arg_per_${crypto.randomBytes(8).toString('hex')}`;
      cand.isNew = true;
      cand.decision = 'NEW';
      definitelyAbsentList.push(cand);
    } else {
      possiblyPresentList.push(cand);
    }
  }

  if (possiblyPresentList.length > 0) {
    const hmacs = possiblyPresentList.map(c => c.identifier_value);
    hmacs.sort();
    const exRes = await client.query(`
      SELECT identifier_value, atlas_person_id
      FROM public.atlas_person_identity_map
      WHERE identifier_type = 'NATIONAL_IDENTITY_HMAC'
      AND identifier_value = ANY($1::text[])
    `, [hmacs]);
    const exMap = new Map(exRes.rows.map(r => [r.identifier_value, r.atlas_person_id]));
    for (const cand of possiblyPresentList) {
      const match = exMap.get(cand.identifier_value);
      if (match) {
        cand.targetAtlasId = match;
        cand.isNew = false;
        cand.decision = 'MERGE';
      } else {
        cand.targetAtlasId = `atlas_arg_per_${crypto.randomBytes(8).toString('hex')}`;
        cand.isNew = true;
        cand.decision = 'NEW';
      }
    }
  }

  // Prepare arrays
  const mapIds = [], mapSources = [], mapPersonIds = [], mapTypes = [], mapValues = [], mapEvidences = [], mapConfidences = [], mapResolutions = [];
  const outboxIds = [], outboxSources = [], outboxRecords = [], outboxPayloads = [], outboxVersions = [], outboxStatuses = [], outboxAttempts = [];
  const decisions = [];

  let localNew = 0, localMerged = 0;
  for (const cand of batchData) {
    if (cand.isNew) localNew++;
    else localMerged++;

    mapIds.push(cand.targetAtlasId);
    mapSources.push(cand.source_id);
    mapPersonIds.push(cand.source_person_id);
    mapTypes.push('NATIONAL_IDENTITY_HMAC');
    mapValues.push(cand.identifier_value);
    mapEvidences.push('ev_arca_' + cand.source_person_id);
    mapConfidences.push(1.0);
    mapResolutions.push('DETERMINISTIC');

    const payload = {
      atlas_person_id: cand.targetAtlasId,
      display_name: cand.raw_name,
      display_name_normalized: cand.name_norm,
      search_text_normalized: cand.name_norm,
      source_id: cand.source_id,
      source_record_id: cand.source_person_id
    };

    outboxIds.push(cand.targetAtlasId);
    outboxSources.push(cand.source_id);
    outboxRecords.push(cand.source_person_id);
    outboxPayloads.push(JSON.stringify(payload));
    outboxVersions.push(1);
    outboxStatuses.push('PENDING');
    outboxAttempts.push(0);

    decisions.push(cand.decision);
  }

  let txDurationMs = 0;
  let roundTrips = 0;

  if (useRpc) {
    // 1 single client invocation
    roundTrips = 1;
    const t0 = performance.now();
    const rpcRes = await client.query(`
      SELECT * FROM public.atlas_ingest_batch_rpc(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
        $6::text[], $7::numeric[], $8::text[],
        $9::text[], $10::text[], $11::text[], $12::jsonb[],
        $13::int[], $14::text[], $15::int[],
        $16::text[]
      )
    `, [
      mapIds, mapSources, mapPersonIds, mapTypes, mapValues,
      mapEvidences, mapConfidences, mapResolutions,
      outboxIds, outboxSources, outboxRecords, outboxPayloads,
      outboxVersions, outboxStatuses, outboxAttempts,
      decisions
    ]);
    txDurationMs = performance.now() - t0;
    console.log('[RPC Result]', rpcRes.rows[0]);
  } else {
    // Legacy 2-statement path with BEGIN and COMMIT
    roundTrips = 4; // BEGIN, ID_INSERT, OUTBOX_INSERT, COMMIT
    const t0 = performance.now();
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO public.atlas_person_identity_map (
        atlas_person_id, source_id, source_person_id, identifier_type, identifier_value,
        evidence_id, confidence, resolution_method, observed_at
      )
      SELECT * FROM UNNEST(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
        $6::text[], $7::numeric[], $8::text[], array_fill(NOW(), ARRAY[cardinality($1::text[])])
      )
      ON CONFLICT (source_id, source_person_id) DO NOTHING
    `, [mapIds, mapSources, mapPersonIds, mapTypes, mapValues, mapEvidences, mapConfidences, mapResolutions]);

    await client.query(`
      INSERT INTO public.atlas_search_outbox (
        atlas_person_id, source_id, source_record_id, payload, payload_version, status, attempt_count
      )
      SELECT * FROM UNNEST(
        $1::text[], $2::text[], $3::text[], $4::jsonb[], $5::int[], $6::text[], $7::int[]
      )
      ON CONFLICT (source_id, source_record_id) DO NOTHING
    `, [outboxIds, outboxSources, outboxRecords, outboxPayloads, outboxVersions, outboxStatuses, outboxAttempts]);

    await client.query('COMMIT');
    txDurationMs = performance.now() - t0;
  }

  const newSec = Number((localNew / (txDurationMs / 1000)).toFixed(2));
  const candSec = Number((batchData.length / (txDurationMs / 1000)).toFixed(2));

  client.release();
  await pool.end();

  return {
    useRpc,
    candidates: batchData.length,
    localNew,
    localMerged,
    roundTrips,
    txDurationMs: Number(txDurationMs.toFixed(1)),
    newSec,
    candSec
  };
}

async function main() {
  console.log('================================================================');
  console.log('⚡ BENCHMARK: SERVER-SIDE BATCH RPC vs LEGACY TWO-STATEMENT');
  console.log('================================================================\n');

  console.log('1. Running LEGACY path on 2,000 candidates (lines 2,845,000 to 2,847,000)...');
  const legacyResult = await runMatchedCohort(false, 2845000);
  console.log('LEGACY Result:', legacyResult);

  console.log('\n2. Running RPC path on 2,000 candidates (lines 2,847,000 to 2,849,000)...');
  const rpcResult = await runMatchedCohort(true, 2847000);
  console.log('RPC Result:', rpcResult);

  const speedup = Number((legacyResult.txDurationMs / rpcResult.txDurationMs).toFixed(2));
  const throughputSpeedup = Number((rpcResult.newSec / legacyResult.newSec).toFixed(2));

  console.log('\n================================================================');
  console.log('🏆 SERVER-SIDE BATCH RPC PERFORMANCE GATE RESULTS');
  console.log('================================================================');
  console.log('LEGACY_ROUND_TRIPS_PER_BATCH:', legacyResult.roundTrips);
  console.log('RPC_ROUND_TRIPS_PER_BATCH   :', rpcResult.roundTrips);
  console.log('LEGACY_TRANSACTION_MS       :', legacyResult.txDurationMs);
  console.log('RPC_TRANSACTION_MS          :', rpcResult.txDurationMs);
  console.log('LEGACY_NEW_SEC              :', legacyResult.newSec);
  console.log('RPC_NEW_SEC                 :', rpcResult.newSec);
  console.log('LATENCY_SPEEDUP             :', speedup + 'x');
  console.log('THROUGHPUT_SPEEDUP          :', throughputSpeedup + 'x');
  console.log('SERVER_BATCH_RPC_SPEEDUP    :', throughputSpeedup);
  console.log('GATE STATUS                 :', throughputSpeedup > 1.0 ? 'PASS (RPC IS MEASURABLY FASTER)' : 'FAIL');
  console.log('================================================================\n');
}

main().catch(console.error);
