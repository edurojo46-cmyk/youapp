import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log('--- AUDITORÍA DE FUENTES Y CONTEOS EN DISCOVERY CANDIDATES ---');
  const sources = [
    'BIEP_APN',
    'CONICET_OAI_PMH',
    'WIKIDATA_CABA_PERSONS',
    'OPENALEX_CABA',
    'GCBA_COMUNA_6_JUNTA',
    'GCBA_EDUCACION_COMUNA_6',
    'ASOCIACION_COMERCIANTES_CABALLITO',
    'UBA_ECONOMICAS_REGISTRO',
    'UBA_EXACTAS_DOCENTES',
    'UBA_MEDICINA_DOCENTES',
    'IGJ_AUTORIDADES_2026'
  ];

  for (const s of sources) {
    const { count } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('*', { count: 'exact', head: true })
      .eq('source_id', s);
    if (count && count > 0) {
      console.log(`Source ${s}: ${count} rows`);
    }
  }

  const { count: total } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true });
  console.log(`TOTAL ROWS in atlas_people_discovery_candidates: ${total}`);

  // Also check atlas_people_resolution_items
  const { count: resTotal } = await supabase
    .from('atlas_people_resolution_items')
    .select('*', { count: 'exact', head: true });
  console.log(`TOTAL ROWS in atlas_people_resolution_items: ${resTotal}`);

  const { count: resCaba } = await supabase
    .from('atlas_people_resolution_items')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'RESOLVED_CABA');
  console.log(`RESOLVED_CABA in atlas_people_resolution_items: ${resCaba}`);

  const { count: resNonCaba } = await supabase
    .from('atlas_people_resolution_items')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'RESOLVED_NON_CABA');
  console.log(`RESOLVED_NON_CABA in atlas_people_resolution_items: ${resNonCaba}`);

  const { count: resUnresolved } = await supabase
    .from('atlas_people_resolution_items')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'UNRESOLVED');
  console.log(`UNRESOLVED in atlas_people_resolution_items: ${resUnresolved}`);
}

run().catch(console.error);
