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
  console.log('--- AUDITING STAGE 3G PREFLIGHT CENSUS (412,000 -> 472,000) ---');
  
  const startOffset = 412000;
  const canaryCount = 10000;
  const proofCount = 50000;
  const totalCount = canaryCount + proofCount; // 60,000 total

  const candidates = [];
  const rl = readline.createInterface({ input: fs.createReadStream(SOURCE_FILE), crlfDelay: Infinity });
  let idx = 0;
  let nonNatural = 0;

  for await (const line of rl) {
    if (idx >= startOffset) {
      if (line.length >= 50 && ['20', '27', '23', '24'].includes(line.substring(0, 2))) {
        candidates.push(parseCandidate(line));
        if (candidates.length >= totalCount) break;
      } else {
        nonNatural++;
      }
    }
    idx++;
  }

  console.log(`Scanned range from line ${startOffset}.`);
  console.log(`Eligible natural-person candidates gathered: ${candidates.length}`);
  console.log(`Non-natural/skipped records in stream: ${nonNatural}`);

  // Check overlap against PostgreSQL database
  const client = new pg.Client(parseDbUrl());
  await client.connect();

  try {
    // Check 10k canary sample
    const canaryCuits = candidates.slice(0, canaryCount).map(c => c.cuit);
    const existingCanary = await client.query(`
      SELECT count(*) FROM public.atlas_person_identity_map
      WHERE source_person_id = ANY($1::text[])
    `, [canaryCuits]);

    console.log(`\nCanary (412k-422k): Existing in identity map: ${existingCanary.rows[0].count} / ${canaryCount}`);

    // Check 50k proof sample
    const proofCuits = candidates.slice(canaryCount, totalCount).map(c => c.cuit);
    const existingProof = await client.query(`
      SELECT count(*) FROM public.atlas_person_identity_map
      WHERE source_person_id = ANY($1::text[])
    `, [proofCuits]);

    console.log(`Proof (422k-472k): Existing in identity map: ${existingProof.rows[0].count} / ${proofCount}`);

  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Census error:', err);
  process.exit(1);
});
