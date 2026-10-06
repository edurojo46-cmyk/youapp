import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkConicetStats() {
  const { count: totalConicet, error } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('discovery_id', { count: 'exact', head: true })
    .eq('source_id', 'CONICET_OAI_PMH');

  console.log('Total CONICET rows in DB:', totalConicet);

  const { data: nonCaba, count: nonCabaCount } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('discovery_id', { count: 'exact' })
    .eq('source_id', 'CONICET_OAI_PMH')
    .eq('location_relation_type', 'CONFIRMED_NON_CABA');

  console.log('CONICET rows already CONFIRMED_NON_CABA:', nonCabaCount);

  const { count: pendingCount } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('discovery_id', { count: 'exact', head: true })
    .eq('source_id', 'CONICET_OAI_PMH')
    .neq('location_relation_type', 'CONFIRMED_NON_CABA');

  console.log('CONICET rows pending resolution:', pendingCount);
}

checkConicetStats();
