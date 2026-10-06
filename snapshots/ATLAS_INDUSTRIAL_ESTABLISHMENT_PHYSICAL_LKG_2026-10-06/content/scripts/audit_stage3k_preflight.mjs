import fs from 'fs';
import readline from 'readline';
import crypto from 'crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const HMAC_SECRET = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY;
if (!HMAC_SECRET) throw new Error('MISSING_HMAC_SECRET');

function parseCandidate(line) {
  const cuit = line.substring(0, 11).trim();
  const dni = String(parseInt(cuit.slice(2, 10), 10));
  const identifierValue = crypto.createHmac('sha256', HMAC_SECRET).update(`ARG:DNI:${dni}`).digest('hex');
  const atlasPersonId = `atlas_arg_per_${identifierValue.slice(0, 16)}`;
  return { cuit, dni, identifierValue, atlasPersonId };
}

async function main() {
  console.log('--- AUDITING STAGE 3K PREFLIGHT CENSUS (432,000 -> 457,000) ---');
  
  const startOffset = 432000;
  const count = 25000;

  const candidates = [];
  const cuitSet = new Set();
  const rl = readline.createInterface({ input: fs.createReadStream(SOURCE_FILE), crlfDelay: Infinity });
  let idx = 0;
  let nonNatural = 0;

  for await (const line of rl) {
    if (idx >= startOffset) {
      if (line.length >= 50 && ['20', '27', '23', '24'].includes(line.substring(0, 2))) {
        const c = parseCandidate(line);
        candidates.push(c);
        cuitSet.add(c.cuit);
        if (candidates.length >= count) break;
      } else {
        nonNatural++;
      }
    }
    idx++;
  }

  console.log(`Scanned range from line ${startOffset}.`);
  console.log(`Eligible natural-person candidates gathered: ${candidates.length}`);
  console.log(`Distinct source keys (CUITs) in batch: ${cuitSet.size}`);
  console.log(`Non-natural/skipped records in stream: ${nonNatural}`);

  // Check overlap against PostgreSQL database
  const client = new pg.Client(parseDbUrl());
  await client.connect();

  try {
    const canaryCuits = candidates.map(c => c.cuit);
    
    // Batch query to avoid oversized array parameter in PostgreSQL
    let existingCount = 0;
    const chunkSize = 5000;
    for (let i = 0; i < canaryCuits.length; i += chunkSize) {
      const chunk = canaryCuits.slice(i, i + chunkSize);
      const existingRes = await client.query(`
        SELECT count(*) FROM public.atlas_person_identity_map
        WHERE source_person_id = ANY($1::text[])
      `, [chunk]);
      existingCount += parseInt(existingRes.rows[0].count, 10);
    }

    console.log(`Canary (432k-457k): Existing in identity map: ${existingCount} / ${count}`);

    // Check terminal queue state right now
    const queueState = await client.query(`
      SELECT 
        (SELECT count(*) FROM public.atlas_search_outbox WHERE status = 'PENDING') as pending,
        (SELECT count(*) FROM public.atlas_search_outbox WHERE status = 'PROCESSING') as processing
    `);
    console.log(`Current live queue state: Pending=${queueState.rows[0].pending}, Processing=${queueState.rows[0].processing}`);

    if (existingCount !== 0) {
      throw new Error(`PREFLIGHT_FAIL: Overlap detected! Existing: ${existingCount}`);
    }
    if (cuitSet.size !== count) {
      throw new Error(`PREFLIGHT_FAIL: Duplicate source keys in candidate batch! (${cuitSet.size} !== ${count})`);
    }
    if (queueState.rows[0].pending !== '0' || queueState.rows[0].processing !== '0') {
      throw new Error(`PREFLIGHT_FAIL: Queue not clean!`);
    }

    console.log('✔ STAGE 3K PREFLIGHT CENSUS PASSED: 25,000 eligible, 25,000 distinct, 0 evaluated, queue clean.');

  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Census error:', err);
  process.exit(1);
});
