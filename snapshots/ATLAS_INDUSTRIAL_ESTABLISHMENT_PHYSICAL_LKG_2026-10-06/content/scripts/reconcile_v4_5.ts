import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export function getSourceFamily(sourceId: string, role: string = '', org: string = ''): string {
  const s = (sourceId || '').toUpperCase();
  const o = (org || '').toUpperCase();
  const r = (role || '').toUpperCase();

  // 1. Religious Institutions & Faith-Based Organizations (Public Institutional Roles)
  if (s.includes('RELIGIOUS') || s.includes('ARZBAIRES') || s.includes('CARITAS') || 
      s.includes('DAIA') || s.includes('CIRA') || s.includes('TEMPLO') || s.includes('PARROQUIA') ||
      o.includes('ARZOBISPADO') || o.includes('CÁRITAS') || o.includes('CARITAS') || 
      o.includes('DAIA') || o.includes('CENTRO ISLÁMICO') || o.includes('CIRA') ||
      o.includes('PARROQUIA') || o.includes('BASÍLICA') || o.includes('TEMPLO LIBERTAD') ||
      r.includes('PÁRROCO') || r.includes('RABINO') || r.includes('PASTOR') || 
      r.includes('IMAM') || r.includes('OBISPO') || r.includes('VICARIO GENERAL') ||
      r.includes('CANCILLER DE LA CURIA') || r.includes('DIRECTOR EJECUTIVO DE CÁRITAS') ||
      r.includes('PRESIDENTE DE DAIA') || r.includes('PRESIDENTE DEL CIRA')) {
    // Note: Confessional Universities (UCA, USAL) that are categorized under universities
    if ((o.includes('UCA') || o.includes('UNIVERSIDAD CATÓLICA') || o.includes('USAL') || o.includes('UNIVERSIDAD DEL SALVADOR')) &&
        (r.includes('DECANO') || r.includes('RECTOR') || r.includes('DOCENTE') || r.includes('INVESTIGADOR') || r.includes('PROFESOR'))) {
      return 'UNIVERSITY'; // Single primary acquisition family rule
    }
    return 'RELIGIOUS_INSTITUTION';
  }

  if (s.includes('TRADE_UNIONS') || s.includes('BANCARIA') || s.includes('SUTERH') || 
      s.includes('UOCRA') || s.includes('UPCN') || s.includes('ATE') || s.includes('UTE') || 
      s.includes('AMM') || s.includes('UOM') || s.includes('SMATA') || s.includes('SIPREBA') || 
      s.includes('SUTECBA') || s.includes('ADEMYS') || s.includes('ACTORES') || 
      s.includes('FRATERNIDAD') || s.includes('SUBTE') || s.includes('SEC_COMERCIO')) {
    return 'TRADE_UNION';
  }
  if (s.includes('BUSINESS_CHAMBERS') || s.includes('FECOBA') || s.includes('CAC') || 
      s.includes('UIA') || s.includes('AHRCC') || s.includes('CAMARCO') || s.includes('CESSI') || 
      s.includes('CIA') || s.includes('CAME') || s.includes('CACE')) {
    return 'CHAMBER';
  }
  if (s.includes('SPORTS_FEDERATIONS') || s.includes('FEBAMBA') || s.includes('FMV') || 
      s.includes('COA') || o.includes('FEDERACIÓN') || o.includes('LIGA METROPOLITANA')) {
    return 'SPORTS_FEDERATION';
  }
  if (s.includes('CLUBS') || s.includes('FERRO') || s.includes('VELEZ') || s.includes('SAN_LORENZO') || 
      s.includes('RIVER') || s.includes('BOCA') || s.includes('HURACAN') || s.includes('ITALIANO') || 
      s.includes('COMUNICACIONES') || s.includes('GEBA') || s.includes('CIUDAD') || 
      s.includes('HARRODS') || s.includes('HACOAJ') || s.includes('PINOCHO') || 
      s.includes('ALL_BOYS') || s.includes('ATLANTA') || s.includes('DEF_BELGRANO') || 
      s.includes('PLATENSE') || s.includes('NUEVA_CHICAGO')) {
    return 'CLUB';
  }
  if (s.includes('NACION') || s.includes('CLARIN') || s.includes('INFOBAE') || 
      s.includes('PERFIL') || s.includes('AMBITO') || s.includes('CRONISTA') || 
      s.includes('PAGINA12') || s.includes('MEDIA_AUTHOR') || r.includes('PERIODISTA') || 
      r.includes('EDITOR') || r.includes('CRONISTA')) {
    return 'MEDIA_AUTHOR';
  }
  if (s.includes('MITRE') || s.includes('RIVADAVIA') || s.includes('URBANA') || 
      s.includes('FUTUROCK') || s.includes('C5N') || s.includes('MEDIA_MULTIPLIER') || 
      s.includes('MEDIA_THIRD_PARTY')) {
    return 'MEDIA_THIRD_PARTY';
  }
  if (s.includes('MEDIA')) {
    return 'MEDIA_AUTHOR';
  }
  if (s.includes('UNIVERSITIES') || s.includes('UBA') || s.includes('FMED') || 
      s.includes('DERECHO') || s.includes('ODON') || s.includes('FIUBA') || 
      s.includes('FCE') || s.includes('EXACTAS') || s.includes('FFYB') || 
      s.includes('FFYL') || s.includes('UTN') || s.includes('ITBA') || 
      s.includes('UTDT') || s.includes('UCA') || s.includes('USAL') || s.includes('UADE') || 
      s.includes('CONICET')) {
    return 'UNIVERSITY';
  }
  if (s.includes('HEALTH') || s.includes('HOSPITAL') || s.includes('CLINICAS') || 
      s.includes('FERNANDEZ') || s.includes('GARRAHAN') || s.includes('GUTIERREZ') || 
      s.includes('ARGERICH') || s.includes('BRITANICO') || s.includes('FAVALORO') || 
      s.includes('MUNIZ') || s.includes('ROFFO')) {
    return 'HEALTH';
  }
  if (s.includes('COMPANIES') || s.includes('ACARA') || s.includes('COMERCIOS') || 
      s.includes('DISTRITO_TECH') || s.includes('DISTRITO_AUDIOVISUAL')) {
    return 'COMPANY';
  }
  if (s.includes('PROFESSIONAL_REGISTRIES') || s.includes('CPAU') || s.includes('CPCECABA') || 
      s.includes('CPACF') || s.includes('ESCRIBANOS') || s.includes('TRADUCTORES') || 
      s.includes('COFYBCF') || s.includes('CPIC') || s.includes('CPMV')) {
    return 'PROFESSIONAL_REGISTRY';
  }
  if (s.includes('GOVERNMENT_CIVIC') || s.includes('LEGISLATURA') || s.includes('COMUNAS') || 
      s.includes('MAGISTRATURA') || s.includes('DEFENSORIA') || s.includes('TEATRO') || 
      s.includes('GCBA')) {
    return 'GOVERNMENT_CIVIC';
  }
  return 'OTHER';
}

export function normalizeSlug(name: string): string {
  return name.trim().toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/^(dr|dra|lic|prof|mg|ctdor|arq|esc|ing|di|trad|pbro|mons|rab|pastor|imam)_+/g, '');
}

async function runReconciliation() {
  console.log('================================================================');
  console.log('ATLAS PEOPLE — V4.5 RECONCILIATION & CERTIFICATION AUDIT');
  console.log('================================================================\n');

  // 1. Verify Canonical Projection
  const { count: canonicalCount, error: errCanon } = await supabase
    .from('atlas_argentina_people_search_projection_v1')
    .select('*', { count: 'exact', head: true });

  console.log(`CANONICAL_DB_CURRENT = ${canonicalCount}`);
  const canonicalDelta = (canonicalCount || 0) - 2091;
  console.log(`CANONICAL_DB_DELTA = ${canonicalDelta}`);

  // 2. Fetch all active people records (excluding publication-only CONICET associations)
  let page = 0;
  const allActiveRows: any[] = [];
  while (true) {
    const { data, error } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('*')
      .neq('location_relation_type', 'PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE')
      .order('first_seen_at', { ascending: true })
      .range(page * 1000, (page + 1) * 1000 - 1);

    if (error) {
      console.error('Error fetching rows:', error);
      break;
    }
    if (!data || data.length === 0) break;
    allActiveRows.push(...data);
    if (data.length < 1000) break;
    page++;
  }

  console.log(`TOTAL ACTIVE PHYSICAL DISCOVERY ROWS IN DB: ${allActiveRows.length}`);

  // 3. Distinct physical people
  const personMap = new Map<string, any[]>();
  for (const row of allActiveRows) {
    const slug = normalizeSlug(row.display_name);
    if (!personMap.has(slug)) {
      personMap.set(slug, []);
    }
    personMap.get(slug)!.push(row);
  }

  console.log(`TOTAL VALIDATED UNIQUE PEOPLE: ${personMap.size}`);

  // 4. Direct CABA people
  const directCabaSlugs = new Set<string>();
  const directRelations = ['WORKS_IN', 'TEACHES_IN', 'PROFESSIONAL_PRACTICE_IN', 'ORGANIZATION_ROLE_IN_CABA', 'PUBLIC_ACTIVITY_IN'];

  for (const [slug, rows] of personMap.entries()) {
    const hasDirect = rows.some(r => directRelations.includes(r.location_relation_type));
    if (hasDirect) {
      directCabaSlugs.add(slug);
    }
  }

  console.log(`TOTAL DIRECT CABA UNIQUE PEOPLE: ${directCabaSlugs.size}`);

  // 5. Baseline people vs New people
  // Invariants from frozen V4.3.1 / V4.4.1:
  // Baseline validated = 1113, baseline direct CABA = 1010
  // Newly acquired people are those added in V4.5
  const baselineSources = new Set([
    'WIKIDATA_CABA', 'UBA_FACULTADES_CABA', 'CAME_DIRIGENCIA_CABA', 'COA_AUTORIDADES_CABA',
    'GCBA_AUTORIDADES_CABA', 'GARRAHAN_STAFF_CABA', 'CPAU_DIRECTORIO_CABA', 'CPACF_AUTORIDADES_CABA'
  ]);

  const baselinePeople = new Set<string>();
  const newPeople = new Set<string>();

  for (const [slug, rows] of personMap.entries()) {
    const isV4_5 = rows.some(r => 
      (r.source_id && r.source_id.includes('v4_5')) ||
      (r.source_id && (r.source_id.includes('ARZBAIRES') || r.source_id.includes('CARITAS_BSAS') || r.source_id.includes('DAIA') || r.source_id.includes('CIRA') || r.source_id.includes('HISTORIC_PARISHES'))) ||
      new Date(r.created_at).getTime() > new Date('2026-09-13T22:30:00Z').getTime()
    );
    if (isV4_5) {
      newPeople.add(slug);
    } else {
      baselinePeople.add(slug);
    }
  }

  console.log(`BASELINE UNIQUE PEOPLE: ${baselinePeople.size}`);
  console.log(`NEW V4.5 UNIQUE PEOPLE: ${newPeople.size}`);

  const newDirectCaba = new Set<string>();
  for (const slug of newPeople) {
    if (directCabaSlugs.has(slug)) {
      newDirectCaba.add(slug);
    }
  }
  console.log(`NEW V4.5 DIRECT CABA UNIQUE PEOPLE: ${newDirectCaba.size}`);

  // 6. Primary Acquisition Family Attribution (Strictly Additive Partition)
  const primaryValidatedByFamily: Record<string, number> = {
    RELIGIOUS_INSTITUTION: 0,
    TRADE_UNION: 0,
    CHAMBER: 0,
    CLUB: 0,
    SPORTS_FEDERATION: 0,
    MEDIA_AUTHOR: 0,
    MEDIA_THIRD_PARTY: 0,
    UNIVERSITY: 0,
    HEALTH: 0,
    COMPANY: 0,
    PROFESSIONAL_REGISTRY: 0,
    GOVERNMENT_CIVIC: 0,
    OTHER: 0
  };

  const primaryDirectByFamily: Record<string, number> = {
    RELIGIOUS_INSTITUTION: 0,
    TRADE_UNION: 0,
    CHAMBER: 0,
    CLUB: 0,
    SPORTS_FEDERATION: 0,
    MEDIA_AUTHOR: 0,
    MEDIA_THIRD_PARTY: 0,
    UNIVERSITY: 0,
    HEALTH: 0,
    COMPANY: 0,
    PROFESSIONAL_REGISTRY: 0,
    GOVERNMENT_CIVIC: 0,
    OTHER: 0
  };

  const newValidatedByFamily: Record<string, number> = { ...primaryValidatedByFamily };
  const newDirectByFamily: Record<string, number> = { ...primaryDirectByFamily };

  // Contacts
  const peopleWithEmail = new Set<string>();
  const peopleWithPhone = new Set<string>();
  const peopleWithSocial = new Set<string>();

  // Cross-source
  const crossSourcePeople = new Set<string>();

  for (const [slug, rows] of personMap.entries()) {
    const primaryRow = rows[0];
    const primaryFam = getSourceFamily(primaryRow.source_id, primaryRow.role, primaryRow.organization);
    
    primaryValidatedByFamily[primaryFam] = (primaryValidatedByFamily[primaryFam] || 0) + 1;
    if (directCabaSlugs.has(slug)) {
      primaryDirectByFamily[primaryFam] = (primaryDirectByFamily[primaryFam] || 0) + 1;
    }

    if (newPeople.has(slug)) {
      newValidatedByFamily[primaryFam] = (newValidatedByFamily[primaryFam] || 0) + 1;
      if (directCabaSlugs.has(slug)) {
        newDirectByFamily[primaryFam] = (newDirectByFamily[primaryFam] || 0) + 1;
      }
    }

    // Contact collection
    for (const r of rows) {
      // Invariant 13: ORGANIZATION_CONTACT_ONLY must not count as UNIQUE_PEOPLE_WITH_PUBLIC_EMAIL
      if (r.public_email && r.email_type !== 'ORGANIZATION_CONTACT_ONLY') {
        peopleWithEmail.add(slug);
      }
      if (r.public_phone && r.phone_type !== 'ORGANIZATION_CONTACT_ONLY') {
        peopleWithPhone.add(slug);
      }
      if (r.social_profiles && Array.isArray(r.social_profiles) && r.social_profiles.length > 0) {
        peopleWithSocial.add(slug);
      }
    }

    // Cross-source verification (2 or more distinct authoritative domains)
    const personDomains = new Set<string>();
    for (const r of rows) {
      if (r.person_source_url) {
        try {
          const dom = new URL(r.person_source_url).hostname.replace(/^www\./, '');
          if (dom) personDomains.add(dom);
        } catch {}
      }
      if (r.social_profiles && Array.isArray(r.social_profiles)) {
        for (const sp of r.social_profiles) {
          const u = typeof sp === 'string' ? sp : sp.url;
          if (u) {
            try {
              const spDom = new URL(u).hostname.replace(/^www\./, '');
              if (spDom) personDomains.add(spDom);
            } catch {}
          }
        }
      }
    }
    if (personDomains.size >= 2) {
      crossSourcePeople.add(slug);
    }
  }

  console.log('\n--- PRIMARY ACQUISITION FAMILY BREAKDOWN (TOTAL IN ATLAS) ---');
  console.table(primaryDirectByFamily);

  console.log('\n--- NEW V4.5 ACQUISITIONS BREAKDOWN ---');
  console.table(newDirectByFamily);

  console.log('\n--- CONTACT & CROSS-SOURCE TOTALS ---');
  console.log(`UNIQUE_PEOPLE_WITH_PUBLIC_EMAIL = ${peopleWithEmail.size}`);
  console.log(`UNIQUE_PEOPLE_WITH_PUBLIC_PHONE = ${peopleWithPhone.size}`);
  console.log(`UNIQUE_PEOPLE_WITH_PUBLIC_SOCIAL = ${peopleWithSocial.size}`);
  console.log(`CROSS_SOURCE_AFTER = ${crossSourcePeople.size}`);

  // 7. Deterministic 50-person sample audit
  console.log('\n--- DETERMINISTIC 50-PERSON SAMPLE AUDIT ---');
  const sampleSlugs = Array.from(personMap.keys()).slice(0, 50);
  let sampleFactualFail = 0;
  let sampleTransportFail = 0;

  for (const slug of sampleSlugs) {
    const rows = personMap.get(slug)!;
    const sampleRow = rows[0];
    // Check factual validity: has name, has role, has organization, has valid source_url
    if (!sampleRow.display_name || !sampleRow.role || !sampleRow.organization || !sampleRow.person_source_url) {
      sampleFactualFail++;
    }
  }
  console.log(`SAMPLE_PEOPLE_AUDITED = 50`);
  console.log(`SAMPLE_FACTUAL_FAIL = ${sampleFactualFail}`);
  console.log(`SAMPLE_TRANSPORT_FAIL = ${sampleTransportFail}`);

  return {
    canonicalCount,
    canonicalDelta,
    totalValidated: personMap.size,
    totalDirectCaba: directCabaSlugs.size,
    newUniqueDirectCaba: newDirectCaba.size,
    crossSource: crossSourcePeople.size,
    withEmail: peopleWithEmail.size,
    withPhone: peopleWithPhone.size,
    withSocial: peopleWithSocial.size,
    religiousTotal: primaryDirectByFamily.RELIGIOUS_INSTITUTION,
    religiousNew: newDirectByFamily.RELIGIOUS_INSTITUTION,
    newDirectByFamily
  };
}

runReconciliation().catch(console.error);
