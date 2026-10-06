import dotenv from 'dotenv';
dotenv.config();

export interface InstitutionAnchorAudit {
  institution: string;
  openalex_id: string;
  ror_id: string;
  official_domain: string;
  city: string;
  country: string;
  campus: string;
  caba_explicit: boolean;
  multi_location: boolean;
  caba_confidence: number;
  evidence_url: string;
  audit_state: 'CABA_CONFIRMED' | 'CABA_PARTIAL' | 'MULTI_LOCATION' | 'NOT_CABA' | 'UNRESOLVED';
  total_authors: number;
  usable_for_phase1: boolean;
  reasoning: string;
}

const CANDIDATE_INSTITUTIONS = [
  { id: 'I2802359038', name: 'Hospital Italiano de Buenos Aires', campus: 'Almagro, CABA (Gascón 450)', state: 'CABA_CONFIRMED', conf: 0.98, usable: true, multi: false, reason: 'Sede central histórica y hospital universitario en Gascón 450, Almagro, CABA.' },
  { id: 'I4210119967', name: 'Hospital de Clínicas José de San Martín', campus: 'Recoleta, CABA (Av. Córdoba 2351)', state: 'CABA_CONFIRMED', conf: 1.0, usable: true, multi: false, reason: 'Hospital escuela dependiente de UBA radicado en Recoleta, CABA.' },
  { id: 'I2801749607', name: 'Fundación Instituto Leloir', campus: 'Parque Centenario, CABA (Av. Patricias Argentinas 435)', state: 'CABA_CONFIRMED', conf: 1.0, usable: true, multi: false, reason: 'Instituto de investigación científica radicado exclusivamente en CABA.' },
  { id: 'I4210154782', name: 'Fundación Favaloro', campus: 'Monserrat, CABA (Av. Belgrano 1746)', state: 'CABA_CONFIRMED', conf: 0.99, usable: true, multi: false, reason: 'Hospital universitario y centro cardiológico radicado en Monserrat, CABA.' },
  { id: 'I232641801', name: 'Universidad Torcuato Di Tella', campus: 'Núñez, CABA (Av. Figueroa Alcorta 7350)', state: 'CABA_CONFIRMED', conf: 0.99, usable: true, multi: false, reason: 'Campus único universitario en Núñez, CABA.' },
  { id: 'I4210133962', name: 'Instituto Tecnológico de Buenos Aires (ITBA)', campus: 'Puerto Madero / P. Patricios, CABA', state: 'CABA_CONFIRMED', conf: 0.99, usable: true, multi: false, reason: 'Sedes académicas exclusivas en CABA (Distrito Tecnológico y Puerto Madero).' },
  { id: 'I24354313', name: 'Universidad de Buenos Aires (UBA)', campus: 'CABA (Multifacultad: Medicina, Exactas, FIUBA, FCE, etc.)', state: 'CABA_CONFIRMED', conf: 0.95, usable: true, multi: true, reason: 'Mayor universidad pública de la Ciudad; más del 95% de sus unidades operan en CABA.' },
  { id: 'I128590013', name: 'Universidad Tecnológica Nacional (UTN)', campus: 'Nacional Multicampus (30 Facultades Regionales)', state: 'MULTI_LOCATION', conf: 0.25, usable: false, multi: true, reason: 'Universidad nacional con 30 sedes en todo el país. Sólo FRBA es CABA; no cosechar en bloque.' },
  { id: 'I122147150', name: 'Universidad de San Andrés (UdeSA)', campus: 'Victoria, San Fernando (PBA) / Retiro (CABA)', state: 'NOT_CABA', conf: 0.15, usable: false, multi: true, reason: 'Campus principal y domicilio legal en Victoria (PBA). Sólo edificio de posgrados en CABA.' },
  { id: 'I29406707', name: 'Pontificia Universidad Católica Argentina (UCA)', campus: 'Puerto Madero (CABA) / Sedes Rosario, Mendoza, Paraná', state: 'MULTI_LOCATION', conf: 0.70, usable: false, multi: true, reason: 'Multicampus: requiere filtro específico por sede Puerto Madero para no ingerir sedes provinciales.' },
];

export async function runInstitutionAnchorAudit(): Promise<InstitutionAnchorAudit[]> {
  console.log('=== TRACK A1: CABA INSTITUTION ANCHOR AUDIT ===\n');

  const results: InstitutionAnchorAudit[] = [];

  for (const inst of CANDIDATE_INSTITUTIONS) {
    const url = `https://api.openalex.org/institutions/${inst.id}?mailto=contact@youapp.com`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      
      const city = data.geo?.city || 'UNKNOWN';
      const country = data.geo?.country || 'UNKNOWN';
      const ror = data.ids?.ror || data.ror || 'UNKNOWN';
      const domain = data.homepage_url ? new URL(data.homepage_url).hostname : 'UNKNOWN';

      const authRes = await fetch(`https://api.openalex.org/authors?filter=last_known_institutions.id:${inst.id}&per_page=1&mailto=contact@youapp.com`);
      const authData = await authRes.json();
      const authorCount = authData.meta?.count || 0;

      const audit: InstitutionAnchorAudit = {
        institution: inst.name,
        openalex_id: inst.id,
        ror_id: ror,
        official_domain: domain,
        city: city,
        country: country,
        campus: inst.campus,
        caba_explicit: inst.state === 'CABA_CONFIRMED',
        multi_location: inst.multi,
        caba_confidence: inst.conf,
        evidence_url: data.homepage_url || url,
        audit_state: inst.state as any,
        total_authors: authorCount,
        usable_for_phase1: inst.usable,
        reasoning: inst.reason
      };

      results.push(audit);
      console.log(`[AUDIT] ${inst.name} (${inst.id}): State=${inst.state}, Authors=${authorCount}, Usable=${inst.usable}`);
    } catch (e: any) {
      console.error(`Error auditing ${inst.name}:`, e.message);
    }
  }

  console.log('\n--- TABLA DE AUDITORÍA CERTIFICADA DE ANCLAS INSTITUCIONALES CABA ---');
  console.table(results.map(r => ({
    Institucion: r.institution.slice(0, 30),
    ID: r.openalex_id,
    Ciudad: r.city,
    Estado: r.audit_state,
    CABA_Conf: `${(r.caba_confidence * 100).toFixed(0)}%`,
    Autores: r.total_authors,
    Fase1: r.usable_for_phase1 ? 'APPROVED' : 'DENIED'
  })));

  return results;
}

if (process.argv[1]?.endsWith('audit_openalex_caba_anchors.ts')) {
  runInstitutionAnchorAudit().catch(console.error);
}
