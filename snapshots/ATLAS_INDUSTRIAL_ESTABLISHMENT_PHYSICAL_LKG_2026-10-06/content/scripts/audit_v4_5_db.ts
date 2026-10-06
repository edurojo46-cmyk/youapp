import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

async function main() {
  console.log('=== AUDITING V4.5 DATABASE STATE ===');

  // 1. Canonical search projection
  const { count: canonicalCount } = await supabase
    .from('atlas_argentina_people_search_projection_v1')
    .select('*', { count: 'exact', head: true });
  console.log('CANONICAL (atlas_argentina_people_search_projection_v1):', canonicalCount);

  // 2. Discovery candidates total
  const { count: candidatesCount } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true });
  console.log('TOTAL DISCOVERY CANDIDATES:', candidatesCount);

  // 3. Conicet rows
  const { count: conicetCount } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true })
    .ilike('source_id', '%conicet%');
  console.log('CONICET ROWS:', conicetCount);

  // 4. Non-Conicet candidates (fetch in chunks if needed)
  let allNonConicet: any[] = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('discovery_id, display_name, organization, role, location_relation_type, location_evidence, source_id, person_source_url, public_email, public_phone, social_profiles')
      .not('source_id', 'ilike', '%conicet%')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Error fetching non-conicet:', error);
      break;
    }
    if (!data || data.length === 0) break;
    allNonConicet = allNonConicet.concat(data);
    if (data.length < pageSize) break;
    page++;
  }

  console.log('NON-CONICET CANDIDATES COUNT:', allNonConicet.length);

  // 5. Unique people non-conicet
  const uniqueNames = new Set<string>();
  const directCabaPeople = new Set<string>();
  const crossSourcePeople = new Set<string>();
  const domainPerPerson = new Map<string, Set<string>>();
  const religiousPeople = new Set<string>();

  const peopleWithEmail = new Set<string>();
  const peopleWithPhone = new Set<string>();
  const peopleWithSocial = new Set<string>();

  // Breakdown by primary family
  const familyCount: Record<string, number> = {
    TRADE_UNIONS: 0,
    CHAMBERS: 0,
    CLUBS_SPORTS: 0,
    MEDIA_BROADCAST: 0,
    COMPANIES: 0,
    UNIVERSITIES: 0,
    HEALTH: 0,
    PROFESSIONAL_REGISTRIES: 0,
    GOVERNMENT_CIVIC: 0,
    RELIGIOUS_INSTITUTIONS: 0,
    OTHER: 0
  };

  for (const row of allNonConicet) {
    const norm = (row.display_name || '').toLowerCase().trim();
    if (!norm) continue;
    uniqueNames.add(norm);

    if (row.location_relation_type === 'WORKS_IN' || 
        row.location_relation_type === 'ORGANIZATION_ROLE_IN_CABA' ||
        row.location_relation_type === 'TEACHES_IN' ||
        (row.location_evidence && (row.location_evidence.includes('CABA') || row.location_evidence.includes('Buenos Aires')))) {
      directCabaPeople.add(norm);
    }

    // Check domain
    let domain = '';
    if (row.person_source_url) {
      try {
        domain = new URL(row.person_source_url).hostname;
      } catch {}
    }
    if (!domainPerPerson.has(norm)) {
      domainPerPerson.set(norm, new Set());
    }
    if (domain) domainPerPerson.get(norm)!.add(domain);

    // Check social profiles
    if (row.social_profiles && Array.isArray(row.social_profiles)) {
      for (const sp of row.social_profiles) {
        try {
          const spDom = new URL(sp).hostname;
          domainPerPerson.get(norm)!.add(spDom);
        } catch {}
      }
    }

    // Map source to family
    const src = (row.source_id || '').toLowerCase();
    const org = (row.organization || '').toLowerCase();
    const role = (row.role || '').toLowerCase();

    let family = 'OTHER';
    if (src.includes('religious') || src.includes('arzbaires') || src.includes('caritas') || src.includes('daia') || src.includes('cira') ||
        org.includes('arzobispado') || org.includes('cáritas') || org.includes('caritas') || org.includes('parroquia') || org.includes('basílica') || org.includes('templo') || org.includes('daia') || org.includes('cira') ||
        role.includes('párroco') || role.includes('rabino') || role.includes('pastor') || role.includes('imam') || role.includes('obispo') || role.includes('vicario')) {
      family = 'RELIGIOUS_INSTITUTIONS';
      religiousPeople.add(norm);
    } else if (src.includes('union') || org.includes('sindicato') || org.includes('gremio') || org.includes('asociación bancaria') || org.includes('uocra') || org.includes('suterh') || org.includes('ate capital') || org.includes('upcn')) {
      family = 'TRADE_UNIONS';
    } else if (src.includes('chamber') || org.includes('cámara') || org.includes('cac') || org.includes('uia') || org.includes('cgera') || org.includes('came')) {
      family = 'CHAMBERS';
    } else if (src.includes('club') || org.includes('club') || org.includes('river') || org.includes('boca') || org.includes('san lorenzo') || org.includes('velez') || org.includes('ferro') || org.includes('huracán')) {
      family = 'CLUBS_SPORTS';
    } else if (src.includes('media') || org.includes('clarín') || org.includes('la nación') || org.includes('infobae') || org.includes('perfil') || org.includes('página 12')) {
      family = 'MEDIA_BROADCAST';
    } else if (src.includes('company') || org.includes('ypf') || org.includes('techint') || org.includes('mercadolibre') || org.includes('globant') || org.includes('arcor') || org.includes('banco galicia') || org.includes('telecom')) {
      family = 'COMPANIES';
    } else if (src.includes('uni') || org.includes('universidad') || org.includes('uba') || org.includes('uca') || org.includes('usal') || org.includes('utn') || org.includes('itba') || org.includes('torcuato di tella') || org.includes('san andrés')) {
      family = 'UNIVERSITIES';
    } else if (src.includes('health') || src.includes('hospital') || org.includes('hospital') || org.includes('sanatorio') || org.includes('garrahan') || org.includes('italiano') || org.includes('clínicas') || org.includes('fernández')) {
      family = 'HEALTH';
    } else if (src.includes('cpce') || src.includes('cpau') || src.includes('colproba') || src.includes('cpacf') || org.includes('cpce') || org.includes('cpau') || org.includes('colegio')) {
      family = 'PROFESSIONAL_REGISTRIES';
    } else if (src.includes('legis') || src.includes('defensor') || org.includes('legislatura') || org.includes('defensoría') || org.includes('gcba') || org.includes('gobierno de la ciudad')) {
      family = 'GOVERNMENT_CIVIC';
    }

    familyCount[family] = (familyCount[family] || 0) + 1;

    if (row.public_email && !peopleWithEmail.has(norm)) {
      peopleWithEmail.add(norm);
    }
    if (row.public_phone && !peopleWithPhone.has(norm)) {
      peopleWithPhone.add(norm);
    }
    if (row.social_profiles && row.social_profiles.length > 0 && !peopleWithSocial.has(norm)) {
      peopleWithSocial.add(norm);
    }
  }

  for (const [norm, domains] of domainPerPerson.entries()) {
    if (domains.size >= 2) {
      crossSourcePeople.add(norm);
    }
  }

  console.log('----------------------------------------------------');
  console.log('VALIDATED UNIQUE NON-CONICET PEOPLE:', uniqueNames.size);
  console.log('DIRECT CABA NON-CONICET PEOPLE:', directCabaPeople.size);
  console.log('CROSS SOURCE PEOPLE:', crossSourcePeople.size);
  console.log('RELIGIOUS INSTITUTIONS PUBLIC ROLES:', religiousPeople.size);
  console.log('PEOPLE WITH EMAIL:', peopleWithEmail.size);
  console.log('PEOPLE WITH PHONE:', peopleWithPhone.size);
  console.log('PEOPLE WITH SOCIAL:', peopleWithSocial.size);
  console.log('----------------------------------------------------');
  console.log('FAMILY BREAKDOWN (ROWS):', JSON.stringify(familyCount, null, 2));
}

main().catch(console.error);
