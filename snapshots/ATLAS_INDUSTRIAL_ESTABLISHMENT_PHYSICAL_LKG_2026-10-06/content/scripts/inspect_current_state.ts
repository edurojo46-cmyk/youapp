import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

async function inspect() {
  const { data, error } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('source_id, discovery_id, display_name, public_email, public_phone, location_source_url');

  if (error || !data) {
    console.error('Error:', error);
    return;
  }

  const bySource: Record<string, number> = {};
  for (const r of data) {
    bySource[r.source_id] = (bySource[r.source_id] || 0) + 1;
  }

  console.log(`TOTAL RECORDS IN DB: ${data.length}`);
  console.log('BY SOURCE:', bySource);

  // Check how many have email and phone
  const withEmail = data.filter(r => !!r.public_email).length;
  const withPhone = data.filter(r => !!r.public_phone).length;
  console.log(`WITH PUBLIC EMAIL: ${withEmail}`);
  console.log(`WITH PUBLIC PHONE: ${withPhone}`);

  // Inspect the new source_ids inserted by execute_master_growth_v3
  const newSources = ['UBA_DOCENTES_REGISTRO', 'HOSPITALES_PUBLICOS_CABA', 'COMPANY_TEAM_PAGE', 'FECOBA_CAME_COMERCIO', 'CONFERENCIAS_EVENTOS_CABA'];
  const newRecords = data.filter(r => newSources.includes(r.source_id));
  console.log(`TOTAL NEW EXPERIMENTAL RECORDS: ${newRecords.length}`);
}

inspect().catch(console.error);
