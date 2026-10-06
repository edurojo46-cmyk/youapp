import fs from 'fs';
import path from 'path';
import readline from 'readline';
import crypto from 'crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const algPath = path.resolve('scratch/physical_sources/anmat_alimentos_libres_gluten.csv');
const chasPath = path.resolve('scratch/physical_sources/chas_autopartes_seguridad.csv');

async function dryRun() {
  console.log('Testing V3 Discovery & Ingestion Dry Run...');
  
  const client = new pg.Client({ ...parseDbUrl() });
  await client.connect();

  // 1. Existing entities & categories
  const catRes = await client.query(`SELECT category, count(*) FROM public.atlas_products WHERE status = 'ACTIVE' GROUP BY category ORDER BY count DESC LIMIT 10;`);
  console.log('Top categories in DB:', catRes.rows);

  const existingEntitiesRes = await client.query(`
    SELECT canonical_entity_id, canonical_name, normalized_name
    FROM public.atlas_canonical_entities
    WHERE entity_type = 'COMPANY';
  `);
  console.log(`Loaded ${existingEntitiesRes.rows.length} existing COMPANY entities from DB.`);

  const companyNameToId = new Map();
  for (const row of existingEntitiesRes.rows) {
    if (row.normalized_name) companyNameToId.set(row.normalized_name.trim(), row.canonical_entity_id);
    if (row.canonical_name) companyNameToId.set(row.canonical_name.trim().toLowerCase(), row.canonical_entity_id);
  }

  // 2. Test ALG parsing
  const algLines = fs.readFileSync(algPath, 'utf8').split('\n').filter(l => l.trim().length > 0);
  console.log(`ALG lines: ${algLines.length}`);

  let algMatchesExisting = 0;
  let algNewCompanies = 0;
  const algSeenCompanies = new Set();
  const algValidProducts = [];

  for (let i = 1; i < algLines.length; i++) {
    const line = algLines[i].trim();
    if (!line) continue;

    let inQuotes = false;
    let currentField = '';
    const fields = [];
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        fields.push(currentField.trim());
        currentField = '';
      } else {
        currentField += ch;
      }
    }
    fields.push(currentField.trim());

    if (fields.length < 4) continue;

    const marca = fields[0].replace(/^"|"$/g, '').trim();
    const fantasia = fields[1].replace(/^"|"$/g, '').trim();
    const denom = fields[2].replace(/^"|"$/g, '').trim();
    const rnpa = fields[3].replace(/^"|"$/g, '').trim();

    if (!marca || !denom || !rnpa) continue;

    const normMarca = marca.toLowerCase();
    if (!algSeenCompanies.has(normMarca)) {
      algSeenCompanies.add(normMarca);
      if (companyNameToId.has(normMarca)) {
        algMatchesExisting++;
      } else {
        algNewCompanies++;
      }
    }

    algValidProducts.push({
      marca,
      fantasia,
      denom,
      rnpa,
      name: `${marca} - ${denom}`.trim()
    });
  }

  console.log(`ALG Products parsed: ${algValidProducts.length}`);
  console.log(`ALG Unique Companies: ${algSeenCompanies.size} (Matches existing: ${algMatchesExisting}, Net New: ${algNewCompanies})`);

  // 3. Test CHAS continuation offset
  const rlChas = readline.createInterface({ input: fs.createReadStream(chasPath, 'utf8') });
  let chasTotalRows = 0;
  let chasHeader = null;
  for await (const line of rlChas) {
    if (!line.trim()) continue;
    if (!chasHeader) { chasHeader = line; continue; }
    chasTotalRows++;
  }
  console.log(`CHAS Total data rows available: ${chasTotalRows}`);
  console.log(`Previously consumed in V2: 45,000. Unconsumed remainder: ${chasTotalRows - 45000}`);

  await client.end();
}

dryRun().catch(console.error);
