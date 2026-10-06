/**
 * src/lib/atlas/discovery/property/AtlasPropertyRegistryIntelligence.mjs
 * 
 * ATLAS PROPERTY REGISTRY SOURCE INTELLIGENCE V1
 * 
 * Incorporates the Argentine Real-Estate Property Registry (RPI) ecosystem
 * for all 23 provinces + CABA into the Atlas General Source Map
 * as a regulated, conditional ENRICHMENT capability.
 * 
 * Governing Invariants:
 * - GENERAL_RESERVOIR_ELIGIBLE = FALSE
 * - PEOPLE_RESERVOIR_ELIGIBLE = FALSE
 * - ENRICHMENT_ELIGIBLE = TRUE
 * - DISCOVERY_MODE = LOOKUP_BY_PERSON
 * - ENUMERABLE_BULK = FALSE
 * - MASS_CRAWLING_ALLOWED = FALSE
 * - BULK_PUBLIC_VERIFIED = 0
 * - ZERO PERSON LOOKUPS EXECUTED
 * - ZERO PROPERTY OWNER SCRAPING
 * - ZERO PAID TRANSACTIONS
 * - ZERO AUTH BYPASS
 * - SSOT_MUTATION = FALSE
 */

import crypto from 'node:crypto';

export const PROPERTY_SOURCE_FAMILY = 'PROPERTY_REGISTRY';

export const PROPERTY_DOMAIN_CAPABILITIES = Object.freeze([
  'ASSETS',
  'REAL_ESTATE',
  'PROPERTY_OWNERSHIP',
  'REGISTRY_VERIFICATION'
]);

export const PROPERTY_ACCESS_MODES = Object.freeze({
  FORMAL_LOOKUP_ONLINE_PAID: 'FORMAL_LOOKUP_ONLINE_PAID',
  FORMAL_LOOKUP_ONLINE: 'FORMAL_LOOKUP_ONLINE',
  FORMAL_LOOKUP_PARTIALLY_ONLINE: 'FORMAL_LOOKUP_PARTIALLY_ONLINE',
  FORMAL_LOOKUP_DIGITAL_CAPABLE: 'FORMAL_LOOKUP_DIGITAL_CAPABLE',
  FORMAL_LOOKUP_PERSON_INDEX: 'FORMAL_LOOKUP_PERSON_INDEX',
  FORMAL_LOOKUP_PAID: 'FORMAL_LOOKUP_PAID',
  FORMAL_LOOKUP_OFFLINE: 'FORMAL_LOOKUP_OFFLINE',
  FORMAL_LOOKUP_OFFLINE_RESTRICTED: 'FORMAL_LOOKUP_OFFLINE_RESTRICTED',
  FORMAL_LOOKUP_RESTRICTED: 'FORMAL_LOOKUP_RESTRICTED',
  AUTHENTICATED_REGISTRY_SYSTEM: 'AUTHENTICATED_REGISTRY_SYSTEM',
  CHANNEL_TO_VERIFY: 'CHANNEL_TO_VERIFY'
});

export const LOOKUP_BY_PERSON_STATUS = Object.freeze({
  VERIFIED: 'VERIFIED',
  PARTIAL: 'PARTIAL',
  NEEDS_CANARY: 'NEEDS_CANARY'
});

export const COST_CLASSES = Object.freeze({
  PAID_PER_LOOKUP: 'PAID_PER_LOOKUP',
  FREE_PUBLIC: 'FREE_PUBLIC',
  RESTRICTED_OFFICIAL: 'RESTRICTED_OFFICIAL'
});

/**
 * 24 Authoritative Real-Estate Property Registry (RPI) Entities across Argentina
 */
export const PROPERTY_REGISTRY_ENTITIES = Object.freeze([
  {
    entity_id: 'RPI_CABA_TITULARIDAD',
    jurisdiction_code: 'AR_CABA',
    jurisdiction_name: 'Ciudad Autónoma de Buenos Aires',
    official_agency: 'Registro de la Propiedad Inmueble de la Capital Federal (RPI Nacional)',
    canonical_landing_url: 'https://www.argentina.gob.ar/justicia/rpi',
    portal_url: 'https://dgrpi.jus.gov.ar/',
    access_mode: PROPERTY_ACCESS_MODES.FORMAL_LOOKUP_ONLINE_PAID,
    lookup_by_person: LOOKUP_BY_PERSON_STATUS.VERIFIED,
    cost_class: COST_CLASSES.PAID_PER_LOOKUP,
    default_auto_query: false,
    policy_restricted: true,
    legal_basis: 'Ley Nacional 17.801 Art. 21 / Decreto 2080/80 (Interés Legítimo Acreditado)',
    discovery_value: 'LOW',
    enrichment_value: 'HIGH',
    authority_value: 'VERY_HIGH',
    freshness: 'REQUEST_TIME_DEPENDENT',
    enumerable_bulk: false
  },
  {
    entity_id: 'RPI_BUENOS_AIRES_INDICE_TITULARES',
    jurisdiction_code: 'AR_B',
    jurisdiction_name: 'Provincia de Buenos Aires',
    official_agency: 'Registro de la Propiedad de la Provincia de Buenos Aires (RPBA)',
    canonical_landing_url: 'https://www.rpba.gov.ar/',
    portal_url: 'https://www.rpba.gov.ar/servicios/consulta-titularidad',
    access_mode: PROPERTY_ACCESS_MODES.FORMAL_LOOKUP_ONLINE_PAID,
    lookup_by_person: LOOKUP_BY_PERSON_STATUS.VERIFIED,
    cost_class: COST_CLASSES.PAID_PER_LOOKUP,
    default_auto_query: false,
    policy_restricted: true,
    legal_basis: 'Ley Provincial 5479 / Decreto Reglamentario (Interés Legítimo Requerido)',
    discovery_value: 'LOW',
    enrichment_value: 'HIGH',
    authority_value: 'VERY_HIGH',
    freshness: 'REQUEST_TIME_DEPENDENT',
    enumerable_bulk: false
  },
  {
    entity_id: 'RPI_CATAMARCA_TITULARIDAD',
    jurisdiction_code: 'AR_K',
    jurisdiction_name: 'Catamarca',
    official_agency: 'Registro General de la Propiedad Inmobiliaria de Catamarca',
    canonical_landing_url: 'https://portal.catamarca.gob.ar/',
    portal_url: 'https://catamarca.gob.ar/organismo/registro-de-la-propiedad-inmueble/',
    access_mode: PROPERTY_ACCESS_MODES.CHANNEL_TO_VERIFY,
    lookup_by_person: LOOKUP_BY_PERSON_STATUS.NEEDS_CANARY,
    cost_class: COST_CLASSES.PAID_PER_LOOKUP,
    default_auto_query: false,
    policy_restricted: true,
    legal_basis: 'Ley Provincial 3344',
    discovery_value: 'LOW',
    enrichment_value: 'HIGH',
    authority_value: 'VERY_HIGH',
    freshness: 'REQUEST_TIME_DEPENDENT',
    enumerable_bulk: false
  },
  {
    entity_id: 'RPI_CHACO_TITULARES_DOMINIO',
    jurisdiction_code: 'AR_H',
    jurisdiction_name: 'Chaco',
    official_agency: 'Registro de la Propiedad Inmueble del Chaco',
    canonical_landing_url: 'https://rpi.chaco.gov.ar/',
    portal_url: 'https://rpi.chaco.gov.ar/tramites/informes',
    access_mode: PROPERTY_ACCESS_MODES.FORMAL_LOOKUP_OFFLINE_RESTRICTED,
    lookup_by_person: LOOKUP_BY_PERSON_STATUS.VERIFIED,
    cost_class: COST_CLASSES.PAID_PER_LOOKUP,
    default_auto_query: false,
    policy_restricted: true,
    legal_basis: 'Ley Provincial 1140-B',
    discovery_value: 'LOW',
    enrichment_value: 'HIGH',
    authority_value: 'VERY_HIGH',
    freshness: 'REQUEST_TIME_DEPENDENT',
    enumerable_bulk: false
  },
  {
    entity_id: 'RPI_CHUBUT_INDICE_TITULARES',
    jurisdiction_code: 'AR_U',
    jurisdiction_name: 'Chubut',
    official_agency: 'Dirección General de Registro de la Propiedad Inmueble de Chubut',
    canonical_landing_url: 'https://dgregprop.chubut.gov.ar/',
    portal_url: 'https://dgregprop.chubut.gov.ar/formularios',
    access_mode: PROPERTY_ACCESS_MODES.FORMAL_LOOKUP_PERSON_INDEX,
    lookup_by_person: LOOKUP_BY_PERSON_STATUS.VERIFIED,
    cost_class: COST_CLASSES.PAID_PER_LOOKUP,
    default_auto_query: false,
    policy_restricted: true,
    legal_basis: 'Ley I - N° 156',
    discovery_value: 'LOW',
    enrichment_value: 'HIGH',
    authority_value: 'VERY_HIGH',
    freshness: 'REQUEST_TIME_DEPENDENT',
    enumerable_bulk: false
  },
  {
    entity_id: 'RPI_CORDOBA_INDICES_PERSONALES',
    jurisdiction_code: 'AR_X',
    jurisdiction_name: 'Córdoba',
    official_agency: 'Registro General de la Provincia de Córdoba (RGYC)',
    canonical_landing_url: 'https://rgyc.cba.gov.ar/',
    portal_url: 'https://rgyc.cba.gov.ar/servicios-web/',
    access_mode: PROPERTY_ACCESS_MODES.FORMAL_LOOKUP_DIGITAL_CAPABLE,
    lookup_by_person: LOOKUP_BY_PERSON_STATUS.VERIFIED,
    cost_class: COST_CLASSES.PAID_PER_LOOKUP,
    default_auto_query: false,
    policy_restricted: true,
    legal_basis: 'Ley Provincial 5771 / Sistema Informático Registral Córdoba',
    discovery_value: 'LOW',
    enrichment_value: 'HIGH',
    authority_value: 'VERY_HIGH',
    freshness: 'REQUEST_TIME_DEPENDENT',
    enumerable_bulk: false
  },
  {
    entity_id: 'RPI_CORRIENTES_TITULARIDAD',
    jurisdiction_code: 'AR_W',
    jurisdiction_name: 'Corrientes',
    official_agency: 'Dirección General del Registro de la Propiedad Inmueble de Corrientes',
    canonical_landing_url: 'https://rpi.corrientes.gob.ar/',
    portal_url: 'https://rpi.corrientes.gob.ar/informes',
    access_mode: PROPERTY_ACCESS_MODES.CHANNEL_TO_VERIFY,
    lookup_by_person: LOOKUP_BY_PERSON_STATUS.NEEDS_CANARY,
    cost_class: COST_CLASSES.PAID_PER_LOOKUP,
    default_auto_query: false,
    policy_restricted: true,
    legal_basis: 'Ley Provincial 3133',
    discovery_value: 'LOW',
    enrichment_value: 'HIGH',
    authority_value: 'VERY_HIGH',
    freshness: 'REQUEST_TIME_DEPENDENT',
    enumerable_bulk: false
  },
  {
    entity_id: 'RPI_ENTRE_RIOS_TITULARIDAD',
    jurisdiction_code: 'AR_E',
    jurisdiction_name: 'Entre Ríos',
    official_agency: 'Registro Público de la Propiedad Inmueble de Entre Ríos',
    canonical_landing_url: 'https://www.entrerios.gov.ar/rpi/',
    portal_url: 'https://www.entrerios.gov.ar/rpi/sistema',
    access_mode: PROPERTY_ACCESS_MODES.AUTHENTICATED_REGISTRY_SYSTEM,
    lookup_by_person: LOOKUP_BY_PERSON_STATUS.NEEDS_CANARY,
    cost_class: COST_CLASSES.PAID_PER_LOOKUP,
    default_auto_query: false,
    policy_restricted: true,
    legal_basis: 'Ley Provincial 6964',
    discovery_value: 'LOW',
    enrichment_value: 'HIGH',
    authority_value: 'VERY_HIGH',
    freshness: 'REQUEST_TIME_DEPENDENT',
    enumerable_bulk: false
  },
  {
    entity_id: 'RPI_FORMOSA_TITULARIDAD',
    jurisdiction_code: 'AR_P',
    jurisdiction_name: 'Formosa',
    official_agency: 'Dirección General del Registro de la Propiedad Inmueble de Formosa',
    canonical_landing_url: 'https://www.formosa.gob.ar/rpi',
    portal_url: 'https://www.formosa.gob.ar/rpi/tramites',
    access_mode: PROPERTY_ACCESS_MODES.FORMAL_LOOKUP_OFFLINE,
    lookup_by_person: LOOKUP_BY_PERSON_STATUS.VERIFIED,
    cost_class: COST_CLASSES.PAID_PER_LOOKUP,
    default_auto_query: false,
    policy_restricted: true,
    legal_basis: 'Ley Provincial 119',
    discovery_value: 'LOW',
    enrichment_value: 'HIGH',
    authority_value: 'VERY_HIGH',
    freshness: 'REQUEST_TIME_DEPENDENT',
    enumerable_bulk: false
  },
  {
    entity_id: 'RPI_JUJUY_TITULARIDAD',
    jurisdiction_code: 'AR_Y',
    jurisdiction_name: 'Jujuy',
    official_agency: 'Registro Inmobiliario de la Provincia de Jujuy',
    canonical_landing_url: 'https://inmobiliario.jujuy.gob.ar/',
    portal_url: 'https://inmobiliario.jujuy.gob.ar/tramites',
    access_mode: PROPERTY_ACCESS_MODES.CHANNEL_TO_VERIFY,
    lookup_by_person: LOOKUP_BY_PERSON_STATUS.NEEDS_CANARY,
    cost_class: COST_CLASSES.PAID_PER_LOOKUP,
    default_auto_query: false,
    policy_restricted: true,
    legal_basis: 'Ley Provincial 3327',
    discovery_value: 'LOW',
    enrichment_value: 'HIGH',
    authority_value: 'VERY_HIGH',
    freshness: 'REQUEST_TIME_DEPENDENT',
    enumerable_bulk: false
  },
  {
    entity_id: 'RPI_LA_PAMPA_TITULARIDAD',
    jurisdiction_code: 'AR_L',
    jurisdiction_name: 'La Pampa',
    official_agency: 'Dirección General del Registro de la Propiedad Inmueble de La Pampa',
    canonical_landing_url: 'https://rpi.lapampa.gob.ar/',
    portal_url: 'https://rpi.lapampa.gob.ar/servicios',
    access_mode: PROPERTY_ACCESS_MODES.CHANNEL_TO_VERIFY,
    lookup_by_person: LOOKUP_BY_PERSON_STATUS.NEEDS_CANARY,
    cost_class: COST_CLASSES.PAID_PER_LOOKUP,
    default_auto_query: false,
    policy_restricted: true,
    legal_basis: 'Ley Provincial 483',
    discovery_value: 'LOW',
    enrichment_value: 'HIGH',
    authority_value: 'VERY_HIGH',
    freshness: 'REQUEST_TIME_DEPENDENT',
    enumerable_bulk: false
  },
  {
    entity_id: 'RPI_LA_RIOJA_TITULARES_DOMINIALES',
    jurisdiction_code: 'AR_F',
    jurisdiction_name: 'La Rioja',
    official_agency: 'Dirección General del Registro de la Propiedad Inmueble de La Rioja',
    canonical_landing_url: 'https://rpi.larioja.gov.ar/',
    portal_url: 'https://rpi.larioja.gov.ar/tramites/informe-dominial',
    access_mode: PROPERTY_ACCESS_MODES.FORMAL_LOOKUP_PAID,
    lookup_by_person: LOOKUP_BY_PERSON_STATUS.VERIFIED,
    cost_class: COST_CLASSES.PAID_PER_LOOKUP,
    default_auto_query: false,
    policy_restricted: true,
    legal_basis: 'Ley Provincial 4045',
    discovery_value: 'LOW',
    enrichment_value: 'HIGH',
    authority_value: 'VERY_HIGH',
    freshness: 'REQUEST_TIME_DEPENDENT',
    enumerable_bulk: false
  },
  {
    entity_id: 'RPI_MENDOZA_TITULARIDAD',
    jurisdiction_code: 'AR_M',
    jurisdiction_name: 'Mendoza',
    official_agency: 'Dirección de Registros Públicos y Archivo Judicial de Mendoza',
    canonical_landing_url: 'https://www.jus.mendoza.gov.ar/registros-publicos',
    portal_url: 'https://www.jus.mendoza.gov.ar/servicios-drp',
    access_mode: PROPERTY_ACCESS_MODES.FORMAL_LOOKUP_PARTIALLY_ONLINE,
    lookup_by_person: LOOKUP_BY_PERSON_STATUS.VERIFIED,
    cost_class: COST_CLASSES.PAID_PER_LOOKUP,
    default_auto_query: false,
    policy_restricted: true,
    legal_basis: 'Ley Provincial 8236 / Acordadas Suprema Corte Mendoza',
    discovery_value: 'LOW',
    enrichment_value: 'HIGH',
    authority_value: 'VERY_HIGH',
    freshness: 'REQUEST_TIME_DEPENDENT',
    enumerable_bulk: false
  },
  {
    entity_id: 'RPI_MISIONES_BUSQUEDA_TITULARIDAD',
    jurisdiction_code: 'AR_N',
    jurisdiction_name: 'Misiones',
    official_agency: 'Registro de la Propiedad Inmueble de Misiones',
    canonical_landing_url: 'https://www.rpi.misiones.gov.ar/',
    portal_url: 'https://www.rpi.misiones.gov.ar/servicios-online',
    access_mode: PROPERTY_ACCESS_MODES.FORMAL_LOOKUP_ONLINE,
    lookup_by_person: LOOKUP_BY_PERSON_STATUS.VERIFIED,
    cost_class: COST_CLASSES.PAID_PER_LOOKUP,
    default_auto_query: false,
    policy_restricted: true,
    legal_basis: 'Ley Provincial XII - N° 3',
    discovery_value: 'LOW',
    enrichment_value: 'HIGH',
    authority_value: 'VERY_HIGH',
    freshness: 'REQUEST_TIME_DEPENDENT',
    enumerable_bulk: false
  },
  {
    entity_id: 'RPI_NEUQUEN_TITULARIDAD_PERSONA',
    jurisdiction_code: 'AR_Q',
    jurisdiction_name: 'Neuquén',
    official_agency: 'Dirección Provincial del Registro de la Propiedad Inmueble del Neuquén',
    canonical_landing_url: 'https://rpi.neuquen.gov.ar/',
    portal_url: 'https://rpi.neuquen.gov.ar/formularios-y-tasas',
    access_mode: PROPERTY_ACCESS_MODES.FORMAL_LOOKUP_PAID,
    lookup_by_person: LOOKUP_BY_PERSON_STATUS.VERIFIED,
    cost_class: COST_CLASSES.PAID_PER_LOOKUP,
    default_auto_query: false,
    policy_restricted: true,
    legal_basis: 'Ley Provincial 2087',
    discovery_value: 'LOW',
    enrichment_value: 'HIGH',
    authority_value: 'VERY_HIGH',
    freshness: 'REQUEST_TIME_DEPENDENT',
    enumerable_bulk: false
  },
  {
    entity_id: 'RPI_RIO_NEGRO_INFORME_2',
    jurisdiction_code: 'AR_R',
    jurisdiction_name: 'Río Negro',
    official_agency: 'Registro de la Propiedad Inmueble de Río Negro',
    canonical_landing_url: 'https://rpi.rionegro.gov.ar/',
    portal_url: 'https://rpi.rionegro.gov.ar/tramites/informe-de-anotaciones-personales',
    access_mode: PROPERTY_ACCESS_MODES.FORMAL_LOOKUP_PERSON_INDEX,
    lookup_by_person: LOOKUP_BY_PERSON_STATUS.VERIFIED,
    cost_class: COST_CLASSES.PAID_PER_LOOKUP,
    default_auto_query: false,
    policy_restricted: true,
    legal_basis: 'Ley Provincial 2312 (Informe 2: Búsqueda por Persona)',
    discovery_value: 'LOW',
    enrichment_value: 'HIGH',
    authority_value: 'VERY_HIGH',
    freshness: 'REQUEST_TIME_DEPENDENT',
    enumerable_bulk: false
  },
  {
    entity_id: 'RPI_SALTA_TITULARIDAD',
    jurisdiction_code: 'AR_A',
    jurisdiction_name: 'Salta',
    official_agency: 'Dirección General de Inmuebles de Salta',
    canonical_landing_url: 'https://inmuebles.salta.gov.ar/',
    portal_url: 'https://inmuebles.salta.gov.ar/servicios',
    access_mode: PROPERTY_ACCESS_MODES.CHANNEL_TO_VERIFY,
    lookup_by_person: LOOKUP_BY_PERSON_STATUS.NEEDS_CANARY,
    cost_class: COST_CLASSES.PAID_PER_LOOKUP,
    default_auto_query: false,
    policy_restricted: true,
    legal_basis: 'Ley Provincial 5513',
    discovery_value: 'LOW',
    enrichment_value: 'HIGH',
    authority_value: 'VERY_HIGH',
    freshness: 'REQUEST_TIME_DEPENDENT',
    enumerable_bulk: false
  },
  {
    entity_id: 'RPI_SAN_JUAN_INFORME_BIENES',
    jurisdiction_code: 'AR_J',
    jurisdiction_name: 'San Juan',
    official_agency: 'Registro General Inmobiliario de San Juan',
    canonical_landing_url: 'https://registrodeinmuebles.sanjuan.gob.ar/',
    portal_url: 'https://registrodeinmuebles.sanjuan.gob.ar/informes-en-linea',
    access_mode: PROPERTY_ACCESS_MODES.FORMAL_LOOKUP_PAID,
    lookup_by_person: LOOKUP_BY_PERSON_STATUS.VERIFIED,
    cost_class: COST_CLASSES.PAID_PER_LOOKUP,
    default_auto_query: false,
    policy_restricted: true,
    legal_basis: 'Ley Provincial 292-A',
    discovery_value: 'LOW',
    enrichment_value: 'HIGH',
    authority_value: 'VERY_HIGH',
    freshness: 'REQUEST_TIME_DEPENDENT',
    enumerable_bulk: false
  },
  {
    entity_id: 'RPI_SAN_LUIS_TITULARIDAD',
    jurisdiction_code: 'AR_D',
    jurisdiction_name: 'San Luis',
    official_agency: 'Dirección del Registro de la Propiedad Inmueble de San Luis',
    canonical_landing_url: 'https://rpi.sanluis.gov.ar/',
    portal_url: 'https://rpi.sanluis.gov.ar/tramites',
    access_mode: PROPERTY_ACCESS_MODES.CHANNEL_TO_VERIFY,
    lookup_by_person: LOOKUP_BY_PERSON_STATUS.NEEDS_CANARY,
    cost_class: COST_CLASSES.PAID_PER_LOOKUP,
    default_auto_query: false,
    policy_restricted: true,
    legal_basis: 'Ley Provincial V-0158-2004',
    discovery_value: 'LOW',
    enrichment_value: 'HIGH',
    authority_value: 'VERY_HIGH',
    freshness: 'REQUEST_TIME_DEPENDENT',
    enumerable_bulk: false
  },
  {
    entity_id: 'RPI_SANTA_CRUZ_TITULARIDAD',
    jurisdiction_code: 'AR_Z',
    jurisdiction_name: 'Santa Cruz',
    official_agency: 'Registro de la Propiedad Inmueble de Santa Cruz',
    canonical_landing_url: 'https://rpi.santacruz.gob.ar/',
    portal_url: 'https://rpi.santacruz.gob.ar/consultas',
    access_mode: PROPERTY_ACCESS_MODES.FORMAL_LOOKUP_RESTRICTED,
    lookup_by_person: LOOKUP_BY_PERSON_STATUS.PARTIAL,
    cost_class: COST_CLASSES.PAID_PER_LOOKUP,
    default_auto_query: false,
    policy_restricted: true,
    legal_basis: 'Ley Provincial 1119 (Acceso restrictivo formal por escribano/profesional)',
    discovery_value: 'LOW',
    enrichment_value: 'HIGH',
    authority_value: 'VERY_HIGH',
    freshness: 'REQUEST_TIME_DEPENDENT',
    enumerable_bulk: false
  },
  {
    entity_id: 'RPI_SANTA_FE_TITULARIDAD',
    jurisdiction_code: 'AR_S',
    jurisdiction_name: 'Santa Fe',
    official_agency: 'Registro General de la Propiedad de la Provincia de Santa Fe',
    canonical_landing_url: 'https://www.santafe.gob.ar/index.php/tramites/modulotramites/index/205607',
    portal_url: 'https://www.santafe.gob.ar/rgp/',
    access_mode: PROPERTY_ACCESS_MODES.FORMAL_LOOKUP_OFFLINE_RESTRICTED,
    lookup_by_person: LOOKUP_BY_PERSON_STATUS.VERIFIED,
    cost_class: COST_CLASSES.PAID_PER_LOOKUP,
    default_auto_query: false,
    policy_restricted: true,
    legal_basis: 'Ley Provincial 6435 / Interés Legítimo Acreditado',
    discovery_value: 'LOW',
    enrichment_value: 'HIGH',
    authority_value: 'VERY_HIGH',
    freshness: 'REQUEST_TIME_DEPENDENT',
    enumerable_bulk: false
  },
  {
    entity_id: 'RPI_SANTIAGO_DEL_ESTERO_TITULARIDAD',
    jurisdiction_code: 'AR_G',
    jurisdiction_name: 'Santiago del Estero',
    official_agency: 'Registro General de la Propiedad Inmueble de Santiago del Estero',
    canonical_landing_url: 'https://rpi.sde.gob.ar/',
    portal_url: 'https://rpi.sde.gob.ar/tramites',
    access_mode: PROPERTY_ACCESS_MODES.CHANNEL_TO_VERIFY,
    lookup_by_person: LOOKUP_BY_PERSON_STATUS.NEEDS_CANARY,
    cost_class: COST_CLASSES.PAID_PER_LOOKUP,
    default_auto_query: false,
    policy_restricted: true,
    legal_basis: 'Ley Provincial 3622',
    discovery_value: 'LOW',
    enrichment_value: 'HIGH',
    authority_value: 'VERY_HIGH',
    freshness: 'REQUEST_TIME_DEPENDENT',
    enumerable_bulk: false
  },
  {
    entity_id: 'RPI_TIERRA_DEL_FUEGO_TITULARIDAD',
    jurisdiction_code: 'AR_V',
    jurisdiction_name: 'Tierra del Fuego',
    official_agency: 'Dirección del Registro de la Propiedad Inmueble de Tierra del Fuego',
    canonical_landing_url: 'https://rpi.tierradelfuego.gob.ar/',
    portal_url: 'https://rpi.tierradelfuego.gob.ar/informes',
    access_mode: PROPERTY_ACCESS_MODES.CHANNEL_TO_VERIFY,
    lookup_by_person: LOOKUP_BY_PERSON_STATUS.NEEDS_CANARY,
    cost_class: COST_CLASSES.PAID_PER_LOOKUP,
    default_auto_query: false,
    policy_restricted: true,
    legal_basis: 'Ley Territorial 305 / Ley Provincial 168',
    discovery_value: 'LOW',
    enrichment_value: 'HIGH',
    authority_value: 'VERY_HIGH',
    freshness: 'REQUEST_TIME_DEPENDENT',
    enumerable_bulk: false
  },
  {
    entity_id: 'RPI_TUCUMAN_TITULARIDAD',
    jurisdiction_code: 'AR_T',
    jurisdiction_name: 'Tucumán',
    official_agency: 'Registro Inmobiliario de la Provincia de Tucumán',
    canonical_landing_url: 'https://registroinmobiliario.tucuman.gov.ar/',
    portal_url: 'https://registroinmobiliario.tucuman.gov.ar/servicios',
    access_mode: PROPERTY_ACCESS_MODES.CHANNEL_TO_VERIFY,
    lookup_by_person: LOOKUP_BY_PERSON_STATUS.NEEDS_CANARY,
    cost_class: COST_CLASSES.PAID_PER_LOOKUP,
    default_auto_query: false,
    policy_restricted: true,
    legal_basis: 'Ley Provincial 3764',
    discovery_value: 'LOW',
    enrichment_value: 'HIGH',
    authority_value: 'VERY_HIGH',
    freshness: 'REQUEST_TIME_DEPENDENT',
    enumerable_bulk: false
  }
]);

/**
 * Capability Contract: PROPERTY_LOOKUP_BY_PERSON
 */
export const PROPERTY_LOOKUP_BY_PERSON_CONTRACT = Object.freeze({
  capability_id: 'PROPERTY_LOOKUP_BY_PERSON',
  description: 'Targeted enrichment lookup of real estate ownership evidence by person across Argentine provincial property registries.',
  domain: 'ASSETS',
  subdomain: 'REAL_ESTATE',
  input_schema: {
    atlas_person_id: { type: 'string', required: true, description: 'Canonical person identifier in Atlas SSOT' },
    jurisdiction: { type: 'string', required: true, description: 'Target provincial jurisdiction code (e.g. AR_CABA, AR_B)' },
    authorized_identity_lookup_material: { type: 'object', required: false, description: 'Internal encrypted identity materials permitted by explicit policy' },
    reason: { type: 'string', required: true, description: 'Legitimate request justification or lawful basis' },
    purpose: { type: 'string', required: true, description: 'Legal interest category or certified compliance purpose' },
    requesting_capability: { type: 'string', required: true, description: 'Atlas subsystem or module requesting property enrichment' }
  },
  output_type: 'PROPERTY_REGISTRY_EVIDENCE',
  never_outputs: 'CANONICAL_PERSON',
  data_minimization_rule: 'Raw identity materials (DNI/CUIT) must remain internal; zero credentials exposed in search projection or public interfaces.'
});

/**
 * Safe Internal Evidence Structure
 */
export class AtlasPropertyRegistryEvidence {
  constructor(data) {
    if (!data.atlas_person_id) throw new Error('MISSING_REQUIRED_FIELD: atlas_person_id');
    if (!data.source_entity_id) throw new Error('MISSING_REQUIRED_FIELD: source_entity_id');
    if (!data.jurisdiction) throw new Error('MISSING_REQUIRED_FIELD: jurisdiction');

    this.atlas_person_id = data.atlas_person_id;
    this.source_entity_id = data.source_entity_id;
    this.jurisdiction = data.jurisdiction;
    this.asset_type = 'REAL_ESTATE';
    this.registry_result_type = data.registry_result_type || 'OWNERSHIP_REPORT'; // TITULAR_REGISTRADO, NO_CONSTA_TITULARIDAD, INFORME_NEGATIVO
    this.owns_property = typeof data.owns_property === 'boolean' ? data.owns_property : null;
    this.property_count = typeof data.property_count === 'number' ? data.property_count : null;
    this.registry_reference_safe = data.registry_reference_safe || null; // e.g. "MATRICULA_EXP_2026_XXXX" (safe token, no PII)
    this.ownership_type = data.ownership_type || null; // TITULAR_EXCLUSIVO, CONDOMINIO, USUFRUCTO
    this.ownership_share = data.ownership_share || null; // e.g. "100%", "50%"
    this.observed_at = data.observed_at || new Date().toISOString();
    this.source_authority = data.source_authority;
    this.provenance = data.provenance || {};
    this.confidence = typeof data.confidence === 'number' ? data.confidence : 1.0;
    this.access_basis = data.access_basis || 'LEGITIMATE_INTEREST_LEGAL';
    this.request_id = data.request_id || `req_rpi_${crypto.randomUUID()}`;

    Object.freeze(this);
  }
}

/**
 * Deterministic Policy Gate for Property Registry Lookups
 */
export class AtlasPropertyRegistryPolicyGate {
  static evaluateLookupRequest(request, entityConfig) {
    const checks = {
      policy_allowed: false,
      access_mode_compatible: false,
      purpose_allowed: false,
      interest_legitimacy: false,
      cost_allowed: false
    };

    const reasons = [];

    // 1. Purpose Allowed Check
    const ALLOWED_PURPOSES = [
      'LEGAL_COMPLIANCE',
      'ASSET_VERIFICATION_AUTHORIZED',
      'REGULATORY_AUDIT',
      'JUDICIAL_MANDATE'
    ];
    if (ALLOWED_PURPOSES.includes(request.purpose)) {
      checks.purpose_allowed = true;
    } else {
      reasons.push(`PURPOSE_DISALLOWED: '${request.purpose}' is not in approved compliance list`);
    }

    // 2. Interest Legitimacy Check
    if (request.reason && request.reason.length >= 10 && request.authorized_requestor) {
      checks.interest_legitimacy = true;
    } else {
      reasons.push('INTEREST_LEGITIMACY_UNVERIFIED: Request lacks formal justification or authorized requestor');
    }

    // 3. Access Mode Compatibility
    const INCOMPATIBLE_MODES = [
      PROPERTY_ACCESS_MODES.CHANNEL_TO_VERIFY,
      PROPERTY_ACCESS_MODES.FORMAL_LOOKUP_OFFLINE,
      PROPERTY_ACCESS_MODES.FORMAL_LOOKUP_OFFLINE_RESTRICTED
    ];
    if (entityConfig && !INCOMPATIBLE_MODES.includes(entityConfig.access_mode)) {
      checks.access_mode_compatible = true;
    } else {
      reasons.push(`ACCESS_MODE_INCOMPATIBLE: '${entityConfig ? entityConfig.access_mode : 'UNKNOWN'}' cannot support automated digital lookup`);
    }

    // 4. Cost Policy Check (North Star: acquisition cost ≈ 0)
    if (entityConfig && entityConfig.cost_class === COST_CLASSES.FREE_PUBLIC) {
      checks.cost_allowed = true;
    } else if (request.explicit_cost_authorization === true) {
      checks.cost_allowed = true;
    } else {
      checks.cost_allowed = false;
      reasons.push('COST_DISALLOWED: Source requires fee and no explicit cost authorization provided');
    }

    // 5. Policy Allowed Synthesis
    checks.policy_allowed = checks.purpose_allowed &&
                            checks.interest_legitimacy &&
                            checks.access_mode_compatible &&
                            checks.cost_allowed;

    return {
      status: checks.policy_allowed ? 'POLICY_ALLOWED' : 'POLICY_BLOCKED',
      decision: checks.policy_allowed,
      checks,
      reasons,
      evaluated_at: new Date().toISOString()
    };
  }
}
