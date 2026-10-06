import fs from 'fs';
import readline from 'readline';
import pg from 'pg';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';

async function census() {
  const rl = readline.createInterface({ input: fs.createReadStream(SOURCE_FILE), crlfDelay: Infinity });
  let idx = 0;
  let count = 0;
  let validNatural = 0;
  let cuits = new Set();

  for await (const line of rl) {
    if (idx >= 316000) {
      const prefix = line.substring(0, 2);
      if (['20', '27', '23', '24'].includes(prefix) && line.length >= 50) {
        validNatural++;
      }
      const cuit = line.substring(0, 11).trim();
      cuits.add(cuit);
      count++;
      if (count >= 50000) break;
    }
    idx++;
  }

  console.log('Census 50k from offset 316000:');
  console.log('Total read:', count);
  console.log('Valid natural persons:', validNatural);
  console.log('Distinct CUITS:', cuits.size);

  const pool = new pg.Pool(parseDbUrl());
  const sampleCuits = Array.from(cuits).slice(0, 500);
  const checkRes = await pool.query('SELECT count(*) FROM public.atlas_person_identity_map WHERE source_person_id = ANY($1)', [sampleCuits]);
  console.log('Sample prior evaluations in DB:', checkRes.rows[0].count);
  await pool.end();
}
census();
