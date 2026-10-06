import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkBreakdown() {
  const { count: totalCandidates, error: err1 } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true });

  const { count: canonicalTotal, error: err2 } = await supabase
    .from('atlas_argentina_people_search_projection_v1')
    .select('*', { count: 'exact', head: true });

  console.log(`TOTAL DISCOVERY CANDIDATES: ${totalCandidates}`);
  console.log(`TOTAL CANONICAL PROJECTION: ${canonicalTotal}`);

  // Count by source_id
  const sources = [
    'CONICET_OAI_PMH',
    'UBA_DOCENTES_REGISTRO',
    'CAME_CAMARA_CABA',
    'ACTORES_SINDICATO_CABA',
    'COA_FEDERACION_CABA',
    'HOSPITAL_GARRAHAN_CABA',
    'MINCYT_INVESTIGADORES',
    'BCRA_AUTORIDADES',
    'CNV_DIRECTORIO',
    'LEGISLATURA_CABA'
  ];

  for (const src of sources) {
    const { count } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('*', { count: 'exact', head: true })
      .eq('source_id', src);
    if (count && count > 0) {
      console.log(`  Source ${src}: ${count}`);
    }
  }

  // Count relation types
  const relTypes = ['WORKS_IN', 'PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE', 'ASSOCIATED_WITH'];
  for (const rel of relTypes) {
    const { count } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('*', { count: 'exact', head: true })
      .eq('location_relation_type', rel);
    console.log(`  Relation ${rel}: ${count}`);
  }
}

checkBreakdown().catch(console.error);
