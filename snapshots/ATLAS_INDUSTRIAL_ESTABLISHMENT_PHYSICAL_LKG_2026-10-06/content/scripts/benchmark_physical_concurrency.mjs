import dotenv from 'dotenv';
dotenv.config();
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { ConstitutionalCertificationGateway } from '../src/lib/atlasIntelligence/ConstitutionalCertificationGateway.ts';

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

async function testPhysicalConcurrency(concurrencyLevel, candidateSample) {
  const poolConfig = {
    ...parseDbUrl(),
    max: concurrencyLevel + 4,
    idleTimeoutMillis: 15000,
    connectionTimeoutMillis: 10000
  };
  const pool = new pg.Pool(poolConfig);
  const gateway = ConstitutionalCertificationGateway.getInstance();

  const latencies = [];
  let certifiedCount = 0;
  let errorCount = 0;
  let fingerprintErrors = 0;

  const chunks = Array.from({ length: concurrencyLevel }, () => []);
  candidateSample.forEach((c, idx) => {
    chunks[idx % concurrencyLevel].push(c);
  });

  const startTime = Date.now();

  await Promise.all(
    chunks.map(async (chunk) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const row of chunk) {
          const res = await gateway.certifyProductRelation(
            client,
            {
              productId: row.product_id,
              tenantId: row.tenant_id,
              name: row.name,
              category: row.category,
              description: row.description,
              rawAttributes: row.attributes_json,
              missionScope: 'BUSCADOR_INDUSTRIAL'
            },
            { shadowMode: false } // Real physical insert + update
          );

          if (res.fingerprintError) fingerprintErrors++;
          if (res.certified) certifiedCount++;
          latencies.push(res.latencyMs || 0);
        }
        await client.query('ROLLBACK'); // Rollback so canary does not commit test rows
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        errorCount++;
      } finally {
        client.release();
      }
    })
  );

  const durationMs = Date.now() - startTime;
  await pool.end();

  const throughput = parseFloat((candidateSample.length / (durationMs / 1000)).toFixed(2));
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);

  return {
    concurrency: concurrencyLevel,
    sampleSize: candidateSample.length,
    durationMs,
    throughput,
    p50,
    p95,
    fingerprintErrors,
    errorCount,
    certifiedCount
  };
}

async function runBenchmark() {
  console.log('=============================================================');
  console.log('PHYSICAL DB CONCURRENCY BENCHMARK (18 vs 24 vs 32)');
  console.log('=============================================================');

  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();

  const res = await client.query(`
    SELECT product_id, tenant_id, name, category, description, attributes_json
    FROM public.atlas_products
    WHERE status = 'ACTIVE'
      AND attributes_json ? 'category'
      AND (attributes_json->'constitutional_authorization'->>'constitution_decision_id' IS NULL)
    LIMIT 150;
  `);

  client.release();
  await pool.end();

  const candidates = res.rows;
  console.log(`Fetched ${candidates.length} candidates for physical test.`);

  console.log('\n--- Testing C=18 (Physical Writes in Rollback) ---');
  const res18 = await testPhysicalConcurrency(18, candidates);
  console.log(`C=18: Throughput=${res18.throughput} certs/s | P50=${res18.p50}ms | P95=${res18.p95}ms | FP_Errors=${res18.fingerprintErrors} | Errors=${res18.errorCount}`);

  console.log('\n--- Testing C=24 (Physical Writes in Rollback) ---');
  const res24 = await testPhysicalConcurrency(24, candidates);
  console.log(`C=24: Throughput=${res24.throughput} certs/s | P50=${res24.p50}ms | P95=${res24.p95}ms | FP_Errors=${res24.fingerprintErrors} | Errors=${res24.errorCount}`);

  console.log('\n--- Testing C=32 (Physical Writes in Rollback) ---');
  const res32 = await testPhysicalConcurrency(32, candidates);
  console.log(`C=32: Throughput=${res32.throughput} certs/s | P50=${res32.p50}ms | P95=${res32.p95}ms | FP_Errors=${res32.fingerprintErrors} | Errors=${res32.errorCount}`);

  console.log('\nResults summary:');
  console.log(JSON.stringify({ res18, res24, res32 }, null, 2));
}

runBenchmark().catch(console.error);
