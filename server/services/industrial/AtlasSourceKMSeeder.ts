/**
 * ATLAS SOURCE KNOWLEDGE MAP SEEDER V1
 * @server/services/industrial/AtlasSourceKMSeeder.ts
 * 
 * Enforces Architectural Invariant:
 * SOURCE KNOWLEDGE MAP IS THE ONLY SSOT FOR ALL PRODUCTIVE SOURCES.
 * PRODUCTIVE_SOURCES_OUTSIDE_SOURCE_KM = 0.
 * 
 * Migrates / registers all 8 productive static sources into public.atlas_source_knowledge_map.
 * Static definitions remain only as bootstrap / recovery seeds.
 */

import type pg from 'pg';
import { dbPool } from '../../db.ts';

export interface ProductiveSourceSeed {
  source_id: string;
  source_name: string;
  canonical_url: string;
  source_family: string;
  source_universe: string;
  owner_organization: string;
  geography_scope: string;
  protocol: string;
  access_method: string;
  public_status: string;
  permitted_status: string;
  schema_signature: Record<string, any>;
  supported_motor_template: string;
  estimated_records: number;
  estimated_unique_entities: number;
  update_frequency: string;
  reliability_score: number;
  quality_score: number;
  storage_amplification: number;
  rate_limit_profile: Record<string, any>;
  current_status: string;
  entity_capabilities: Record<string, any>;
  source_roles: string[];
  can_produce_entity_rows: string;
  entity_types_supported: string[];
  row_unit_supported: string[];
  geographic_granularity: string;
  queryability: Record<string, any>;
  public_access_confirmed: boolean;
  field_telemetry: Record<string, any>;
}

export const PRODUCTIVE_STATIC_SOURCES: ProductiveSourceSeed[] = [
  // 1. OSM / Overpass Generic Enumerable Source
  {
    source_id: 'SRC_OSM_PUBLIC_ESTABLISHMENTS',
    source_name: 'Directorio Público Abierto de Comercios y Establecimientos (OSM / Overpass Registry)',
    canonical_url: 'https://overpass-api.de/api/interpreter',
    source_family: 'OVERPASS_API',
    source_universe: 'FAM_CANONICAL_ESTABLISHMENT_DIRECTORY',
    owner_organization: 'OpenStreetMap Foundation',
    geography_scope: 'GLOBAL',
    protocol: 'HTTP_REST',
    access_method: 'SPATIAL_QUERY',
    public_status: 'PUBLIC',
    permitted_status: 'PERMITTED',
    schema_signature: { types: ['node', 'way', 'relation'], fields: ['id', 'lat', 'lon', 'tags'] },
    supported_motor_template: 'AtlasOverpassConnector',
    estimated_records: 50000000,
    estimated_unique_entities: 50000000,
    update_frequency: 'REALTIME',
    reliability_score: 0.95,
    quality_score: 0.90,
    storage_amplification: 1.00,
    rate_limit_profile: { min_interval_ms: 1000, max_requests_per_sec: 2 },
    current_status: 'PROMOTED',
    entity_capabilities: { ESTABLISHMENT: 'HIGH', COMPANY: 'MEDIUM', POI: 'HIGH' },
    source_roles: ['ENTITY_SOURCE', 'DISCOVERY_SOURCE', 'EVIDENCE_SOURCE'],
    can_produce_entity_rows: 'TRUE',
    entity_types_supported: ['ESTABLISHMENT', 'COMPANY', 'ORGANIZATION', 'POI'],
    row_unit_supported: ['ESTABLISHMENT', 'COMPANY'],
    geographic_granularity: 'LOCAL_BOUNDING_BOX',
    queryability: {
      by_id: true,
      by_name: true,
      free_text: true,
      by_concept: true,
      by_geography: true,
      spatial_bounding_box: true,
      browse_only: false
    },
    public_access_confirmed: true,
    field_telemetry: {
      connector_family: 'OSM_OVERPASS',
      bulk_enumeration_available: true,
      dynamic_taxonomy_capable: true,
      generic_enumerable: true
    }
  },
  // 2. REFAR (Farmacias Oficiales SISA MinSalud)
  {
    source_id: 'SRC_REFAR_ESTABLECIMIENTOS_FARMACIAS',
    source_name: 'Registro Federal de Establecimientos de Salud (REFAR / MinSalud)',
    canonical_url: 'https://sisa.msal.gov.ar/sisa/#sisa',
    source_family: 'OFFICIAL_REGISTRY',
    source_universe: 'FAM_CANONICAL_ESTABLISHMENT_DIRECTORY',
    owner_organization: 'Ministerio de Salud de la Nación',
    geography_scope: 'ARG_NACIONAL',
    protocol: 'LOCAL_FILE_CSV',
    access_method: 'DOWNLOADABLE_DATASET',
    public_status: 'PUBLIC',
    permitted_status: 'PERMITTED',
    schema_signature: { fields: ['id', 'nombre', 'direccion', 'provincia', 'categoria'] },
    supported_motor_template: 'AtlasCSVConnector',
    estimated_records: 15000,
    estimated_unique_entities: 15000,
    update_frequency: 'MONTHLY',
    reliability_score: 0.99,
    quality_score: 0.98,
    storage_amplification: 1.00,
    rate_limit_profile: { min_interval_ms: 0, max_requests_per_sec: 100 },
    current_status: 'PROMOTED',
    entity_capabilities: { ESTABLISHMENT: 'HIGH', COMPANY: 'HIGH' },
    source_roles: ['ENTITY_SOURCE', 'EVIDENCE_SOURCE'],
    can_produce_entity_rows: 'TRUE',
    entity_types_supported: ['ESTABLISHMENT', 'COMPANY'],
    row_unit_supported: ['ESTABLISHMENT', 'COMPANY'],
    geographic_granularity: 'CITY_PROVINCE',
    queryability: { by_id: true, by_name: true, free_text: true, by_concept: true, by_geography: true },
    public_access_confirmed: true,
    field_telemetry: { 
      filename: 'refar_establecimientos_farmacias.csv', 
      parser_type: 'CSV',
      categories_supported: ['PHARMACY', 'HEALTH', 'SALUD_Y_FARMACIA', 'FARMACIA', 'FARMACIAS'],
      relations_supported: ['ESTABLISHMENT_SERVICE', 'SELLER', 'RETAILER']
    }
  },
  // 3. IDECOR (Veterinarias Habilitadas Córdoba)
  {
    source_id: 'SRC_IDECOR_STOCK_VETERINARIA',
    source_name: 'Registro Oficial de Establecimientos Veterinarios y Zooterápicos (IDECOR / MinGanadería Córdoba)',
    canonical_url: 'https://idecor.cba.gov.ar/geoserver/idecor/wfs',
    source_family: 'OFFICIAL_REGISTRY',
    source_universe: 'FAM_CANONICAL_ESTABLISHMENT_DIRECTORY',
    owner_organization: 'Gobierno de la Provincia de Córdoba / IDECOR',
    geography_scope: 'ARG_CORDOBA',
    protocol: 'LOCAL_FILE_GEOJSON',
    access_method: 'DOWNLOADABLE_DATASET',
    public_status: 'PUBLIC',
    permitted_status: 'PERMITTED',
    schema_signature: { fields: ['id', 'razon_social', 'domicilio', 'localidad', 'rubro'] },
    supported_motor_template: 'AtlasGeoJSONConnector',
    estimated_records: 2500,
    estimated_unique_entities: 2500,
    update_frequency: 'MONTHLY',
    reliability_score: 0.98,
    quality_score: 0.95,
    storage_amplification: 1.00,
    rate_limit_profile: { min_interval_ms: 0, max_requests_per_sec: 100 },
    current_status: 'PROMOTED',
    entity_capabilities: { ESTABLISHMENT: 'HIGH', COMPANY: 'HIGH' },
    source_roles: ['ENTITY_SOURCE', 'EVIDENCE_SOURCE'],
    can_produce_entity_rows: 'TRUE',
    entity_types_supported: ['ESTABLISHMENT', 'COMPANY'],
    row_unit_supported: ['ESTABLISHMENT', 'COMPANY'],
    geographic_granularity: 'CITY_PROVINCE',
    queryability: { by_id: true, by_name: true, free_text: true, by_concept: true, by_geography: true },
    public_access_confirmed: true,
    field_telemetry: { 
      filename: 'cordoba_veterinarias_idecor.json', 
      parser_type: 'GEOJSON',
      categories_supported: ['VETERINARY', 'ZOOTERAPICOS'],
      relations_supported: ['ESTABLISHMENT_SERVICE', 'SERVICE_PROVIDER']
    }
  },
  // 4. CAFABYT (Fabricantes Industriales de Bulones ADIMRA)
  {
    source_id: 'SRC_CAFABYT_FABRICANTES_BULONES',
    source_name: 'Cámara de Fabricantes de Bulones, Tornillos, Tuercas y Afines (CAFABYT / ADIMRA)',
    canonical_url: 'https://cafabyt.com.ar/empresas/',
    source_family: 'CHAMBER_DIRECTORY',
    source_universe: 'FAM_CANONICAL_ESTABLISHMENT_DIRECTORY',
    owner_organization: 'CAFABYT / ADIMRA',
    geography_scope: 'ARG_NACIONAL',
    protocol: 'LOCAL_FILE_JSON',
    access_method: 'DOWNLOADABLE_DATASET',
    public_status: 'PUBLIC',
    permitted_status: 'PERMITTED',
    schema_signature: { fields: ['id', 'empresa', 'productos', 'cuit', 'ubicacion'] },
    supported_motor_template: 'AtlasJSONConnector',
    estimated_records: 120,
    estimated_unique_entities: 120,
    update_frequency: 'MONTHLY',
    reliability_score: 0.99,
    quality_score: 0.98,
    storage_amplification: 1.00,
    rate_limit_profile: { min_interval_ms: 0, max_requests_per_sec: 100 },
    current_status: 'PROMOTED',
    entity_capabilities: { COMPANY: 'HIGH' },
    source_roles: ['ENTITY_SOURCE', 'EVIDENCE_SOURCE'],
    can_produce_entity_rows: 'TRUE',
    entity_types_supported: ['COMPANY'],
    row_unit_supported: ['COMPANY'],
    geographic_granularity: 'NATIONAL_AND_PROVINCIAL',
    queryability: { by_id: true, by_name: true, free_text: true, by_concept: true, by_geography: true },
    public_access_confirmed: true,
    field_telemetry: { 
      filename: 'cafabyt_fabricantes_bulones.json', 
      parser_type: 'JSON',
      categories_supported: ['FASTENERS_MANUFACTURING', 'METALURGICA'],
      relations_supported: ['MANUFACTURER']
    }
  },
  // 5. SIPRO MUEBLES (Fabricantes de Mobiliario y Madera)
  {
    source_id: 'SRC_SIPRO_MUEBLES_FABRICANTES',
    source_name: 'Registro Oficial de Fabricantes de Muebles y Madera (SIPRO)',
    canonical_url: 'https://datos.gob.ar/dataset/modernizacion-proveedores-del-estado-sipro',
    source_family: 'OPEN_DATA',
    source_universe: 'FAM_CANONICAL_ESTABLISHMENT_DIRECTORY',
    owner_organization: 'Oficina Nacional de Contrataciones (ONC)',
    geography_scope: 'ARG_NACIONAL',
    protocol: 'LOCAL_FILE_CSV',
    access_method: 'DOWNLOADABLE_DATASET',
    public_status: 'PUBLIC',
    permitted_status: 'PERMITTED',
    schema_signature: { fields: ['cuit', 'razon_social', 'rubro', 'provincia'] },
    supported_motor_template: 'AtlasCSVConnector',
    estimated_records: 5000,
    estimated_unique_entities: 5000,
    update_frequency: 'MONTHLY',
    reliability_score: 0.95,
    quality_score: 0.90,
    storage_amplification: 1.00,
    rate_limit_profile: { min_interval_ms: 0, max_requests_per_sec: 100 },
    current_status: 'PROMOTED',
    entity_capabilities: { COMPANY: 'HIGH' },
    source_roles: ['ENTITY_SOURCE', 'EVIDENCE_SOURCE'],
    can_produce_entity_rows: 'TRUE',
    entity_types_supported: ['COMPANY'],
    row_unit_supported: ['COMPANY'],
    geographic_granularity: 'NATIONAL_AND_PROVINCIAL',
    queryability: { by_id: true, by_name: true, free_text: true, by_concept: true, by_geography: true },
    public_access_confirmed: true,
    field_telemetry: { 
      filename: 'sipro_proveedores.csv', 
      parser_type: 'CSV',
      categories_supported: ['FURNITURE_MANUFACTURING', 'MADERA'],
      relations_supported: ['MANUFACTURER']
    }
  },
  // 6. BA GASTRO (Locales Gastronómicos Habilitados GCBA)
  {
    source_id: 'SRC_BA_GASTRO_ESTABLECIMIENTOS',
    source_name: 'Registro Oficial de Establecimientos Gastronómicos Habilitados GCBA',
    canonical_url: 'https://data.buenosaires.gob.ar/dataset/establecimientos-gastronomicos',
    source_family: 'OPEN_DATA',
    source_universe: 'FAM_CANONICAL_ESTABLISHMENT_DIRECTORY',
    owner_organization: 'Gobierno de la Ciudad de Buenos Aires',
    geography_scope: 'ARG_CABA',
    protocol: 'LOCAL_FILE_CSV',
    access_method: 'DOWNLOADABLE_DATASET',
    public_status: 'PUBLIC',
    permitted_status: 'PERMITTED',
    schema_signature: { fields: ['id', 'nombre', 'direccion', 'categoria', 'comuna'] },
    supported_motor_template: 'AtlasCSVConnector',
    estimated_records: 12000,
    estimated_unique_entities: 12000,
    update_frequency: 'MONTHLY',
    reliability_score: 0.98,
    quality_score: 0.95,
    storage_amplification: 1.00,
    rate_limit_profile: { min_interval_ms: 0, max_requests_per_sec: 100 },
    current_status: 'PROMOTED',
    entity_capabilities: { ESTABLISHMENT: 'HIGH' },
    source_roles: ['ENTITY_SOURCE', 'EVIDENCE_SOURCE'],
    can_produce_entity_rows: 'TRUE',
    entity_types_supported: ['ESTABLISHMENT'],
    row_unit_supported: ['ESTABLISHMENT'],
    geographic_granularity: 'CITY_PROVINCE',
    queryability: { by_id: true, by_name: true, free_text: true, by_concept: true, by_geography: true },
    public_access_confirmed: true,
    field_telemetry: { 
      filename: 'ba_establecimientos_gastronomicos.csv', 
      parser_type: 'CSV',
      categories_supported: ['GASTRONOMY', 'RESTAURANTE', 'ALIMENTOS'],
      relations_supported: ['ESTABLISHMENT_SERVICE', 'SELLER']
    }
  },
  // 7. GCBA PRENSA (Periodistas de Redacción y Cobertura Pública)
  {
    source_id: 'SRC_GCBA_PRENSA_PERIODISTAS',
    source_name: 'Nómina Oficial de Redacción y Divulgación Periodística',
    canonical_url: 'https://datos.gob.ar/dataset/modernizacion-autoridades-prensa',
    source_family: 'OPEN_DATA',
    source_universe: 'FAM_CANONICAL_ESTABLISHMENT_DIRECTORY',
    owner_organization: 'Secretaría de Medios y Comunicación',
    geography_scope: 'ARG_NACIONAL',
    protocol: 'LOCAL_FILE_CSV',
    access_method: 'DOWNLOADABLE_DATASET',
    public_status: 'PUBLIC',
    permitted_status: 'PERMITTED',
    schema_signature: { fields: ['id', 'nombre_completo', 'cargo', 'medio', 'email'] },
    supported_motor_template: 'AtlasCSVConnector',
    estimated_records: 1500,
    estimated_unique_entities: 1500,
    update_frequency: 'MONTHLY',
    reliability_score: 0.95,
    quality_score: 0.90,
    storage_amplification: 1.00,
    rate_limit_profile: { min_interval_ms: 0, max_requests_per_sec: 100 },
    current_status: 'PROMOTED',
    entity_capabilities: { PERSON: 'HIGH' },
    source_roles: ['ENTITY_SOURCE', 'EVIDENCE_SOURCE'],
    can_produce_entity_rows: 'TRUE',
    entity_types_supported: ['PERSON'],
    row_unit_supported: ['PERSON'],
    geographic_granularity: 'NATIONAL_AND_PROVINCIAL',
    queryability: { by_id: true, by_name: true, free_text: true, by_concept: true, by_geography: true },
    public_access_confirmed: true,
    field_telemetry: { 
      filename: 'gcba_autoridades_2026.csv', 
      parser_type: 'CSV',
      categories_supported: ['JOURNALISM_ECONOMICS', 'PRENSA'],
      relations_supported: ['MEDIA_ROLE']
    }
  },
  // 8. BA ALOJAMIENTOS EMAIL (Empresas Registradas con Email Público GCBA)
  {
    source_id: 'SRC_BA_ALOJAMIENTOS_PUBLIC_EMAIL',
    source_name: 'Directorio Oficial de Empresas Registradas con Email Público GCBA',
    canonical_url: 'https://data.buenosaires.gob.ar/dataset/alojamientos-turisticos',
    source_family: 'OPEN_DATA',
    source_universe: 'FAM_CANONICAL_ESTABLISHMENT_DIRECTORY',
    owner_organization: 'Ente de Turismo GCBA',
    geography_scope: 'ARG_CABA',
    protocol: 'LOCAL_FILE_CSV',
    access_method: 'DOWNLOADABLE_DATASET',
    public_status: 'PUBLIC',
    permitted_status: 'PERMITTED',
    schema_signature: { fields: ['id', 'establecimiento', 'email', 'direccion', 'categoria'] },
    supported_motor_template: 'AtlasCSVConnector',
    estimated_records: 1200,
    estimated_unique_entities: 1200,
    update_frequency: 'MONTHLY',
    reliability_score: 0.99,
    quality_score: 0.98,
    storage_amplification: 1.00,
    rate_limit_profile: { min_interval_ms: 0, max_requests_per_sec: 100 },
    current_status: 'PROMOTED',
    entity_capabilities: { COMPANY: 'HIGH', CONTACT: 'HIGH' },
    source_roles: ['ENTITY_SOURCE', 'EVIDENCE_SOURCE'],
    can_produce_entity_rows: 'TRUE',
    entity_types_supported: ['COMPANY', 'CONTACT'],
    row_unit_supported: ['COMPANY'],
    geographic_granularity: 'CITY_PROVINCE',
    queryability: { by_id: true, by_name: true, free_text: true, by_concept: true, by_geography: true },
    public_access_confirmed: true,
    field_telemetry: { filename: 'ba_alojamientos_turisticos.csv', parser_type: 'CSV' }
  }
];

export async function ensureSourceKnowledgeMapSSOT(pool: pg.Pool = dbPool): Promise<{
  inserted: number;
  total_productive: number;
  outside_km: number;
}> {
  let inserted = 0;

  for (const s of PRODUCTIVE_STATIC_SOURCES) {
    const q = `
      INSERT INTO public.atlas_source_knowledge_map (
        source_id, canonical_url, source_name, source_family, source_universe,
        owner_organization, geography_scope, protocol, access_method,
        public_status, permitted_status, schema_signature, supported_motor_template,
        estimated_records, estimated_unique_entities, update_frequency,
        reliability_score, quality_score, storage_amplification, rate_limit_profile,
        current_status, entity_capabilities, source_roles, can_produce_entity_rows,
        entity_types_supported, row_unit_supported, geographic_granularity,
        queryability, public_access_confirmed, field_telemetry,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12::jsonb, $13,
        $14, $15, $16,
        $17, $18, $19, $20::jsonb,
        $21, $22::jsonb, $23, $24,
        $25, $26, $27,
        $28::jsonb, $29, $30::jsonb,
        NOW(), NOW()
      )
      ON CONFLICT (source_id) DO UPDATE SET
        source_name = EXCLUDED.source_name,
        canonical_url = EXCLUDED.canonical_url,
        source_family = EXCLUDED.source_family,
        owner_organization = EXCLUDED.owner_organization,
        geography_scope = EXCLUDED.geography_scope,
        protocol = EXCLUDED.protocol,
        access_method = EXCLUDED.access_method,
        public_status = EXCLUDED.public_status,
        permitted_status = EXCLUDED.permitted_status,
        supported_motor_template = EXCLUDED.supported_motor_template,
        current_status = EXCLUDED.current_status,
        entity_capabilities = EXCLUDED.entity_capabilities,
        source_roles = EXCLUDED.source_roles,
        can_produce_entity_rows = EXCLUDED.can_produce_entity_rows,
        entity_types_supported = EXCLUDED.entity_types_supported,
        row_unit_supported = EXCLUDED.row_unit_supported,
        geographic_granularity = EXCLUDED.geographic_granularity,
        queryability = EXCLUDED.queryability,
        public_access_confirmed = EXCLUDED.public_access_confirmed,
        field_telemetry = EXCLUDED.field_telemetry,
        updated_at = NOW();
    `;

    await pool.query(q, [
      s.source_id,
      s.canonical_url,
      s.source_name,
      s.source_family,
      s.source_universe,
      s.owner_organization,
      s.geography_scope,
      s.protocol,
      s.access_method,
      s.public_status,
      s.permitted_status,
      JSON.stringify(s.schema_signature),
      s.supported_motor_template,
      s.estimated_records,
      s.estimated_unique_entities,
      s.update_frequency,
      s.reliability_score,
      s.quality_score,
      s.storage_amplification,
      JSON.stringify(s.rate_limit_profile),
      s.current_status,
      JSON.stringify(s.entity_capabilities),
      s.source_roles,
      s.can_produce_entity_rows,
      s.entity_types_supported,
      s.row_unit_supported,
      s.geographic_granularity,
      JSON.stringify(s.queryability),
      s.public_access_confirmed,
      JSON.stringify(s.field_telemetry)
    ]);
    inserted++;
  }

  // Verification audit: ensure 0 productive sources outside Source KM
  const checkRes = await pool.query(`
    SELECT source_id FROM public.atlas_source_knowledge_map 
    WHERE source_id = ANY($1::text[])
  `, [PRODUCTIVE_STATIC_SOURCES.map(s => s.source_id)]);

  const matched = new Set(checkRes.rows.map(r => r.source_id));
  const outside = PRODUCTIVE_STATIC_SOURCES.filter(s => !matched.has(s.source_id)).length;

  return {
    inserted,
    total_productive: PRODUCTIVE_STATIC_SOURCES.length,
    outside_km: outside
  };
}
