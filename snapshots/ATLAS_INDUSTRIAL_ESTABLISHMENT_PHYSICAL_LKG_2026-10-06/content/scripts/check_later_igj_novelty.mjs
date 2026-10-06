import fs from 'fs';
import readline from 'readline';
import { ExactBinaryExclusionAuthority } from './test_exact_exclusion_engine.mjs';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const dbConfig = parseDbUrl();

async function checkNovelty() {
  const engine = new ExactBinaryExclusionAuthority(8000000);
  const coldPool = new pg.Pool({ ...dbConfig, database: 'atlas_shadow_cold_gate', ssl: { rejectUnauthorized: false } });
  const client = await coldPool.connect();

  console.log('Loading prior gate ledger into binary authority...');
  const qLedger = await client.query('SELECT normalized_name FROM atlas_authority.global_t0_identity_ledger;');
  for (const r of qLedger.rows) {
    engine.addKey(r.normalized_name);
  }
  engine.build();
  client.release();
  await coldPool.end();

  console.log('Testing IGJ lines 500,000 to 520,000 for novelty...');
  const fileStream = fs.createReadStream('scratch/physical_sources/igj_autoridades_genero_202603.csv');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let lineNum = 0;
  let sampleCount = 0;
  let rejected = 0;
  let netNew = 0;

  for await (const line of rl) {
    lineNum++;
    if (lineNum < 500000) continue;
    if (lineNum > 520000) break;

    const parts = line.split('","').map(s => s.replace(/^"|"$/g, '').trim());
    if (parts.length < 6) continue;
    const name = parts[1].toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    sampleCount++;
    if (engine.has(name)) {
      rejected++;
    } else {
      netNew++;
    }
  }

  console.log(`Lines 500K-520K: Sample ${sampleCount.toLocaleString()} | Net New: ${netNew.toLocaleString()} (${((netNew/sampleCount)*100).toFixed(1)}%) | Rejected: ${rejected.toLocaleString()}`);
}

checkNovelty().catch(console.error);
