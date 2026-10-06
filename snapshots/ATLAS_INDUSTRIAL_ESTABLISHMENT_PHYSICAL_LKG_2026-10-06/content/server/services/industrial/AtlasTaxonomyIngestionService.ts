/**
 * ATLAS TAXONOMY INGESTION SERVICE V1
 * @server/services/industrial/AtlasTaxonomyIngestionService.ts
 * 
 * Ingests structured, open public taxonomies:
 * 1. UN ISIC Rev. 4 / CLAE (Official Argentine Activity Classification structure)
 * 2. OpenStreetMap Tagging Taxonomy (Map Features / Taginfo)
 * 3. Wikidata Q-IDs
 * 
 * Rules:
 * - NO AI per row.
 * - Normalized Concept Model with all required fields.
 * - Quality > Quantity, full provenance and valid mappings.
 * - Persists into PostgreSQL public.atlas_concept_registry (SSOT).
 * - Updates server/data/ontology/bootstrap_concepts.json as recovery seed.
 */

import fs from 'fs';
import path from 'path';
import type pg from 'pg';
import { dbPool } from '../../db.ts';
import { AtlasConceptRegistry, type AtlasConceptDefinition } from './AtlasConceptRegistry.ts';
import type { UniversalRowUnit, UniversalRelationType } from './UniversalSemanticResolver.ts';

// Comprehensive domain bridge for OSM tags, Wikidata IDs, and commercial synonyms
interface DomainMetadataBridge {
  osm_tags: string[];
  wikidata_ids: string[];
  default_row_unit: UniversalRowUnit;
  row_units: UniversalRowUnit[];
  entity_types: string[];
  relation: UniversalRelationType;
  activity: string;
  category: string;
  synonyms: string[];
  disallowed_roles: string[];
}

export class AtlasTaxonomyIngestionService {
  private static instance: AtlasTaxonomyIngestionService;

  public static getInstance(): AtlasTaxonomyIngestionService {
    if (!this.instance) {
      this.instance = new AtlasTaxonomyIngestionService();
    }
    return this.instance;
  }

  /**
   * Helper to normalize text
   */
  private normalize(str: string): string {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  /**
   * Domain rules dictionary mapping ISIC/CLAE divisions & classes to OSM, Wikidata, and semantic profiles
   */
  private getDivisionRules(code: string, title: string): DomainMetadataBridge {
    const div2 = code.slice(0, 2);
    const div4 = code.length === 4 ? code : '';

    // Default bridge
    let bridge: DomainMetadataBridge = {
      osm_tags: [],
      wikidata_ids: ['Q4830453'], // Business
      default_row_unit: 'COMPANY',
      row_units: ['COMPANY', 'ESTABLISHMENT'],
      entity_types: ['COMPANY'],
      relation: 'SERVICE_PROVIDER',
      activity: 'COMMERCIAL_SERVICE',
      category: `CLAE_DIV_${div2}`,
      synonyms: [],
      disallowed_roles: []
    };

    // Agriculture & Fishing (01 - 03)
    if (div2 >= '01' && div2 <= '03') {
      bridge = {
        osm_tags: ['landuse=farmland', 'industrial=agriculture'],
        wikidata_ids: ['Q11451'],
        default_row_unit: 'COMPANY',
        row_units: ['COMPANY'],
        entity_types: ['COMPANY'],
        relation: 'MANUFACTURER',
        activity: 'AGRICULTURE_AND_LIVESTOCK',
        category: 'AGRICULTURE',
        synonyms: ['agropecuaria', 'productor agropecuario', 'campo', 'empresa agricola'],
        disallowed_roles: ['RETAILER', 'DISTRIBUTOR']
      };
    }
    // Mining (05 - 09)
    else if (div2 >= '05' && div2 <= '09') {
      bridge = {
        osm_tags: ['landuse=quarry', 'industrial=mining'],
        wikidata_ids: ['Q44497'],
        default_row_unit: 'COMPANY',
        row_units: ['COMPANY'],
        entity_types: ['COMPANY'],
        relation: 'MANUFACTURER',
        activity: 'MINING_AND_EXTRACTION',
        category: 'MINING',
        synonyms: ['minera', 'empresa minera', 'extraccion minera', 'yacimiento'],
        disallowed_roles: ['RETAILER', 'DISTRIBUTOR']
      };
    }
    // Food & Beverage Manufacturing (10, 11)
    else if (div2 === '10' || div2 === '11') {
      let specificOsm = ['craft=caterer', 'industrial=food_processing'];
      let wiki = ['Q208197'];
      let syns = ['industria de alimentos', 'procesamiento de alimentos', 'fabrica de alimentos'];

      if (div4 === '1010') {
        specificOsm = ['shop=butcher', 'craft=slaughterhouse'];
        wiki = ['Q131645'];
        syns = ['frigorifico', 'matadero', 'procesamiento de carne', 'industria carnica', 'frigorificos'];
      } else if (div4 === '1071') {
        specificOsm = ['shop=bakery', 'craft=bakery'];
        wiki = ['Q131520'];
        syns = ['panaderia', 'panaderias', 'fabrica de pan', 'elaboracion de pan', 'panificadora', 'panificaciones'];
      } else if (div4 === '1073') {
        specificOsm = ['shop=confectionery', 'craft=confectionery'];
        wiki = ['Q178553'];
        syns = ['confiteria', 'fabrica de chocolates', 'chocolateria', 'elaboracion de golosinas'];
      } else if (div4 === '1102') {
        specificOsm = ['craft=winery', 'industrial=winery', 'shop=wine'];
        wiki = ['Q22652'];
        syns = ['bodega', 'bodegas', 'elaboracion de vino', 'vitivinicola', 'bodega de vino', 'vinicola'];
      } else if (div4 === '1103') {
        specificOsm = ['craft=brewery', 'industrial=brewery'];
        wiki = ['Q131323'];
        syns = ['cerveceria', 'fabrica de cerveza', 'cerveceria artesanal', 'elaboracion de cerveza'];
      }

      bridge = {
        osm_tags: specificOsm,
        wikidata_ids: wiki,
        default_row_unit: 'COMPANY',
        row_units: ['COMPANY', 'ESTABLISHMENT'],
        entity_types: ['COMPANY'],
        relation: 'MANUFACTURER',
        activity: 'FOOD_AND_BEVERAGE_MANUFACTURING',
        category: 'FOOD_MANUFACTURING',
        synonyms: syns,
        disallowed_roles: ['FERRETERIA', 'AUTOMOTIVE', 'CONSTRUCTION']
      };
    }
    // Textiles, Apparel & Leather (13 - 15)
    else if (div2 >= '13' && div2 <= '15') {
      let osm = ['shop=clothes', 'craft=tailor', 'industrial=textile'];
      let wiki = ['Q28823'];
      let syns = ['textil', 'fabrica textil', 'confeccion', 'indumentaria', 'industria textil'];
      if (div4 === '1520') {
        osm = ['shop=shoes', 'craft=shoemaker'];
        wiki = ['Q161928'];
        syns = ['fabrica de calzado', 'calzado', 'zapateria industrial', 'fabricacion de zapatos'];
      } else if (div4 === '1511') {
        osm = ['industrial=leather', 'craft=leather'];
        wiki = ['Q1056587'];
        syns = ['curtiembre', 'curtiembres', 'procesamiento de cuero', 'industria del cuero'];
      }
      bridge = {
        osm_tags: osm,
        wikidata_ids: wiki,
        default_row_unit: 'COMPANY',
        row_units: ['COMPANY'],
        entity_types: ['COMPANY'],
        relation: 'MANUFACTURER',
        activity: 'TEXTILE_AND_LEATHER_MANUFACTURING',
        category: 'TEXTILE_MANUFACTURING',
        synonyms: syns,
        disallowed_roles: ['RETAILER', 'DISTRIBUTOR']
      };
    }
    // Wood & Paper (16, 17)
    else if (div2 === '16' || div2 === '17') {
      let osm = ['industrial=sawmill', 'craft=carpenter'];
      let wiki = ['Q28823'];
      let syns = ['aserradero', 'aserraderos', 'industria maderera', 'papelera', 'fabrica de papel y carton'];
      if (div4 === '1702' || div2 === '17') {
        syns.push('packaging', 'envases', 'cajas de carton', 'empaque', 'embalaje', 'cajas', 'fabrica de envases', 'envases y embalajes');
      }
      bridge = {
        osm_tags: osm,
        wikidata_ids: wiki,
        default_row_unit: 'COMPANY',
        row_units: ['COMPANY'],
        entity_types: ['COMPANY'],
        relation: 'MANUFACTURER',
        activity: 'WOOD_AND_PAPER_MANUFACTURING',
        category: 'WOOD_AND_PAPER',
        synonyms: syns,
        disallowed_roles: ['RETAILER', 'DISTRIBUTOR']
      };
    }
    // Chemicals & Pharmaceuticals (20, 21)
    else if (div2 === '20' || div2 === '21') {
      let osm = ['industrial=chemical', 'office=chemist'];
      let wiki = ['Q131756'];
      let syns = ['industria quimica', 'fabrica de productos quimicos', 'quimica industrial'];
      if (div4 === '2100' || div2 === '21') {
        osm = ['industrial=pharmaceutical', 'office=pharmaceutical'];
        wiki = ['Q131756'];
        syns = ['laboratorio farmaceutico', 'laboratorios farmaceuticos', 'industria farmaceutica', 'fabricacion de medicamentos'];
      }
      bridge = {
        osm_tags: osm,
        wikidata_ids: wiki,
        default_row_unit: 'COMPANY',
        row_units: ['COMPANY'],
        entity_types: ['COMPANY'],
        relation: 'MANUFACTURER',
        activity: 'CHEMICAL_AND_PHARMACEUTICAL_MANUFACTURING',
        category: 'PHARMACEUTICAL_AND_CHEMICAL',
        synonyms: syns,
        disallowed_roles: ['RETAIL_PHARMACY', 'FERRETERIA']
      };
    }
    // Plastics, Minerals & Metals (22 - 25)
    else if (div2 >= '22' && div2 <= '25') {
      let osm = ['industrial=metalworking', 'craft=metal_construction'];
      let wiki = ['Q11442'];
      let syns = ['metalurgica', 'industria metalurgica', 'fundicion', 'metalmecanica', 'fabrica de plasticos'];
      if (div4 === '2593') {
        osm = ['industrial=machine_shop', 'craft=locksmith'];
        syns = ['fabrica de herramientas', 'fabrica de bulones', 'tornilleria industrial'];
      }
      bridge = {
        osm_tags: osm,
        wikidata_ids: wiki,
        default_row_unit: 'COMPANY',
        row_units: ['COMPANY'],
        entity_types: ['COMPANY'],
        relation: 'MANUFACTURER',
        activity: 'METALS_AND_PLASTICS_MANUFACTURING',
        category: 'METALLURGY_AND_MATERIALS',
        synonyms: syns,
        disallowed_roles: ['RETAILER', 'DISTRIBUTOR']
      };
    }
    // Machinery, Electronics & Automotive (26 - 30)
    else if (div2 >= '26' && div2 <= '30') {
      bridge = {
        osm_tags: ['industrial=factory', 'office=company'],
        wikidata_ids: ['Q11442', 'Q1420'],
        default_row_unit: 'COMPANY',
        row_units: ['COMPANY'],
        entity_types: ['COMPANY'],
        relation: 'MANUFACTURER',
        activity: 'MACHINERY_AND_EQUIPMENT_MANUFACTURING',
        category: 'INDUSTRIAL_MACHINERY',
        synonyms: ['fabrica de maquinaria', 'industria automotriz', 'autopartista', 'fabrica electronica'],
        disallowed_roles: ['RETAILER', 'DISTRIBUTOR']
      };
    }
    // Furniture (31)
    else if (div2 === '31') {
      bridge = {
        osm_tags: ['shop=furniture', 'craft=carpenter'],
        wikidata_ids: ['Q14920'],
        default_row_unit: 'COMPANY',
        row_units: ['COMPANY', 'ESTABLISHMENT'],
        entity_types: ['COMPANY'],
        relation: 'MANUFACTURER',
        activity: 'FURNITURE_MANUFACTURING',
        category: 'FURNITURE_INDUSTRY',
        synonyms: ['fabrica de muebles', 'fabricantes de muebles', 'carpinteria industrial', 'muebleria industrial'],
        disallowed_roles: ['RETAIL_FURNITURE_STORE']
      };
    }
    // Construction (41 - 43)
    else if (div2 >= '41' && div2 <= '43') {
      let osm = ['office=construction', 'craft=builder'];
      let wiki = ['Q38188'];
      let syns = ['empresa constructora', 'constructoras', 'obras civiles', 'construccion'];
      if (div4 === '4321') {
        osm = ['craft=electrician'];
        wiki = ['Q165077'];
        syns = ['instalaciones electricas', 'electricistas industriales', 'empresa de electricidad'];
      } else if (div4 === '4322') {
        osm = ['craft=plumber', 'craft=hvac'];
        wiki = ['Q252040'];
        syns = ['plomeria industrial', 'instalaciones de gas', 'climatizacion', 'calefaccion'];
      }
      bridge = {
        osm_tags: osm,
        wikidata_ids: wiki,
        default_row_unit: 'COMPANY',
        row_units: ['COMPANY'],
        entity_types: ['COMPANY'],
        relation: 'SERVICE_PROVIDER',
        activity: 'CONSTRUCTION',
        category: 'CONSTRUCTION_INDUSTRY',
        synonyms: syns,
        disallowed_roles: ['CORRALON', 'HARDWARE_RETAIL']
      };
    }
    // Motor Vehicle Trade & Repair (45)
    else if (div2 === '45') {
      let osm = ['shop=car', 'shop=car_repair'];
      let wiki = ['Q647573'];
      let syns = ['concesionaria', 'agencia de autos', 'taller mecanico', 'repuestos automotor'];
      if (div4 === '4520') {
        osm = ['shop=car_repair', 'craft=car_repair'];
        wiki = ['Q647573'];
        syns = ['taller mecanico', 'talleres mecanicos', 'mecanica automotriz', 'reparacion de autos'];
      }
      bridge = {
        osm_tags: osm,
        wikidata_ids: wiki,
        default_row_unit: 'ESTABLISHMENT',
        row_units: ['ESTABLISHMENT', 'COMPANY'],
        entity_types: ['COMPANY', 'ESTABLISHMENT'],
        relation: div4 === '4520' ? 'SERVICE_PROVIDER' : 'SELLER',
        activity: 'AUTOMOTIVE_COMMERCE_AND_REPAIR',
        category: 'AUTOMOTIVE',
        synonyms: syns,
        disallowed_roles: []
      };
    }
    // Wholesale Trade (46)
    else if (div2 === '46') {
      let osm = ['office=wholesale', 'shop=wholesale'];
      let wiki = ['Q212627'];
      let syns = ['mayorista', 'distribuidora', 'distribuidor mayorista', 'venta al por mayor'];
      if (div4 === '4663') {
        osm = ['shop=trade', 'industrial=warehouse'];
        syns = ['corralon mayorista', 'distribuidora de materiales', 'mayorista de ferreteria'];
      }
      bridge = {
        osm_tags: osm,
        wikidata_ids: wiki,
        default_row_unit: 'COMPANY',
        row_units: ['COMPANY'],
        entity_types: ['COMPANY'],
        relation: 'DISTRIBUTOR',
        activity: 'WHOLESALE_TRADE',
        category: 'WHOLESALE_TRADE',
        synonyms: syns,
        disallowed_roles: ['CONSUMIDOR_FINAL', 'RETAILER']
      };
    }
    // Retail Trade (47)
    else if (div2 === '47') {
      let osm = ['shop=yes'];
      let wiki = ['Q126793'];
      let syns = ['comercio minorista', 'local comercial', 'tienda', 'negocio'];
      let cat = 'RETAIL_TRADE';

      if (div4 === '4711') {
        osm = ['shop=supermarket', 'shop=convenience'];
        wiki = ['Q180490'];
        syns = ['supermercado', 'supermercados', 'autoservicio', 'almacen de comestibles'];
      } else if (div4 === '4721') {
        osm = ['shop=greengrocer', 'shop=butcher', 'shop=bakery'];
        wiki = ['Q131645'];
        syns = ['carniceria', 'verduleria', 'almacen de barrio', 'fiambreria'];
      } else if (div4 === '4752') {
        osm = ['shop=hardware', 'shop=paint'];
        wiki = ['Q843236'];
        syns = ['ferreteria', 'ferreterias', 'pintureria', 'corralon', 'articulos de ferreteria'];
      } else if (div4 === '4772') {
        osm = ['amenity=pharmacy', 'shop=chemist'];
        wiki = ['Q131065'];
        syns = ['farmacia', 'farmacias', 'botica', 'farmacia minorista'];
      } else if (div4 === '4759') {
        osm = ['shop=furniture', 'shop=electrical'];
        wiki = ['Q14920'];
        syns = ['muebleria', 'mueblerias', 'venta de muebles', 'casa de electrodomesticos'];
      } else if (div4 === '4771') {
        osm = ['shop=clothes', 'shop=shoes'];
        wiki = ['Q28823'];
        syns = ['tienda de ropa', 'zapateria', 'indumentaria minorista'];
      }

      bridge = {
        osm_tags: osm,
        wikidata_ids: wiki,
        default_row_unit: 'ESTABLISHMENT',
        row_units: ['ESTABLISHMENT', 'COMPANY'],
        entity_types: ['ESTABLISHMENT', 'COMPANY'],
        relation: 'SELLER',
        activity: 'RETAIL_COMMERCE',
        category: cat,
        synonyms: syns,
        disallowed_roles: ['MANUFACTURER']
      };
    }
    // Transport & Storage (49 - 53)
    else if (div2 >= '49' && div2 <= '53') {
      let osm = ['office=logistics', 'industrial=warehouse'];
      let wiki = ['Q7590'];
      let syns = ['transporte de carga', 'empresa de transporte', 'fletes', 'logistica', 'deposito'];
      bridge = {
        osm_tags: osm,
        wikidata_ids: wiki,
        default_row_unit: 'COMPANY',
        row_units: ['COMPANY'],
        entity_types: ['COMPANY'],
        relation: 'SERVICE_PROVIDER',
        activity: 'TRANSPORT_AND_STORAGE',
        category: 'TRANSPORT_AND_LOGISTICS',
        synonyms: syns,
        disallowed_roles: []
      };
    }
    // Hospitality & Accommodation (55)
    else if (div2 === '55') {
      bridge = {
        osm_tags: ['tourism=hotel', 'tourism=motel', 'tourism=hostel'],
        wikidata_ids: ['Q27686'],
        default_row_unit: 'ESTABLISHMENT',
        row_units: ['ESTABLISHMENT', 'COMPANY'],
        entity_types: ['ESTABLISHMENT', 'COMPANY'],
        relation: 'ESTABLISHMENT_SERVICE',
        activity: 'ACCOMMODATION',
        category: 'HOSPITALITY',
        synonyms: ['hotel', 'hoteles', 'hospedaje', 'alojamiento', 'hostel', 'posada'],
        disallowed_roles: []
      };
    }
    // Food & Beverage Services (56)
    else if (div2 === '56') {
      let osm = ['amenity=restaurant', 'amenity=cafe', 'amenity=bar'];
      let wiki = ['Q11707'];
      let syns = ['restaurante', 'restaurantes', 'bar', 'cafe', 'pizzeria', 'gastronomia', 'gastronomico', 'gastronomica', 'casa de comidas'];
      if (div4 === '5630') {
        osm = ['amenity=bar', 'amenity=pub', 'amenity=cafe'];
        wiki = ['Q187456'];
        syns = ['bar', 'bares', 'cerveceria bar', 'cafeteria', 'pub'];
      }
      bridge = {
        osm_tags: osm,
        wikidata_ids: wiki,
        default_row_unit: 'ESTABLISHMENT',
        row_units: ['ESTABLISHMENT', 'COMPANY'],
        entity_types: ['ESTABLISHMENT', 'COMPANY'],
        relation: 'ESTABLISHMENT_SERVICE',
        activity: 'FOOD_AND_BEVERAGE_SERVICE',
        category: 'GASTRONOMY',
        synonyms: syns,
        disallowed_roles: []
      };
    }
    // Media & Publishing (58 - 60)
    else if (div2 >= '58' && div2 <= '60') {
      let osm = ['office=newspaper', 'office=media'];
      let wiki = ['Q11032'];
      let syns = ['editorial', 'diario', 'periodico', 'medio de comunicacion', 'revista', 'prensa', 'periodista', 'periodistas', 'cronista', 'redaccion', 'periodismo'];
      bridge = {
        osm_tags: osm,
        wikidata_ids: wiki,
        default_row_unit: 'COMPANY',
        row_units: ['COMPANY', 'ESTABLISHMENT', 'PERSON'],
        entity_types: ['COMPANY', 'PERSON'],
        relation: 'SERVICE_PROVIDER',
        activity: 'PUBLISHING_AND_MEDIA',
        category: 'MEDIA_AND_COMMUNICATION',
        synonyms: syns,
        disallowed_roles: []
      };
    }
    // Software & IT Services (62, 63)
    else if (div2 === '62' || div2 === '63') {
      bridge = {
        osm_tags: ['office=it', 'office=company'],
        wikidata_ids: ['Q7397'],
        default_row_unit: 'COMPANY',
        row_units: ['COMPANY'],
        entity_types: ['COMPANY'],
        relation: 'SERVICE_PROVIDER',
        activity: 'INFORMATION_TECHNOLOGY',
        category: 'SOFTWARE_AND_IT',
        synonyms: ['empresa de software', 'desarrollo de software', 'software', 'tecnologia informatica', 'servicios it'],
        disallowed_roles: []
      };
    }
    // Real Estate (68)
    else if (div2 === '68') {
      bridge = {
        osm_tags: ['office=estate_agent', 'shop=estate_agent'],
        wikidata_ids: ['Q167332'],
        default_row_unit: 'ESTABLISHMENT',
        row_units: ['ESTABLISHMENT', 'COMPANY'],
        entity_types: ['REAL_ESTATE_BUSINESS', 'COMPANY', 'ESTABLISHMENT'],
        relation: 'REAL_ESTATE_BROKERAGE',
        activity: 'REAL_ESTATE_SERVICES',
        category: 'REAL_ESTATE',
        synonyms: ['inmobiliaria', 'inmobiliarias', 'agencia inmobiliaria', 'bienes raices', 'propiedades'],
        disallowed_roles: ['CONSTRUCTION_COMPANY']
      };
    }
    // Professional, Legal, Accounting, Architecture & Engineering (69 - 71)
    else if (div2 >= '69' && div2 <= '71') {
      let osm = ['office=lawyer', 'office=accountant', 'office=architect'];
      let wiki = ['Q40348'];
      let syns = ['servicios profesionales', 'estudio profesional'];
      if (div4 === '6910') {
        osm = ['office=lawyer'];
        wiki = ['Q40348'];
        syns = ['estudio juridico', 'estudios juridicos', 'abogados', 'bufete de abogados', 'asesoria legal'];
      } else if (div4 === '6920') {
        osm = ['office=accountant'];
        wiki = ['Q177309'];
        syns = ['estudio contable', 'estudios contables', 'contadores', 'asesoria impositiva', 'auditoria'];
      } else if (div4 === '7110') {
        osm = ['office=architect', 'office=engineer'];
        wiki = ['Q42973'];
        syns = ['estudio de arquitectura', 'estudios de arquitectura', 'estudio de ingenieria', 'arquitectos', 'ingenieros'];
      }
      bridge = {
        osm_tags: osm,
        wikidata_ids: wiki,
        default_row_unit: 'COMPANY',
        row_units: ['COMPANY', 'ESTABLISHMENT', 'PERSON'],
        entity_types: ['COMPANY', 'PERSON'],
        relation: 'SERVICE_PROVIDER',
        activity: 'PROFESSIONAL_SERVICES',
        category: 'PROFESSIONAL_LEGAL_ACCOUNTING',
        synonyms: syns,
        disallowed_roles: []
      };
    }
    // Advertising (73)
    else if (div2 === '73') {
      bridge = {
        osm_tags: ['office=advertising_agency'],
        wikidata_ids: ['Q379606'],
        default_row_unit: 'COMPANY',
        row_units: ['COMPANY'],
        entity_types: ['COMPANY'],
        relation: 'SERVICE_PROVIDER',
        activity: 'ADVERTISING_AND_MARKETING',
        category: 'ADVERTISING',
        synonyms: ['agencia de publicidad', 'agencias de publicidad', 'marketing', 'publicidad', 'estudio publicitario'],
        disallowed_roles: []
      };
    }
    // Veterinary (75)
    else if (div2 === '75') {
      bridge = {
        osm_tags: ['amenity=veterinary', 'shop=pet'],
        wikidata_ids: ['Q170119'],
        default_row_unit: 'ESTABLISHMENT',
        row_units: ['ESTABLISHMENT', 'COMPANY'],
        entity_types: ['ESTABLISHMENT', 'COMPANY'],
        relation: 'ESTABLISHMENT_SERVICE',
        activity: 'VETERINARY_CARE',
        category: 'VETERINARY',
        synonyms: ['veterinaria', 'veterinarias', 'clinica veterinaria', 'atencion veterinaria'],
        disallowed_roles: []
      };
    }
    // Education (85)
    else if (div2 === '85') {
      let osm = ['amenity=school', 'amenity=university', 'amenity=kindergarten'];
      let wiki = ['Q3914'];
      let syns = ['colegio', 'escuela', 'instituto educativo', 'universidad', 'educacion'];
      bridge = {
        osm_tags: osm,
        wikidata_ids: wiki,
        default_row_unit: 'INSTITUTION',
        row_units: ['INSTITUTION', 'ESTABLISHMENT'],
        entity_types: ['ORGANIZATION', 'ESTABLISHMENT'],
        relation: 'SERVICE_PROVIDER',
        activity: 'EDUCATION',
        category: 'EDUCATION',
        synonyms: syns,
        disallowed_roles: []
      };
    }
    // Healthcare & Hospitals (86)
    else if (div2 === '86') {
      let osm = ['amenity=hospital', 'amenity=clinic', 'amenity=doctors', 'amenity=dentist'];
      let wiki = ['Q16917'];
      let syns = ['hospital', 'clinica', 'sanatorio', 'centro medico', 'consultorio medico', 'atencion de la salud'];
      if (div4 === '8620') {
        osm = ['amenity=doctors', 'amenity=dentist'];
        wiki = ['Q39631'];
        syns = ['consultorio odontologico', 'dentista', 'odontologos', 'medicos'];
      }
      bridge = {
        osm_tags: osm,
        wikidata_ids: wiki,
        default_row_unit: 'ESTABLISHMENT',
        row_units: ['ESTABLISHMENT', 'INSTITUTION', 'COMPANY'],
        entity_types: ['ORGANIZATION', 'ESTABLISHMENT', 'COMPANY'],
        relation: 'SERVICE_PROVIDER',
        activity: 'HEALTHCARE',
        category: 'HEALTHCARE',
        synonyms: syns,
        disallowed_roles: []
      };
    }
    // Personal Services & Hairdressing (96)
    else if (div2 === '96') {
      let osm = ['shop=hairdresser', 'shop=beauty'];
      let wiki = ['Q108920'];
      let syns = ['peluqueria', 'peluquerias', 'salon de belleza', 'estetica', 'tratamientos de belleza'];
      bridge = {
        osm_tags: osm,
        wikidata_ids: wiki,
        default_row_unit: 'ESTABLISHMENT',
        row_units: ['ESTABLISHMENT', 'PERSON'],
        entity_types: ['ESTABLISHMENT'],
        relation: 'ESTABLISHMENT_SERVICE',
        activity: 'PERSONAL_SERVICES',
        category: 'PERSONAL_CARE',
        synonyms: syns,
        disallowed_roles: []
      };
    }

    return bridge;
  }

  /**
   * Generates clean synonyms for an ISIC/CLAE title in Spanish
   */
  private generateCleanSynonyms(title: string, code: string, bridgeSynonyms: string[]): string[] {
    const syns: Set<string> = new Set(bridgeSynonyms);
    const lower = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    syns.add(lower);

    // Clean formal prefix patterns
    const cleanCore = lower
      .replace(/^(?:fabricacion|elaboracion|procesamiento|produccion|cultivo|corte|instalacion|reparacion|mantenimiento|actividades|servicios?|venta al por mayor|venta al por menor|transporte|gestion|edicion)\s+(?:de|en|para|y)\s+/i, '')
      .replace(/\s*\(excepto[^)]+\)/gi, '')
      .replace(/\s*n\.c\.p\./gi, '')
      .replace(/\s*en comercios especializados/gi, '')
      .trim();

    if (cleanCore.length >= 3) {
      syns.add(cleanCore);
      if (lower.startsWith('fabricacion') || lower.startsWith('elaboracion')) {
        syns.add(`fabrica de ${cleanCore}`);
        syns.add(`fabricantes de ${cleanCore}`);
        syns.add(`fabricacion de ${cleanCore}`);
        syns.add(`industria de ${cleanCore}`);
      } else if (lower.startsWith('venta al por mayor')) {
        syns.add(`mayorista de ${cleanCore}`);
        syns.add(`distribuidora de ${cleanCore}`);
        syns.add(`distribuidores de ${cleanCore}`);
        syns.add(`proveedores de ${cleanCore}`);
      } else if (lower.startsWith('venta al por menor')) {
        syns.add(`venta de ${cleanCore}`);
        syns.add(`negocio de ${cleanCore}`);
        syns.add(`tienda de ${cleanCore}`);
        syns.add(`local de ${cleanCore}`);
      } else if (lower.startsWith('actividades de') || lower.startsWith('servicios')) {
        syns.add(`servicios de ${cleanCore}`);
        syns.add(`empresa de ${cleanCore}`);
        syns.add(`empresas de ${cleanCore}`);
      }
    }

    return Array.from(syns).filter(s => s.length >= 3 && !s.includes('n.c.p.'));
  }

  /**
   * Reads and parses official ISIC Rev 4 Spanish structure file
   */
  public parseIsicFile(filePath: string): Array<{ code: string; title: string }> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`ISIC file not found at: ${filePath}`);
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
    const results: Array<{ code: string; title: string }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('"Code"') || line.startsWith('Code')) continue;

      const match = line.match(/^"([^"]+)","?([^"]+)"?$/);
      if (match) {
        results.push({
          code: match[1].trim(),
          title: match[2].trim()
        });
      }
    }

    return results;
  }

  /**
   * Ingests full public taxonomies into PostgreSQL public.atlas_concept_registry
   */
  public async ingestPublicTaxonomies(): Promise<{
    total_parsed: number;
    concepts_generated: number;
    concepts_inserted: number;
  }> {
    const isicPath = path.resolve('server/data/ontology/isic_rev_4_spanish_structure.txt');
    const records = this.parseIsicFile(isicPath);
    console.log(`[AtlasTaxonomyIngestionService] Parsed ${records.length} official classification records from UN ISIC/CLAE.`);

    const generatedConcepts: Map<string, AtlasConceptDefinition> = new Map();

    // 1. Keep all existing baseline concepts
    const registry = AtlasConceptRegistry.getInstance();
    registry.setDbPool(dbPool);
    await registry.ensureSchema();
    const existing = registry.getAllConcepts();
    for (const ec of existing) {
      generatedConcepts.set(ec.concept_id, ec);
    }
    console.log(`[AtlasTaxonomyIngestionService] Preserved ${generatedConcepts.size} existing baseline concepts.`);

    // 2. Generate concept for each ISIC / CLAE entry
    for (const rec of records) {
      const code = rec.code;
      const title = rec.title;
      const bridge = this.getDivisionRules(code, title);

      let conceptId = '';
      if (/^[A-U]$/.test(code)) {
        conceptId = `CLAE_SEC_${code}`;
      } else if (/^\d{2}$/.test(code)) {
        conceptId = `CLAE_DIV_${code}`;
      } else if (/^\d{3}$/.test(code)) {
        conceptId = `CLAE_GRP_${code}`;
      } else if (/^\d{4}$/.test(code)) {
        conceptId = `CLAE_${code}`;
      } else {
        conceptId = `CLAE_${code.toUpperCase().replace(/\W+/g, '_')}`;
      }

      const synonyms = this.generateCleanSynonyms(title, code, bridge.synonyms);
      const aliases = [title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()];

      // Parent hierarchy linking
      const parentConcepts: string[] = [];
      if (code.length === 4) {
        parentConcepts.push(`CLAE_GRP_${code.slice(0, 3)}`);
        parentConcepts.push(`CLAE_DIV_${code.slice(0, 2)}`);
      } else if (code.length === 3) {
        parentConcepts.push(`CLAE_DIV_${code.slice(0, 2)}`);
      }

      // Negative semantics
      const negative_concepts = bridge.disallowed_roles.length > 0 ? {
        disallowed_roles: bridge.disallowed_roles,
        disallowed_categories: bridge.disallowed_roles,
        disallowed_keywords: bridge.disallowed_roles.map(r => r.toLowerCase()),
        reason: `Restricción taxonómica estricta CLAE ${code}: Rol ${bridge.relation} excluye roles incompatibles.`
      } : undefined;

      // Extract products from manufacturing
      const products: string[] = [];
      if (bridge.relation === 'MANUFACTURER' || bridge.activity.includes('MANUFACTURING')) {
        const prodName = title.replace(/^(?:fabricacion|elaboracion|produccion)\s+(?:de\s+)?/i, '').trim();
        if (prodName.length >= 3) products.push(prodName);
      }

      const conceptDef: AtlasConceptDefinition = {
        concept_id: conceptId,
        canonical_name: title,
        synonyms,
        aliases,
        entity_types: bridge.entity_types,
        row_units: bridge.row_units,
        default_row_unit: bridge.default_row_unit,
        categories: [bridge.category, conceptId],
        activities: [bridge.activity],
        relations: [bridge.relation],
        products,
        services: bridge.relation === 'SERVICE_PROVIDER' ? [title] : [],
        parent_concepts: parentConcepts,
        child_concepts: [],
        negative_concepts,
        required_evidence: ['BUSINESS_IDENTITY', 'ACTIVITY_EVIDENCE'],
        semantic_features: {
          clae_codes: [code],
          osm_tags: bridge.osm_tags,
          wikidata_ids: bridge.wikidata_ids,
          other_external_taxonomy_ids: { isic_rev4: code },
          source_hints: bridge.osm_tags.length > 0 ? ['OSM_OVERPASS'] : ['OFFICIAL_REGISTER']
        },
        osm_tags: bridge.osm_tags,
        clae_codes: [code],
        wikidata_ids: bridge.wikidata_ids,
        other_external_taxonomy_ids: { isic_rev4: code },
        source_hints: bridge.osm_tags.length > 0 ? ['OSM_OVERPASS'] : ['OFFICIAL_REGISTER'],
        source_capability_hints: bridge.osm_tags.length > 0 ? ['OSM_OVERPASS'] : ['OFFICIAL_REGISTER'],
        confidence: 1.0,
        provenance: 'UN_ISIC_REV4_CLAE',
        validation_state: 'VALIDATED',
        version: 2
      };

      // Don't overwrite if existing baseline had custom handcrafted semantics, but augment with taxonomy mappings
      if (generatedConcepts.has(conceptId)) {
        const prev = generatedConcepts.get(conceptId)!;
        prev.clae_codes = Array.from(new Set([...(prev.clae_codes || []), code]));
        prev.osm_tags = Array.from(new Set([...(prev.osm_tags || []), ...bridge.osm_tags]));
        prev.wikidata_ids = Array.from(new Set([...(prev.wikidata_ids || []), ...bridge.wikidata_ids]));
        prev.synonyms = Array.from(new Set([...(prev.synonyms || []), ...synonyms]));
      } else {
        generatedConcepts.set(conceptId, conceptDef);
      }
    }

    console.log(`[AtlasTaxonomyIngestionService] Total consolidated concepts to persist: ${generatedConcepts.size}`);

    // 3. Batch persist into PostgreSQL public.atlas_concept_registry (SSOT)
    let inserted = 0;
    const allList = Array.from(generatedConcepts.values());

    for (const def of allList) {
      await dbPool.query(`
        INSERT INTO public.atlas_concept_registry (
          concept_id, canonical_name, synonyms, aliases, entity_types, row_units, default_row_unit,
          categories, activities, relations, products, services, service_display,
          parent_concepts, child_concepts, negative_concepts, required_evidence,
          semantic_features, osm_tags, clae_codes, wikidata_ids, other_external_taxonomy_ids,
          source_hints, source_capability_hints, confidence, provenance, validation_state, version,
          updated_at
        ) VALUES (
          $1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7,
          $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13,
          $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb,
          $18::jsonb, $19::jsonb, $20::jsonb, $21::jsonb, $22::jsonb,
          $23::jsonb, $24::jsonb, $25, $26, $27, $28,
          NOW()
        )
        ON CONFLICT (concept_id) DO UPDATE SET
          canonical_name = EXCLUDED.canonical_name,
          synonyms = EXCLUDED.synonyms,
          aliases = EXCLUDED.aliases,
          entity_types = EXCLUDED.entity_types,
          row_units = EXCLUDED.row_units,
          default_row_unit = EXCLUDED.default_row_unit,
          categories = EXCLUDED.categories,
          activities = EXCLUDED.activities,
          relations = EXCLUDED.relations,
          products = EXCLUDED.products,
          services = EXCLUDED.services,
          parent_concepts = EXCLUDED.parent_concepts,
          negative_concepts = EXCLUDED.negative_concepts,
          required_evidence = EXCLUDED.required_evidence,
          semantic_features = EXCLUDED.semantic_features,
          osm_tags = EXCLUDED.osm_tags,
          clae_codes = EXCLUDED.clae_codes,
          wikidata_ids = EXCLUDED.wikidata_ids,
          other_external_taxonomy_ids = EXCLUDED.other_external_taxonomy_ids,
          source_hints = EXCLUDED.source_hints,
          source_capability_hints = EXCLUDED.source_capability_hints,
          confidence = EXCLUDED.confidence,
          provenance = EXCLUDED.provenance,
          validation_state = EXCLUDED.validation_state,
          version = EXCLUDED.version,
          updated_at = NOW();
      `, [
        def.concept_id,
        def.canonical_name,
        JSON.stringify(def.synonyms || []),
        JSON.stringify(def.aliases || []),
        JSON.stringify(def.entity_types || ['COMPANY']),
        JSON.stringify(def.row_units || ['COMPANY']),
        def.default_row_unit || 'COMPANY',
        JSON.stringify(def.categories || [def.concept_id]),
        JSON.stringify(def.activities || []),
        JSON.stringify(def.relations || ['GENERAL_ENTITY']),
        JSON.stringify(def.products || []),
        JSON.stringify(def.services || []),
        def.service_display || null,
        JSON.stringify(def.parent_concepts || []),
        JSON.stringify(def.child_concepts || []),
        JSON.stringify(def.negative_concepts || {}),
        JSON.stringify(def.required_evidence || []),
        JSON.stringify(def.semantic_features || {}),
        JSON.stringify(def.osm_tags || []),
        JSON.stringify(def.clae_codes || []),
        JSON.stringify(def.wikidata_ids || []),
        JSON.stringify(def.other_external_taxonomy_ids || {}),
        JSON.stringify(def.source_hints || []),
        JSON.stringify(def.source_capability_hints || []),
        def.confidence !== undefined ? def.confidence : 1.0,
        def.provenance || 'UN_ISIC_REV4_CLAE',
        def.validation_state || 'VALIDATED',
        def.version || 2
      ]);
      inserted++;
    }

    // 4. Update bootstrap JSON recovery seed
    const bootstrapPath = path.resolve('server/data/ontology/bootstrap_concepts.json');
    fs.writeFileSync(bootstrapPath, JSON.stringify(allList, null, 2), 'utf8');
    console.log(`[AtlasTaxonomyIngestionService] Updated bootstrap recovery file: ${bootstrapPath}`);

    // 5. Reload active cache in AtlasConceptRegistry
    await registry.loadFromDb();

    return {
      total_parsed: records.length,
      concepts_generated: generatedConcepts.size,
      concepts_inserted: inserted
    };
  }
}
