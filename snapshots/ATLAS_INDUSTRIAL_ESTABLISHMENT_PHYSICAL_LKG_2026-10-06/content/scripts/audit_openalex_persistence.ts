import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function auditOpenAlexPersistence() {
  console.log('=== STEP 1: AUDITORÍA DE PERSISTENCIA OPENALEX CABA ===\n');

  let offset = 0;
  const BATCH_SIZE = 1000;
  const rows: any[] = [];

  while (true) {
    const { data, error } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('discovery_id, display_name, location_relation_type, current_activity_state, organization, social_profiles')
      .eq('source_id', 'OPENALEX_CABA')
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    offset += data.length;
    if (data.length < BATCH_SIZE) break;
  }

  console.log(`Total registros OPENALEX_CABA en base de datos: ${rows.length}`);

  // Cross distribution: location_relation_type x current_activity_state
  const matrix: Record<string, Record<string, number>> = {};
  const stateCounts: Record<string, number> = {};
  const relCounts: Record<string, number> = {};

  for (const r of rows) {
    const rel = r.location_relation_type || 'NONE';
    const state = r.current_activity_state || 'NONE';

    if (!matrix[rel]) matrix[rel] = {};
    matrix[rel][state] = (matrix[rel][state] || 0) + 1;

    stateCounts[state] = (stateCounts[state] || 0) + 1;
    relCounts[rel] = (relCounts[rel] || 0) + 1;
  }

  console.log('\n--- DISTRIBUCIÓN POR current_activity_state ---');
  console.table(stateCounts);

  console.log('\n--- DISTRIBUCIÓN POR location_relation_type ---');
  console.table(relCounts);

  console.log('\n--- MATRIZ CRUZADA (location_relation_type × current_activity_state) ---');
  console.table(matrix);

  // Inspect sample of each category
  console.log('\n--- MUESTRA DE REGISTROS POR ESTADO ---');
  for (const state of ['ACTIVE', 'STALE', 'HISTORICAL']) {
    const sample = rows.filter(r => r.current_activity_state === state).slice(0, 2);
    console.log(`\nEstado: ${state}`);
    for (const s of sample) {
      const sp = s.social_profiles?.[0];
      console.log(`  - "${s.display_name}" | Rel: ${s.location_relation_type} | Org: ${s.organization} | Ultima Obra: ${sp?.latest_work_year}`);
    }
  }

  return { rowsCount: rows.length, matrix, stateCounts };
}

auditOpenAlexPersistence().catch(console.error);
