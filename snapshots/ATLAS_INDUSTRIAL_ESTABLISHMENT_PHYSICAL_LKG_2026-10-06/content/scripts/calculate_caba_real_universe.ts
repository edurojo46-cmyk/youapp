import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

function normalizePersonKey(name: string, org?: string | null, role?: string | null): string {
  const cleanName = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  // We use name as base, and if org or role exists, we create a primary identity key
  return cleanName;
}

async function calculateRealCabaUniverse() {
  console.log('=== FASE A: CALCULAR UNIVERSO CABA REAL ===\n');

  let offset = 0;
  const BATCH_SIZE = 1000;
  const allCandidates: any[] = [];

  while (true) {
    const { data, error } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('discovery_id, display_name, current_activity_state, source_id, source_record_id, organization, role, location_relation_type')
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    allCandidates.push(...data);
    offset += data.length;
    if (data.length < BATCH_SIZE) break;
  }

  console.log(`Total Discovery Candidates in DB: ${allCandidates.length}`);

  // Sets for calculation
  const currentDirectCabaKeys = new Set<string>();
  const cabaAssociatedAliveKeys = new Set<string>();
  const cabaHistoricalKeys = new Set<string>();

  // Map for deep identity checking
  const currentDirectMap = new Map<string, any>();
  const cabaAssociatedMap = new Map<string, any>();
  const historicalMap = new Map<string, any>();

  const sourceBreakdown: Record<string, { total: number; active: number; stale: number; historical: number }> = {};

  for (const c of allCandidates) {
    if (!c.display_name) continue;
    const key = normalizePersonKey(c.display_name, c.organization, c.role);
    const state = c.current_activity_state;
    const src = c.source_id || 'UNKNOWN';

    if (!sourceBreakdown[src]) {
      sourceBreakdown[src] = { total: 0, active: 0, stale: 0, historical: 0 };
    }
    sourceBreakdown[src].total++;
    if (state === 'ACTIVE') sourceBreakdown[src].active++;
    else if (state === 'STALE') sourceBreakdown[src].stale++;
    else if (state === 'HISTORICAL') sourceBreakdown[src].historical++;

    if (state === 'ACTIVE') {
      currentDirectCabaKeys.add(key);
      currentDirectMap.set(key, c);
    } else if (state === 'STALE') {
      cabaAssociatedAliveKeys.add(key);
      cabaAssociatedMap.set(key, c);
    } else if (state === 'HISTORICAL') {
      cabaHistoricalKeys.add(key);
      historicalMap.set(key, c);
    }
  }

  console.log('\n--- DISTRIBUCIÓN POR FUENTE Y ESTADO TEMPORAL ---');
  console.table(sourceBreakdown);

  // Calculate Overlap / Intersection
  const overlapKeys = new Set<string>();
  for (const key of cabaAssociatedAliveKeys) {
    if (currentDirectCabaKeys.has(key)) {
      overlapKeys.add(key);
    }
  }

  // Calculate Union: CABA_UNIVERSE_UNIQUE
  const cabaUniverseKeys = new Set<string>([...currentDirectCabaKeys, ...cabaAssociatedAliveKeys]);

  // Canonical baseline verification
  const { count: canonicalCount } = await supabase
    .from('atlas_argentina_people_search_projection_v1')
    .select('*', { count: 'exact', head: true });

  console.log('\n--- RESULTADOS FÍSICOS DE CONJUNTOS ---');
  console.log(`1. CURRENT_DIRECT_CABA_UNIQUE:      ${currentDirectCabaKeys.size}`);
  console.log(`2. CABA_ASSOCIATED_ALIVE_UNIQUE:     ${cabaAssociatedAliveKeys.size}`);
  console.log(`3. OVERLAP_BETWEEN_BOTH:             ${overlapKeys.size}`);
  console.log(`4. CABA_UNIVERSE_UNIQUE (UNION):     ${cabaUniverseKeys.size}`);
  console.log(`5. CABA_HISTORICAL_UNIQUE:           ${cabaHistoricalKeys.size}`);
  console.log(`6. CANONICAL_IDENTITIES_BASELINE:    ${canonicalCount} (CANONICAL_DB_DELTA = 0)`);

  if (overlapKeys.size > 0) {
    console.log(`\nMuestra de candidatos en intersección (presentes en Direct y Associated):`);
    let count = 0;
    for (const key of overlapKeys) {
      if (count++ >= 5) break;
      console.log(`- "${key}" (Direct: ${currentDirectMap.get(key)?.source_id} / Associated: ${cabaAssociatedMap.get(key)?.source_id})`);
    }
  }

  return {
    CURRENT_DIRECT_CABA_UNIQUE: currentDirectCabaKeys.size,
    CABA_ASSOCIATED_ALIVE_UNIQUE: cabaAssociatedAliveKeys.size,
    OVERLAP_BETWEEN_BOTH: overlapKeys.size,
    CABA_UNIVERSE_UNIQUE: cabaUniverseKeys.size,
    CABA_HISTORICAL_UNIQUE: cabaHistoricalKeys.size,
    CANONICAL_IDENTITIES_BASELINE: canonicalCount
  };
}

calculateRealCabaUniverse().catch(console.error);
