import fs from 'node:fs';
import pg from 'pg';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const SHADOW_TABLE = 'public.atlas_person_identity_map_shadow';
const BASELINE_RECORDS = 50000;
const TEST_CANDIDATE_COUNT = 10000;
const BATCH_SIZE = 2000;

async function setupShadowTable(pool) {
  console.log(`Creating shadow table ${SHADOW_TABLE}...`);
  await pool.query(`DROP TABLE IF EXISTS ${SHADOW_TABLE} CASCADE`);
  await pool.query(`
    CREATE TABLE ${SHADOW_TABLE} (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      atlas_person_id text NOT NULL,
      source_id text NOT NULL,
      source_person_id text NOT NULL,
      identifier_type text NOT NULL,
      identifier_value text NOT NULL,
      evidence_id text,
      confidence double precision,
      resolution_method text,
      observed_at timestamp with time zone DEFAULT now(),
      CONSTRAINT uq_shadow_source UNIQUE (source_id, source_person_id)
    )
  `);

  await pool.query(`CREATE INDEX idx_shadow_atlas_person_id ON ${SHADOW_TABLE} (atlas_person_id)`);
  await pool.query(`CREATE INDEX idx_shadow_identifier ON ${SHADOW_TABLE} (identifier_type, identifier_value)`);

  console.log(`Populating ${BASELINE_RECORDS} baseline records into ${SHADOW_TABLE}...`);
  const chunkSize = 5000;
  for (let c = 0; c < BASELINE_RECORDS; c += chunkSize) {
    const pids = [], sids = [], spids = [], types = [], vals = [];
    for (let i = 0; i < chunkSize; i++) {
      const idx = c + i;
      pids.push(`atlas_base_${idx}`);
      sids.push('ARCA_CONDICION_TRIBUTARIA');
      spids.push(`rec_base_${idx}`);
      types.push('NATIONAL_IDENTITY_HMAC');
      vals.push(crypto.createHash('sha256').update(`base_hmac_${idx}`).digest('hex'));
    }
    await pool.query(`
      INSERT INTO ${SHADOW_TABLE} (atlas_person_id, source_id, source_person_id, identifier_type, identifier_value)
      SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])
    `, [pids, sids, spids, types, vals]);
  }
  console.log('Baseline records loaded and indexed.');
}

async function getWalBytes(pool) {
  const res = await pool.query(`SELECT wal_bytes FROM pg_stat_wal`);
  return BigInt(res.rows[0].wal_bytes);
}

async function getIndexIoStats(pool) {
  const res = await pool.query(`
    SELECT indexrelname, idx_blks_read, idx_blks_hit
    FROM pg_statio_user_indexes
    WHERE relname = 'atlas_person_identity_map_shadow'
  `);
  const map = {};
  for (const row of res.rows) {
    map[row.indexrelname] = {
      read: parseInt(row.idx_blks_read || '0', 10),
      hit: parseInt(row.idx_blks_hit || '0', 10)
    };
  }
  return map;
}

// Generate identical 10,000 candidate dataset for all variants
function generateCandidates(count) {
  const candidates = [];
  for (let i = 0; i < count; i++) {
    const cuit = `20${String(10000000 + i).padStart(8, '0')}9`;
    const dni = String(10000000 + i);
    candidates.push({
      atlas_person_id: `atlas_test_${crypto.randomBytes(6).toString('hex')}`,
      source_id: 'ARCA_CONDICION_TRIBUTARIA',
      source_person_id: `rec_arca_${cuit}`,
      identifier_type: 'NATIONAL_IDENTITY_HMAC',
      identifier_value: crypto.createHash('sha256').update(`ARG:DNI:${dni}`).digest('hex'),
      evidence_id: `ev_arca_rec_arca_${cuit}`,
      confidence: 1.0,
      resolution_method: 'DETERMINISTIC_CUIT_DNI_HMAC'
    });
  }
  return candidates;
}

async function runVariantTest(pool, variantName, candidates, sortFn) {
  console.log(`\nTesting Variant: ${variantName}...`);
  // Reset shadow table to exact baseline state by deleting any test records added previously
  await pool.query(`DELETE FROM ${SHADOW_TABLE} WHERE source_person_id LIKE 'rec_arca_%'`);
  await pool.query(`VACUUM ${SHADOW_TABLE}`);

  // Create deep copy of candidates
  const testCandidates = candidates.map(c => ({ ...c }));

  // Split into batches of BATCH_SIZE
  const batches = [];
  for (let i = 0; i < testCandidates.length; i += BATCH_SIZE) {
    const b = testCandidates.slice(i, i + BATCH_SIZE);
    if (sortFn) {
      b.sort(sortFn);
    }
    batches.push(b);
  }

  // Pre-snapshot WAL and Index I/O
  const walBefore = await getWalBytes(pool);
  const ioBefore = await getIndexIoStats(pool);

  let totalIdentityWriteMs = 0;
  let totalBatchMs = 0;
  const t0 = performance.now();

  for (const b of batches) {
    const pids = b.map(c => c.atlas_person_id);
    const sids = b.map(c => c.source_id);
    const spids = b.map(c => c.source_person_id);
    const types = b.map(c => c.identifier_type);
    const vals = b.map(c => c.identifier_value);
    const evids = b.map(c => c.evidence_id);
    const confs = b.map(c => c.confidence);
    const resols = b.map(c => c.resolution_method);

    const tBatch0 = performance.now();
    await pool.query('BEGIN');
    const tWrite0 = performance.now();

    await pool.query(`
      INSERT INTO ${SHADOW_TABLE} (
        atlas_person_id, source_id, source_person_id, identifier_type, identifier_value,
        evidence_id, confidence, resolution_method, observed_at
      )
      SELECT * FROM UNNEST(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
        $6::text[], $7::float[], $8::text[], array_fill(NOW(), ARRAY[cardinality($1::text[])])
      )
      ON CONFLICT (source_id, source_person_id) DO NOTHING
    `, [pids, sids, spids, types, vals, evids, confs, resols]);

    const writeMs = performance.now() - tWrite0;
    await pool.query('COMMIT');
    const batchMs = performance.now() - tBatch0;

    totalIdentityWriteMs += writeMs;
    totalBatchMs += batchMs;
  }

  const wallTimeSec = (performance.now() - t0) / 1000;
  const walAfter = await getWalBytes(pool);
  const ioAfter = await getIndexIoStats(pool);

  const walDeltaBytes = Number(walAfter - walBefore);

  const indexDeltas = {};
  for (const idxName of Object.keys(ioAfter)) {
    const b = ioBefore[idxName] || { read: 0, hit: 0 };
    const a = ioAfter[idxName];
    indexDeltas[idxName] = {
      IDX_BLOCK_READ_DELTA: a.read - b.read,
      IDX_BLOCK_HIT_DELTA: a.hit - b.hit
    };
  }

  const NEW_SEC = Number((testCandidates.length / wallTimeSec).toFixed(1));
  const CAND_SEC = Number((testCandidates.length / wallTimeSec).toFixed(1));

  const result = {
    VARIANT: variantName,
    CANDIDATE_COUNT: testCandidates.length,
    IDENTITY_WRITE_MS: Number(totalIdentityWriteMs.toFixed(1)),
    TOTAL_BATCH_MS: Number(totalBatchMs.toFixed(1)),
    WALL_TIME_SEC: Number(wallTimeSec.toFixed(2)),
    NEW_SEC,
    CAND_SEC,
    WAL_BYTES_DELTA: walDeltaBytes,
    INDEX_IO_DELTAS: indexDeltas
  };

  console.log(`[${variantName}] WriteMs: ${result.IDENTITY_WRITE_MS}ms | NEW_SEC: ${result.NEW_SEC} | WAL: ${(result.WAL_BYTES_DELTA/1024/1024).toFixed(2)} MB`);
  return result;
}

async function main() {
  console.log('=============================================================');
  console.log('STEP 6: PG INSERT-ORDER CONTROLLED A/B/C/D BENCHMARK');
  console.log('=============================================================\n');

  const pool = new pg.Pool(parseDbUrl());
  try {
    await setupShadowTable(pool);
    const candidates = generateCandidates(TEST_CANDIDATE_COUNT);

    // Testing variants with rotated order: D -> B -> C -> A
    const variants = [
      {
        name: 'Variant_D_leading_index_order',
        sortFn: (a, b) => {
          if (a.source_id !== b.source_id) return a.source_id.localeCompare(b.source_id);
          return a.source_person_id.localeCompare(b.source_person_id);
        }
      },
      {
        name: 'Variant_B_sort_source_person_id',
        sortFn: (a, b) => a.source_person_id.localeCompare(b.source_person_id)
      },
      {
        name: 'Variant_C_sort_identifier_value',
        sortFn: (a, b) => a.identifier_value.localeCompare(b.identifier_value)
      },
      {
        name: 'Variant_A_current_unsorted',
        sortFn: null
      }
    ];

    const results = [];
    for (const v of variants) {
      const res = await runVariantTest(pool, v.name, candidates, v.sortFn);
      results.push(res);
    }

    // Clean up shadow table
    await pool.query(`DROP TABLE IF EXISTS ${SHADOW_TABLE}`);

    // Sort results by NEW_SEC desc
    const sortedResults = [...results].sort((a, b) => b.NEW_SEC - a.NEW_SEC);
    const bestVariant = sortedResults[0];
    const unsortedVariant = results.find(r => r.VARIANT === 'Variant_A_current_unsorted');
    const speedup = Number((bestVariant.NEW_SEC / unsortedVariant.NEW_SEC).toFixed(2));

    const finalReport = {
      timestamp: new Date().toISOString(),
      stage: 'atlas_perf_1m30_p2_pg_insert_order_abcd',
      METHODOLOGY: 'Production-fidelity isolated shadow table with identical 4 indexes and 50,000 baseline records. 100% identical test population reset between variants.',
      ROTATED_EXECUTION_ORDER: ['Variant_D', 'Variant_B', 'Variant_C', 'Variant_A'],
      results,
      BEST_PG_INSERT_ORDER: bestVariant.VARIANT,
      PG_IDENTITY_WRITE_SPEEDUP: speedup,
      RECOMMENDATION: speedup > 1.05 ? `Adopt ${bestVariant.VARIANT}` : 'Retain current order or negligible difference'
    };

    console.log('\n--- A/B/C/D INSERT ORDER RESULTS ---');
    console.log(JSON.stringify(finalReport, null, 2));

    fs.mkdirSync('reports/atlas/discovery', { recursive: true });
    fs.writeFileSync(
      'reports/atlas/discovery/atlas_perf_1m30_p2_pg_insert_order_abcd_v1.json',
      JSON.stringify(finalReport, null, 2)
    );

  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal A/B/C/D Error:', err);
  process.exit(1);
});
