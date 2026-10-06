/**
 * ATLAS — SOURCE UNIVERSE GENERATOR V4
 * Distinguishes Evidence-Derived vs Combinatorial-Guessed candidates
 * and injects positive control sources for signal recall certification.
 */

import {
  NATIONAL_UNIVERSITIES,
  UNIVERSITY_ENDPOINTS,
  UNIVERSITY_FACULTY_PREFIXES,
  PROVINCIAL_JURISDICTIONS,
  PROVINCIAL_SECRETARIATS,
  MUNICIPALITIES_TOP
} from './AIStrategistHypotheses.ts';
import type { CandidateSource } from './types.ts';

// 1. Positive Control Sources (known verified productive endpoints)
export const POSITIVE_CONTROL_SOURCES: CandidateSource[] = [
  {
    candidateId: 'CTRL_UNC_LENGUAS_CONTACTO',
    classId: 'CONTROL_POSITIVE',
    sourceFamily: 'FAM_ACADEMIC_UNC',
    url: 'https://lenguas.unc.edu.ar/contacto',
    host: 'lenguas.unc.edu.ar',
    sector: 'HIGHER_EDUCATION',
    jurisdiction: 'CBA',
    protocol: 'HTTPS',
    expectedEmailDensity: 0.90,
    expectedSupply: 2500,
    generatedAt: new Date().toISOString(),
    originType: 'EVIDENCE_DERIVED',
    isControl: true
  },
  {
    candidateId: 'CTRL_UNC_LENGUAS_AUTORIDADES',
    classId: 'CONTROL_POSITIVE',
    sourceFamily: 'FAM_ACADEMIC_UNC',
    url: 'https://lenguas.unc.edu.ar/autoridades',
    host: 'lenguas.unc.edu.ar',
    sector: 'HIGHER_EDUCATION',
    jurisdiction: 'CBA',
    protocol: 'HTTPS',
    expectedEmailDensity: 0.85,
    expectedSupply: 2500,
    generatedAt: new Date().toISOString(),
    originType: 'EVIDENCE_DERIVED',
    isControl: true
  },
  {
    candidateId: 'CTRL_UNER_CONTACTO',
    classId: 'CONTROL_POSITIVE',
    sourceFamily: 'FAM_ACADEMIC_UNER',
    url: 'https://uner.edu.ar/contacto',
    host: 'uner.edu.ar',
    sector: 'HIGHER_EDUCATION',
    jurisdiction: 'ERS',
    protocol: 'HTTPS',
    expectedEmailDensity: 0.80,
    expectedSupply: 5000,
    generatedAt: new Date().toISOString(),
    originType: 'EVIDENCE_DERIVED',
    isControl: true
  },
  {
    candidateId: 'CTRL_UBA_EXACTAS_AUTORIDADES',
    classId: 'CONTROL_POSITIVE',
    sourceFamily: 'FAM_ACADEMIC_UBA',
    url: 'https://exactas.uba.ar/autoridades',
    host: 'exactas.uba.ar',
    sector: 'HIGHER_EDUCATION',
    jurisdiction: 'CABA',
    protocol: 'HTTPS',
    expectedEmailDensity: 0.75,
    expectedSupply: 5000,
    generatedAt: new Date().toISOString(),
    originType: 'EVIDENCE_DERIVED',
    isControl: true
  },
  {
    candidateId: 'CTRL_UBA_EXACTAS_CONTACTO',
    classId: 'CONTROL_POSITIVE',
    sourceFamily: 'FAM_ACADEMIC_UBA',
    url: 'https://exactas.uba.ar/contacto',
    host: 'exactas.uba.ar',
    sector: 'HIGHER_EDUCATION',
    jurisdiction: 'CABA',
    protocol: 'HTTPS',
    expectedEmailDensity: 0.75,
    expectedSupply: 5000,
    generatedAt: new Date().toISOString(),
    originType: 'EVIDENCE_DERIVED',
    isControl: true
  },
  {
    candidateId: 'CTRL_SEDICI_UNLP_OAI',
    classId: 'CONTROL_POSITIVE',
    sourceFamily: 'FAM_ACADEMIC_UNLP',
    url: 'http://sedici.unlp.edu.ar/oai/request',
    host: 'sedici.unlp.edu.ar',
    sector: 'SCIENTIFIC_RESEARCH',
    jurisdiction: 'BUE',
    protocol: 'OAI_PMH',
    expectedEmailDensity: 0.70,
    expectedSupply: 38000,
    generatedAt: new Date().toISOString(),
    originType: 'EVIDENCE_DERIVED',
    isControl: true
  },
  {
    candidateId: 'CTRL_BA_DATA_CKAN',
    classId: 'CONTROL_POSITIVE',
    sourceFamily: 'FAM_BA_DATA',
    url: 'https://data.buenosaires.gob.ar/api/3/action/package_search',
    host: 'data.buenosaires.gob.ar',
    sector: 'PUBLIC_ADMINISTRATION',
    jurisdiction: 'CABA',
    protocol: 'CKAN_API',
    expectedEmailDensity: 0.65,
    expectedSupply: 15000,
    generatedAt: new Date().toISOString(),
    originType: 'EVIDENCE_DERIVED',
    isControl: true
  },
  {
    candidateId: 'CTRL_PBA_DATA_CKAN',
    classId: 'CONTROL_POSITIVE',
    sourceFamily: 'FAM_PBA_DATA',
    url: 'https://catalogo.datos.gba.gob.ar/api/3/action/package_search',
    host: 'catalogo.datos.gba.gob.ar',
    sector: 'PUBLIC_ADMINISTRATION',
    jurisdiction: 'BUE',
    protocol: 'CKAN_API',
    expectedEmailDensity: 0.65,
    expectedSupply: 12000,
    generatedAt: new Date().toISOString(),
    originType: 'EVIDENCE_DERIVED',
    isControl: true
  }
];

// Real verified faculties on major universities
const VERIFIED_FACULTIES = [
  // UBA
  { host: 'exactas.uba.ar', code: 'UBA_EXACTAS', juris: 'CABA' },
  { host: 'derecho.uba.ar', code: 'UBA_DERECHO', juris: 'CABA' },
  { host: 'economicas.uba.ar', code: 'UBA_ECONOMICAS', juris: 'CABA' },
  { host: 'fadu.uba.ar', code: 'UBA_FADU', juris: 'CABA' },
  { host: 'filo.uba.ar', code: 'UBA_FILO', juris: 'CABA' },
  { host: 'medicina.uba.ar', code: 'UBA_MEDICINA', juris: 'CABA' },
  { host: 'sociales.uba.ar', code: 'UBA_SOCIALES', juris: 'CABA' },
  { host: 'agronomia.uba.ar', code: 'UBA_AGRO', juris: 'CABA' },
  { host: 'ingenieria.uba.ar', code: 'UBA_ING', juris: 'CABA' },
  // UNC
  { host: 'lenguas.unc.edu.ar', code: 'UNC_LENGUAS', juris: 'CBA' },
  { host: 'famaf.unc.edu.ar', code: 'UNC_FAMAF', juris: 'CBA' },
  { host: 'quimicas.unc.edu.ar', code: 'UNC_QUIMICAS', juris: 'CBA' },
  { host: 'fcm.unc.edu.ar', code: 'UNC_MEDICAS', juris: 'CBA' },
  { host: 'derecho.unc.edu.ar', code: 'UNC_DERECHO', juris: 'CBA' },
  { host: 'economicas.unc.edu.ar', code: 'UNC_ECONOMICAS', juris: 'CBA' },
  // UNLP
  { host: 'sedici.unlp.edu.ar', code: 'UNLP_SEDICI', juris: 'BUE' },
  { host: 'info.unlp.edu.ar', code: 'UNLP_INFO', juris: 'BUE' },
  { host: 'med.unlp.edu.ar', code: 'UNLP_MED', juris: 'BUE' },
  { host: 'fcnym.unlp.edu.ar', code: 'UNLP_NATURALES', juris: 'BUE' },
  { host: 'jursoc.unlp.edu.ar', code: 'UNLP_DERECHO', juris: 'BUE' },
  { host: 'econo.unlp.edu.ar', code: 'UNLP_ECONOMICAS', juris: 'BUE' },
  // UNR
  { host: 'rephip.unr.edu.ar', code: 'UNR_REPHIP', juris: 'SFE' },
  { host: 'fceia.unr.edu.ar', code: 'UNR_INGENIERIA', juris: 'SFE' },
  { host: 'fcm.unr.edu.ar', code: 'UNR_MEDICINA', juris: 'SFE' },
  { host: 'fder.unr.edu.ar', code: 'UNR_DERECHO', juris: 'SFE' },
  // UNQ
  { host: 'ridaa.unq.edu.ar', code: 'UNQ_RIDAA', juris: 'BUE' },
  // UNER
  { host: 'uner.edu.ar', code: 'UNER_ROOT', juris: 'ERS' }
];

export class SourceUniverseGenerator {
  /**
   * Generates Evidence-Derived candidates from real, verified Argentine institutions
   */
  public static *generateEvidenceDerivedCandidates(limit: number = 30000): Generator<CandidateSource> {
    let count = 0;
    const nowIso = new Date().toISOString();

    // 1. Real National Universities Root Domains (all 65 national universities)
    const univStructuralEndpoints = [
      '/contacto', '/autoridades', '/directorio', '/docentes', '/institutos',
      '/departamentos', '/investigacion', '/carreras', '/posgrado', '/secretarias',
      '/catedras', '/personal', '/guia-tramites', '/organigrama', '/extension',
      '/bienestar', '/academica', '/rectorado', '/gestion', '/comunicacion',
      '/transparencia', '/institucional', '/graduados', '/posgrados', '/areas',
      '/sedes', '/facultades', '/cooperacion', '/internacionales', '/ingreso',
      '/extension/cultura', '/secretarias/academica', '/secretarias/extension',
      '/secretarias/investigacion', '/secretarias/posgrado', '/secretarias/administracion',
      '/institucional/autoridades', '/institucional/consejo-superior', '/claustro',
      '/claustro-docente', '/padron-docente', '/sitemap.xml'
    ];
    for (const univ of NATIONAL_UNIVERSITIES) {
      for (const ep of univStructuralEndpoints) {
        if (count >= limit) return;
        count++;
        yield {
          candidateId: `EVID_UNIV_${univ.code}_${count}`,
          classId: 'CLASS_ACADEMIC_EVIDENCE_DERIVED',
          sourceFamily: `FAM_ACADEMIC_${univ.code}`,
          url: `https://${univ.domain}${ep}`,
          host: univ.domain,
          sector: 'HIGHER_EDUCATION',
          jurisdiction: univ.juris,
          protocol: ep.includes('oai') ? 'OAI_PMH' : 'HTTPS',
          expectedEmailDensity: 0.60,
          expectedSupply: 5000,
          generatedAt: nowIso,
          originType: 'EVIDENCE_DERIVED',
          isControl: false
        };
      }
    }

    // 3. Verified Faculties & Repositories of major universities
    for (const fac of VERIFIED_FACULTIES) {
      for (const ep of univStructuralEndpoints) {
        if (count >= limit) return;
        count++;
        yield {
          candidateId: `EVID_FAC_${fac.code}_${count}`,
          classId: 'CLASS_FACULTY_EVIDENCE_DERIVED',
          sourceFamily: `FAM_FACULTY_${fac.code}`,
          url: `https://${fac.host}${ep}`,
          host: fac.host,
          sector: 'HIGHER_EDUCATION',
          jurisdiction: fac.juris,
          protocol: fac.host.includes('oai') || ep.includes('oai') ? 'OAI_PMH' : 'HTTPS',
          expectedEmailDensity: 0.65,
          expectedSupply: 3500,
          generatedAt: nowIso,
          originType: 'EVIDENCE_DERIVED',
          isControl: false
        };
      }
    }

    // 4. Real Provincial Portals (24 Jurisdictions)
    const provEndpoints = [
      '/contacto', '/autoridades', '/directorio', '/dependencias', '/institucional',
      '/organigrama', '/datos-abiertos', '/datosabiertos', '/boletin-oficial',
      '/transparencia', '/guia-tramites', '/noticias', '/sitemap.xml'
    ];
    for (const prov of PROVINCIAL_JURISDICTIONS) {
      for (const ep of provEndpoints) {
        if (count >= limit) return;
        count++;
        yield {
          candidateId: `EVID_PROV_${prov.code}_${count}`,
          classId: 'CLASS_PROVINCIAL_EVIDENCE_DERIVED',
          sourceFamily: `FAM_PROV_${prov.code}`,
          url: `https://${prov.domain}${ep}`,
          host: prov.domain,
          sector: 'PUBLIC_ADMINISTRATION',
          jurisdiction: prov.code,
          protocol: ep.includes('datos') ? 'CKAN_API' : 'HTTPS',
          expectedEmailDensity: 0.50,
          expectedSupply: 8000,
          generatedAt: nowIso,
          originType: 'EVIDENCE_DERIVED',
          isControl: false
        };
      }
    }

    // 5. Real Municipal Portals
    const muniEndpoints = [
      '/contacto', '/autoridades', '/directorio', '/secretarias', '/salud',
      '/educacion', '/habilitaciones', '/comercio', '/guia-tramites', '/transparencia',
      '/datosabiertos', '/organigrama', '/boletin-oficial', '/sitemap.xml'
    ];
    for (const muni of MUNICIPALITIES_TOP) {
      for (const ep of muniEndpoints) {
        if (count >= limit) return;
        count++;
        yield {
          candidateId: `EVID_MUNI_${muni.toUpperCase()}_${count}`,
          classId: 'CLASS_MUNICIPAL_EVIDENCE_DERIVED',
          sourceFamily: `FAM_MUNI_${muni.toUpperCase()}`,
          url: `https://${muni}.gob.ar${ep}`,
          host: `${muni}.gob.ar`,
          sector: 'PUBLIC_ADMINISTRATION',
          jurisdiction: 'LOCAL',
          protocol: 'HTTPS',
          expectedEmailDensity: 0.45,
          expectedSupply: 3000,
          generatedAt: nowIso,
          originType: 'EVIDENCE_DERIVED',
          isControl: false
        };
      }
    }

    // 6. Professional Colleges & Regulatory Councils
    const profCouncils = [
      { host: 'cpacf.org.ar', code: 'CPACF', juris: 'CABA', sector: 'PROFESSIONAL_LICENSING' },
      { host: 'colabog.org.ar', code: 'COLABOG', juris: 'BUE', sector: 'PROFESSIONAL_LICENSING' },
      { host: 'casi.com.ar', code: 'CASI', juris: 'BUE', sector: 'PROFESSIONAL_LICENSING' },
      { host: 'cpau.org', code: 'CPAU', juris: 'CABA', sector: 'PROFESSIONAL_LICENSING' },
      { host: 'colmed2.org.ar', code: 'COLMED2', juris: 'BUE', sector: 'HEALTHCARE_AND_HOSPITALS' },
      { host: 'colegioescribanos.org.ar', code: 'ESCRIBANOS_CABA', juris: 'CABA', sector: 'PROFESSIONAL_LICENSING' },
      { host: 'cpce.org.ar', code: 'CPCE_CABA', juris: 'CABA', sector: 'PROFESSIONAL_LICENSING' },
      { host: 'cpcecordoba.org.ar', code: 'CPCE_CBA', juris: 'CBA', sector: 'PROFESSIONAL_LICENSING' },
      { host: 'cpcesfe2.org.ar', code: 'CPCE_ROSARIO', juris: 'SFE', sector: 'PROFESSIONAL_LICENSING' },
      { host: 'colpsiba.org.ar', code: 'COLPSIBA', juris: 'BUE', sector: 'HEALTHCARE_AND_HOSPITALS' }
    ];
    for (const pc of profCouncils) {
      for (const ep of ['/contacto', '/autoridades', '/matriculados', '/directorio', '/institucional', '/sitemap.xml']) {
        if (count >= limit) return;
        count++;
        yield {
          candidateId: `EVID_COUNCIL_${pc.code}_${count}`,
          classId: 'CLASS_COUNCIL_EVIDENCE_DERIVED',
          sourceFamily: `FAM_COUNCIL_${pc.code}`,
          url: `https://${pc.host}${ep}`,
          host: pc.host,
          sector: pc.sector,
          jurisdiction: pc.juris,
          protocol: 'HTTPS',
          expectedEmailDensity: 0.70,
          expectedSupply: 6000,
          generatedAt: nowIso,
          originType: 'EVIDENCE_DERIVED',
          isControl: false
        };
      }
    }

    // 7. National Research Organisms & Institutes
    const researchInstitutes = [
      { host: 'conicet.gov.ar', code: 'CONICET', juris: 'NAC', sector: 'SCIENTIFIC_RESEARCH' },
      { host: 'inta.gob.ar', code: 'INTA', juris: 'NAC', sector: 'AGRICULTURE_AND_AGRIBUSINESS' },
      { host: 'inti.gob.ar', code: 'INTI', juris: 'NAC', sector: 'INDUSTRY_AND_MANUFACTURING' },
      { host: 'cnea.gob.ar', code: 'CNEA', juris: 'NAC', sector: 'ENERGY_AND_MINING' },
      { host: 'anmat.gob.ar', code: 'ANMAT', juris: 'NAC', sector: 'HEALTHCARE_AND_HOSPITALS' },
      { host: 'inpi.gob.ar', code: 'INPI', juris: 'NAC', sector: 'PUBLIC_ADMINISTRATION' }
    ];
    for (const ri of researchInstitutes) {
      for (const ep of ['/contacto', '/autoridades', '/institucional', '/organigrama', '/directorio', '/sitemap.xml']) {
        if (count >= limit) return;
        count++;
        yield {
          candidateId: `EVID_RESEARCH_${ri.code}_${count}`,
          classId: 'CLASS_RESEARCH_EVIDENCE_DERIVED',
          sourceFamily: `FAM_RESEARCH_${ri.code}`,
          url: `https://${ri.host}${ep}`,
          host: ri.host,
          sector: ri.sector,
          jurisdiction: ri.juris,
          protocol: 'HTTPS',
          expectedEmailDensity: 0.65,
          expectedSupply: 10000,
          generatedAt: nowIso,
          originType: 'EVIDENCE_DERIVED',
          isControl: false
        };
      }
    }

    // 8. Real Open Data & CKAN Repositories (Bounded pagination)
    const realCatalogs = [
      { host: 'datos.gob.ar', path: '/api/3/action/package_search', name: 'DATOS_AR' },
      { host: 'catalogo.datos.gba.gob.ar', path: '/api/3/action/package_search', name: 'DATOS_PBA' },
      { host: 'data.buenosaires.gob.ar', path: '/api/3/action/package_search', name: 'BA_DATA' },
      { host: 'datos.cultura.gob.ar', path: '/api/3/action/package_search', name: 'DATOS_CULTURA' }
    ];

    for (let start = 0; start <= 150; start += 50) {
      for (const cat of realCatalogs) {
        if (count >= limit) return;
        count++;
        yield {
          candidateId: `EVID_CKAN_${cat.name}_S${start}_${count}`,
          classId: 'CLASS_CKAN_EVIDENCE_DERIVED',
          sourceFamily: `FAM_CKAN_${cat.name}`,
          url: `https://${cat.host}${cat.path}?start=${start}&rows=50`,
          host: cat.host,
          sector: 'SCIENTIFIC_RESEARCH',
          jurisdiction: 'NAC',
          protocol: 'CKAN_API',
          expectedEmailDensity: 0.60,
          expectedSupply: 15000,
          generatedAt: nowIso,
          originType: 'EVIDENCE_DERIVED',
          isControl: false
        };
      }
    }
  }

  /**
   * Generates Combinatorial-Guessed candidates for breadth exploration
   */
  public static *generateCombinatorialCandidates(limit: number = 70000): Generator<CandidateSource> {
    let count = 0;
    const nowIso = new Date().toISOString();

    const prefixes = UNIVERSITY_FACULTY_PREFIXES;
    const endpoints = ['/contacto', '/autoridades', '/directorio', '/docentes', '/secretarias', '/catedras', '/institutos', '/sitemap.xml'];

    for (const univ of NATIONAL_UNIVERSITIES) {
      for (const pref of prefixes) {
        const subHost = `${pref}.${univ.domain}`;
        for (const ep of endpoints) {
          if (count >= limit) return;
          count++;
          yield {
            candidateId: `GUESS_UNIV_${univ.code}_${pref.toUpperCase()}_${count}`,
            classId: 'CLASS_COMBINATORIAL_GUESSED',
            sourceFamily: `FAM_ACADEMIC_${univ.code}`,
            url: `https://${subHost}${ep}`,
            host: subHost,
            sector: 'HIGHER_EDUCATION',
            jurisdiction: univ.juris,
            protocol: 'HTTPS',
            expectedEmailDensity: 0.35,
            expectedSupply: 2000,
            generatedAt: nowIso,
            originType: 'COMBINATORIAL_GUESSED',
            isControl: false
          };
        }
      }
    }

    // Academic Departments
    const depts = ['computacion', 'matematica', 'fisica', 'quimica', 'biologia', 'historia', 'letras', 'filosofia', 'economia', 'administracion', 'enfermeria'];
    for (const univ of NATIONAL_UNIVERSITIES) {
      for (const dept of depts) {
        for (const ep of ['/contacto', '/autoridades', '/docentes', '/catedras', '/sitemap.xml']) {
          if (count >= limit) return;
          count++;
          const subHost = `${dept}.${univ.domain}`;
          yield {
            candidateId: `GUESS_DEPT_${univ.code}_${dept.toUpperCase()}_${count}`,
            classId: 'CLASS_DEPT_GUESSED',
            sourceFamily: `FAM_ACADEMIC_${univ.code}`,
            url: `https://${subHost}${ep}`,
            host: subHost,
            sector: 'HIGHER_EDUCATION',
            jurisdiction: univ.juris,
            protocol: 'HTTPS',
            expectedEmailDensity: 0.50,
            expectedSupply: 2500,
            generatedAt: nowIso,
            originType: 'COMBINATORIAL_GUESSED',
            isControl: false
          };
        }
      }
    }

    // Provincial secretariats
    for (const prov of PROVINCIAL_JURISDICTIONS) {
      for (const sec of PROVINCIAL_SECRETARIATS) {
        for (const ep of ['/contacto', '/autoridades', '/directorio', '/organigrama', '/dependencias', '/sitemap.xml']) {
          if (count >= limit) return;
          count++;
          const subHost = `${sec.area}.${prov.domain}`;
          yield {
            candidateId: `GUESS_PROV_${prov.code}_${sec.area.toUpperCase()}_${count}`,
            classId: 'CLASS_PROV_SECRETARIAT_GUESSED',
            sourceFamily: `FAM_PROV_${prov.code}`,
            url: `https://${subHost}${ep}`,
            host: subHost,
            sector: sec.sector,
            jurisdiction: prov.code,
            protocol: 'HTTPS',
            expectedEmailDensity: 0.40,
            expectedSupply: 3000,
            generatedAt: nowIso,
            originType: 'COMBINATORIAL_GUESSED',
            isControl: false
          };
        }
      }
    }

    // Municipal secretariats & areas
    for (const muni of MUNICIPALITIES_TOP) {
      for (const area of ['salud', 'educacion', 'comercio', 'desarrollosocial', 'obras', 'seguridad']) {
        for (const ep of ['/contacto', '/autoridades', '/directorio', '/institucional']) {
          if (count >= limit) return;
          count++;
          const subHost = `${area}.${muni}.gob.ar`;
          yield {
            candidateId: `GUESS_MUNI_${muni.toUpperCase()}_${area.toUpperCase()}_${count}`,
            classId: 'CLASS_MUNI_SECRETARIAT_GUESSED',
            sourceFamily: `FAM_MUNI_${muni.toUpperCase()}`,
            url: `https://${subHost}${ep}`,
            host: subHost,
            sector: 'PUBLIC_ADMINISTRATION',
            jurisdiction: 'LOCAL',
            protocol: 'HTTPS',
            expectedEmailDensity: 0.35,
            expectedSupply: 2000,
            generatedAt: nowIso,
            originType: 'COMBINATORIAL_GUESSED',
            isControl: false
          };
        }
      }
    }

    // Municipalities with .gov.ar domain
    for (const muni of MUNICIPALITIES_TOP) {
      for (const area of ['salud', 'educacion', 'comercio', 'desarrollosocial', 'obras', 'seguridad', 'gobierno']) {
        for (const ep of ['/contacto', '/autoridades', '/directorio', '/institucional', '/sitemap.xml']) {
          if (count >= limit) return;
          count++;
          const subHost = `${area}.${muni}.gov.ar`;
          yield {
            candidateId: `GUESS_MUNI_GOV_${muni.toUpperCase()}_${area.toUpperCase()}_${count}`,
            classId: 'CLASS_MUNI_SECRETARIAT_GUESSED',
            sourceFamily: `FAM_MUNI_${muni.toUpperCase()}`,
            url: `https://${subHost}${ep}`,
            host: subHost,
            sector: 'PUBLIC_ADMINISTRATION',
            jurisdiction: 'LOCAL',
            protocol: 'HTTPS',
            expectedEmailDensity: 0.35,
            expectedSupply: 2000,
            generatedAt: nowIso,
            originType: 'COMBINATORIAL_GUESSED',
            isControl: false
          };
        }
      }
    }

    // National ministries
    const nationalMinistries = [
      'salud', 'educacion', 'economia', 'seguridad', 'justicia', 'trabajo',
      'obraspublicas', 'transporte', 'ambiente', 'turismo', 'cultura', 'desarrollosocial',
      'defensa', 'cancilleria', 'agroindustria', 'ciencia', 'modernizacion'
    ];
    for (const min of nationalMinistries) {
      for (const ep of ['/contacto', '/autoridades', '/institucional', '/organigrama', '/secretarias', '/dependencias']) {
        if (count >= limit) return;
        count++;
        yield {
          candidateId: `GUESS_MIN_${min.toUpperCase()}_${count}`,
          classId: 'CLASS_NATIONAL_MINISTRY_GUESSED',
          sourceFamily: `FAM_MINISTRY_${min.toUpperCase()}`,
          url: `https://www.argentina.gob.ar/${min}${ep}`,
          host: 'www.argentina.gob.ar',
          sector: 'PUBLIC_ADMINISTRATION',
          jurisdiction: 'NAC',
          protocol: 'HTTPS',
          expectedEmailDensity: 0.55,
          expectedSupply: 10000,
          generatedAt: nowIso,
          originType: 'COMBINATORIAL_GUESSED',
          isControl: false
        };
      }
    }
  }

  /**
   * Generates a striped/interleaved batch prioritizing Evidence-Derived candidates first,
   * interleaved across real distinct hosts to eliminate concurrency bottlenecks.
   */
  public static generateStripedBatch(limit: number = 100000): CandidateSource[] {
    const evidenceList: CandidateSource[] = [];
    for (const c of this.generateEvidenceDerivedCandidates(limit)) {
      evidenceList.push(c);
    }

    const guessedTarget = Math.max(0, limit - evidenceList.length);
    const guessedList: CandidateSource[] = [];
    for (const c of this.generateCombinatorialCandidates(guessedTarget)) {
      guessedList.push(c);
    }

    // Group evidence candidates by host
    const byHost = new Map<string, CandidateSource[]>();
    for (const c of evidenceList) {
      let list = byHost.get(c.host);
      if (!list) {
        list = [];
        byHost.set(c.host, list);
      }
      list.push(c);
    }

    const striped: CandidateSource[] = [];

    // Inject controls first
    for (const ctrl of POSITIVE_CONTROL_SOURCES) {
      striped.push(ctrl);
    }

    // Interleave evidence-derived candidates across real hosts
    let hasMore = true;
    let round = 0;
    while (hasMore && striped.length < limit) {
      hasMore = false;
      for (const [_, list] of byHost.entries()) {
        if (round < list.length) {
          striped.push(list[round]);
          hasMore = true;
          if (striped.length >= limit) break;
        }
      }
      round++;
    }

    // Append combinatorial candidates until limit
    for (const g of guessedList) {
      if (striped.length >= limit) break;
      striped.push(g);
    }

    return striped;
  }
}
