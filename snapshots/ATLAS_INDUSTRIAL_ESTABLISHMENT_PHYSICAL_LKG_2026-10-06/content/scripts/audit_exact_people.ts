import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function exactPeopleAudit() {
  let page = 0;
  const pageSize = 1000;
  const nonConicet: any[] = [];

  while (true) {
    const { data } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('*')
      .neq('source_id', 'CONICET_OAI_PMH')
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (!data || data.length === 0) break;
    nonConicet.push(...data);
    if (data.length < pageSize) break;
    page++;
  }

  // 1. All non-conicet unique people by name/fingerprint
  const allNonConicetNames = new Set<string>();
  const directCabaNames = new Set<string>();
  const autoSourceNames = new Set<string>();
  const autoSources = ['ACTORES_SINDICATO_CABA', 'COA_FEDERACION_CABA', 'CAME_CAMARA_CABA', 'UBA_DOCENTES_REGISTRO', 'HOSPITAL_GARRAHAN_CABA'];

  let directCabaRows = 0;
  let autoRows = 0;

  for (const r of nonConicet) {
    const norm = r.display_name.trim().toLowerCase().replace(/^(dr|dra|lic|prof|mg|ctdor|arq|di)_+/g, '');
    allNonConicetNames.add(norm);

    const rel = r.location_relation_type;
    const isDirect = ['WORKS_IN', 'TEACHES_IN', 'PROFESSIONAL_PRACTICE_IN', 'BUSINESS_LOCATED_IN', 'RESIDES_IN', 'SERVES_AREA'].includes(rel);

    if (isDirect) {
      directCabaRows++;
      directCabaNames.add(norm);
    }

    if (autoSources.includes(r.source_id)) {
      autoRows++;
      autoSourceNames.add(norm);
    }
  }

  console.log(`TOTAL NON-CONICET ROWS: ${nonConicet.length}`);
  console.log(`TOTAL NON-CONICET UNIQUE PEOPLE: ${allNonConicetNames.size}`);
  console.log(`DIRECT CABA ROWS: ${directCabaRows}`);
  console.log(`DIRECT CABA UNIQUE PEOPLE: ${directCabaNames.size}`);
  console.log(`AUTO-SOURCE ROWS IN NON-CONICET: ${autoRows}`);
  console.log(`AUTO-SOURCE UNIQUE PEOPLE: ${autoSourceNames.size}`);
}

exactPeopleAudit().catch(console.error);
