import pg from 'pg';
import { performance } from 'node:perf_hooks';
import dotenv from 'dotenv';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

function calcPercentiles(arr) {
  if (!arr || !arr.length) return { P50: 0, P95: 0, P99: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    P50: Number(sorted[Math.floor(sorted.length * 0.50)].toFixed(2)),
    P95: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
    P99: Number(sorted[Math.floor(sorted.length * 0.99)].toFixed(2))
  };
}

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });
  const client = await pool.connect();

  console.log('Starting 100 iterations of SELECT $1 against Supabase connection ...');
  // Warmup
  for (let i = 0; i < 5; i++) {
    await client.query('SELECT $1::int as v', [i]);
  }

  const rtts = [];
  for (let i = 0; i < 100; i++) {
    const t0 = performance.now();
    await client.query('SELECT $1::int as v', [i]);
    const dt = performance.now() - t0;
    rtts.push(dt);
  }

  const p = calcPercentiles(rtts);
  const avg = Number((rtts.reduce((a, b) => a + b, 0) / rtts.length).toFixed(2));
  const min = Number(Math.min(...rtts).toFixed(2));
  const max = Number(Math.max(...rtts).toFixed(2));

  console.log('\n=== WAN RTT MEASUREMENT RESULTS (100 ITERATIONS) ===');
  console.log('DB_RTT_P50_MS:', p.P50);
  console.log('DB_RTT_P95_MS:', p.P95);
  console.log('DB_RTT_P99_MS:', p.P99);
  console.log('DB_RTT_AVG_MS:', avg);
  console.log('DB_RTT_MIN_MS:', min);
  console.log('DB_RTT_MAX_MS:', max);

  client.release();
  await pool.end();
}

main().catch(console.error);
