import fs from 'node:fs';
import readline from 'node:readline';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const pool = new pg.Pool(parseDbUrl());

const rl = readline.createInterface({
  input: fs.createReadStream('cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp'),
  crlfDelay: Infinity
});

let lineNum = 0;
let eligibleCount = 0;
const sampleCuits = [];

for await (const line of rl) {
  lineNum++;
  if (lineNum >= 1700000 && lineNum < 1750000) {
    if (line.startsWith('20') || line.startsWith('23') || line.startsWith('24') || line.startsWith('27')) {
      eligibleCount++;
      if (sampleCuits.length < 20) {
        sampleCuits.push('rec_arca_' + line.substring(0, 11).trim());
      }
    }
  }
  if (lineNum >= 1750000) break;
}

console.log(`Lines 1,700,000..1,750,000: eligible candidates = ${eligibleCount}`);
const res = await pool.query(
  "SELECT count(*) as found_in_db FROM public.atlas_person_identity_map WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA' AND source_person_id = ANY($1)",
  [sampleCuits]
);
console.log(`Sample 20 CUITs found in DB: ${res.rows[0].found_in_db}`);

await pool.end();
