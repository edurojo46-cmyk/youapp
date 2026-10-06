import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const { count: total } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true });

  const { count: canon } = await supabase
    .from('atlas_argentina_people_search_projection_v1')
    .select('*', { count: 'exact', head: true });

  // Get source counts
  let page = 0;
  const pageSize = 1000;
  const sourceMap = new Map<string, number>();

  while (true) {
    const { data, error } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('source_id')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error || !data || data.length === 0) break;
    for (const r of data) {
      sourceMap.set(r.source_id, (sourceMap.get(r.source_id) || 0) + 1);
    }
    if (data.length < pageSize) break;
    page++;
  }

  console.log('TOTAL_DISCOVERY_INDEX:', total);
  console.log('TOTAL_CANONICAL:', canon);
  console.log('SOURCES_BREAKDOWN:', Object.fromEntries(sourceMap.entries()));
}

check().catch(console.error);
