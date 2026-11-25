/**
 * ATLAS — AI STRATEGIST HYPOTHESES & COMBINATORIAL PATTERNS
 * Defines high-yield hypotheses across all 24 jurisdictions and 18 sectors.
 * Emits generative strategy rules without per-candidate LLM calls.
 */

import type { SourceHypothesis } from './types.ts';

export const NATIONAL_UNIVERSITIES = [
  { code: 'UBA', domain: 'uba.ar', name: 'Universidad de Buenos Aires', juris: 'CABA' },
  { code: 'UNLP', domain: 'unlp.edu.ar', name: 'Universidad Nacional de La Plata', juris: 'BUE' },
  { code: 'UNC', domain: 'unc.edu.ar', name: 'Universidad Nacional de Córdoba', juris: 'CBA' },
  { code: 'UNR', domain: 'unr.edu.ar', name: 'Universidad Nacional de Rosario', juris: 'SFE' },
  { code: 'UNCUYO', domain: 'uncuyo.edu.ar', name: 'Universidad Nacional de Cuyo', juris: 'MZA' },
  { code: 'UTN', domain: 'utn.edu.ar', name: 'Universidad Tecnológica Nacional', juris: 'NAC' },
  { code: 'UNS', domain: 'uns.edu.ar', name: 'Universidad Nacional del Sur', juris: 'BUE' },
  { code: 'UNNE', domain: 'unne.edu.ar', name: 'Universidad Nacional del Nordeste', juris: 'CTS' },
  { code: 'UNER', domain: 'uner.edu.ar', name: 'Universidad Nacional de Entre Ríos', juris: 'ERS' },
  { code: 'UNT', domain: 'unt.edu.ar', name: 'Universidad Nacional de Tucumán', juris: 'TUC' },
  { code: 'UNMDP', domain: 'mdp.edu.ar', name: 'Universidad Nacional de Mar del Plata', juris: 'BUE' },
  { code: 'UNSAM', domain: 'unsam.edu.ar', name: 'Universidad Nacional de San Martín', juris: 'BUE' },
  { code: 'UNQ', domain: 'unq.edu.ar', name: 'Universidad Nacional de Quilmes', juris: 'BUE' },
  { code: 'UNTREF', domain: 'untref.edu.ar', name: 'Universidad Nacional de Tres de Febrero', juris: 'BUE' },
  { code: 'UNLAM', domain: 'unlam.edu.ar', name: 'Universidad Nacional de La Matanza', juris: 'BUE' },
  { code: 'UNGS', domain: 'ungs.edu.ar', name: 'Universidad Nacional de General Sarmiento', juris: 'BUE' },
  { code: 'UNLU', domain: 'unlu.edu.ar', name: 'Universidad Nacional de Luján', juris: 'BUE' },
  { code: 'UNICEN', domain: 'unicen.edu.ar', name: 'Universidad Nacional del Centro de la PBA', juris: 'BUE' },
  { code: 'UNPSJB', domain: 'unp.edu.ar', name: 'Universidad Nacional de la Patagonia San Juan Bosco', juris: 'CHB' },
  { code: 'UNCOMA', domain: 'uncoma.edu.ar', name: 'Universidad Nacional del Comahue', juris: 'NQN' },
  { code: 'UNLPAM', domain: 'unlpam.edu.ar', name: 'Universidad Nacional de La Pampa', juris: 'LPA' },
  { code: 'UNRN', domain: 'unrn.edu.ar', name: 'Universidad Nacional de Río Negro', juris: 'RNO' },
  { code: 'UNPA', domain: 'unpa.edu.ar', name: 'Universidad Nacional de la Patagonia Austral', juris: 'SCZ' },
  { code: 'UNTDF', domain: 'untdf.edu.ar', name: 'Universidad Nacional de Tierra del Fuego', juris: 'TDF' },
  { code: 'UNJU', domain: 'unju.edu.ar', name: 'Universidad Nacional de Jujuy', juris: 'JUJ' },
  { code: 'UNSA', domain: 'unsa.edu.ar', name: 'Universidad Nacional de Salta', juris: 'SLA' },
  { code: 'UNCA', domain: 'unca.edu.ar', name: 'Universidad Nacional de Catamarca', juris: 'CAT' },
  { code: 'UNSE', domain: 'unse.edu.ar', name: 'Universidad Nacional de Santiago del Estero', juris: 'SDE' },
  { code: 'UNLAR', domain: 'unlar.edu.ar', name: 'Universidad Nacional de La Rioja', juris: 'LRJ' },
  { code: 'UNSL', domain: 'unsl.edu.ar', name: 'Universidad Nacional de San Luis', juris: 'SLU' },
  { code: 'UNSJ', domain: 'unsj.edu.ar', name: 'Universidad Nacional de San Juan', juris: 'SJU' },
  { code: 'UNAF', domain: 'unaf.edu.ar', name: 'Universidad Nacional de Formosa', juris: 'FOR' },
  { code: 'UNAM', domain: 'unam.edu.ar', name: 'Universidad Nacional de Misiones', juris: 'MIS' },
  { code: 'UNCAUS', domain: 'uncaus.edu.ar', name: 'Universidad Nacional del Chaco Austral', juris: 'CHA' },
  { code: 'UNRAF', domain: 'unraf.edu.ar', name: 'Universidad Nacional de Rafaela', juris: 'SFE' },
  { code: 'UNLC', domain: 'unlc.edu.ar', name: 'Universidad Nacional de Los Comechingones', juris: 'SLU' },
  { code: 'UNVIME', domain: 'unvime.edu.ar', name: 'Universidad Nacional de Villa Mercedes', juris: 'SLU' },
  { code: 'UNVM', domain: 'unvm.edu.ar', name: 'Universidad Nacional de Villa María', juris: 'CBA' },
  { code: 'UNRC', domain: 'unrc.edu.ar', name: 'Universidad Nacional de Río Cuarto', juris: 'CBA' },
  { code: 'UADER', domain: 'uader.edu.ar', name: 'Universidad Autónoma de Entre Ríos', juris: 'ERS' },
  { code: 'UNA', domain: 'una.edu.ar', name: 'Universidad Nacional de las Artes', juris: 'CABA' }
];

export const UNIVERSITY_FACULTY_PREFIXES = [
  'exactas', 'medicina', 'derecho', 'economicas', 'ingenieria', 'fadu',
  'filo', 'agronomia', 'odontologia', 'veterinaria', 'psicologia', 'sociales',
  'farmacia', 'humanidades', 'rectorado', 'posgrado', 'investigacion', 'extension',
  'academica', 'bienestar', 'secretariageneral', 'comunicacion', 'biblioteca', 'editorial',
  'cienciasdelasalud', 'ambientales', 'politicas', 'lenguas', 'turismo', 'informatica',
  'artes', 'periodismo', 'educacionfisica', 'bioingenieria'
];


export const UNIVERSITY_ENDPOINTS = [
  '/autoridades',
  '/contacto',
  '/directorio',
  '/claustro',
  '/docentes',
  '/institutos',
  '/departamentos',
  '/investigacion',
  '/carreras',
  '/oai/request',
  '/sitemap.xml'
];

export const PROVINCIAL_JURISDICTIONS = [
  { code: 'BUE', name: 'Buenos Aires', domain: 'gba.gob.ar' },
  { code: 'CABA', name: 'Ciudad de Buenos Aires', domain: 'buenosaires.gob.ar' },
  { code: 'CBA', name: 'Córdoba', domain: 'cba.gov.ar' },
  { code: 'SFE', name: 'Santa Fe', domain: 'santafe.gob.ar' },
  { code: 'MZA', name: 'Mendoza', domain: 'mendoza.gov.ar' },
  { code: 'TUC', name: 'Tucumán', domain: 'tucuman.gov.ar' },
  { code: 'ERS', name: 'Entre Ríos', domain: 'entrerios.gov.ar' },
  { code: 'SLA', name: 'Salta', domain: 'salta.gob.ar' },
  { code: 'CHA', name: 'Chaco', domain: 'chaco.gob.ar' },
  { code: 'CTS', name: 'Corrientes', domain: 'corrientes.gob.ar' },
  { code: 'SDE', name: 'Santiago del Estero', domain: 'sde.gob.ar' },
  { code: 'SJU', name: 'San Juan', domain: 'sanjuan.gob.ar' },
  { code: 'JUJ', name: 'Jujuy', domain: 'jujuy.gob.ar' },
  { code: 'RNO', name: 'Río Negro', domain: 'rionegro.gov.ar' },
  { code: 'NQN', name: 'Neuquén', domain: 'neuquen.gov.ar' },
  { code: 'FOR', name: 'Formosa', domain: 'formosa.gob.ar' },
  { code: 'CHB', name: 'Chubut', domain: 'chubut.gov.ar' },
  { code: 'SLU', name: 'San Luis', domain: 'sanluis.gov.ar' },
  { code: 'CAT', name: 'Catamarca', domain: 'catamarca.gob.ar' },
  { code: 'LRJ', name: 'La Rioja', domain: 'larioja.gov.ar' },
  { code: 'LPA', name: 'La Pampa', domain: 'lapampa.gob.ar' },
  { code: 'SCZ', name: 'Santa Cruz', domain: 'santacruz.gob.ar' },
  { code: 'TDF', name: 'Tierra del Fuego', domain: 'tierradelfuego.gob.ar' },
  { code: 'MIS', name: 'Misiones', domain: 'misiones.gob.ar' }
];

export const PROVINCIAL_SECRETARIATS = [
  { area: 'salud', sector: 'HEALTHCARE_AND_HOSPITALS' },
  { area: 'educacion', sector: 'HIGHER_EDUCATION' },
  { area: 'desarrollohumano', sector: 'CIVIL_SOCIETY_NGOS' },
  { area: 'produccion', sector: 'INDUSTRY_AND_MANUFACTURING' },
  { area: 'trabajo', sector: 'TRADE_ASSOCIATIONS' },
  { area: 'justicia', sector: 'PROFESSIONAL_LICENSING' },
  { area: 'ambiente', sector: 'PUBLIC_ADMINISTRATION' },
  { area: 'turismo', sector: 'TOURISM_AND_HOSPITALITY' },
  { area: 'cultura', sector: 'CULTURE_AND_ARTS' },
  { area: 'obraspublicas', sector: 'CONSTRUCTION_AND_INFRASTRUCTURE' },
  { area: 'transporte', sector: 'LOGISTICS_AND_TRANSPORT' },
  { area: 'energia', sector: 'ENERGY_AND_MINING' },
  { area: 'comercio', sector: 'COMMERCE_AND_RETAIL' },
  { area: 'ciencia', sector: 'SCIENTIFIC_RESEARCH' }
];

export const PROFESSIONAL_BODIES = [
  { prof: 'abogados', sector: 'PROFESSIONAL_LICENSING', density: 0.65, supply: 18000 },
  { prof: 'cpce', sector: 'PROFESSIONAL_LICENSING', density: 0.60, supply: 16000 },
  { prof: 'medicos', sector: 'HEALTHCARE_AND_HOSPITALS', density: 0.55, supply: 15000 },
  { prof: 'ingenieros', sector: 'PROFESSIONAL_LICENSING', density: 0.50, supply: 12000 },
  { prof: 'escribanos', sector: 'PROFESSIONAL_LICENSING', density: 0.50, supply: 8000 },
  { prof: 'arquitectos', sector: 'PROFESSIONAL_LICENSING', density: 0.45, supply: 9000 },
  { prof: 'farmaceuticos', sector: 'HEALTHCARE_AND_HOSPITALS', density: 0.55, supply: 8500 },
  { prof: 'veterinarios', sector: 'AGRICULTURE_AND_AGRIBUSINESS', density: 0.45, supply: 6000 },
  { prof: 'psicologos', sector: 'HEALTHCARE_AND_HOSPITALS', density: 0.50, supply: 7000 }
];

export const MUNICIPALITIES_TOP = [
  'laplata', 'rosario', 'cordoba', 'mardelplata', 'bahiablanca', 'mendoza',
  'tucuman', 'salta', 'santafe', 'sanjuan', 'neuquen', 'posadas', 'parana',
  'resistencia', 'corrientes', 'formosa', 'santiago', 'sanluis', 'catamarca',
  'larioja', 'santacruzturismo', 'ushuaia', 'quilmes', 'lanus', 'vicentelopez',
  'sanisidro', 'moron', 'tigre', 'avellaneda', 'tresdefebrero', 'sanmiguel'
];

export function buildStrategistHypotheses(): SourceHypothesis[] {
  const hypotheses: SourceHypothesis[] = [];

  // 1. National Universities Ecosystem
  hypotheses.push({
    classId: 'CLASS_ACADEMIC_NATIONAL_UNIVERSITIES',
    sourceFamily: 'FAM_ACADEMIC_NATIONAL_NETWORKS',
    sector: 'HIGHER_EDUCATION',
    jurisdiction: 'NAC',
    description: 'Red Nacional de Universidades Públicas (CIN) - Claustros, Facultades e Institutos',
    hosts: NATIONAL_UNIVERSITIES.map(u => u.domain),
    paths: UNIVERSITY_ENDPOINTS,
    expectedEmailDensity: 0.55,
    expectedSupplyPerWinner: 25000
  });

  // 2. Provincial Government Portals & Secretariats
  hypotheses.push({
    classId: 'CLASS_PROVINCIAL_GOVERNMENTS',
    sourceFamily: 'FAM_PROVINCIAL_GOVERNMENT_PORTALS',
    sector: 'PUBLIC_ADMINISTRATION',
    jurisdiction: 'PROVINCIAL',
    description: 'Portales Institucionales y Directorios de las 23 Provincias + CABA',
    hosts: PROVINCIAL_JURISDICTIONS.map(p => p.domain),
    paths: ['/autoridades', '/contacto', '/directorio', '/dependencias', '/organigrama', '/datos-abiertos'],
    expectedEmailDensity: 0.40,
    expectedSupplyPerWinner: 12000
  });

  // 3. Professional Councils & Licensing Bodies
  hypotheses.push({
    classId: 'CLASS_PROFESSIONAL_LICENSING_BODIES',
    sourceFamily: 'FAM_PROFESSIONAL_COUNCILS_ARG',
    sector: 'PROFESSIONAL_LICENSING',
    jurisdiction: 'NAC',
    description: 'Colegios y Consejos Profesionales Provinciales y Nacionales',
    hosts: ['cpacf.org.ar', 'consejo.org.ar', 'colproba.org.ar', 'cai.org.ar', 'cofa.org.ar', 'colegio-escribanos.org.ar', 'cmpc.org.ar', 'cipba.org.ar', 'capba.org.ar'],
    paths: ['/matriculados', '/directorio', '/autoridades', '/delegaciones', '/contacto', '/padron'],
    expectedEmailDensity: 0.65,
    expectedSupplyPerWinner: 22000
  });

  // 4. Municipal Networks & Local Governments
  hypotheses.push({
    classId: 'CLASS_MUNICIPAL_NETWORKS',
    sourceFamily: 'FAM_MUNICIPAL_LOCAL_PORTALS',
    sector: 'PUBLIC_ADMINISTRATION',
    jurisdiction: 'LOCAL',
    description: 'Municipios y Gobiernos Locales de la República Argentina',
    hosts: MUNICIPALITIES_TOP.map(m => `${m}.gob.ar`),
    paths: ['/contacto', '/autoridades', '/directorio', '/secretarias', '/salud', '/educacion', '/habilitaciones', '/transparencia'],
    expectedEmailDensity: 0.35,
    expectedSupplyPerWinner: 6000
  });

  // 5. Civil Society & NGOs (Closing missing sector)
  hypotheses.push({
    classId: 'CLASS_CIVIL_SOCIETY_NGOS',
    sourceFamily: 'FAM_CIVIL_SOCIETY_OSC_REGISTRIES',
    sector: 'CIVIL_SOCIETY_NGOS',
    jurisdiction: 'NAC',
    description: 'Directorio Nacional de Organizaciones de la Sociedad Civil, Fundaciones y Cooperación',
    hosts: ['cenoc.gob.ar', 'raci.org.ar', 'inaes.gob.ar', 'datos.jus.gob.ar', 'conecta-osc.org.ar', 'redsolidaria.org.ar'],
    paths: ['/directorio', '/organizaciones', '/fundaciones', '/mutuales', '/registro', '/contacto'],
    expectedEmailDensity: 0.50,
    expectedSupplyPerWinner: 18000
  });

  // 6. Trade Associations & Labor Federations (Closing missing sector)
  hypotheses.push({
    classId: 'CLASS_TRADE_ASSOCIATIONS_GREMIALES',
    sourceFamily: 'FAM_TRADE_ASSOCIATIONS_UNIONS',
    sector: 'TRADE_ASSOCIATIONS',
    jurisdiction: 'NAC',
    description: 'Registro Nacional de Asociaciones Sindicales, Federaciones y Delegaciones',
    hosts: ['trabajo.gob.ar', 'datos.trabajo.gob.ar', 'ate.org.ar', 'upcn.org.ar', 'cgt.org.ar', 'cta.org.ar'],
    paths: ['/asociacionessindicales', '/seccionales', '/delegaciones', '/registro', '/contacto'],
    expectedEmailDensity: 0.45,
    expectedSupplyPerWinner: 15000
  });

  // 7. National Business Chambers & Industry
  hypotheses.push({
    classId: 'CLASS_BUSINESS_CHAMBERS_INDUSTRY',
    sourceFamily: 'FAM_BUSINESS_CHAMBERS_FEDERATIONS',
    sector: 'INDUSTRY_AND_MANUFACTURING',
    jurisdiction: 'NAC',
    description: 'Red Nacional de Cámaras Industriales, Comercio y Empresas (UIA, CAC, CAME, CAMARCO, CESSI)',
    hosts: ['uia.org.ar', 'cac.com.ar', 'redcame.org.ar', 'camarco.org.ar', 'cessi.org.ar', 'cgera.org.ar'],
    paths: ['/asociados', '/camaras-adheridas', '/autoridades', '/sectores', '/contacto', '/directorio'],
    expectedEmailDensity: 0.50,
    expectedSupplyPerWinner: 14000
  });

  // 8. Open Repositories, Sitemaps & OAI Endpoints
  hypotheses.push({
    classId: 'CLASS_OPEN_REPOSITORIES_OAI_CKAN',
    sourceFamily: 'FAM_OPEN_DATA_REPOSITORIES',
    sector: 'SCIENTIFIC_RESEARCH',
    jurisdiction: 'NAC',
    description: 'Catálogos CKAN Abiertos, Repositorios Digitales Institucionales y Endpoints OAI-PMH',
    hosts: ['datos.gob.ar', 'catalogo.datos.gba.gob.ar', 'datos.cultura.gob.ar', 'sedici.unlp.edu.ar', 'ridaa.unq.edu.ar', 'repositorio.uba.ar'],
    paths: ['/api/3/action/package_search', '/oai/request', '/sitemap.xml', '/dataset', '/robots.txt'],
    expectedEmailDensity: 0.40,
    expectedSupplyPerWinner: 20000
  });

  return hypotheses;
}
