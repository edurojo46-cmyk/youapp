import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

async function purgeSeededRecords() {
  const seededSourceIds = [
    'UBA_DOCENTES_REGISTRO',
    'HOSPITALES_PUBLICOS_CABA',
    'COMPANY_TEAM_PAGE',
    'FECOBA_CAME_COMERCIO',
    'CONFERENCIAS_EVENTOS_CABA'
  ];

  console.log('Purging seeded records from DB to restore certified baseline...');
  const { data: toDelete, error: selErr } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('discovery_id')
    .in('source_id', seededSourceIds);

  if (selErr) {
    console.error('Select error:', selErr);
    return;
  }

  console.log(`Found ${toDelete?.length} seeded records to purge.`);

  if (toDelete && toDelete.length > 0) {
    const ids = toDelete.map(r => r.discovery_id);
    const { error: delErr } = await supabase
      .from('atlas_people_discovery_candidates')
      .delete()
      .in('discovery_id', ids);

    if (delErr) {
      console.error('Delete error:', delErr);
      return;
    }
    console.log('✅ Successfully purged seeded records.');
  }

  const { count: remaining } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true });

  console.log(`CURRENT CERTIFIED BASELINE COUNT: ${remaining}`);
}

purgeSeededRecords().catch(console.error);
