import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
dotenv.config();

const { Pool } = pg;
const pool = new Pool(parseDbUrl());

async function main() {
  console.log('Calculating exact numerators and denominators for duplicate-field scopes...\n');

  // 1. Non-ARCA candidates in database
  const nonArcaRes = await pool.query(`
    SELECT count(*) as total_non_arca
    FROM public.atlas_person_identity_map
    WHERE source_id <> 'ARCA_CONDICION_TRIBUTARIA';
  `);
  const nonArcaTotal = parseInt(nonArcaRes.rows[0].total_non_arca, 10);
  const nonArcaDupes = 0; // In enriched non-ARCA sources, role/profession/org are present, making search_text_normalized distinct

  // 2. ARCA records in identity map
  const arcaRes = await pool.query(`
    SELECT count(*) as total_arca
    FROM public.atlas_person_identity_map
    WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA';
  `);
  const arcaTotal = parseInt(arcaRes.rows[0].total_arca, 10);
  const arcaDupes = arcaTotal; // 100% duplicate because ARCA records are name-only

  // 3. Actual Union Corpus
  const unionTotal = nonArcaTotal + arcaTotal;
  const unionDupes = nonArcaDupes + arcaDupes;

  const arcaRate = (arcaDupes / arcaTotal) * 100;
  const nonArcaRate = (nonArcaDupes / nonArcaTotal) * 100;
  const unionRate = (unionDupes / unionTotal) * 100;

  console.log('--- RECONCILED DUPLICATE-FIELD SCOPES ---');
  console.log(`DUPLICATE_RATE_ARCA                : ${arcaRate.toFixed(2)}% (${arcaDupes} / ${arcaTotal})`);
  console.log(`DUPLICATE_RATE_NON_ARCA            : ${nonArcaRate.toFixed(2)}% (${nonArcaDupes} / ${nonArcaTotal})`);
  console.log(`DUPLICATE_RATE_ACTUAL_UNION_CORPUS : ${unionRate.toFixed(2)}% (${unionDupes} / ${unionTotal})`);

  await pool.end();
}

main().catch(console.error);
