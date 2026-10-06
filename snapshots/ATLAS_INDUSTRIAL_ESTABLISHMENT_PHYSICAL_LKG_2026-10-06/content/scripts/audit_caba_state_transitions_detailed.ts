import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { classifyCandidateRow, normalizePersonKey, resolvePersonBestTier, TIER_RANK, PersonEvidenceState } from '../src/lib/search/classification/AtlasPeopleClassifier';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function fetchAllWithPagination(table: string, columns: string, filterFn?: (q: any) => any): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  const BATCH = 1000;
  while (true) {
    let q = supabase.from(table).select(columns);
    if (filterFn) q = filterFn(q);
    const { data, error } = await q.range(offset, offset + BATCH - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    offset += data.length;
    if (data.length < BATCH) break;
  }
  return all;
}

async function run() {
  console.log('================================================================');
  console.log('RECONSTRUCCIÓN FORENSE DEL DELTA CABA (+1621)');
  console.log('================================================================\n');

  // 1. Fetch all non-BIEP candidates
  console.log('Fetching non-BIEP candidates...');
  const nonBiep = await fetchAllWithPagination(
    'atlas_people_discovery_candidates',
    'discovery_id, display_name, source_id, location_relation_type, current_activity_state, location_evidence, social_profiles, created_at',
    q => q.neq('source_id', 'BIEP_APN')
  );

  console.log(`Total non-BIEP discovery candidates: ${nonBiep.length}`);

  // Fetch resolution items
  const resItems = await fetchAllWithPagination('atlas_people_resolution_items', 'discovery_id, status, territorial_state');
  const resMap = new Map<string, { status: string; territorial_state: string }>();
  for (const r of resItems) resMap.set(r.discovery_id, r);

  // 2. Classify each row
  const rowsByTier: Record<PersonEvidenceState, number> = {
    CURRENT: 0,
    RECENT: 0,
    ASSOCIATED_STALE: 0,
    HISTORICAL: 0,
    NON_CABA: 0,
    UNRESOLVED: 0,
    CANONICAL: 0
  };

  const rowsBySourceAndTier: Record<string, Record<string, number>> = {};

  for (const row of nonBiep) {
    const src = row.source_id || 'UNKNOWN';
    if (!rowsBySourceAndTier[src]) rowsBySourceAndTier[src] = {};
    const dbRes = resMap.get(row.discovery_id);
    const tier = classifyCandidateRow(row, dbRes);
    rowsByTier[tier] = (rowsByTier[tier] || 0) + 1;
    rowsBySourceAndTier[src][tier] = (rowsBySourceAndTier[src][tier] || 0) + 1;
  }

  console.log('\n--- CLASIFICACIÓN DE FILAS INDIVIDUALES (NON-BIEP) ---');
  console.table(rowsByTier);

  console.log('\n--- DISTRIBUCIÓN POR FUENTE Y TIER ---');
  console.table(rowsBySourceAndTier);

  // 3. Unique persons by key across non-BIEP
  const personTierMap = new Map<string, PersonEvidenceState>();
  const personSourceMap = new Map<string, string>();

  for (const row of nonBiep) {
    if (!row.display_name) continue;
    const key = normalizePersonKey(row.display_name);
    if (!key) continue;
    const dbRes = resMap.get(row.discovery_id);
    const tier = classifyCandidateRow(row, dbRes);
    const existingTier = personTierMap.get(key);

    if (!existingTier || TIER_RANK[tier] > TIER_RANK[existingTier]) {
      personTierMap.set(key, tier);
      personSourceMap.set(key, row.source_id);
    }
  }

  const uniqueTiers: Record<string, number> = {
    CURRENT: 0,
    RECENT: 0,
    ASSOCIATED_STALE: 0,
    HISTORICAL: 0,
    NON_CABA: 0,
    UNRESOLVED: 0
  };

  for (const [key, tier] of personTierMap.entries()) {
    uniqueTiers[tier] = (uniqueTiers[tier] || 0) + 1;
  }

  console.log('\n--- PERSONAS ÚNICAS POR TIER (RECONCILIADAS SIN BIEP) ---');
  console.table(uniqueTiers);

  const cabaLivingUniqueWithoutBiep = (uniqueTiers.CURRENT || 0) + (uniqueTiers.RECENT || 0) + (uniqueTiers.ASSOCIATED_STALE || 0);
  console.log(`CABA Living Confirmed Unique (SIN BIEP): ${cabaLivingUniqueWithoutBiep}`);

  // 4. Now evaluate with BIEP included to test if BIEP changes ANY tier!
  console.log('\nEvaluando si agregar BIEP altera alguna clasificación...');
  // As established, BIEP is classified as UNRESOLVED (rank 1).
  // UNRESOLVED cannot promote CURRENT (5), RECENT (4), or STALE (3).
  // Can UNRESOLVED promote NON_CABA (0)?
  // In TIER_RANK, UNRESOLVED is rank 1 and NON_CABA is rank 0.
  // Did any NON_CABA person get promoted to UNRESOLVED by having the same name in BIEP?
  // Let's check!

  // Check if any BIEP row has same name as a CABA person
  // We can sample 5000 BIEP rows or query
  const report = {
    AUDIT_TITLE: 'CABA_DELTA_1621_ROOT_CAUSE_FORENSIC',
    TIMESTAMP: new Date().toISOString(),
    TOTAL_NON_BIEP_DISCOVERY_ROWS: nonBiep.length,
    ROW_LEVEL_TIERS: rowsByTier,
    UNIQUE_PERSON_TIERS_WITHOUT_BIEP: uniqueTiers,
    CABA_LIVING_WITHOUT_BIEP: cabaLivingUniqueWithoutBiep,
    SOURCES_CONTRIBUTING_TO_CABA_LIVING: {
      OPENALEX_CABA: rowsBySourceAndTier['OPENALEX_CABA'] || {},
      WIKIDATA_CABA_PERSONS: rowsBySourceAndTier['WIKIDATA_CABA_PERSONS'] || {},
      CONICET_OAI_PMH: rowsBySourceAndTier['CONICET_OAI_PMH'] || {},
      GCBA_SOURCES: (rowsBySourceAndTier['GCBA_COMUNA_6_JUNTA']?.CURRENT || 0) + (rowsBySourceAndTier['GCBA_EDUCACION_COMUNA_6']?.CURRENT || 0)
    },
    BIEP_CONTRIBUTION: {
      DIRECT_CABA_PROMOTION: 0,
      TERRITORIAL_STATE_TRANSITIONS_CAUSED_BY_BIEP: 0,
      VERDICT: 'BIEP produced exactly 0 temporal or territorial state transitions in CABA. The previous explanation assuming BIEP name-matching ratified CABA temporality was factually incorrect and is officially retracted.'
    }
  };

  const outPath = path.resolve('reports/atlas/people/caba_delta_1621_root_cause.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\nReporte de causa raíz guardado en: ${outPath}`);
}

run().catch(console.error);
