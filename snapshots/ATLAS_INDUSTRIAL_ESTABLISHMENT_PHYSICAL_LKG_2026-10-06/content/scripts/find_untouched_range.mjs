import fs from 'fs';
import readline from 'readline';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 5 });
  const client = await pool.connect();

  console.log('Fetching committed cuils from database...');
  const res = await client.query(`
    SELECT source_person_id FROM public.atlas_person_identity_map
    WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA'
  `);
  const committedCuils = new Set(res.rows.map(r => r.source_person_id.replace('rec_arca_', '')));
  console.log(`Loaded ${committedCuils.size} committed CUILs.`);

  client.release();
  await pool.end();

  const filePath = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity
  });

  let lineNum = 0;
  let lastCommittedLine = 0;
  let firstUncommittedAfterLast = 0;

  for await (const line of rl) {
    const cuit = line.substring(0, 11).trim();
    if (committedCuils.has(cuit)) {
      lastCommittedLine = lineNum;
    } else if (lastCommittedLine > 0 && firstUncommittedAfterLast === 0) {
      firstUncommittedAfterLast = lineNum;
    }
    lineNum++;
  }

  console.log(`Total lines: ${lineNum}`);
  console.log(`Last committed line in file: ${lastCommittedLine}`);
  console.log(`First uncommitted line after last: ${firstUncommittedAfterLast}`);
}

main().catch(console.error);
