import fs from 'node:fs';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';

const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('=== AUDITING CROSS-STAGE POPULATION OVERLAP ===\n');

// 1. Stage 1 (Offsets 0..10,000)
// 2. Stage 2 (Offsets 10,000..60,000)
// 3. Stage 3 (Offsets 60,000..160,000)
// 4. Stage 3C Canary (Offsets 160,000..165,000)
// 5. Stage 3C 100K Proof (Offsets 165,000..265,000)

const fd = fs.openSync(SOURCE_FILE, 'r');

function getCuits(startOffset, count) {
  const buf = Buffer.alloc(count * 52);
  fs.readSync(fd, buf, 0, count * 52, startOffset * 52);
  const cuits = new Set();
  for (let i = 0; i < count; i++) {
    const line = buf.toString('latin1', i * 52, (i + 1) * 52);
    const cuit = line.substring(0, 11).trim();
    cuits.add(cuit);
  }
  return cuits;
}

console.log('Loading Stage populations from source file...');
const stage1Cuits = getCuits(0, 10000);
const stage2Cuits = getCuits(10000, 50000);
const stage3Cuits = getCuits(60000, 100000);
const canaryCuits = getCuits(160000, 5000);
const proof100kCuits = getCuits(165000, 100000);
fs.closeSync(fd);

console.log(`Stage 1:      ${stage1Cuits.size} unique CUITs`);
console.log(`Stage 2:      ${stage2Cuits.size} unique CUITs`);
console.log(`Stage 3:      ${stage3Cuits.size} unique CUITs`);
console.log(`Stage 3C 5K:  ${canaryCuits.size} unique CUITs`);
console.log(`Stage 3C 100K: ${proof100kCuits.size} unique CUITs`);

// Check intersections with Stage 3C 100K
let overlapStage1 = 0;
let overlapStage2 = 0;
let overlapStage3 = 0;
let overlapCanary = 0;

for (const cuit of proof100kCuits) {
  if (stage1Cuits.has(cuit)) overlapStage1++;
  if (stage2Cuits.has(cuit)) overlapStage2++;
  if (stage3Cuits.has(cuit)) overlapStage3++;
  if (canaryCuits.has(cuit)) overlapCanary++;
}

console.log('\n--- INTERSECTION RESULTS ---');
console.log('Stage 1 ∩ Stage 3C 100K: ', overlapStage1);
console.log('Stage 2 ∩ Stage 3C 100K: ', overlapStage2);
console.log('Stage 3 ∩ Stage 3C 100K: ', overlapStage3);
console.log('Canary  ∩ Stage 3C 100K: ', overlapCanary);

const totalUnion = stage1Cuits.size + stage2Cuits.size + stage3Cuits.size + canaryCuits.size + proof100kCuits.size;
console.log('\nCumulative Natural-Person CUIT Union: ', totalUnion);

await client.end();
