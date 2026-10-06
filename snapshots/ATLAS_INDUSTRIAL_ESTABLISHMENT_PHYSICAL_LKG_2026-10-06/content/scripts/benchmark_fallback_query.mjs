import pg from 'pg';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool(parseDbUrl());

function calcPercentiles(arr) {
  if (!arr.length) return { P50: 0, P95: 0, P99: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    P50: Number(sorted[Math.floor(sorted.length * 0.50)].toFixed(2)),
    P95: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
    P99: Number(sorted[Math.floor(sorted.length * 0.99)].toFixed(2))
  };
}

async function main() {
  console.log('================================================================');
  console.log('⚡ BENCHMARK: FALLBACK QUERY ANY($1) vs JOIN UNNEST($1)');
  console.log('================================================================\n');

  // 1. Get ~100 existing HMACs and generate ~100 random HMACs (typical batch mix: 50% hit, 50% miss)
  const existingSample = await pool.query(`
    SELECT identifier_value 
    FROM atlas_person_identity_map 
    WHERE identifier_type = 'NATIONAL_IDENTITY_HMAC' 
    LIMIT 50
  `);
  const sampleHmacs = existingSample.rows.map(r => r.identifier_value);
  for (let i = 0; i < 50; i++) {
    sampleHmacs.push(crypto.randomBytes(32).toString('hex'));
  }
  // Total ~100 fallback candidates (typical fallback count per 2000 batch)
  console.log(`Generated test batch of ${sampleHmacs.length} HMAC candidates (~5% of 2000 batch).`);

  // Run EXPLAIN (ANALYZE, BUFFERS) for ANY($1)
  const explainAny = await pool.query(`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT identifier_value, atlas_person_id
    FROM public.atlas_person_identity_map
    WHERE identifier_type = 'NATIONAL_IDENTITY_HMAC'
    AND identifier_value = ANY($1::text[])
  `, [sampleHmacs]);
  console.log('\n--- EXPLAIN (ANALYZE, BUFFERS) FOR ANY($1) ---');
  console.log(explainAny.rows.map(r => r['QUERY PLAN']).join('\n'));

  // Run EXPLAIN (ANALYZE, BUFFERS) for JOIN UNNEST($1)
  const explainUnnest = await pool.query(`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT m.identifier_value, m.atlas_person_id
    FROM unnest($1::text[]) AS u(val)
    JOIN public.atlas_person_identity_map m
      ON m.identifier_type = 'NATIONAL_IDENTITY_HMAC'
     AND m.identifier_value = u.val
  `, [sampleHmacs]);
  console.log('\n--- EXPLAIN (ANALYZE, BUFFERS) FOR JOIN UNNEST($1) ---');
  console.log(explainUnnest.rows.map(r => r['QUERY PLAN']).join('\n'));

  // Run repeated benchmark: 50 iterations each
  const ITERATIONS = 50;
  const anyLatencies = [];
  const unnestLatencies = [];

  // Warm up
  for (let i = 0; i < 5; i++) {
    await pool.query(`
      SELECT identifier_value, atlas_person_id
      FROM public.atlas_person_identity_map
      WHERE identifier_type = 'NATIONAL_IDENTITY_HMAC'
      AND identifier_value = ANY($1::text[])
    `, [sampleHmacs]);
    await pool.query(`
      SELECT m.identifier_value, m.atlas_person_id
      FROM unnest($1::text[]) AS u(val)
      JOIN public.atlas_person_identity_map m
        ON m.identifier_type = 'NATIONAL_IDENTITY_HMAC'
       AND m.identifier_value = u.val
    `, [sampleHmacs]);
  }

  // Benchmark ANY($1)
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    await pool.query(`
      SELECT identifier_value, atlas_person_id
      FROM public.atlas_person_identity_map
      WHERE identifier_type = 'NATIONAL_IDENTITY_HMAC'
      AND identifier_value = ANY($1::text[])
    `, [sampleHmacs]);
    anyLatencies.push(performance.now() - t0);
  }

  // Benchmark JOIN UNNEST($1)
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    await pool.query(`
      SELECT m.identifier_value, m.atlas_person_id
      FROM unnest($1::text[]) AS u(val)
      JOIN public.atlas_person_identity_map m
        ON m.identifier_type = 'NATIONAL_IDENTITY_HMAC'
       AND m.identifier_value = u.val
    `, [sampleHmacs]);
    unnestLatencies.push(performance.now() - t0);
  }

  const pAny = calcPercentiles(anyLatencies);
  const pUnnest = calcPercentiles(unnestLatencies);

  console.log('\n=== BENCHMARK RESULTS (50 runs each) ===');
  console.log('ANY($1):        P50 =', pAny.P50, 'ms | P95 =', pAny.P95, 'ms | P99 =', pAny.P99, 'ms');
  console.log('JOIN UNNEST($1): P50 =', pUnnest.P50, 'ms | P95 =', pUnnest.P95, 'ms | P99 =', pUnnest.P99, 'ms');
  console.log(`Speedup factor: ${(pAny.P50 / pUnnest.P50).toFixed(2)}x`);

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
