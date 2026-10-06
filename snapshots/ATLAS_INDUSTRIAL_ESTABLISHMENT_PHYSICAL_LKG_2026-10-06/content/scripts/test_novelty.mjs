import fs from 'fs';
import readline from 'readline';
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function scanOffsets() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });
  const client = await pool.connect();

  const slices = [0, 10000, 20000, 30000, 40000, 50000, 60000, 70000, 80000, 90000];
  const sliceSamples = {};
  slices.forEach(s => sliceSamples[s] = []);

  const rl = readline.createInterface({
    input: fs.createReadStream('scratch/real_candidates_sample_100k.jsonl'),
    crlfDelay: Infinity
  });

  let lineIdx = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    lineIdx++;
    for (const s of slices) {
      if (lineIdx > s && lineIdx <= s + 20) {
        sliceSamples[s].push(Buffer.from(JSON.parse(line).identity_hash_hex, 'hex'));
      }
    }
  }

  for (const s of slices) {
    const res = await client.query('SELECT count(*) FROM atlas_ingest_v2_shadow.atlas_identity_keys_v2 WHERE identity_hash = ANY($1)', [sliceSamples[s]]);
    console.log(`Offset ${s}: ${res.rows[0].count} / 20 existing in v2 cache`);
  }

  await client.release();
  await pool.end();
}
scanOffsets().catch(console.error);
