/**
 * ATLAS EMAIL FILTER CONSTANTS & TAXONOMY DICTIONARIES
 * Client & Server safe (Zero Node.js / database imports)
 */

export const CANONICAL_ENGINE_NAME = 'ATLAS_EMAIL_FILTER_ENGINE';
export const VISIBLE_NAME = 'FILTRO DE EMAILS ATLAS';
export const CERTIFIED_UNIVERSE = 2000000;

// Flag bit positions
export const FLAG_HAS_PHONE       = 1 << 0;
export const FLAG_HAS_WEBSITE     = 1 << 1;
export const FLAG_HAS_LINKEDIN    = 1 << 2;
export const FLAG_HAS_INSTAGRAM   = 1 << 3;
export const FLAG_HAS_FACEBOOK    = 1 << 4;
export const FLAG_DIRECT_BINDING  = 1 << 5;
export const FLAG_VALID_PROV      = 1 << 6;
export const FLAG_EVIDENCE_EXISTS = 1 << 7;

// Dictionaries
export const PROVINCES = [
  'UNKNOWN',
  'CABA',
  'Buenos Aires',
  'Córdoba',
  'Santa Fe',
  'Mendoza',
  'Tucumán',
  'Salta',
  'Entre Ríos',
  'Río Negro',
  'Neuquén',
  'Chubut',
  'Chaco',
  'Corrientes',
  'Misiones',
  'San Juan',
  'Jujuy'
];

export const CITIES = [
  'UNKNOWN',
  'Ciudad Autónoma de Buenos Aires',
  'La Plata',
  'Mar del Plata',
  'Bahía Blanca',
  'Quilmes',
  'San Martín',
  'Córdoba',
  'Rosario',
  'Santa Fe',
  'Mendoza',
  'San Miguel de Tucumán',
  'Salta',
  'Paraná',
  'Viedma',
  'Neuquén',
  'Rawson',
  'Resistencia',
  'Corrientes',
  'Posadas',
  'San Juan',
  'San Salvador de Jujuy'
];

export const PROFESSIONS = [
  'UNKNOWN',
  'Abogado',
  'Médico',
  'Investigador',
  'Ingeniero',
  'Docente / Académico',
  'Contador / Economista',
  'Funcionario Público',
  'Director / Ejecutivo'
];

export const SECTORS = [
  'UNKNOWN',
  'ACADEMIC_RESEARCH',
  'PUBLIC_GOVERNMENT',
  'HEALTHCARE_MEDICAL',
  'LEGAL_JURIDICAL',
  'FINANCE_COMMERCE',
  'ENGINEERING_TECHNOLOGY',
  'INDUSTRY_CONSTRUCTION'
];

export const SOURCE_FAMILIES = [
  'UNKNOWN',
  'OPENALEX',
  'PUBLIC_NOT_INDEXED',
  'PUBLIC_RENDERED',
  'GOV_ACADEMIC',
  'SOCIAL_BRIDGE',
  'JOB_NETWORKS',
  'GOV_DATA',
  'COMMERCE_REGISTRY',
  'LEGAL_OFFICIAL',
  'MARKETPLACES'
];

export const EMAIL_TYPES = [
  'UNKNOWN',
  'EDU',
  'GOV',
  'CORPORATE',
  'PUBLIC_PROFESSIONAL',
  'PERSONAL'
];
