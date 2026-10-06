import pg from 'pg';
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

  console.log('Querying 5,000 published outbox rows to measure document payload sizes...');
  const res = await client.query(`
    SELECT payload
    FROM public.atlas_search_outbox
    WHERE status = 'PUBLISHED'
    LIMIT 5000
  `);

  const sizes = [];
  let totalBytes = 0;
  const fieldByteCounts = {};

  for (const row of res.rows) {
    const jsonStr = JSON.stringify(row.payload);
    const byteLen = Buffer.byteLength(jsonStr, 'utf8');
    sizes.push(byteLen);
    totalBytes += byteLen;

    for (const [k, v] of Object.entries(row.payload)) {
      const fieldBytes = Buffer.byteLength(k, 'utf8') + Buffer.byteLength(JSON.stringify(v), 'utf8') + 3; // key + val + formatting
      fieldByteCounts[k] = (fieldByteCounts[k] || 0) + fieldBytes;
    }
  }

  const p = calcPercentiles(sizes);
  const avg = Number((totalBytes / sizes.length).toFixed(2));
  const estimated100kBytes = avg * 100000;

  console.log('\n=== DOCUMENT PAYLOAD SIZE AUDIT (5,000 SAMPLE ROWS) ===');
  console.log('AVG_DOCUMENT_BYTES      :', avg, 'bytes');
  console.log('P50_DOCUMENT_BYTES      :', p.P50, 'bytes');
  console.log('P95_DOCUMENT_BYTES      :', p.P95, 'bytes');
  console.log('ESTIMATED_100K_BYTES    :', (estimated100kBytes / 1024 / 1024).toFixed(2), 'MB');
  console.log('\n--- FIELD BYTE BREAKDOWN (AVG PER DOC) ---');
  for (const [k, b] of Object.entries(fieldByteCounts)) {
    console.log(`- ${k.padEnd(25)}: ${(b / sizes.length).toFixed(1)} bytes`);
  }

  client.release();
  await pool.end();
}

main().catch(console.error);
