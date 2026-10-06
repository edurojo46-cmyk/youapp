import fs from 'fs';
import readline from 'readline';
import dotenv from 'dotenv';
import pg from 'pg';
import crypto from 'crypto';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

async function run() {
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();
  const hmacSecret = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY;

  const testLines = [1000000, 1200000, 1400000, 1600000, 1800000];
  const rl = readline.createInterface({
    input: fs.createReadStream('scratch/physical_sources/igj_autoridades_genero_202603.csv'),
    crlfDelay: Infinity
  });

  let lineNum = 0;
  for await (const line of rl) {
    lineNum++;
    if (testLines.includes(lineNum)) {
      const match = line.match(/^"([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)"/);
      if (match) {
        const cleanDoc = match[4].replace(/\D/g, '');
        const docHmac = crypto.createHmac('sha256', hmacSecret).update(`ARG:DNI:${cleanDoc}`).digest('hex');
        const atlasPersonId = `atlas_arg_per_${docHmac.slice(0, 16)}`;
        const res = await client.query('SELECT 1 FROM public.atlas_people_discovery_candidates WHERE atlas_person_id = $1', [atlasPersonId]);
        console.log(`Line ${lineNum} (DNI ${cleanDoc}): EXISTS = ${res.rows.length > 0}`);
      }
    }
  }

  client.release();
  await pool.end();
}

run().catch(console.error);
