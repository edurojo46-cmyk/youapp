import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import https from 'https';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

const agent = new https.Agent({ rejectUnauthorized: false });

function cleanPersonName(raw: string): string {
  return raw
    .replace(/^(Dr\.|Dra\.|Lic\.|Arq\.|Ing\.|Prof\.|Pbro\.|Rab\.|Pastor|Pastora|Imam|Mons\.|Fray|Hermano|Hermana|Mg\.|Ctdor\.|Abog\.)\s+/i, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*-\s*.*$/, '')
    .trim();
}

async function profileGcbaVsDiscovery() {
  console.log('================================================================');
  console.log('GCBA DATOS ABIERTOS 2026 — PHYSICAL PREFLIGHT & OVERLAP AUDIT');
  console.log('================================================================\n');

  const url = 'https://cdn.buenosaires.gob.ar/datosabiertos/datasets/ministerio-de-economia-y-finanzas/autoridades-superiores-funcionarios/autoridades_superiores_y_funcionarios_2026.csv';
  console.log(`Fetching latest live CSV from: ${url}...`);

  let text = '';
  try {
    const res = await fetch(url, { agent, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 } as any);
    if (!res.ok) {
      console.error(`HTTP error fetching GCBA CSV: ${res.status}`);
      return;
    }
    text = await res.text();
  } catch (err: any) {
    console.error('Fetch error:', err.message);
    return;
  }

  const lines = text.split('\n').filter(l => l.trim().length > 0);
  const rawRowsObserved = lines.length - 1; // minus header
  console.log(`RAW_ROWS_OBSERVED: ${rawRowsObserved}`);

  // Fetch all existing candidate names and source_record_ids from atlas_people_discovery_candidates
  console.log('Loading existing discovery candidates from Supabase...');
  const existingRecords = new Set<string>();
  const existingNames = new Set<string>();

  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('display_name, source_record_id')
      .range(offset, offset + pageSize - 1);

    if (error || !data || data.length === 0) break;
    for (const r of data) {
      if (r.source_record_id) existingRecords.add(r.source_record_id);
      if (r.display_name) existingNames.add(r.display_name.toLowerCase().trim());
    }
    offset += data.length;
    if (data.length < pageSize) break;
  }
  console.log(`Loaded ${existingNames.size} unique existing names from Discovery Index.`);

  let personRowsObserved = 0;
  let alreadyPresent = 0;
  let newUniqueObserved = 0;
  let existingEnriched = 0;
  let duplicatesInFile = 0;
  let historicalOnly = 0;

  const seenInThisFile = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split('","').map(v => v.replace(/^"|"$/g, '').trim());
    const ministerio = row[0];
    const descRep = row[1];
    const cargo = row[5];
    const ayn = row[7]; // Apellido y Nombre
    const estado = row[11];
    const mail = row[14];

    if (!ayn || ayn.length <= 2) continue;
    personRowsObserved++;

    if (estado !== 'Activo') {
      historicalOnly++;
      continue;
    }

    const parts = ayn.split(' ');
    const displayName = parts.length > 1 ? `${parts.slice(1).join(' ')} ${parts[0]}` : ayn;
    const cleaned = cleanPersonName(displayName);
    const key = cleaned.toLowerCase().trim();

    if (seenInThisFile.has(key)) {
      duplicatesInFile++;
      continue;
    }
    seenInThisFile.add(key);

    const recordId = `gcba_2026_${i}`;
    if (existingRecords.has(recordId) || existingNames.has(key)) {
      alreadyPresent++;
      existingEnriched++;
    } else {
      newUniqueObserved++;
    }
  }

  console.log('\n--- PHYSICAL AUDIT RESULTS ---');
  console.log(`RAW_ROWS_OBSERVED:           ${rawRowsObserved}`);
  console.log(`PERSON_ROWS_OBSERVED:        ${personRowsObserved}`);
  console.log(`HISTORICAL_ONLY:             ${historicalOnly}`);
  console.log(`DUPLICATES_IN_FILE:          ${duplicatesInFile}`);
  console.log(`ALREADY_PRESENT:             ${alreadyPresent}`);
  console.log(`EXISTING_PEOPLE_ENRICHED:    ${existingEnriched}`);
  console.log(`NEW_UNIQUE_OBSERVED:         ${newUniqueObserved}`);
  console.log(`OVERLAP_RATE_OBSERVED:       ${((alreadyPresent / (alreadyPresent + newUniqueObserved || 1)) * 100).toFixed(1)}%`);

  if (newUniqueObserved <= 10) {
    console.log('\nCONCLUSION: NEW_UNIQUE_OBSERVED ≈ 0');
    console.log('STATUS: SOURCE_STATUS = EXHAUSTED / REVISIT_FOR_REFRESH');
    console.log('ROLE: Transitioned from PRIMARY ACQUISITION to REFRESH / TEMPORAL VERIFICATION.');
  } else {
    console.log(`\nCONCLUSION: Found ${newUniqueObserved} potential net-new officials.`);
  }
}

profileGcbaVsDiscovery().catch(console.error);
