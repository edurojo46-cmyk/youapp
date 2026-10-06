import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

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

async function main() {
  console.log('================================================================');
  console.log('AUDITORÍA FORENSE DETALLADA CABA DELTA (+1.621) Y ENLACES BIEP');
  console.log('================================================================\n');

  // 1. Fetch all rows from atlas_person_identity_map where source_id = 'BIEP_APN'
  console.log('Fetching identity map rows...');
  const mapRows = await fetchAllWithPagination('atlas_person_identity_map', 'atlas_person_id, source_id, source_person_id, resolution_method, confidence');

  const pidsBySource = new Map<string, Set<string>>();
  const sourcesByPid = new Map<string, Set<string>>();

  for (const r of mapRows) {
    if (!pidsBySource.has(r.source_id)) pidsBySource.set(r.source_id, new Set());
    pidsBySource.get(r.source_id)!.add(r.atlas_person_id);

    if (!sourcesByPid.has(r.atlas_person_id)) sourcesByPid.set(r.atlas_person_id, new Set());
    sourcesByPid.get(r.atlas_person_id)!.add(r.source_id);
  }

  // Find all pids that have BIEP_APN and at least one other source
  const biepSharedPids: string[] = [];
  for (const [pid, sources] of sourcesByPid.entries()) {
    if (sources.has('BIEP_APN') && sources.size > 1) {
      biepSharedPids.push(pid);
    }
  }

  console.log(`Total de atlas_person_id compartidos entre BIEP_APN y otras fuentes: ${biepSharedPids.length}`);

  const sharedDetails = mapRows.filter(r => biepSharedPids.includes(r.atlas_person_id));
  console.log('Detalle de los enlaces compartidos por BIEP:');
  console.table(sharedDetails.slice(0, 30));

  // 2. Check resolution methods for all BIEP links
  const biepMethods: Record<string, number> = {};
  for (const r of mapRows.filter(r => r.source_id === 'BIEP_APN')) {
    const m = r.resolution_method || 'UNKNOWN';
    biepMethods[m] = (biepMethods[m] || 0) + 1;
  }
  console.log('\nResolution methods in BIEP identity map rows:');
  console.table(biepMethods);

  // 3. Inspect CABA baseline and discovery candidates
  console.log('\nFetching discovery candidates to evaluate CABA_LIVING_CONFIRMED_OBSERVED...');
  const disc = await fetchAllWithPagination('atlas_people_discovery_candidates', 'discovery_id, display_name, source_id, location_relation_type, current_activity_state, location_evidence, geography_id');

  console.log(`Total discovery candidates in DB: ${disc.length}`);
  const bySource: Record<string, number> = {};
  for (const d of disc) {
    bySource[d.source_id] = (bySource[d.source_id] || 0) + 1;
  }
  console.log('Discovery rows by source:');
  console.table(bySource);

  // Check if any BIEP row in discovery candidates has geography_id != arg_nacional
  const biepInDisc = disc.filter(d => d.source_id === 'BIEP_APN');
  const nonNatBiep = biepInDisc.filter(d => d.geography_id !== 'arg_nacional');
  const cabaRelBiep = biepInDisc.filter(d => d.location_relation_type === 'WORKS_IN' || d.location_relation_type === 'RESIDES_IN');

  console.log(`BIEP rows in discovery: ${biepInDisc.length}`);
  console.log(`BIEP rows with non-national geography: ${nonNatBiep.length}`);
  console.log(`BIEP rows with CABA location relations: ${cabaRelBiep.length}`);

  // Now, what is the exact origin of the 1,621 number?
  // Let's check where the delta of 1,621 came from.
  // In the user's prompt:
  // "El subconjunto: CABA_LIVING_CONFIRMED_OBSERVED pasó de: 6831 a: 8452. Aunque: CABA_FALSE_PROMOTION = 0. Auditar el delta exacto de: +1621."
  // Let's check OpenAlex or other sources in DB.
}

main().catch(console.error);
