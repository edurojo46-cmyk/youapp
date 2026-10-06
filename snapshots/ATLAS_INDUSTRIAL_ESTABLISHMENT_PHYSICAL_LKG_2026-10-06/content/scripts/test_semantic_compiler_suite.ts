/**
 * ATLAS SEMANTIC COMPILER V1 BENCHMARK & CERTIFICATION SUITE
 * @scripts/test_semantic_compiler_suite.ts
 */

import crypto from 'crypto';
import { AtlasSemanticCompiler } from '../server/services/industrial/AtlasSemanticCompiler.ts';
import { AtlasConceptRegistry } from '../server/services/industrial/AtlasConceptRegistry.ts';
import { AtlasGeographyRegistry } from '../server/services/industrial/AtlasGeographyRegistry.ts';
import { UniversalSemanticResolver } from '../server/services/industrial/UniversalSemanticResolver.ts';
import { dbPool } from '../server/db.ts';

// ============================================================================
// SUITE 1: 100 MAIN FROZEN MISSIONS WITH EXPECTED FRAMES
// ============================================================================
interface MainTestCase {
  query: string;
  expected: {
    entity_type: string;
    row_unit: string;
    role: string;
    action: string;
    relation: string;
    object_term: string;
    geography: string | null;
    mandatory_evidence: string[];
    contact_required: boolean;
  };
}

const main100Tests: MainTestCase[] = [
  // 1-10: Manufacturing
  {
    query: 'fabricantes de muebles en Córdoba',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'MANUFACTURER', action: 'MANUFACTURE', relation: 'MANUFACTURES',
      object_term: 'muebles', geography: 'Córdoba', mandatory_evidence: ['COMPANY_IDENTITY', 'MANUFACTURING_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'fábricas de calzado en Buenos Aires',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'MANUFACTURER', action: 'MANUFACTURE', relation: 'MANUFACTURES',
      object_term: 'calzado', geography: 'Buenos Aires', mandatory_evidence: ['COMPANY_IDENTITY', 'MANUFACTURING_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'fabricación de plásticos en Rosario',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'MANUFACTURER', action: 'MANUFACTURE', relation: 'MANUFACTURES',
      object_term: 'plasticos', geography: 'Rosario', mandatory_evidence: ['COMPANY_IDENTITY', 'MANUFACTURING_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'elaboración de lácteos en Santa Fe',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'MANUFACTURER', action: 'MANUFACTURE', relation: 'MANUFACTURES',
      object_term: 'lacteos', geography: 'Santa Fe', mandatory_evidence: ['COMPANY_IDENTITY', 'MANUFACTURING_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'fabricantes de autopartes en Córdoba',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'MANUFACTURER', action: 'MANUFACTURE', relation: 'MANUFACTURES',
      object_term: 'autopartes', geography: 'Córdoba', mandatory_evidence: ['COMPANY_IDENTITY', 'MANUFACTURING_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'fábricas de envases de cartón en CABA',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'MANUFACTURER', action: 'MANUFACTURE', relation: 'MANUFACTURES',
      object_term: 'envases', geography: 'Ciudad Autónoma de Buenos Aires', mandatory_evidence: ['COMPANY_IDENTITY', 'MANUFACTURING_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'fabricación de pinturas en San Martín',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'MANUFACTURER', action: 'MANUFACTURE', relation: 'MANUFACTURES',
      object_term: 'pinturas', geography: 'General San Martín', mandatory_evidence: ['COMPANY_IDENTITY', 'MANUFACTURING_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'fabricantes de maquinaria agrícola en Córdoba',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'MANUFACTURER', action: 'MANUFACTURE', relation: 'MANUFACTURES',
      object_term: 'maquinaria', geography: 'Córdoba', mandatory_evidence: ['COMPANY_IDENTITY', 'MANUFACTURING_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'industria textil en Buenos Aires',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'MANUFACTURER', action: 'MANUFACTURE', relation: 'MANUFACTURES',
      object_term: 'textil', geography: 'Buenos Aires', mandatory_evidence: ['COMPANY_IDENTITY', 'MANUFACTURING_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'fabricantes de colchones en Pilar',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'MANUFACTURER', action: 'MANUFACTURE', relation: 'MANUFACTURES',
      object_term: 'colchones', geography: 'Pilar', mandatory_evidence: ['COMPANY_IDENTITY', 'MANUFACTURING_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },

  // 11-20: Retail & Shops
  {
    query: 'mueblerías en Córdoba',
    expected: {
      entity_type: 'ESTABLISHMENT', row_unit: 'ESTABLISHMENT', role: 'SELLER', action: 'SELL', relation: 'SELLS',
      object_term: 'muebles', geography: 'Córdoba', mandatory_evidence: ['ESTABLISHMENT_IDENTITY', 'RETAIL_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'zapaterías en Salta',
    expected: {
      entity_type: 'ESTABLISHMENT', row_unit: 'ESTABLISHMENT', role: 'SELLER', action: 'SELL', relation: 'SELLS',
      object_term: 'calzado', geography: 'Salta', mandatory_evidence: ['ESTABLISHMENT_IDENTITY', 'RETAIL_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'librerías en Rosario',
    expected: {
      entity_type: 'ESTABLISHMENT', row_unit: 'ESTABLISHMENT', role: 'SELLER', action: 'SELL', relation: 'SELLS',
      object_term: 'libros', geography: 'Rosario', mandatory_evidence: ['ESTABLISHMENT_IDENTITY', 'RETAIL_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'farmacias en Neuquén',
    expected: {
      entity_type: 'ESTABLISHMENT', row_unit: 'ESTABLISHMENT', role: 'RETAILER', action: 'RETAIL', relation: 'SELLS',
      object_term: 'farmacia', geography: 'Neuquén', mandatory_evidence: ['ESTABLISHMENT_IDENTITY', 'RETAIL_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'carnicerías en Mendoza',
    expected: {
      entity_type: 'ESTABLISHMENT', row_unit: 'ESTABLISHMENT', role: 'SELLER', action: 'SELL', relation: 'SELLS',
      object_term: 'carne', geography: 'Mendoza', mandatory_evidence: ['ESTABLISHMENT_IDENTITY', 'RETAIL_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'tiendas de ropa en Bariloche',
    expected: {
      entity_type: 'ESTABLISHMENT', row_unit: 'ESTABLISHMENT', role: 'SELLER', action: 'SELL', relation: 'SELLS',
      object_term: 'ropa', geography: 'San Carlos de Bariloche', mandatory_evidence: ['ESTABLISHMENT_IDENTITY', 'RETAIL_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'panaderías en CABA',
    expected: {
      entity_type: 'ESTABLISHMENT', row_unit: 'ESTABLISHMENT', role: 'SELLER', action: 'SELL', relation: 'SELLS',
      object_term: 'panaderia', geography: 'Ciudad Autónoma de Buenos Aires', mandatory_evidence: ['ESTABLISHMENT_IDENTITY', 'RETAIL_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'ferreterías en Mar del Plata',
    expected: {
      entity_type: 'ESTABLISHMENT', row_unit: 'ESTABLISHMENT', role: 'SELLER', action: 'SELL', relation: 'SELLS',
      object_term: 'ferreteria', geography: 'Mar del Plata', mandatory_evidence: ['ESTABLISHMENT_IDENTITY', 'RETAIL_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'jugueterías en Santa Fe',
    expected: {
      entity_type: 'ESTABLISHMENT', row_unit: 'ESTABLISHMENT', role: 'SELLER', action: 'SELL', relation: 'SELLS',
      object_term: 'juegos', geography: 'Santa Fe', mandatory_evidence: ['ESTABLISHMENT_IDENTITY', 'RETAIL_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'ópticas en Neuquén',
    expected: {
      entity_type: 'ESTABLISHMENT', row_unit: 'ESTABLISHMENT', role: 'SELLER', action: 'SELL', relation: 'SELLS',
      object_term: 'optica', geography: 'Neuquén', mandatory_evidence: ['ESTABLISHMENT_IDENTITY', 'RETAIL_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },

  // 21-30: Corporate Demand & Buyers
  {
    query: 'empresas que compran packaging en Córdoba',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'BUYER', action: 'BUY', relation: 'BUYS',
      object_term: 'packaging', geography: 'Córdoba', mandatory_evidence: ['COMPANY_IDENTITY', 'BUYER_RELATION', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'compradores de acero en Rosario',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'BUYER', action: 'BUY', relation: 'BUYS',
      object_term: 'acero', geography: 'Rosario', mandatory_evidence: ['COMPANY_IDENTITY', 'BUYER_RELATION', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'empresas que compren insumos químicos en Buenos Aires',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'BUYER', action: 'BUY', relation: 'BUYS',
      object_term: 'quimicos', geography: 'Buenos Aires', mandatory_evidence: ['COMPANY_IDENTITY', 'BUYER_RELATION', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'demanda de envases plásticos en Mendoza',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'BUYER', action: 'BUY', relation: 'BUYS',
      object_term: 'plasticos', geography: 'Mendoza', mandatory_evidence: ['COMPANY_IDENTITY', 'BUYER_RELATION', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'empresas que compran granos en Santa Fe',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'BUYER', action: 'BUY', relation: 'BUYS',
      object_term: 'granos', geography: 'Santa Fe', mandatory_evidence: ['COMPANY_IDENTITY', 'BUYER_RELATION', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'empresas que adquieren equipamiento médico en CABA',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'BUYER', action: 'BUY', relation: 'BUYS',
      object_term: 'medico', geography: 'Ciudad Autónoma de Buenos Aires', mandatory_evidence: ['COMPANY_IDENTITY', 'BUYER_RELATION', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'compradores de madera en Misiones',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'BUYER', action: 'BUY', relation: 'BUYS',
      object_term: 'madera', geography: 'Misiones', mandatory_evidence: ['COMPANY_IDENTITY', 'BUYER_RELATION', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'empresas que compran software en Córdoba',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'BUYER', action: 'BUY', relation: 'BUYS',
      object_term: 'software', geography: 'Córdoba', mandatory_evidence: ['COMPANY_IDENTITY', 'BUYER_RELATION', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'empresas que compran harina en Salta',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'BUYER', action: 'BUY', relation: 'BUYS',
      object_term: 'harina', geography: 'Salta', mandatory_evidence: ['COMPANY_IDENTITY', 'BUYER_RELATION', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'empresas que compren uniformes industriales en Neuquén',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'BUYER', action: 'BUY', relation: 'BUYS',
      object_term: 'uniformes', geography: 'Neuquén', mandatory_evidence: ['COMPANY_IDENTITY', 'BUYER_RELATION', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },

  // 31-40: Suppliers & Provision to Target Sectors
  {
    query: 'proveedores para hoteles en Bariloche',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'SUPPLIER', action: 'SUPPLY', relation: 'SUPPLIES_TO',
      object_term: 'hoteles', geography: 'San Carlos de Bariloche', mandatory_evidence: ['COMPANY_IDENTITY', 'SUPPLIER_RELATION', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'proveedores gastronómicos en Salta',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'SUPPLIER', action: 'SUPPLY', relation: 'SUPPLIES_TO',
      object_term: 'gastronomicos', geography: 'Salta', mandatory_evidence: ['COMPANY_IDENTITY', 'SUPPLIER_RELATION', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'proveedores de limpieza para hospitales en CABA',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'SUPPLIER', action: 'SUPPLY', relation: 'SUPPLIES_TO',
      object_term: 'hospitales', geography: 'Ciudad Autónoma de Buenos Aires', mandatory_evidence: ['COMPANY_IDENTITY', 'SUPPLIER_RELATION', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'proveedores de insumos para minería en San Juan',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'SUPPLIER', action: 'SUPPLY', relation: 'SUPPLIES_TO',
      object_term: 'mineria', geography: 'San Juan', mandatory_evidence: ['COMPANY_IDENTITY', 'SUPPLIER_RELATION', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'proveedores de ferretería industrial en Rosario',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'SUPPLIER', action: 'SUPPLY', relation: 'SUPPLIES_TO',
      object_term: 'ferreteria', geography: 'Rosario', mandatory_evidence: ['COMPANY_IDENTITY', 'SUPPLIER_RELATION', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'proveedores de servicios petroleros en Neuquén',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'SUPPLIER', action: 'SUPPLY', relation: 'SUPPLIES_TO',
      object_term: 'petroleros', geography: 'Neuquén', mandatory_evidence: ['COMPANY_IDENTITY', 'SUPPLIER_RELATION', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'proveedores para restaurantes en Mendoza',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'SUPPLIER', action: 'SUPPLY', relation: 'SUPPLIES_TO',
      object_term: 'restaurantes', geography: 'Mendoza', mandatory_evidence: ['COMPANY_IDENTITY', 'SUPPLIER_RELATION', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'proveedores de envases para bodegas en Mendoza',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'SUPPLIER', action: 'SUPPLY', relation: 'SUPPLIES_TO',
      object_term: 'bodegas', geography: 'Mendoza', mandatory_evidence: ['COMPANY_IDENTITY', 'SUPPLIER_RELATION', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'proveedores para clínicas en Córdoba',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'SUPPLIER', action: 'SUPPLY', relation: 'SUPPLIES_TO',
      object_term: 'clinicas', geography: 'Córdoba', mandatory_evidence: ['COMPANY_IDENTITY', 'SUPPLIER_RELATION', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'abastecedores de alimentos para comedores en Buenos Aires',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'SUPPLIER', action: 'SUPPLY', relation: 'SUPPLIES_TO',
      object_term: 'alimentos', geography: 'Buenos Aires', mandatory_evidence: ['COMPANY_IDENTITY', 'SUPPLIER_RELATION', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },

  // 41-50: Foreign Trade (Import / Export)
  {
    query: 'empresas que exportan alimentos congelados en Mendoza',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'EXPORTER', action: 'EXPORT', relation: 'EXPORTS',
      object_term: 'alimentos', geography: 'Mendoza', mandatory_evidence: ['COMPANY_IDENTITY', 'EXPORT_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'exportadores de vino en Mendoza',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'EXPORTER', action: 'EXPORT', relation: 'EXPORTS',
      object_term: 'vino', geography: 'Mendoza', mandatory_evidence: ['COMPANY_IDENTITY', 'EXPORT_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'exportación de carne en Santa Fe',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'EXPORTER', action: 'EXPORT', relation: 'EXPORTS',
      object_term: 'carne', geography: 'Santa Fe', mandatory_evidence: ['COMPANY_IDENTITY', 'EXPORT_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'exportadores de frutas en Río Negro',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'EXPORTER', action: 'EXPORT', relation: 'EXPORTS',
      object_term: 'frutas', geography: 'Río Negro', mandatory_evidence: ['COMPANY_IDENTITY', 'EXPORT_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'empresas que exporten miel en Buenos Aires',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'EXPORTER', action: 'EXPORT', relation: 'EXPORTS',
      object_term: 'miel', geography: 'Buenos Aires', mandatory_evidence: ['COMPANY_IDENTITY', 'EXPORT_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'importadores de autopartes en CABA',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'IMPORTER', action: 'IMPORT', relation: 'IMPORTS',
      object_term: 'autopartes', geography: 'Ciudad Autónoma de Buenos Aires', mandatory_evidence: ['COMPANY_IDENTITY', 'IMPORT_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'empresas que importan componentes electrónicos en Córdoba',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'IMPORTER', action: 'IMPORT', relation: 'IMPORTS',
      object_term: 'electronicos', geography: 'Córdoba', mandatory_evidence: ['COMPANY_IDENTITY', 'IMPORT_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'importadores de instrumental médico en Rosario',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'IMPORTER', action: 'IMPORT', relation: 'IMPORTS',
      object_term: 'medico', geography: 'Rosario', mandatory_evidence: ['COMPANY_IDENTITY', 'IMPORT_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'importación de maquinaria en Buenos Aires',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'IMPORTER', action: 'IMPORT', relation: 'IMPORTS',
      object_term: 'maquinaria', geography: 'Buenos Aires', mandatory_evidence: ['COMPANY_IDENTITY', 'IMPORT_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'importadores de café en CABA',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'IMPORTER', action: 'IMPORT', relation: 'IMPORTS',
      object_term: 'cafe', geography: 'Ciudad Autónoma de Buenos Aires', mandatory_evidence: ['COMPANY_IDENTITY', 'IMPORT_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },

  // 51-60: Professional Services & Person Roles
  {
    query: 'periodistas de economía en CABA',
    expected: {
      entity_type: 'PERSON', row_unit: 'PERSON', role: 'JOURNALIST', action: 'WRITE_ABOUT', relation: 'WRITES_ABOUT',
      object_term: 'economia', geography: 'Ciudad Autónoma de Buenos Aires', mandatory_evidence: ['PERSON_IDENTITY', 'JOURNALIST_ROLE', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'periodistas que escriban sobre energía en Neuquén',
    expected: {
      entity_type: 'PERSON', row_unit: 'PERSON', role: 'JOURNALIST', action: 'WRITE_ABOUT', relation: 'WRITES_ABOUT',
      object_term: 'energia', geography: 'Neuquén', mandatory_evidence: ['PERSON_IDENTITY', 'JOURNALIST_ROLE', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'estudios contables en Córdoba',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'SERVICE_PROVIDER', action: 'PROVIDE_SERVICE', relation: 'PROVIDES_SERVICE',
      object_term: 'contable', geography: 'Córdoba', mandatory_evidence: ['COMPANY_IDENTITY', 'SERVICE_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'estudios jurídicos en Rosario',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'SERVICE_PROVIDER', action: 'PROVIDE_SERVICE', relation: 'PROVIDES_SERVICE',
      object_term: 'juridico', geography: 'Rosario', mandatory_evidence: ['COMPANY_IDENTITY', 'SERVICE_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'estudios de arquitectura en Bariloche',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'SERVICE_PROVIDER', action: 'PROVIDE_SERVICE', relation: 'PROVIDES_SERVICE',
      object_term: 'arquitectura', geography: 'San Carlos de Bariloche', mandatory_evidence: ['COMPANY_IDENTITY', 'SERVICE_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'consultoras de recursos humanos en CABA',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'SERVICE_PROVIDER', action: 'PROVIDE_SERVICE', relation: 'PROVIDES_SERVICE',
      object_term: 'recursos humanos', geography: 'Ciudad Autónoma de Buenos Aires', mandatory_evidence: ['COMPANY_IDENTITY', 'SERVICE_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'servicios de ingeniería en Salta',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'SERVICE_PROVIDER', action: 'PROVIDE_SERVICE', relation: 'PROVIDES_SERVICE',
      object_term: 'ingenieria', geography: 'Salta', mandatory_evidence: ['COMPANY_IDENTITY', 'SERVICE_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'agencias de publicidad en Mendoza',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'SERVICE_PROVIDER', action: 'PROVIDE_SERVICE', relation: 'PROVIDES_SERVICE',
      object_term: 'publicidad', geography: 'Mendoza', mandatory_evidence: ['COMPANY_IDENTITY', 'SERVICE_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'agencias de marketing digital en Córdoba',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'SERVICE_PROVIDER', action: 'PROVIDE_SERVICE', relation: 'PROVIDES_SERVICE',
      object_term: 'marketing', geography: 'Córdoba', mandatory_evidence: ['COMPANY_IDENTITY', 'SERVICE_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'empresas de seguridad privada en Buenos Aires',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'SERVICE_PROVIDER', action: 'PROVIDE_SERVICE', relation: 'PROVIDES_SERVICE',
      object_term: 'seguridad', geography: 'Buenos Aires', mandatory_evidence: ['COMPANY_IDENTITY', 'SERVICE_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },

  // 61-70: Hospitality, Food Service & Establishments
  {
    query: 'hoteles en Bariloche',
    expected: {
      entity_type: 'ESTABLISHMENT', row_unit: 'ESTABLISHMENT', role: 'SERVICE_PROVIDER', action: 'PROVIDE_SERVICE', relation: 'ESTABLISHMENT_SERVICE',
      object_term: 'hoteles', geography: 'San Carlos de Bariloche', mandatory_evidence: ['ESTABLISHMENT_IDENTITY', 'ACTIVITY_EVIDENCE', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'restaurantes en Salta',
    expected: {
      entity_type: 'ESTABLISHMENT', row_unit: 'ESTABLISHMENT', role: 'SERVICE_PROVIDER', action: 'PROVIDE_SERVICE', relation: 'ESTABLISHMENT_SERVICE',
      object_term: 'restaurantes', geography: 'Salta', mandatory_evidence: ['ESTABLISHMENT_IDENTITY', 'ACTIVITY_EVIDENCE', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'cafeterías en Córdoba',
    expected: {
      entity_type: 'ESTABLISHMENT', row_unit: 'ESTABLISHMENT', role: 'SERVICE_PROVIDER', action: 'PROVIDE_SERVICE', relation: 'ESTABLISHMENT_SERVICE',
      object_term: 'cafeterias', geography: 'Córdoba', mandatory_evidence: ['ESTABLISHMENT_IDENTITY', 'ACTIVITY_EVIDENCE', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'clínicas y sanatorios en Rosario',
    expected: {
      entity_type: 'ESTABLISHMENT', row_unit: 'ESTABLISHMENT', role: 'SERVICE_PROVIDER', action: 'PROVIDE_SERVICE', relation: 'ESTABLISHMENT_SERVICE',
      object_term: 'clinicas', geography: 'Rosario', mandatory_evidence: ['ESTABLISHMENT_IDENTITY', 'ACTIVITY_EVIDENCE', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'gomerías en Neuquén',
    expected: {
      entity_type: 'ESTABLISHMENT', row_unit: 'ESTABLISHMENT', role: 'SERVICE_PROVIDER', action: 'PROVIDE_SERVICE', relation: 'ESTABLISHMENT_SERVICE',
      object_term: 'gomerias', geography: 'Neuquén', mandatory_evidence: ['ESTABLISHMENT_IDENTITY', 'ACTIVITY_EVIDENCE', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'veterinarias en Bariloche',
    expected: {
      entity_type: 'ESTABLISHMENT', row_unit: 'ESTABLISHMENT', role: 'SERVICE_PROVIDER', action: 'PROVIDE_SERVICE', relation: 'ESTABLISHMENT_SERVICE',
      object_term: 'veterinarias', geography: 'San Carlos de Bariloche', mandatory_evidence: ['ESTABLISHMENT_IDENTITY', 'ACTIVITY_EVIDENCE', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'talleres mecánicos en CABA',
    expected: {
      entity_type: 'ESTABLISHMENT', row_unit: 'ESTABLISHMENT', role: 'SERVICE_PROVIDER', action: 'PROVIDE_SERVICE', relation: 'ESTABLISHMENT_SERVICE',
      object_term: 'talleres', geography: 'Ciudad Autónoma de Buenos Aires', mandatory_evidence: ['ESTABLISHMENT_IDENTITY', 'ACTIVITY_EVIDENCE', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'gimnasios en Mendoza',
    expected: {
      entity_type: 'ESTABLISHMENT', row_unit: 'ESTABLISHMENT', role: 'SERVICE_PROVIDER', action: 'PROVIDE_SERVICE', relation: 'ESTABLISHMENT_SERVICE',
      object_term: 'gimnasios', geography: 'Mendoza', mandatory_evidence: ['ESTABLISHMENT_IDENTITY', 'ACTIVITY_EVIDENCE', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'peluquerías en Salta',
    expected: {
      entity_type: 'ESTABLISHMENT', row_unit: 'ESTABLISHMENT', role: 'SERVICE_PROVIDER', action: 'PROVIDE_SERVICE', relation: 'ESTABLISHMENT_SERVICE',
      object_term: 'peluquerias', geography: 'Salta', mandatory_evidence: ['ESTABLISHMENT_IDENTITY', 'ACTIVITY_EVIDENCE', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'lavanderías en Bariloche',
    expected: {
      entity_type: 'ESTABLISHMENT', row_unit: 'ESTABLISHMENT', role: 'SERVICE_PROVIDER', action: 'PROVIDE_SERVICE', relation: 'ESTABLISHMENT_SERVICE',
      object_term: 'lavanderias', geography: 'San Carlos de Bariloche', mandatory_evidence: ['ESTABLISHMENT_IDENTITY', 'ACTIVITY_EVIDENCE', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },

  // 71-80: Wholesale & Distribution
  {
    query: 'mayoristas de golosinas en Córdoba',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'DISTRIBUTOR', action: 'DISTRIBUTE', relation: 'DISTRIBUTES',
      object_term: 'golosinas', geography: 'Córdoba', mandatory_evidence: ['COMPANY_IDENTITY', 'DISTRIBUTION_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'distribuidores de alimentos en Salta',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'DISTRIBUTOR', action: 'DISTRIBUTE', relation: 'DISTRIBUTES',
      object_term: 'alimentos', geography: 'Salta', mandatory_evidence: ['COMPANY_IDENTITY', 'DISTRIBUTION_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'distribución de bebidas en Rosario',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'DISTRIBUTOR', action: 'DISTRIBUTE', relation: 'DISTRIBUTES',
      object_term: 'bebidas', geography: 'Rosario', mandatory_evidence: ['COMPANY_IDENTITY', 'DISTRIBUTION_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'mayoristas textiles en Buenos Aires',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'DISTRIBUTOR', action: 'DISTRIBUTE', relation: 'DISTRIBUTES',
      object_term: 'textil', geography: 'Buenos Aires', mandatory_evidence: ['COMPANY_IDENTITY', 'DISTRIBUTION_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'distribuidores de ferretería en Mendoza',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'DISTRIBUTOR', action: 'DISTRIBUTE', relation: 'DISTRIBUTES',
      object_term: 'ferreteria', geography: 'Mendoza', mandatory_evidence: ['COMPANY_IDENTITY', 'DISTRIBUTION_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'venta al por mayor de neumáticos en Neuquén',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'DISTRIBUTOR', action: 'DISTRIBUTE', relation: 'DISTRIBUTES',
      object_term: 'neumaticos', geography: 'Neuquén', mandatory_evidence: ['COMPANY_IDENTITY', 'DISTRIBUTION_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'distribuidora de medicamentos en CABA',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'DISTRIBUTOR', action: 'DISTRIBUTE', relation: 'DISTRIBUTES',
      object_term: 'medicamentos', geography: 'Ciudad Autónoma de Buenos Aires', mandatory_evidence: ['COMPANY_IDENTITY', 'DISTRIBUTION_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'mayorista de frutas y verduras en Salta',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'DISTRIBUTOR', action: 'DISTRIBUTE', relation: 'DISTRIBUTES',
      object_term: 'frutas', geography: 'Salta', mandatory_evidence: ['COMPANY_IDENTITY', 'DISTRIBUTION_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'distribuidores de artículos de limpieza en Córdoba',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'DISTRIBUTOR', action: 'DISTRIBUTE', relation: 'DISTRIBUTES',
      object_term: 'limpieza', geography: 'Córdoba', mandatory_evidence: ['COMPANY_IDENTITY', 'DISTRIBUTION_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'mayoristas de papel y librería en Rosario',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'DISTRIBUTOR', action: 'DISTRIBUTE', relation: 'DISTRIBUTES',
      object_term: 'papel', geography: 'Rosario', mandatory_evidence: ['COMPANY_IDENTITY', 'DISTRIBUTION_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },

  // 81-90: Construction & Real Estate
  {
    query: 'empresas constructoras en Neuquén',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'MANUFACTURER', action: 'MANUFACTURE', relation: 'MANUFACTURES',
      object_term: 'construccion', geography: 'Neuquén', mandatory_evidence: ['COMPANY_IDENTITY', 'MANUFACTURING_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'corralón de materiales en Córdoba',
    expected: {
      entity_type: 'ESTABLISHMENT', row_unit: 'ESTABLISHMENT', role: 'SELLER', action: 'SELL', relation: 'SELLS',
      object_term: 'materiales', geography: 'Córdoba', mandatory_evidence: ['ESTABLISHMENT_IDENTITY', 'RETAIL_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'empresa inmobiliaria en CABA',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'SERVICE_PROVIDER', action: 'PROVIDE_SERVICE', relation: 'PROVIDES_SERVICE',
      object_term: 'inmobiliaria', geography: 'Ciudad Autónoma de Buenos Aires', mandatory_evidence: ['COMPANY_IDENTITY', 'SERVICE_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'inmobiliarias en Rosario',
    expected: {
      entity_type: 'ESTABLISHMENT', row_unit: 'ESTABLISHMENT', role: 'SERVICE_PROVIDER', action: 'PROVIDE_SERVICE', relation: 'ESTABLISHMENT_SERVICE',
      object_term: 'inmobiliaria', geography: 'Rosario', mandatory_evidence: ['ESTABLISHMENT_IDENTITY', 'ACTIVITY_EVIDENCE', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'desarrolladoras inmobiliarias en Córdoba',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'SERVICE_PROVIDER', action: 'PROVIDE_SERVICE', relation: 'PROVIDES_SERVICE',
      object_term: 'desarrolladora', geography: 'Córdoba', mandatory_evidence: ['COMPANY_IDENTITY', 'SERVICE_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'empresas de pintura de obra en Mendoza',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'SERVICE_PROVIDER', action: 'PROVIDE_SERVICE', relation: 'PROVIDES_SERVICE',
      object_term: 'pintura', geography: 'Mendoza', mandatory_evidence: ['COMPANY_IDENTITY', 'SERVICE_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'instalaciones eléctricas en CABA',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'SERVICE_PROVIDER', action: 'PROVIDE_SERVICE', relation: 'PROVIDES_SERVICE',
      object_term: 'electricas', geography: 'Ciudad Autónoma de Buenos Aires', mandatory_evidence: ['COMPANY_IDENTITY', 'SERVICE_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'hormigoneras en Salta',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'MANUFACTURER', action: 'MANUFACTURE', relation: 'MANUFACTURES',
      object_term: 'hormigon', geography: 'Salta', mandatory_evidence: ['COMPANY_IDENTITY', 'MANUFACTURING_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'demoliciones en Córdoba',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'SERVICE_PROVIDER', action: 'PROVIDE_SERVICE', relation: 'PROVIDES_SERVICE',
      object_term: 'demoliciones', geography: 'Córdoba', mandatory_evidence: ['COMPANY_IDENTITY', 'SERVICE_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'carpinterías metálicas en Bariloche',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'MANUFACTURER', action: 'MANUFACTURE', relation: 'MANUFACTURES',
      object_term: 'carpinteria', geography: 'San Carlos de Bariloche', mandatory_evidence: ['COMPANY_IDENTITY', 'MANUFACTURING_ACTIVITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },

  // 91-100: Contact & Direct Extract Modifiers + Institutions
  {
    query: 'emails de farmacias en Salta',
    expected: {
      entity_type: 'ESTABLISHMENT', row_unit: 'PUBLIC_EMAIL_CONTACT', role: 'RETAILER', action: 'RETAIL', relation: 'SELLS',
      object_term: 'farmacia', geography: 'Salta', mandatory_evidence: ['ESTABLISHMENT_IDENTITY', 'RETAIL_ACTIVITY', 'PUBLIC_EMAIL_EVIDENCE'], contact_required: true
    }
  },
  {
    query: 'base de mails de empresas en Córdoba',
    expected: {
      entity_type: 'COMPANY', row_unit: 'PUBLIC_EMAIL_CONTACT', role: 'GENERAL_ENTITY', action: 'GENERAL_ACTION', relation: 'GENERAL_RELATION',
      object_term: 'empresas', geography: 'Córdoba', mandatory_evidence: ['COMPANY_IDENTITY', 'PUBLIC_EMAIL_EVIDENCE'], contact_required: true
    }
  },
  {
    query: 'empresas de Mendoza que exporten alimentos con contacto comercial publico',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'EXPORTER', action: 'EXPORT', relation: 'EXPORTS',
      object_term: 'alimentos', geography: 'Mendoza', mandatory_evidence: ['COMPANY_IDENTITY', 'EXPORT_ACTIVITY', 'PUBLIC_CONTACT_EVIDENCE'], contact_required: true
    }
  },
  {
    query: 'empresas de Rosario con teléfono público',
    expected: {
      entity_type: 'COMPANY', row_unit: 'COMPANY', role: 'GENERAL_ENTITY', action: 'GENERAL_ACTION', relation: 'GENERAL_RELATION',
      object_term: 'empresas', geography: 'Rosario', mandatory_evidence: ['COMPANY_IDENTITY', 'PUBLIC_PHONE_EVIDENCE'], contact_required: true
    }
  },
  {
    query: 'cámaras de comercio en Córdoba',
    expected: {
      entity_type: 'INSTITUTION', row_unit: 'INSTITUTION', role: 'GENERAL_ENTITY', action: 'GENERAL_ACTION', relation: 'GENERAL_RELATION',
      object_term: 'camaras', geography: 'Córdoba', mandatory_evidence: ['INSTITUTION_IDENTITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'colegios de abogados en Salta',
    expected: {
      entity_type: 'INSTITUTION', row_unit: 'INSTITUTION', role: 'GENERAL_ENTITY', action: 'GENERAL_ACTION', relation: 'GENERAL_RELATION',
      object_term: 'abogados', geography: 'Salta', mandatory_evidence: ['INSTITUTION_IDENTITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'asociaciones gremiales en Rosario',
    expected: {
      entity_type: 'INSTITUTION', row_unit: 'INSTITUTION', role: 'GENERAL_ENTITY', action: 'GENERAL_ACTION', relation: 'GENERAL_RELATION',
      object_term: 'gremiales', geography: 'Rosario', mandatory_evidence: ['INSTITUTION_IDENTITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'bibliotecas públicas en CABA',
    expected: {
      entity_type: 'INSTITUTION', row_unit: 'INSTITUTION', role: 'GENERAL_ENTITY', action: 'GENERAL_ACTION', relation: 'GENERAL_RELATION',
      object_term: 'bibliotecas', geography: 'Ciudad Autónoma de Buenos Aires', mandatory_evidence: ['INSTITUTION_IDENTITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'museos en Mendoza',
    expected: {
      entity_type: 'INSTITUTION', row_unit: 'INSTITUTION', role: 'GENERAL_ENTITY', action: 'GENERAL_ACTION', relation: 'GENERAL_RELATION',
      object_term: 'museos', geography: 'Mendoza', mandatory_evidence: ['INSTITUTION_IDENTITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  },
  {
    query: 'clubes deportivos en Bariloche',
    expected: {
      entity_type: 'INSTITUTION', row_unit: 'INSTITUTION', role: 'GENERAL_ENTITY', action: 'GENERAL_ACTION', relation: 'GENERAL_RELATION',
      object_term: 'clubes', geography: 'San Carlos de Bariloche', mandatory_evidence: ['INSTITUTION_IDENTITY', 'GEOGRAPHY_EVIDENCE'], contact_required: false
    }
  }
];

// Compute frozen SHA256 hash of the 100 test definitions
const frozenHash = crypto.createHash('sha256').update(JSON.stringify(main100Tests)).digest('hex');

// ============================================================================
// SUITE 2: 8 REQUIRED CONTRASTIVE PAIRS (0 Inversions expected)
// ============================================================================
const contrastivePairs = [
  {
    name: '1. Fabricantes de muebles vs Mueblerías',
    queryA: 'fabricantes de muebles en Córdoba',
    queryB: 'mueblerías en Córdoba',
    validate: (irA: any, irB: any) => irA.intent.role === 'MANUFACTURER' && (irB.intent.role === 'SELLER' || irB.intent.role === 'RETAILER') && irA.intent.action === 'MANUFACTURE' && (irB.intent.action === 'SELL' || irB.intent.action === 'RETAIL')
  },
  {
    name: '2. Fabricantes de packaging vs Compradores de packaging',
    queryA: 'fabricantes de packaging en Córdoba',
    queryB: 'empresas que compran packaging en Córdoba',
    validate: (irA: any, irB: any) => irA.intent.role === 'MANUFACTURER' && irB.intent.role === 'BUYER' && irB.negative_constraints.some((c: any) => c.disallowed_roles.includes('SELLER'))
  },
  {
    name: '3. Hoteles vs Proveedores para hoteles',
    queryA: 'hoteles en Bariloche',
    queryB: 'proveedores para hoteles en Bariloche',
    validate: (irA: any, irB: any) => irA.target.row_unit === 'ESTABLISHMENT' && irB.intent.role === 'SUPPLIER' && irB.negative_constraints.some((c: any) => c.disallowed_roles.includes('HOSPITALITY') || c.disallowed_categories.includes('HOSPITALITY'))
  },
  {
    name: '4. Farmacias vs Laboratorios farmacéuticos',
    queryA: 'farmacias en CABA',
    queryB: 'laboratorios farmacéuticos en CABA',
    validate: (irA: any, irB: any) => irA.target.row_unit === 'ESTABLISHMENT' && irB.target.row_unit === 'COMPANY' && (irB.intent.role === 'MANUFACTURER' || irB.intent.role === 'GENERAL_ENTITY')
  },
  {
    name: '5. Periodistas de economía vs Medios de economía',
    queryA: 'periodistas de economía en CABA',
    queryB: 'medios de economía en CABA',
    validate: (irA: any, irB: any) => irA.target.entity_type === 'PERSON' && irB.target.entity_type === 'COMPANY' && irA.intent.role === 'JOURNALIST'
  },
  {
    name: '6. Importadores de autopartes vs Fabricantes de autopartes',
    queryA: 'importadores de autopartes en Córdoba',
    queryB: 'fabricantes de autopartes en Córdoba',
    validate: (irA: any, irB: any) => irA.intent.role === 'IMPORTER' && irB.intent.role === 'MANUFACTURER' && irA.intent.action === 'IMPORT' && irB.intent.action === 'MANUFACTURE'
  },
  {
    name: '7. Empresas que venden maquinaria vs Empresas que usan maquinaria',
    queryA: 'empresas que venden maquinaria en Rosario',
    queryB: 'empresas que usan maquinaria en Rosario',
    validate: (irA: any, irB: any) => irA.intent.role === 'SELLER' && irB.intent.role === 'USER' && irA.intent.action === 'SELL' && irB.intent.action === 'USE'
  },
  {
    name: '8. Distribuidores de alimentos vs Restaurantes',
    queryA: 'distribuidores de alimentos en Salta',
    queryB: 'restaurantes en Salta',
    validate: (irA: any, irB: any) => irA.intent.role === 'DISTRIBUTOR' && irB.target.row_unit === 'ESTABLISHMENT' && irA.target.row_unit === 'COMPANY'
  }
];

// ============================================================================
// SUITE 3: 100 UNSEEN COMPOSITIONS (Brand new compositions, known primitives)
// ============================================================================
const unseenCompositions = [
  'empresas de Neuquén que fabriquen envases plásticos',
  'proveedores de lavandería para hoteles de Córdoba',
  'periodistas que escriban sobre energía en Mendoza',
  'empresas que exporten frutas congeladas desde Río Negro',
  'compradores de aluminio reciclado en Santa Fe',
  'fabricantes de transformadores de alta tensión en Salta',
  'distribuidores de indumentaria deportiva en Bariloche',
  'importadores de instrumental quirúrgico en Rosario',
  'empresas que utilicen paneles solares en San Juan',
  'proveedores de catering para eventos en Mar del Plata',
  'fabricación de tintas ecológicas en Buenos Aires',
  'comercialización de maquinaria vial en Catamarca',
  'empresas que adquieran insumos de laboratorio en CABA',
  'exportadores de nueces y frutos secos en La Rioja',
  'estudios de diseño industrial en Córdoba',
  'distribuidora de productos veterinarios en Tandil',
  'empresas de tratamiento de residuos biológicos en Rosario',
  'fabricantes de silos para granos en Pergamino',
  'proveedores de seguridad electrónica para countries en Pilar',
  'compradores de chatarra industrial en Quilmes',
  'empresas que exporten ajo y hortalizas en San Rafael',
  'periodistas que cubran agro y ganadería en Río Cuarto',
  'fabricación de válvulas industriales en San Nicolás',
  'empresas que compren resinas plásticas en San Martín',
  'distribuidores de lubricantes industriales en Comodoro Rivadavia',
  'talleres de rectificación de motores en Villa María',
  'empresas que importen café en grano en CABA',
  'proveedores de software contable para pymes en Córdoba',
  'fabricantes de bolsas biodegradables en Rosario',
  'empresas que usen calderas industriales en Santa Fe',
  'exportadores de aceite de oliva en Catamarca',
  'compradores de cartón corrugado en Resistencia',
  'distribuidora de insumos para panaderías en Salta',
  'empresas de transporte refrigerado en Bahía Blanca',
  'fabricación de bombas sumergibles en Esperanza',
  'proveedores de uniformes escolares en Bariloche',
  'periodistas de ciencia y tecnología en CABA',
  'empresas que adquieran gases industriales en Campana',
  'importadores de rodamientos de precisión en Córdoba',
  'empresas que exporten té negro en Oberá',
  'fabricantes de muebles para oficinas en Tigre',
  'proveedores de equipamiento gastronómico en Neuquén',
  'distribuidores de baterías para autos en San Juan',
  'empresas que compren perfiles de aluminio en La Plata',
  'estudios de agrimensura y topografía en San Luis',
  'exportadores de cítricos en Concordia',
  'fabricación de cerramientos de aluminio en Bariloche',
  'compradores de chapa galvanizada en San Francisco',
  'proveedores de mantenimiento de ascensores en Mar del Plata',
  'distribuidora de artículos de cotillón en Rosario',
  'empresas que usen grúas industriales en Ensenada',
  'periodistas que escriban sobre finanzas en CABA',
  'fabricantes de filtros para agua en Córdoba',
  'empresas que importen telas sintéticas en Once',
  'exportadores de pescado congelado en Puerto Madryn',
  'proveedores de equipamiento para gimnasios en Salta',
  'compradores de pallets de madera en Zárate',
  'distribuidores de pinturas epoxi en Neuquén',
  'empresas de doblado de caños en San Martín',
  'fabricación de cables para automotores en Córdoba',
  'empresas que compren envases de hojalata en Rosario',
  'estudios de impacto ambiental en Neuquén',
  'exportadores de legumbres en Salta',
  'proveedores de insumos odontológicos en Corrientes',
  'distribuidora de productos de bazar en CABA',
  'fabricantes de tanques de acero inoxidable en Rafaela',
  'empresas que usen montacargas en Rosario',
  'periodistas que cubran turismo en Bariloche',
  'importadores de componentes neumáticos en CABA',
  'empresas que exporten arroz en Entre Ríos',
  'proveedores de cartelería y señalética en Córdoba',
  'compradores de bolsas de polietileno en Mendoza',
  'distribuidores de repuestos de refrigeración en Santa Fe',
  'fabricación de cajas de cartón corrugado en Avellaneda',
  'empresas de ensayos no destructivos en Campana',
  'exportadores de cuero curtido en Lanús',
  'proveedores de hielo seco en Rosario',
  'distribuidora de golosinas al por mayor en Posadas',
  'fabricantes de mezcladoras de cemento en Córdoba',
  'empresas que compren alambre de cobre en Quilmes',
  'estudios de bioingeniería en CABA',
  'periodistas que escriban sobre minería en San Juan',
  'importadores de instrumentos de medición en Córdoba',
  'exportadores de mosto concentrado en San Juan',
  'proveedores de envases de vidrio para cervecerías en Bariloche',
  'compradores de bobinas de papel en Morón',
  'distribuidores de artículos de ferretería en Formosa',
  'fabricación de aberturas de PVC en Neuquén',
  'empresas que usen hornos de fundición en San Nicolás',
  'talleres de corte y plegado de chapa en Rosario',
  'exportadores de yerba mate en Apóstoles',
  'proveedores de bandejas plásticas descartables en Mendoza',
  'distribuidora de materiales descartables médicos en CABA',
  'fabricantes de acoplados para camiones en Bell Ville',
  'empresas que compren acero inoxidable en Córdoba',
  'periodistas que cubran política judicial en CABA',
  'importadores de bombas hidráulicas en Rosario',
  'exportadores de lana ovina en Trelew',
  'proveedores de ropa de trabajo en Comodoro Rivadavia',
  'distribuidores de semillas híbridas en Pergamino'
];

// ============================================================================
// SUITE 4: 30 NOVELTY / FICTIONAL TESTS (Fail-closed expected)
// ============================================================================
const noveltyTerms = [
  'fabricantes de zorbaxianos en Córdoba',
  'proveedores de criptodragonita en Salta',
  'distribuidor de partículas taquiónicas en Neuquén',
  'compradores de unobtanium en Bariloche',
  'empresas de teleportación cuántica en CABA',
  'servicios de exorcismo galáctico en Rosario',
  'taller de reactores antimateria en Mendoza',
  'criaderos de basiliscos en Jujuy',
  'alquiler de alfombras voladoras en San Juan',
  'confección de trajes para androides en La Plata',
  'importadores de vibranium en Córdoba',
  'reparación de naves espaciales en Ushuaia',
  'fabricantes de varitas mágicas en Salta',
  'mayorista de pócimas medievales en Catamarca',
  'escuelas de caballeros jedi en Bariloche',
  'agencia de viajes en el tiempo en CABA',
  'cultivo de plantas de kriptonita en Santa Fe',
  'minería de polvo de estrellas en Neuquén',
  'fabricación de sables de luz en San Luis',
  'estudios de astrología interdimensional en CABA',
  'criadores de quimeras en Corrientes',
  'empresas de recolección de ectoplasma en Resistencia',
  'fabricantes de armaduras de mithril en Tandil',
  'vendedores de elixires de inmortalidad en Córdoba',
  'ensamblaje de mechas gigantes en Campana',
  'destilería de ambrosía divina en La Rioja',
  'laboratorio de mutaciones mutagénicas en CABA',
  'proveedores de hiperpropulsores en Neuquén',
  'talleres de portales dimensionales en Salta',
  'consultoría en telepatía sintética en Rosario'
];

async function main() {
  const registry = AtlasConceptRegistry.getInstance();
  registry.setDbPool(dbPool);
  await registry.ensureSchema();
  await registry.loadFromDb();

  const geoRegistry = AtlasGeographyRegistry.getInstance();
  geoRegistry.setDbPool(dbPool);
  await geoRegistry.ensureSchema();
  await geoRegistry.loadFromDb();

  const compiler = AtlasSemanticCompiler.getInstance();
  const legacyResolver = UniversalSemanticResolver.getInstance();

  console.log('==================================================');
  console.log('BENCHMARK EVALUATION: ATLAS SEMANTIC COMPILER V1');
  console.log('==================================================');
  console.log(`TEST_SET_HASH = ${frozenHash}`);
  console.log(`MAIN_TESTS_TOTAL = ${main100Tests.length}`);

  // 1. Evaluate 100 Main Frozen Tests
  let targetCorrect = 0;
  let rowUnitCorrect = 0;
  let roleCorrect = 0;
  let actionCorrect = 0;
  let relationCorrect = 0;
  let objectCorrect = 0;
  let geographyCorrect = 0;
  let evidenceContractCorrect = 0;
  let fullFrameCorrect = 0;
  let falseConfidentResolutions = 0;
  let legacyDifferences = 0;

  for (const t of main100Tests) {
    const ir = compiler.compile(t.query);
    const legacy = legacyResolver.resolve(t.query);

    const isTargetOk = ir.target.entity_type === t.expected.entity_type;
    const isRowUnitOk = ir.target.row_unit === t.expected.row_unit;
    const isRoleOk = ir.intent.role === t.expected.role ||
                     ((ir.intent.role === 'SELLER' || ir.intent.role === 'RETAILER') && (t.expected.role === 'SELLER' || t.expected.role === 'RETAILER'));
    const isActionOk = ir.intent.action === t.expected.action ||
                       ((ir.intent.action === 'SELL' || ir.intent.action === 'RETAIL') && (t.expected.action === 'SELL' || t.expected.action === 'RETAIL'));
    const isRelOk = ir.intent.relation === t.expected.relation;
    const isObjOk = ir.object.canonical_name.toLowerCase().includes(t.expected.object_term.toLowerCase()) ||
                    ir.object.raw_term.toLowerCase().includes(t.expected.object_term.toLowerCase()) ||
                    (ir.object.concept_id ? (() => {
                      const c = registry.getConcept(ir.object.concept_id);
                      if (!c) return false;
                      const term = t.expected.object_term.toLowerCase();
                      return c.synonyms.some(s => s.toLowerCase().includes(term)) ||
                             c.products.some(p => p.toLowerCase().includes(term)) ||
                             c.activities.some(a => a.toLowerCase().includes(term)) ||
                             (c.service_display?.toLowerCase().includes(term) ?? false);
                    })() : false);
    const isGeoOk = t.expected.geography === null ? ir.geography.canonical_name === null : (ir.geography.canonical_name?.includes(t.expected.geography) || false);

    // Evidence check: mandatory evidence items present
    const evTypes = ir.evidence_contract.map(e => e.evidence_type);
    const isEvOk = t.expected.mandatory_evidence.every(req => evTypes.includes(req));

    if (isTargetOk) targetCorrect++;
    if (isRowUnitOk) rowUnitCorrect++;
    if (isRoleOk) roleCorrect++;
    if (isActionOk) actionCorrect++;
    if (isRelOk) relationCorrect++;
    if (isObjOk) objectCorrect++;
    if (isGeoOk) geographyCorrect++;
    if (isEvOk) evidenceContractCorrect++;

    const isFrameOk = isTargetOk && isRowUnitOk && isRoleOk && isActionOk && isRelOk && isObjOk && isGeoOk && isEvOk;
    if (isFrameOk) {
      fullFrameCorrect++;
    } else {
      const fails: string[] = [];
      if (!isTargetOk) fails.push(`target: got ${ir.target.entity_type}, exp ${t.expected.entity_type}`);
      if (!isRowUnitOk) fails.push(`row_unit: got ${ir.target.row_unit}, exp ${t.expected.row_unit}`);
      if (!isRoleOk) fails.push(`role: got ${ir.intent.role}, exp ${t.expected.role}`);
      if (!isActionOk) fails.push(`action: got ${ir.intent.action}, exp ${t.expected.action}`);
      if (!isRelOk) fails.push(`relation: got ${ir.intent.relation}, exp ${t.expected.relation}`);
      if (!isObjOk) fails.push(`object: got "${ir.object.canonical_name}", exp "${t.expected.object_term}"`);
      if (!isGeoOk) fails.push(`geo: got "${ir.geography.canonical_name}", exp "${t.expected.geography}"`);
      if (!isEvOk) fails.push(`ev: got [${evTypes.join(', ')}], exp [${t.expected.mandatory_evidence.join(', ')}]`);
      console.log(`MAIN FAIL [${t.query}] => ${fails.join(' | ')}`);
    }

    if (ir.semantic_confidence.overall >= 0.90 && !isFrameOk) {
      falseConfidentResolutions++;
    }

    if (legacy.row_unit !== ir.target.row_unit || legacy.relation !== ir.intent.role) {
      legacyDifferences++;
    }
  }

  const targetAccuracy = (targetCorrect / main100Tests.length) * 100;
  const rowUnitAccuracy = (rowUnitCorrect / main100Tests.length) * 100;
  const roleAccuracy = (roleCorrect / main100Tests.length) * 100;
  const actionAccuracy = (actionCorrect / main100Tests.length) * 100;
  const relationAccuracy = (relationCorrect / main100Tests.length) * 100;
  const objectAccuracy = (objectCorrect / main100Tests.length) * 100;
  const geographyAccuracy = (geographyCorrect / main100Tests.length) * 100;
  const evidenceContractAccuracy = (evidenceContractCorrect / main100Tests.length) * 100;
  const semanticFrameAccuracy = (fullFrameCorrect / main100Tests.length) * 100;

  // 2. Evaluate 8 Contrastive Pairs
  let contrastiveErrors = 0;
  for (const pair of contrastivePairs) {
    const irA = compiler.compile(pair.queryA);
    const irB = compiler.compile(pair.queryB);
    const ok = pair.validate(irA, irB);
    if (!ok) {
      console.log('CONTRASTIVE FAILED:', pair.name);
      contrastiveErrors++;
    }
  }

  // 3. Evaluate 100 Unseen Compositions
  let unseenSuccess = 0;
  for (const query of unseenCompositions) {
    const ir = compiler.compile(query);
    // Unseen success requires valid atomic decomposition: recognized role/action, recognized object, resolved semantics
    if ((ir.resolution_state === 'SEMANTICS_RESOLVED' || ir.resolution_state === 'AMBIGUOUS_GEOGRAPHY') && ir.intent.role !== 'GENERAL_ENTITY' && ir.object.concept_id !== null) {
      unseenSuccess++;
    } else {
      console.log(`UNSEEN FAIL: "${query}" => state=${ir.resolution_state}, role=${ir.intent.role}, obj_id=${ir.object.concept_id}, obj_name="${ir.object.canonical_name}", obj_raw="${ir.object.raw_term}"`);
    }
  }
  const unseenRate = (unseenSuccess / unseenCompositions.length) * 100;

  // 4. Evaluate 30 Novelty / Fictional Terms (Fail-closed check)
  let noveltyFalseResolutions = 0;
  for (const query of noveltyTerms) {
    const ir = compiler.compile(query);
    if (ir.resolution_state === 'SEMANTICS_RESOLVED' || ir.can_auto_execute) {
      noveltyFalseResolutions++;
    }
  }

  console.log('\n--- EVALUATION RESULTS ---');
  console.log(`SEMANTIC_FRAME_ACCURACY = ${semanticFrameAccuracy.toFixed(1)}%`);
  console.log(`TARGET_ACCURACY = ${targetAccuracy.toFixed(1)}%`);
  console.log(`ROW_UNIT_ACCURACY = ${rowUnitAccuracy.toFixed(1)}%`);
  console.log(`ROLE_ACCURACY = ${roleAccuracy.toFixed(1)}%`);
  console.log(`ACTION_ACCURACY = ${actionAccuracy.toFixed(1)}%`);
  console.log(`RELATION_ACCURACY = ${relationAccuracy.toFixed(1)}%`);
  console.log(`OBJECT_ACCURACY = ${objectAccuracy.toFixed(1)}%`);
  console.log(`GEOGRAPHY_ACCURACY = ${geographyAccuracy.toFixed(1)}%`);
  console.log(`EVIDENCE_CONTRACT_ACCURACY = ${evidenceContractAccuracy.toFixed(1)}%`);
  console.log(`RELATION_INVERSION_ERRORS = ${contrastiveErrors}`);
  console.log(`FALSE_CONFIDENT_RESOLUTIONS = ${falseConfidentResolutions}`);
  console.log(`UNSEEN_COMPOSITION_TESTS = ${unseenCompositions.length}`);
  console.log(`UNSEEN_COMPOSITION_SUCCESS = ${unseenSuccess}`);
  console.log(`UNSEEN_COMPOSITION_RATE = ${unseenRate.toFixed(1)}%`);
  console.log(`NOVELTY_TESTS = ${noveltyTerms.length}`);
  console.log(`NOVELTY_FALSE_RESOLUTIONS = ${noveltyFalseResolutions}`);
  console.log(`LEGACY_VS_COMPILER_DIFFERENCES = ${legacyDifferences}`);

  process.exit(contrastiveErrors === 0 && noveltyFalseResolutions === 0 && semanticFrameAccuracy >= 90 ? 0 : 1);
}

main().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
