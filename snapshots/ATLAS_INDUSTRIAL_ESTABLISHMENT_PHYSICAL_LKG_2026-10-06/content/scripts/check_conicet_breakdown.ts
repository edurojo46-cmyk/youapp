import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkConicetBreakdown() {
  const { count: totalConicet } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true })
    .eq('source_id', 'CONICET_OAI_PMH');

  const { count: nonCabaEvidence } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true })
    .eq('source_id', 'CONICET_OAI_PMH')
    .ilike('location_evidence', '%radicada fuera de CABA%');

  const { count: pendingResolution } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true })
    .eq('source_id', 'CONICET_OAI_PMH')
    .eq('location_relation_type', 'PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE')
    .not('location_evidence', 'ilike', '%radicada fuera de CABA%');

  console.log(`Total CONICET rows: ${totalConicet}`);
  console.log(`CONICET rows with "radicada fuera de CABA": ${nonCabaEvidence}`);
  console.log(`CONICET rows truly pending resolution: ${pendingResolution}`);
}

checkConicetBreakdown().catch(console.error);
