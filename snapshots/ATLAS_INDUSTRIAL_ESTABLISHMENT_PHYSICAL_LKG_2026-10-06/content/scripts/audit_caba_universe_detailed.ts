import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('=== AUDITORIA DETALLADA UNIVERSO CABA ===');

  let offset = 0;
  const BATCH_SIZE = 1000;
  const allRows: any[] = [];

  while (true) {
    const { data, error } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('discovery_id, display_name, source_id, location_relation_type, current_activity_state, organization, role')
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      console.error(error);
      break;
    }
    if (!data || data.length === 0) break;
    allRows.push(...data);
    offset += data.length;
    if (data.length < BATCH_SIZE) break;
  }

  console.log(`Total rows in Discovery: ${allRows.length}`);

  // Breakdown by (source_id, location_relation_type, current_activity_state)
  const stats: Record<string, number> = {};
  const relStats: Record<string, number> = {};
  const stateStats: Record<string, number> = {};

  for (const r of allRows) {
    const k = `${r.source_id} | ${r.location_relation_type} | ${r.current_activity_state}`;
    stats[k] = (stats[k] || 0) + 1;

    relStats[r.location_relation_type || 'NONE'] = (relStats[r.location_relation_type || 'NONE'] || 0) + 1;
    stateStats[r.current_activity_state || 'NONE'] = (stateStats[r.current_activity_state || 'NONE'] || 0) + 1;
  }

  console.log('\n--- BY RELATION TYPE ---');
  console.table(relStats);

  console.log('\n--- BY ACTIVITY STATE ---');
  console.table(stateStats);

  // Separate sets:
  // 1. DIRECT CABA: Proven direct contemporary relationship to CABA (e.g. WORKS_IN, GOV, PROF, etc. AND NOT PUBLICATION_ONLY)
  // Let's see what the user defines:
  // "CURRENT_DIRECT_CABA = relación actual comprobada
  //  CABA_ASSOCIATED_ALIVE = relación explícita con CABA, persona viva, pero temporalidad actual no confirmada
  //  CABA_HISTORICAL = relación histórica con CABA
  //  No sumaría todavía 3.739 + 1.065, porque debemos comprobar cuántos de esos 1.065 ya estaban dentro de los 3.739.
  //  CABA_UNIVERSE_UNIQUE = UNION( CURRENT_DIRECT_CABA, CABA_ASSOCIATED_ALIVE )"

  // Notice the user's explicit distinction:
  // 3.739 was the count of DIRECT CABA persons (excluding CONICET publication authors which are 9,491 unresolved author evidence, not confirmed Direct CABA persons!).
  // Let's verify!
  const directCabaRows = allRows.filter(r => 
    r.location_relation_type !== 'PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE' &&
    r.source_id !== 'WIKIDATA_CABA_PERSONS'
  );

  const conicetRows = allRows.filter(r => r.source_id === 'CONICET_OAI_PMH');
  const wikidataRows = allRows.filter(r => r.source_id === 'WIKIDATA_CABA_PERSONS');

  console.log(`\nDirect CABA Rows (pre-conicet/pre-wikidata): ${directCabaRows.length}`);
  console.log(`CONICET publication authors (unresolved): ${conicetRows.length}`);
  console.log(`Wikidata rows: ${wikidataRows.length}`);

  // Unique names in Direct CABA rows:
  const directUniqueNames = new Set<string>();
  for (const r of directCabaRows) {
    const slug = r.display_name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    directUniqueNames.add(slug);
  }
  console.log(`Direct CABA Unique Persons (excluding publication-only): ${directUniqueNames.size}`);

  // Total ACTIVE unique names (all sources):
  const allActiveUniqueNames = new Set<string>();
  for (const r of allRows.filter(r => r.current_activity_state === 'ACTIVE')) {
    const slug = r.display_name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    allActiveUniqueNames.add(slug);
  }
  console.log(`All ACTIVE Unique Names in DB: ${allActiveUniqueNames.size}`);

  // Wikidata alive (STALE):
  const wikidataAliveUnique = new Set<string>();
  const wikidataHistoricalUnique = new Set<string>();
  for (const r of wikidataRows) {
    const slug = r.display_name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (r.current_activity_state === 'STALE') {
      wikidataAliveUnique.add(slug);
    } else if (r.current_activity_state === 'HISTORICAL') {
      wikidataHistoricalUnique.add(slug);
    }
  }
  console.log(`Wikidata Alive Unique: ${wikidataAliveUnique.size}`);
  console.log(`Wikidata Historical Unique: ${wikidataHistoricalUnique.size}`);

  // Check overlap between Direct CABA (3,739 set) and Wikidata Alive (1,065 set):
  const overlapDirectAndWikidata = new Set<string>();
  for (const name of wikidataAliveUnique) {
    if (directUniqueNames.has(name)) {
      overlapDirectAndWikidata.add(name);
    }
  }
  console.log(`\nOVERLAP between Direct CABA (3,739 pool) and Wikidata Alive (1,065 pool): ${overlapDirectAndWikidata.size}`);
  for (const name of overlapDirectAndWikidata) {
    console.log(`  - Overlap item: "${name}"`);
  }

  // Check overlap between ALL Active (including CONICET) and Wikidata Alive:
  const overlapAllActiveAndWikidata = new Set<string>();
  for (const name of wikidataAliveUnique) {
    if (allActiveUniqueNames.has(name)) {
      overlapAllActiveAndWikidata.add(name);
    }
  }
  console.log(`OVERLAP between ALL ACTIVE (incl Conicet) and Wikidata Alive: ${overlapAllActiveAndWikidata.size}`);

  // Canonical baseline check
  const { count: canonicalCount } = await supabase
    .from('atlas_argentina_people_search_projection_v1')
    .select('*', { count: 'exact', head: true });

  console.log(`\nCanonical Baseline: ${canonicalCount} (Invariant: 2091)`);
}

main().catch(console.error);
