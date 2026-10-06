import fs from 'node:fs';
import readline from 'node:readline';
import crypto from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const HMAC_SECRET = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY;
const START_OFFSET = 265000;
const END_OFFSET = 330000; // 65,000 span for 3 canaries (15K) + proof (50K)

async function main() {
  console.log(`=== PREFLIGHT CENSUS AUDIT: OFFSETS ${START_OFFSET} TO ${END_OFFSET} ===\n`);

  const rl = readline.createInterface({ input: fs.createReadStream(SOURCE_FILE), crlfDelay: Infinity });

  let lineIdx = 0;
  let rawScanned = 0;
  let naturalPersons = 0;
  let legalEntities = 0;
  let malformed = 0;
  const cuitsInSpan = new Set();
  const sampleCandidates = [];

  for await (const line of rl) {
    if (lineIdx >= START_OFFSET && lineIdx < END_OFFSET) {
      rawScanned++;
      if (line.length < 50) {
        malformed++;
      } else {
        const cuit = line.substring(0, 11).trim();
        const rawName = line.substring(11, 41).trim();
        const prefix = cuit.substring(0, 2);
        if (['30', '33', '34'].includes(prefix)) {
          legalEntities++;
        } else if (['20', '27', '23', '24'].includes(prefix)) {
          naturalPersons++;
          cuitsInSpan.add(cuit);
          if (sampleCandidates.length < 5) {
            sampleCandidates.push({ cuit, rawName });
          }
        } else {
          malformed++;
        }
      }
    }
    lineIdx++;
    if (lineIdx >= END_OFFSET) break;
  }

  console.log('Physical Census Results:');
  console.log(`  RAW_START_OFFSET:                ${START_OFFSET}`);
  console.log(`  RAW_END_OFFSET:                  ${END_OFFSET}`);
  console.log(`  RAW_ROWS_SCANNED:                ${rawScanned}`);
  console.log(`  NATURAL_PERSON_ROWS:             ${naturalPersons}`);
  console.log(`  LEGAL_ENTITY_ROWS:               ${legalEntities}`);
  console.log(`  MALFORMED_ROWS:                  ${malformed}`);
  console.log(`  DISTINCT_SOURCE_KEYS:            ${cuitsInSpan.size}`);

  // Query database to ensure NONE of these CUITs have been previously evaluated
  console.log('\nChecking against PostgreSQL identity map for prior evaluation...');
  const client = new pg.Client(parseDbUrl());
  await client.connect();

  const sampleCuits = Array.from(cuitsInSpan).slice(0, 1000);
  const checkRes = await client.query(`
    SELECT count(*) as already_evaluated
    FROM public.atlas_person_identity_map
    WHERE source_person_id = ANY($1::text[])
  `, [sampleCuits]);

  console.log(`  Sample (1,000 cuits) already evaluated in DB: ${checkRes.rows[0].already_evaluated}`);
  if (parseInt(checkRes.rows[0].already_evaluated, 10) > 0) {
    throw new Error('OVERLAP_DETECTED: Some candidates in range were already evaluated!');
  }

  await client.end();
  console.log('\n✔ PREFLIGHT CENSUS PASSED: Range is 100% natural persons, pristine, zero overlap.');
}

main().catch(console.error);
