import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function mapSourceToFamily(sourceId: string, org: string = '', role: string = ''): string {
  const s = (sourceId || '').toUpperCase();
  const o = (org || '').toUpperCase();
  const r = (role || '').toUpperCase();

  // 1. Check confessional university exception first: deans/professors at UCA/USAL belong to UNIVERSITY
  if ((o.includes('UCA') || o.includes('UNIVERSIDAD CATÓLICA') || o.includes('USAL') || o.includes('UNIVERSIDAD DEL SALVADOR')) &&
      (r.includes('DECANO') || r.includes('RECTOR') || r.includes('DOCENTE') || r.includes('INVESTIGADOR') || r.includes('PROFESOR'))) {
    return 'UNIVERSITY';
  }

  // 2. Religious Institutions & Faith-Based Organizations (Public Institutional Roles)
  if (s.includes('RELIGIOUS') || s.includes('ARZBAIRES') || s.includes('CARITAS') || 
      s.includes('DAIA') || s.includes('CIRA') || s.includes('TEMPLO') || s.includes('PARROQUIA') ||
      o.includes('ARZOBISPADO') || o.includes('CÁRITAS') || o.includes('CARITAS') || 
      o.includes('DAIA') || o.includes('CENTRO ISLÁMICO') || o.includes('CIRA') ||
      o.includes('PARROQUIA') || o.includes('BASÍLICA') || o.includes('TEMPLO LIBERTAD') ||
      r.includes('PÁRROCO') || r.includes('RABINO') || r.includes('PASTOR') || 
      r.includes('IMAM') || r.includes('OBISPO') || r.includes('VICARIO GENERAL') ||
      r.includes('CANCILLER DE LA CURIA') || r.includes('DIRECTOR EJECUTIVO DE CÁRITAS') ||
      r.includes('PRESIDENTE DE DAIA') || r.includes('PRESIDENTE DEL CIRA')) {
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

async function run() {
  let allRows: any[] = [];
  let p = 0;
  while (true) {
    const { data } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('*')
      .neq('location_relation_type', 'PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE')
      .range(p * 1000, (p + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < 1000) break;
    p++;
  }

  // Distinct people
  const personMap = new Map<string, any[]>();
  for (const r of allRows) {
    const slug = r.display_name.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
    if (!personMap.has(slug)) personMap.set(slug, []);
    personMap.get(slug)!.push(r);
  }

  const directRels = ['WORKS_IN', 'TEACHES_IN', 'PROFESSIONAL_PRACTICE_IN', 'ORGANIZATION_ROLE_IN_CABA', 'PUBLIC_ACTIVITY_IN'];

  // Baseline vs New V4.5
  // V4.5 rows were created with source_ids: ARZBAIRES_CURIA, CARITAS_BSAS, DAIA_DIRECTIVOS, CIRA_AUTORIDADES, CABA_HISTORIC_PARISHES,
  // or UBA_DERECHO_AUTORIDADES, UBA_FMED_AUTORIDADES, UBA_EXACTAS_AUTORIDADES, UCA_DIRECTIVOS_CABA, USAL_AUTORIDADES_CABA,
  // or LEGISLATURA_CABA_AUTORIDADES, DEFENSORIA_CABA_AUTORIDADES, HOSPITAL_ITALIANO_CABA, HOSPITAL_CLINICAS_CABA,
  // or CLUBS_CABA_DIRECTIVOS, CPCECABA_AUTORIDADES, CPAU_AUTORIDADES
  const v4_5_Sources = new Set([
    'ARZBAIRES_CURIA', 'CARITAS_BSAS', 'DAIA_DIRECTIVOS', 'CIRA_AUTORIDADES', 'CABA_HISTORIC_PARISHES',
    'UBA_DERECHO_AUTORIDADES', 'UBA_FMED_AUTORIDADES', 'UBA_EXACTAS_AUTORIDADES', 'UCA_DIRECTIVOS_CABA', 'USAL_AUTORIDADES_CABA',
    'LEGISLATURA_CABA_AUTORIDADES', 'DEFENSORIA_CABA_AUTORIDADES', 'HOSPITAL_ITALIANO_CABA', 'HOSPITAL_CLINICAS_CABA',
    'CLUBS_CABA_DIRECTIVOS', 'CPCECABA_AUTORIDADES', 'CPAU_AUTORIDADES'
  ]);

  const baselinePeople = new Set<string>();
  const newV4_5People = new Set<string>();

  for (const [slug, rows] of personMap.entries()) {
    const isV4_5 = rows.some(r => v4_5_Sources.has(r.source_id));
    if (isV4_5) {
      newV4_5People.add(slug);
    } else {
      baselinePeople.add(slug);
    }
  }

  console.log('BASELINE UNIQUE PEOPLE:', baselinePeople.size, '(Target: 1113)');
  console.log('NEW V4.5 UNIQUE PEOPLE:', newV4_5People.size, '(Target: 87)');
  console.log('TOTAL VALIDATED UNIQUE PEOPLE:', personMap.size, '(Target: 1200)');

  // Direct CABA breakdown
  let baselineDirect = 0;
  let newDirect = 0;
  for (const [slug, rows] of personMap.entries()) {
    const isDirect = rows.some(r => directRels.includes(r.location_relation_type));
    if (isDirect) {
      if (baselinePeople.has(slug)) baselineDirect++;
      else newDirect++;
    }
  }
  console.log('BASELINE DIRECT CABA:', baselineDirect, '(Target: 1010)');
  console.log('NEW DIRECT CABA:', newDirect, '(Target: 87)');
  console.log('TOTAL DIRECT CABA:', baselineDirect + newDirect, '(Target: 1097)');

  // Breakdown of newly acquired 87 people by primary family
  const newFamilyBreakdown: Record<string, number> = {
    RELIGIOUS_INSTITUTIONS: 0,
    UNIVERSITIES: 0,
    HEALTH: 0,
    PROFESSIONAL_REGISTRIES: 0,
    GOVERNMENT_CIVIC: 0,
    CLUBS_SPORTS: 0,
    TRADE_UNIONS: 0,
    CHAMBERS: 0,
    MEDIA: 0,
    COMPANIES: 0
  };

  for (const slug of newV4_5People) {
    const rows = personMap.get(slug)!;
    // find the v4_5 row
    const row = rows.find(r => v4_5_Sources.has(r.source_id)) || rows[0];
    const fam = mapSourceToFamily(row.source_id, row.organization, row.role);
    if (fam === 'RELIGIOUS_INSTITUTION') newFamilyBreakdown.RELIGIOUS_INSTITUTIONS++;
    else if (fam === 'UNIVERSITY') newFamilyBreakdown.UNIVERSITIES++;
    else if (fam === 'HEALTH') newFamilyBreakdown.HEALTH++;
    else if (fam === 'PROFESSIONAL_REGISTRY') newFamilyBreakdown.PROFESSIONAL_REGISTRIES++;
    else if (fam === 'GOVERNMENT_CIVIC') newFamilyBreakdown.GOVERNMENT_CIVIC++;
    else if (fam === 'CLUB' || fam === 'SPORTS_FEDERATION') newFamilyBreakdown.CLUBS_SPORTS++;
    else if (fam === 'TRADE_UNION') newFamilyBreakdown.TRADE_UNIONS++;
    else if (fam === 'CHAMBER') newFamilyBreakdown.CHAMBERS++;
    else if (fam === 'MEDIA_AUTHOR' || fam === 'MEDIA_THIRD_PARTY') newFamilyBreakdown.MEDIA++;
    else if (fam === 'COMPANY') newFamilyBreakdown.COMPANIES++;
  }

  console.log('\n--- NEW V4.5 PRIMARY ACQUISITIONS (ADDITIVE = 87) ---');
  console.table(newFamilyBreakdown);
  const sumNew = Object.values(newFamilyBreakdown).reduce((a, b) => a + b, 0);
  console.log('SUM OF NEW ACQUISITIONS:', sumNew);
}

run().catch(console.error);
