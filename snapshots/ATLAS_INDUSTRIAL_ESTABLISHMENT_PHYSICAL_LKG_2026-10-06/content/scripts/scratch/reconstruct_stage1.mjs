import fs from 'node:fs';
import readline from 'node:readline';
import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

const sourceFilePath = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const fileStream = fs.createReadStream(sourceFilePath, { encoding: 'latin1' });
const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

const stage1Keys = new Set();
let rawLineCount = 0;
let eligibleCount = 0;

for await (const line of rl) {
  rawLineCount++;
  if (line.length >= 51) {
    const cuit = line.slice(0, 11).trim();
    const prefix = cuit.slice(0, 2);
    if (/^\d{11}$/.test(cuit) && ['20', '27', '23', '24'].includes(prefix)) {
      stage1Keys.add(cuit);
      eligibleCount++;
    }
  }
  if (eligibleCount >= 10000) {
    break;
  }
}
rl.close();

console.log('RECONSTRUCTED_STAGE1:');
console.log('  raw_lines_scanned:', rawLineCount);
console.log('  eligible_candidates:', eligibleCount);
console.log('  unique_cuit_count:', stage1Keys.size);

// Check against DB
const client = new pg.Client(parseDbUrl());
await client.connect();

const sampleCuits = Array.from(stage1Keys).slice(0, 50);
const dbCheck = await client.query(`
  SELECT count(*) as found_in_db
  FROM public.atlas_person_identity_map
  WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA'
    AND source_person_id = ANY($1::text[])
`, [sampleCuits]);

console.log('  sample_50_found_in_db:', dbCheck.rows[0].found_in_db);

await client.end();
