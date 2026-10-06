import pg from 'pg';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import { IdentityInductionField } from '../lib/identity_field.mjs';
import { streamChunkedCandidates } from '../chunked_source_reader.mjs';

dotenv.config();

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const BATCH_SIZE = 1750;
const LIMIT = 50000;
const START_LINE = 2865000;

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();
  const field = IdentityInductionField.loadFromFile('cache_gate31d/identity_field_perf_1m30.bin');

  console.log(`Profiling Fallback WAN cost on 50,000 candidates (Start line: ${START_LINE}, Batch: ${BATCH_SIZE})...`);

  let totalBatches = 0;
  let batchesRequiringFallback = 0;
  let totalFallbackCandidates = 0;
  let totalFallbackWallMs = 0;
  const fallbackClientTimes = [];

  let batch = [];
  let candidateCount = 0;

  for await (const b of streamChunkedCandidates(SOURCE_FILE, { startLine: START_LINE, limit: LIMIT, batchSize: BATCH_SIZE })) {
    totalBatches++;
    const possiblyPresent = [];

    for (const cand of b) {
      const payload = {
        source_id: cand.source_id,
        source_person_id: cand.source_person_id,
        identifier_value: cand.identifier_value
      };
      field.reserveInFlight('audit_worker', payload);
      const res = field.classifyCandidate(payload, 'audit_worker');
      if (res.classification !== 'DEFINITELY_ABSENT') {
        possiblyPresent.push(cand.identifier_value);
      }
    }

    if (possiblyPresent.length > 0) {
      batchesRequiringFallback++;
      totalFallbackCandidates += possiblyPresent.length;

      const hmacs = [...possiblyPresent].sort();
      const t0 = performance.now();
      await client.query(`
        SELECT identifier_value, atlas_person_id
        FROM public.atlas_person_identity_map
        WHERE identifier_type = 'NATIONAL_IDENTITY_HMAC'
        AND identifier_value = ANY($1::text[])
      `, [hmacs]);
      const dt = performance.now() - t0;
      totalFallbackWallMs += dt;
      fallbackClientTimes.push(dt);
    }
  }

  const networkFloorPerQuery = 169.70; // measured RTT floor
  const estimatedNetworkFloorTotal = batchesRequiringFallback * networkFloorPerQuery;
  const estimatedServerTimeTotal = Math.max(0, totalFallbackWallMs - estimatedNetworkFloorTotal);

  console.log('\n=== FALLBACK WAN PROFILE RESULTS (50,000 CANDIDATES) ===');
  console.log('TOTAL_BATCHES                    :', totalBatches);
  console.log('BATCHES_REQUIRING_FALLBACK       :', batchesRequiringFallback);
  console.log('FALLBACK_BATCH_PERCENT           :', ((batchesRequiringFallback / totalBatches) * 100).toFixed(1) + '%');
  console.log('FALLBACK_CANDIDATES              :', totalFallbackCandidates);
  console.log('FALLBACK_QUERY_COUNT             :', batchesRequiringFallback);
  console.log('FALLBACK_TOTAL_CLIENT_WALL_MS    :', Number(totalFallbackWallMs.toFixed(1)));
  console.log('FALLBACK_AVG_CLIENT_WALL_MS      :', batchesRequiringFallback > 0 ? Number((totalFallbackWallMs / batchesRequiringFallback).toFixed(1)) : 0);
  console.log('FALLBACK_NETWORK_FLOOR_MS        :', Number(estimatedNetworkFloorTotal.toFixed(1)));
  console.log('FALLBACK_SERVER_TIME_MS          :', Number(estimatedServerTimeTotal.toFixed(1)));
  console.log('FALLBACK_NETWORK_PERCENT         :', batchesRequiringFallback > 0 ? ((estimatedNetworkFloorTotal / totalFallbackWallMs) * 100).toFixed(1) + '%' : '0%');

  client.release();
  await pool.end();
}

main().catch(console.error);
