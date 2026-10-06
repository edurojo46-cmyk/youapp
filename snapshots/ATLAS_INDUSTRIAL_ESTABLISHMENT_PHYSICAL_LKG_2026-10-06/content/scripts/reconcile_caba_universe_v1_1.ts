import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import { 
  reconcileCandidateUniverse, 
  ReconciledCandidateUniverse 
} from '../src/lib/search/classification/AtlasPeopleClassifier';
import { invalidatePeopleScaleMetricsCache } from '../src/lib/search/AtlasPeopleScaleMetrics';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type ReconciledUniverseReport = ReconciledCandidateUniverse;

export async function runReconciliation(): Promise<ReconciledUniverseReport> {
  console.log('=== ATLAS PEOPLE — RECONCILIACIÓN FÍSICA DE ESTADOS V1.1 ===\n');

  // 1. Verify Canonical DB baseline
  const { count: canonicalCount } = await supabase
    .from('atlas_argentina_people_search_projection_v1')
    .select('*', { count: 'exact', head: true });

  console.log(`CANONICAL_IDENTITIES: ${canonicalCount} (Invariant: 2091, DELTA = 0)`);
  if (canonicalCount !== 2091) {
    throw new Error(`CANONICAL BASELINE BREACH! Expected 2091, got ${canonicalCount}`);
  }

  // 2. Fetch all Discovery Candidates in batches
  console.log('Loading all candidates from atlas_people_discovery_candidates...');
  let offset = 0;
  const BATCH_SIZE = 1000;
  const allRows: any[] = [];

  while (true) {
    const { data, error } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('discovery_id, display_name, source_id, location_relation_type, current_activity_state, organization, role, location_evidence, social_profiles')
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows.push(...data);
    offset += data.length;
    if (data.length < BATCH_SIZE) break;
  }

  console.log(`Total filas cargadas en Discovery: ${allRows.length}`);

  // 3. Load authoritative resolution items directly from atlas_people_resolution_items in PostgreSQL
  const { data: dbResolutionItems } = await supabase
    .from('atlas_people_resolution_items')
    .select('discovery_id, status, territorial_state');

  const resolutionMap = new Map<string, { status: string; territorial_state: string }>();
  for (const item of dbResolutionItems || []) {
    resolutionMap.set(item.discovery_id, { status: item.status, territorial_state: item.territorial_state });
  }

  // 4. Reconcile using Single Source of Truth classifier backed by physical resolution table
  const report = reconcileCandidateUniverse(allRows, canonicalCount || 2091, resolutionMap);

  console.log('\n--- RESULTADOS RECONCILIADOS DE CONJUNTOS MUTUAMENTE EXCLUSIVOS ---');
  console.log(`1. CURRENT_DIRECT_CABA_UNIQUE:      ${report.SETS.CURRENT_DIRECT_CABA_UNIQUE} (Máximo Teórico: 6328) -> ${report.SANITY_CHECKS.CURRENT_LE_THEORETICAL_MAX ? 'PASS' : 'FAIL'}`);
  console.log(`2. RECENT_CABA_UNIQUE:              ${report.SETS.RECENT_CABA_UNIQUE}`);
  console.log(`3. CABA_ASSOCIATED_STALE_UNIQUE:     ${report.SETS.CABA_ASSOCIATED_STALE_UNIQUE}`);
  console.log(`4. CABA_HISTORICAL_UNIQUE:           ${report.SETS.CABA_HISTORICAL_UNIQUE}`);
  console.log(`5. NON_CABA_CONFIRMED_UNIQUE:        ${report.SETS.NON_CABA_CONFIRMED_UNIQUE}`);
  console.log(`6. UNRESOLVED_AUTHORS_UNIQUE:        ${report.SETS.UNRESOLVED_AUTHORS_UNIQUE}`);
  console.log(`7. CABA_UNIVERSE_UNIQUE (UNION):     ${report.CABA_UNIVERSE_UNIQUE} (Máximo Teórico: 11247) -> ${report.SANITY_CHECKS.UNIVERSE_LE_THEORETICAL_MAX ? 'PASS' : 'FAIL'}`);

  console.log('\n--- VERIFICACIÓN DE INTERSECCIONES (CERO CONTAMINACIÓN) ---');
  console.log(`CURRENT ∩ RECENT:      ${report.INTERSECTIONS.CURRENT_AND_RECENT} (Debe ser 0)`);
  console.log(`CURRENT ∩ STALE:       ${report.INTERSECTIONS.CURRENT_AND_STALE} (Debe ser 0)`);
  console.log(`CURRENT ∩ HISTORICAL:  ${report.INTERSECTIONS.CURRENT_AND_HISTORICAL} (Debe ser 0)`);
  console.log(`RECENT ∩ STALE:        ${report.INTERSECTIONS.RECENT_AND_STALE} (Debe ser 0)`);
  console.log(`ALIVE ∩ HISTORICAL:    ${report.INTERSECTIONS.ALIVE_AND_HISTORICAL} (Debe ser 0)`);

  console.log(`\nFórmula Reconciliada: ${report.FORMULA_EXPLANATION}`);

  invalidatePeopleScaleMetricsCache();

  return report;
}

if (process.argv[1]?.endsWith('reconcile_caba_universe_v1_1.ts')) {
  runReconciliation().catch(console.error);
}

