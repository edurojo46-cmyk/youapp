import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

const GENERIC_EMAIL_PREFIXES = [
  'info', 'contacto', 'administracion', 'ventas', 'recepcion', 'secretaria',
  'secretariageneral', 'prensa', 'consultas', 'atencion', 'soporte', 'rrhh',
  'decanato', 'vicedecanato', 'presidencia', 'comercio', 'industria', 'hacienda'
];

function isPersonalEmail(email: string | null): boolean {
  if (!email || !email.includes('@')) return false;
  const prefix = email.split('@')[0].toLowerCase().replace(/[._-]/g, '');
  for (const gen of GENERIC_EMAIL_PREFIXES) {
    if (prefix === gen) return false;
  }
  return true;
}

async function verify() {
  let allRecords: any[] = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data: records, error } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('*')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error || !records || records.length === 0) break;
    allRecords.push(...records);
    if (records.length < pageSize) break;
    page++;
  }

  const records = allRecords;
  const total = records.length;
  console.log(`TOTAL RECORDS IN DISCOVERY INDEX: ${total}`);

  let withEmail = 0;
  let withPhone = 0;
  let withSocial = 0;
  let genericEmailCount = 0;
  let genericPhoneCount = 0;

  let personClassified = 0;
  let validatedPerson = 0;
  let crossSourceVerified = 0;

  const sources = new Map<string, number>();

  for (const r of records) {
    sources.set(r.source_id, (sources.get(r.source_id) || 0) + 1);

    if (r.public_email) {
      withEmail++;
      if (!isPersonalEmail(r.public_email)) {
        genericEmailCount++;
      }
    }

    if (r.public_phone) {
      withPhone++;
      if (r.public_phone.includes('0200') || r.public_phone.includes('5555') || r.public_phone.includes('9900')) {
        genericPhoneCount++;
      }
    }

    if (r.social_profiles && r.social_profiles.length > 0) {
      withSocial++;
    }

    // Mutual Exclusive Certainty
    const domains = new Set<string>();
    if (r.person_source_url) {
      try { domains.add(new URL(r.person_source_url).hostname.replace('www.', '')); } catch {}
    }
    if (r.location_source_url) {
      try { domains.add(new URL(r.location_source_url).hostname.replace('www.', '')); } catch {}
    }
    if (r.website) {
      try { domains.add(new URL(r.website).hostname.replace('www.', '')); } catch {}
    }
    if (r.social_profiles && Array.isArray(r.social_profiles)) {
      for (const sp of r.social_profiles) {
        if (sp.url) {
          try { domains.add(new URL(sp.url).hostname.replace('www.', '')); } catch {}
        }
      }
    }

    const isInstitutionalRoster = [
      'GCBA_COMUNAS_JUNTAS',
      'UBA_DOCENTES_REGISTRO',
      'HOSPITAL_DURAND_CABALLITO',
      'INSTITUTO_PASTEUR_CABALLITO',
      'GCBA_COMUNA_6_JUNTA',
      'CONICET_MACN_CABALLITO',
      'CPACF_PADRON_ABOGADOS',
      'COLEGIO_PSICOLOGOS_CABA',
      'GCBA_NOMINA_PERSONAL',
      'CPAU_PADRON_ARQUITECTOS',
      'GCBA_EDUCACION_COMUNA_6',
      'ASOCIACION_COMERCIANTES_CABALLITO',
      'SANATORIO_MENDEZ_CABALLITO',
      'CPCECABA_PADRON_CONTADORES',
      'WIKIDATA_PUBLIC',
      'REFEPS_REGISTRY',
      'INSTITUTIONAL_NEWS'
    ].includes(r.source_id);

    const isFactualDeveloper = r.source_id === 'GITHUB_API' && (!!r.public_email || !!r.website);
    const isDatedNews = ['NEWS_MEDIA', 'LOCAL_NEWS', 'SPECIALIZED_MEDIA', 'INSTITUTIONAL_NEWS'].includes(r.source_id);

    if (domains.size >= 2) {
      crossSourceVerified++;
    } else if (isInstitutionalRoster || isFactualDeveloper || isDatedNews) {
      validatedPerson++;
    } else {
      personClassified++;
    }
  }

  // Canonical tables
  const { count: cSub } = await supabase.from('atlas_observation_subjects').select('*', { count: 'exact', head: true });
  const { count: cObs } = await supabase.from('atlas_person_observations').select('*', { count: 'exact', head: true });
  const { count: cProj } = await supabase.from('atlas_argentina_people_search_projection_v1').select('*', { count: 'exact', head: true });

  console.log('\n--- BY SOURCE ---');
  for (const [src, cnt] of sources.entries()) {
    console.log(`${src}: ${cnt}`);
  }

  console.log('\n--- METRICS SUMMARY ---');
  console.log(`TOTAL_RECORDS: ${total}`);
  console.log(`CABA_PERSON_CLASSIFIED: ${personClassified}`);
  console.log(`CABA_VALIDATED_PERSON: ${validatedPerson}`);
  console.log(`CABA_CROSS_SOURCE_VERIFIED_PERSON: ${crossSourceVerified}`);
  console.log(`SUM: ${personClassified + validatedPerson + crossSourceVerified}`);
  console.log(`CABA_WITH_PUBLIC_EMAIL: ${withEmail}`);
  console.log(`CABA_WITH_PUBLIC_PHONE: ${withPhone}`);
  console.log(`CABA_WITH_SOCIAL: ${withSocial}`);
  console.log(`GENERIC_ORG_EMAIL_AS_PERSON_EMAIL: ${genericEmailCount}`);
  console.log(`GENERIC_ORG_PHONE_AS_PERSON_PHONE: ${genericPhoneCount}`);
  console.log(`CANONICAL SUBJECTS: ${cSub}`);
  console.log(`CANONICAL OBSERVATIONS: ${cObs}`);
  console.log(`CANONICAL PROJECTIONS: ${cProj}`);
}

verify().catch(console.error);
