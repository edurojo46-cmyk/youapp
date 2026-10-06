import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkGeography() {
  const { data: sample } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('neighborhood, geography_id')
    .limit(20);

  console.log('Sample neighborhood & geography_id:', sample);

  // Check if neighborhood has CABA or Caballito
  const { count: countCaba } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true })
    .ilike('neighborhood', '%CABA%');

  const { count: countCaballito } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true })
    .ilike('neighborhood', '%Caballito%');

  console.log('Count neighborhood ilike %CABA%:', countCaba);
  console.log('Count neighborhood ilike %Caballito%:', countCaballito);
}

checkGeography().catch(console.error);
