/**
 * scripts/seed_atlas_source_knowledge_map.mjs
 * 
 * Populates atlas_source_knowledge_map as the SSOT for all known source universes,
 * their entity capabilities, source graph relationships, saturation memory,
 * field telemetry, and Tesla motor capabilities.
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const INITIAL_SOURCES = [
  // 1. National Academic & Research
  {
    source_id: 'SRC_OAI_CONICET_DIGITAL',
    canonical_url: 'https://ri.conicet.gov.ar/oai/request',
    source_name: 'CONICET Digital Repositorio Institucional',
    source_family: 'CONICET',
    source_universe: 'ACADEMIA_CONICET_RI',
    owner_organization: 'Consejo Nacional de Investigaciones Científicas y Técnicas (CONICET)',
    geography_scope: 'ARGENTINA',
    protocol: 'OAI_PMH',
    access_method: 'DIRECT_PULL',
    public_status: 'PUBLIC',
    permitted_status: 'PERMITTED',
    schema_signature: { format: 'oai_dc', identifier_prefix: 'oai:ri.conicet.gov.ar:' },
    supported_motor_template: 'OAI_PMH_MOTOR',
    estimated_records: 145000,
    estimated_unique_entities: 30000,
    update_frequency: 'WEEKLY',
    reliability_score: 0.98,
    quality_score: 0.95,
    storage_amplification: 1.15,
    current_status: 'SEMANTIC_MOTOR', // High overlap with SSOT, transitioned from acquisition
    entity_capabilities: {
      PERSON: 'HIGH',
      ORGANIZATION: 'HIGH',
      DOCUMENT: 'HIGH',
      OTHER: 'MEDIUM'
    },
    source_graph_relations: [
      { relation_type: 'SAME_ORGANIZATION', target_universe: 'ACADEMIA_OPENALEX_CONICET' },
      { relation_type: 'SAME_POPULATION', target_universe: 'ACADEMIA_OPENALEX_CONICET' },
      { relation_type: 'HIGH_OVERLAP_WITH', target_universe: 'ACADEMIA_OPENALEX_CONICET' },
      { relation_type: 'RELATED_DATASET', target_universe: 'ACADEMIA_SNRD_MINCYT' }
    ],
    overlap_memory: {
      overlap_with_ssot_history: [0.82, 0.91, 0.948],
      overlap_with_other_universes: { 'ACADEMIA_OPENALEX_CONICET': 0.89 },
      true_net_new_history: [120, 45, 8],
      saturation_curve: [0.10, 0.45, 0.85, 0.98],
      records_scanned: 27885,
      true_net_new_found: 1420,
      estimated_unseen_population: 2115,
      net_new_yield_curve: [0.45, 0.15, 0.03]
    },
    field_telemetry: {
      useful_torque_sec: 0.05,
      field_slip_percent: 0.95,
      field_strength_score: 0.15, // Low field because saturated
      active_rotors: 1,
      max_rotors: 2,
      shardable: true,
      shards: ['conicet_part_01', 'conicet_part_02']
    },
    tesla_motor_capabilities: ['CAPABILITY_BULK_FETCH', 'CAPABILITY_SHARDABLE', 'CAPABILITY_SET_BASED_IDENTITY']
  },

  {
    source_id: 'SRC_OAI_SEDICI_UNLP',
    canonical_url: 'http://sedici.unlp.edu.ar/oai/request',
    source_name: 'SEDICI Repositorio de la Universidad Nacional de La Plata',
    source_family: 'UNLP',
    source_universe: 'ACADEMIA_UNLP_SEDICI',
    owner_organization: 'Universidad Nacional de La Plata (UNLP)',
    geography_scope: 'PBA',
    protocol: 'OAI_PMH',
    access_method: 'DIRECT_PULL',
    public_status: 'PUBLIC',
    permitted_status: 'PERMITTED',
    schema_signature: { format: 'oai_dc', sets: ['com_10915_1', 'col_10915_1'] },
    supported_motor_template: 'OAI_PMH_MOTOR',
    estimated_records: 120000,
    estimated_unique_entities: 38000,
    update_frequency: 'WEEKLY',
    reliability_score: 0.96,
    quality_score: 0.92,
    storage_amplification: 1.10,
    current_status: 'ACTIVE',
    entity_capabilities: {
      PERSON: 'HIGH',
      ORGANIZATION: 'HIGH',
      UNIVERSITY: 'HIGH',
      DOCUMENT: 'HIGH'
    },
    source_graph_relations: [
      { relation_type: 'SAME_GEOGRAPHY', target_universe: 'PBA_MUNICIPALITY_LA_PLATA' },
      { relation_type: 'SAME_ORGANIZATION', target_universe: 'ACADEMIA_OPENALEX_UNLP' },
      { relation_type: 'LOW_OVERLAP_WITH', target_universe: 'CABA_GCBA_FUNCIONARIOS' }
    ],
    overlap_memory: {
      overlap_with_ssot_history: [0.65, 0.72],
      overlap_with_other_universes: { 'ACADEMIA_OPENALEX_UNLP': 0.55 },
      true_net_new_history: [450, 310],
      saturation_curve: [0.15, 0.35],
      records_scanned: 13203,
      true_net_new_found: 3750,
      estimated_unseen_population: 24797,
      net_new_yield_curve: [0.60, 0.42]
    },
    field_telemetry: {
      useful_torque_sec: 1.85,
      field_slip_percent: 0.58,
      field_strength_score: 0.78,
      active_rotors: 2,
      max_rotors: 4,
      shardable: true,
      shards: ['sedici_y2020', 'sedici_y2021', 'sedici_y2022', 'sedici_y2023']
    },
    tesla_motor_capabilities: ['CAPABILITY_BULK_FETCH', 'CAPABILITY_SHARDABLE', 'CAPABILITY_SET_BASED_IDENTITY']
  },

  {
    source_id: 'SRC_OAI_SNRD_MINCYT',
    canonical_url: 'https://repositoriosdigitales.mincyt.gob.ar/vufind/OAI/Server',
    source_name: 'Sistema Nacional de Repositorios Digitales (SNRD)',
    source_family: 'MINCYT',
    source_universe: 'ACADEMIA_SNRD_NATIONAL',
    owner_organization: 'Ministerio de Ciencia, Tecnología e Innovación (MINCYT)',
    geography_scope: 'ARGENTINA',
    protocol: 'OAI_PMH',
    access_method: 'DIRECT_PULL',
    public_status: 'PUBLIC',
    permitted_status: 'PERMITTED',
    schema_signature: { format: 'oai_dc' },
    supported_motor_template: 'OAI_PMH_MOTOR',
    estimated_records: 480000,
    estimated_unique_entities: 85000,
    update_frequency: 'MONTHLY',
    reliability_score: 0.94,
    quality_score: 0.90,
    storage_amplification: 1.20,
    current_status: 'ACTIVE',
    entity_capabilities: {
      PERSON: 'HIGH',
      ORGANIZATION: 'HIGH',
      UNIVERSITY: 'HIGH',
      DOCUMENT: 'HIGH'
    },
    source_graph_relations: [
      { relation_type: 'SUPERSET_OF', target_universe: 'ACADEMIA_CONICET_RI' },
      { relation_type: 'SUPERSET_OF', target_universe: 'ACADEMIA_UNLP_SEDICI' },
      { relation_type: 'RELATED_DATASET', target_universe: 'ACADEMIA_OPENALEX_GLOBAL' }
    ],
    overlap_memory: {
      overlap_with_ssot_history: [0.55],
      overlap_with_other_universes: {},
      true_net_new_history: [820],
      saturation_curve: [0.08],
      records_scanned: 5000,
      true_net_new_found: 2250,
      estimated_unseen_population: 80000,
      net_new_yield_curve: [0.70]
    },
    field_telemetry: {
      useful_torque_sec: 4.20,
      field_slip_percent: 0.45,
      field_strength_score: 0.88,
      active_rotors: 3,
      max_rotors: 6,
      shardable: true,
      shards: ['snrd_chunk_01', 'snrd_chunk_02', 'snrd_chunk_03']
    },
    tesla_motor_capabilities: ['CAPABILITY_BULK_FETCH', 'CAPABILITY_SHARDABLE', 'CAPABILITY_COPY_STAGE', 'CAPABILITY_SET_BASED_IDENTITY']
  },

  // 2. Open Data & Transparency Portals (CABA & PBA)
  {
    source_id: 'SRC_CKAN_DATOS_PBA',
    canonical_url: 'https://catalogo.datos.gba.gob.ar/api/3/action',
    source_name: 'Portal de Datos Abiertos de la Provincia de Buenos Aires',
    source_family: 'DATOS_GBA',
    source_universe: 'PBA_DATOS_ABIERTO_PROVINCIA',
    owner_organization: 'Gobierno de la Provincia de Buenos Aires',
    geography_scope: 'PBA',
    protocol: 'CKAN',
    access_method: 'DIRECT_PULL',
    public_status: 'PUBLIC',
    permitted_status: 'PERMITTED',
    schema_signature: { package_list: true, resource_format: ['CSV', 'JSON'] },
    supported_motor_template: 'CKAN_MOTOR',
    estimated_records: 350000,
    estimated_unique_entities: 95000,
    update_frequency: 'DAILY',
    reliability_score: 0.95,
    quality_score: 0.94,
    storage_amplification: 1.05,
    current_status: 'ACTIVE',
    entity_capabilities: {
      PERSON: 'HIGH',
      ORGANIZATION: 'HIGH',
      PUBLIC_AGENCY: 'HIGH',
      HOSPITAL: 'HIGH',
      SCHOOL: 'HIGH',
      LOCATION: 'HIGH'
    },
    source_graph_relations: [
      { relation_type: 'SAME_GEOGRAPHY', target_universe: 'PBA_MUNICIPALITIES_ALL' },
      { relation_type: 'RELATED_DATASET', target_universe: 'ACADEMIA_UNLP_SEDICI' },
      { relation_type: 'LOW_OVERLAP_WITH', target_universe: 'CABA_GCBA_FUNCIONARIOS' }
    ],
    overlap_memory: {
      overlap_with_ssot_history: [0.38, 0.44],
      overlap_with_other_universes: {},
      true_net_new_history: [1800, 2400],
      saturation_curve: [0.12],
      records_scanned: 15000,
      true_net_new_found: 8400,
      estimated_unseen_population: 86600,
      net_new_yield_curve: [0.82, 0.76]
    },
    field_telemetry: {
      useful_torque_sec: 5.40,
      field_slip_percent: 0.32,
      field_strength_score: 0.92,
      active_rotors: 4,
      max_rotors: 8,
      shardable: true,
      shards: ['salud_pba', 'educacion_pba', 'funcionarios_pba', 'policia_pba']
    },
    tesla_motor_capabilities: ['CAPABILITY_BULK_FETCH', 'CAPABILITY_SHARDABLE', 'CAPABILITY_COPY_STAGE', 'CAPABILITY_SET_BASED_IDENTITY', 'CAPABILITY_BULK_PUBLISH']
  },

  {
    source_id: 'SRC_CKAN_BA_DATA_GCBA',
    canonical_url: 'https://data.buenosaires.gob.ar/api/3/action',
    source_name: 'BA Data Portal de Datos Abiertos de la Ciudad de Buenos Aires',
    source_family: 'BA_DATA',
    source_universe: 'CABA_GCBA_DATA_PORTAL',
    owner_organization: 'Gobierno de la Ciudad Autónoma de Buenos Aires',
    geography_scope: 'CABA',
    protocol: 'CKAN',
    access_method: 'DIRECT_PULL',
    public_status: 'PUBLIC',
    permitted_status: 'PERMITTED',
    schema_signature: { package_list: true, resource_format: ['CSV', 'JSON'] },
    supported_motor_template: 'CKAN_MOTOR',
    estimated_records: 420000,
    estimated_unique_entities: 110000,
    update_frequency: 'DAILY',
    reliability_score: 0.97,
    quality_score: 0.96,
    storage_amplification: 1.08,
    current_status: 'ACTIVE',
    entity_capabilities: {
      PERSON: 'HIGH',
      ORGANIZATION: 'HIGH',
      PUBLIC_AGENCY: 'HIGH',
      HOSPITAL: 'HIGH',
      SCHOOL: 'HIGH',
      CONTRACT: 'HIGH',
      PUBLIC_WORK: 'HIGH',
      EVENT: 'MEDIUM'
    },
    source_graph_relations: [
      { relation_type: 'SAME_GEOGRAPHY', target_universe: 'CABA_GCBA_HABILITACIONES' },
      { relation_type: 'SUPERSET_OF', target_universe: 'CABA_GCBA_FUNCIONARIOS' },
      { relation_type: 'LOW_OVERLAP_WITH', target_universe: 'PBA_DATOS_ABIERTO_PROVINCIA' }
    ],
    overlap_memory: {
      overlap_with_ssot_history: [0.68, 0.74],
      overlap_with_other_universes: {},
      true_net_new_history: [950, 720],
      saturation_curve: [0.42],
      records_scanned: 45000,
      true_net_new_found: 11700,
      estimated_unseen_population: 98300,
      net_new_yield_curve: [0.55, 0.40]
    },
    field_telemetry: {
      useful_torque_sec: 2.10,
      field_slip_percent: 0.65,
      field_strength_score: 0.72,
      active_rotors: 2,
      max_rotors: 4,
      shardable: true,
      shards: ['gcba_salud', 'gcba_educacion', 'gcba_autoridades', 'gcba_comunas']
    },
    tesla_motor_capabilities: ['CAPABILITY_BULK_FETCH', 'CAPABILITY_SHARDABLE', 'CAPABILITY_COPY_STAGE', 'CAPABILITY_SET_BASED_IDENTITY']
  },

  // 3. National Legal, Corporate, & Tax Open Data
  {
    source_id: 'SRC_PUB_BOLETIN_OFICIAL',
    canonical_url: 'https://www.boletinoficial.gob.ar/seccion/segunda',
    source_name: 'Boletín Oficial de la República Argentina — Segunda Sección (Sociedades)',
    source_family: 'BOLETIN_OFICIAL',
    source_universe: 'LEGAL_BOLETIN_OFICIAL_SOCIEDADES',
    owner_organization: 'Dirección Nacional del Registro Oficial',
    geography_scope: 'ARGENTINA',
    protocol: 'PUBLIC_HTML_DIRECTORY',
    access_method: 'DIRECT_PULL',
    public_status: 'PUBLIC',
    permitted_status: 'PERMITTED',
    schema_signature: { section: 'segunda', types: ['constitucion', 'designacion', 'asamblea'] },
    supported_motor_template: 'JSON_BULK_MOTOR',
    estimated_records: 650000,
    estimated_unique_entities: 220000,
    update_frequency: 'DAILY',
    reliability_score: 0.99,
    quality_score: 0.98,
    storage_amplification: 1.12,
    current_status: 'ACTIVE',
    entity_capabilities: {
      PERSON: 'HIGH',
      COMPANY: 'HIGH',
      ORGANIZATION: 'HIGH',
      DOCUMENT: 'HIGH',
      CONTRACT: 'HIGH'
    },
    source_graph_relations: [
      { relation_type: 'SUPERSET_OF', target_universe: 'CABA_IGJ_SOCIEDADES' },
      { relation_type: 'RELATED_DATASET', target_universe: 'NATIONAL_DATOS_GOB_AR' },
      { relation_type: 'LOW_OVERLAP_WITH', target_universe: 'ACADEMIA_CONICET_RI' }
    ],
    overlap_memory: {
      overlap_with_ssot_history: [0.18, 0.22], // Highly fresh corporate entity universe!
      overlap_with_other_universes: {},
      true_net_new_history: [3500, 4800],
      saturation_curve: [0.05],
      records_scanned: 12000,
      true_net_new_found: 9360,
      estimated_unseen_population: 210640,
      net_new_yield_curve: [0.92, 0.88]
    },
    field_telemetry: {
      useful_torque_sec: 8.50,
      field_slip_percent: 0.15, // Very low slip! High useful torque
      field_strength_score: 0.98,
      active_rotors: 4,
      max_rotors: 8,
      shardable: true,
      shards: ['boletin_2024_01', 'boletin_2024_02', 'boletin_2024_03', 'boletin_2024_04']
    },
    tesla_motor_capabilities: ['CAPABILITY_BULK_FETCH', 'CAPABILITY_SHARDABLE', 'CAPABILITY_COPY_STAGE', 'CAPABILITY_SET_BASED_IDENTITY', 'CAPABILITY_BULK_PUBLISH']
  },

  {
    source_id: 'SRC_PUB_DATOS_GOB_AR_OSC',
    canonical_url: 'https://datos.gob.ar/dataset/inaes-registro-organizaciones-sociedad-civil',
    source_name: 'Registro Nacional de Organizaciones de la Sociedad Civil (INAES/Datos.gob.ar)',
    source_family: 'DATOS_GOB_AR',
    source_universe: 'NATIONAL_INAES_OSC_REGISTRY',
    owner_organization: 'INAES / Jefatura de Gabinete de Ministros',
    geography_scope: 'ARGENTINA',
    protocol: 'CSV',
    access_method: 'DIRECT_PULL',
    public_status: 'PUBLIC',
    permitted_status: 'PERMITTED',
    schema_signature: { format: 'csv', fields: ['cuit', 'razon_social', 'autoridades', 'provincia', 'municipio'] },
    supported_motor_template: 'CSV_BULK_MOTOR',
    estimated_records: 180000,
    estimated_unique_entities: 75000,
    update_frequency: 'MONTHLY',
    reliability_score: 0.95,
    quality_score: 0.92,
    storage_amplification: 1.04,
    current_status: 'ACTIVE',
    entity_capabilities: {
      PERSON: 'HIGH',
      ORGANIZATION: 'HIGH',
      PUBLIC_AGENCY: 'MEDIUM',
      LOCATION: 'HIGH'
    },
    source_graph_relations: [
      { relation_type: 'SUPERSET_OF', target_universe: 'PBA_DATOS_ABIERTO_PROVINCIA' },
      { relation_type: 'LOW_OVERLAP_WITH', target_universe: 'ACADEMIA_OPENALEX_CONICET' }
    ],
    overlap_memory: {
      overlap_with_ssot_history: [0.28],
      overlap_with_other_universes: {},
      true_net_new_history: [2100],
      saturation_curve: [0.09],
      records_scanned: 8000,
      true_net_new_found: 5760,
      estimated_unseen_population: 69240,
      net_new_yield_curve: [0.85]
    },
    field_telemetry: {
      useful_torque_sec: 4.80,
      field_slip_percent: 0.22,
      field_strength_score: 0.91,
      active_rotors: 3,
      max_rotors: 6,
      shardable: true,
      shards: ['cooperativas_pba', 'mutuales_caba', 'asociaciones_interior']
    },
    tesla_motor_capabilities: ['CAPABILITY_BULK_FETCH', 'CAPABILITY_SHARDABLE', 'CAPABILITY_COPY_STAGE', 'CAPABILITY_SET_BASED_IDENTITY']
  },

  // 4. Wikidata Structured Knowledge Graph (Domain Portitions)
  {
    source_id: 'SRC_SPARQL_WD_PUBLIC_OFFICIALS',
    canonical_url: 'https://query.wikidata.org/sparql',
    source_name: 'Wikidata Public Officials of Argentina (CABA & PBA)',
    source_family: 'WIKIDATA',
    source_universe: 'WIKIDATA_AR_PUBLIC_OFFICIALS',
    owner_organization: 'Wikimedia Foundation',
    geography_scope: 'ARGENTINA',
    protocol: 'SPARQL',
    access_method: 'DIRECT_PULL',
    public_status: 'PUBLIC',
    permitted_status: 'PERMITTED',
    schema_signature: { query_pattern: '?item wdt:P39 ?position . ?item wdt:P27 wd:Q414 .' },
    supported_motor_template: 'SPARQL_MOTOR',
    estimated_records: 28000,
    estimated_unique_entities: 18500,
    update_frequency: 'WEEKLY',
    reliability_score: 0.92,
    quality_score: 0.96,
    storage_amplification: 1.18,
    current_status: 'ACTIVE',
    entity_capabilities: {
      PERSON: 'HIGH',
      PUBLIC_AGENCY: 'HIGH',
      EVENT: 'MEDIUM',
      DOCUMENT: 'MEDIUM'
    },
    source_graph_relations: [
      { relation_type: 'RELATED_DATASET', target_universe: 'CABA_GCBA_DATA_PORTAL' },
      { relation_type: 'RELATED_DATASET', target_universe: 'PBA_DATOS_ABIERTO_PROVINCIA' }
    ],
    overlap_memory: {
      overlap_with_ssot_history: [0.42, 0.48],
      overlap_with_other_universes: {},
      true_net_new_history: [890, 640],
      saturation_curve: [0.22],
      records_scanned: 6200,
      true_net_new_found: 3224,
      estimated_unseen_population: 15276,
      net_new_yield_curve: [0.65, 0.52]
    },
    field_telemetry: {
      useful_torque_sec: 1.40,
      field_slip_percent: 0.52,
      field_strength_score: 0.68,
      active_rotors: 2,
      max_rotors: 4,
      shardable: true,
      shards: ['wd_officials_caba', 'wd_officials_pba', 'wd_officials_national']
    },
    tesla_motor_capabilities: ['CAPABILITY_BULK_FETCH', 'CAPABILITY_SHARDABLE', 'CAPABILITY_SET_BASED_IDENTITY']
  },

  {
    source_id: 'SRC_SPARQL_WD_BUSINESS_LEADERS',
    canonical_url: 'https://query.wikidata.org/sparql',
    source_name: 'Wikidata Corporate Executives & Business Leaders (Argentina)',
    source_family: 'WIKIDATA',
    source_universe: 'WIKIDATA_AR_BUSINESS_LEADERS',
    owner_organization: 'Wikimedia Foundation',
    geography_scope: 'ARGENTINA',
    protocol: 'SPARQL',
    access_method: 'DIRECT_PULL',
    public_status: 'PUBLIC',
    permitted_status: 'PERMITTED',
    schema_signature: { query_pattern: '?item wdt:P106 wd:Q43845 . ?item wdt:P27 wd:Q414 .' },
    supported_motor_template: 'SPARQL_MOTOR',
    estimated_records: 18000,
    estimated_unique_entities: 12200,
    update_frequency: 'MONTHLY',
    reliability_score: 0.90,
    quality_score: 0.94,
    storage_amplification: 1.15,
    current_status: 'ACTIVE',
    entity_capabilities: {
      PERSON: 'HIGH',
      COMPANY: 'HIGH',
      ORGANIZATION: 'HIGH'
    },
    source_graph_relations: [
      { relation_type: 'RELATED_DATASET', target_universe: 'LEGAL_BOLETIN_OFICIAL_SOCIEDADES' }
    ],
    overlap_memory: {
      overlap_with_ssot_history: [0.35],
      overlap_with_other_universes: {},
      true_net_new_history: [480],
      saturation_curve: [0.15],
      records_scanned: 2500,
      true_net_new_found: 1625,
      estimated_unseen_population: 10575,
      net_new_yield_curve: [0.70]
    },
    field_telemetry: {
      useful_torque_sec: 1.20,
      field_slip_percent: 0.40,
      field_strength_score: 0.70,
      active_rotors: 1,
      max_rotors: 2,
      shardable: false,
      shards: []
    },
    tesla_motor_capabilities: ['CAPABILITY_BULK_FETCH', 'CAPABILITY_SET_BASED_IDENTITY']
  },

  // 5. High-Potential PBA Regional & Municipal Universes
  {
    source_id: 'SRC_OAI_UNLAM_DIGITAL',
    canonical_url: 'https://repositoriodigital.unlam.edu.ar/oai/request',
    source_name: 'Repositorio Digital Universidad Nacional de La Matanza',
    source_family: 'UNLAM',
    source_universe: 'PBA_UNLAM_MATANZA_CLUSTER',
    owner_organization: 'Universidad Nacional de La Matanza',
    geography_scope: 'PBA',
    protocol: 'OAI_PMH',
    access_method: 'DIRECT_PULL',
    public_status: 'PUBLIC',
    permitted_status: 'PERMITTED',
    schema_signature: { format: 'oai_dc' },
    supported_motor_template: 'OAI_PMH_MOTOR',
    estimated_records: 45000,
    estimated_unique_entities: 16500,
    update_frequency: 'MONTHLY',
    reliability_score: 0.94,
    quality_score: 0.92,
    storage_amplification: 1.10,
    current_status: 'ACTIVE',
    entity_capabilities: {
      PERSON: 'HIGH',
      ORGANIZATION: 'HIGH',
      UNIVERSITY: 'HIGH',
      DOCUMENT: 'HIGH'
    },
    source_graph_relations: [
      { relation_type: 'SAME_GEOGRAPHY', target_universe: 'PBA_MUNICIPALITY_LA_MATANZA' },
      { relation_type: 'LOW_OVERLAP_WITH', target_universe: 'ACADEMIA_OPENALEX_CONICET' }
    ],
    overlap_memory: {
      overlap_with_ssot_history: [0.25], // Fresh municipal territory!
      overlap_with_other_universes: {},
      true_net_new_history: [950],
      saturation_curve: [0.08],
      records_scanned: 1500,
      true_net_new_found: 1125,
      estimated_unseen_population: 15375,
      net_new_yield_curve: [0.82]
    },
    field_telemetry: {
      useful_torque_sec: 2.90,
      field_slip_percent: 0.20,
      field_strength_score: 0.89,
      active_rotors: 2,
      max_rotors: 4,
      shardable: true,
      shards: ['unlam_salud', 'unlam_ingenieria', 'unlam_humanidades']
    },
    tesla_motor_capabilities: ['CAPABILITY_BULK_FETCH', 'CAPABILITY_SHARDABLE', 'CAPABILITY_SET_BASED_IDENTITY']
  },

  {
    source_id: 'SRC_OAI_UNQ_DIGITAL',
    canonical_url: 'https://ridaa.unq.edu.ar/oai/request',
    source_name: 'RIDAA Repositorio Institucional Universidad Nacional de Quilmes',
    source_family: 'UNQ',
    source_universe: 'PBA_UNQ_QUILMES_CLUSTER',
    owner_organization: 'Universidad Nacional de Quilmes',
    geography_scope: 'PBA',
    protocol: 'OAI_PMH',
    access_method: 'DIRECT_PULL',
    public_status: 'PUBLIC',
    permitted_status: 'PERMITTED',
    schema_signature: { format: 'oai_dc' },
    supported_motor_template: 'OAI_PMH_MOTOR',
    estimated_records: 32000,
    estimated_unique_entities: 12000,
    update_frequency: 'MONTHLY',
    reliability_score: 0.95,
    quality_score: 0.91,
    storage_amplification: 1.10,
    current_status: 'ACTIVE',
    entity_capabilities: {
      PERSON: 'HIGH',
      ORGANIZATION: 'HIGH',
      UNIVERSITY: 'HIGH',
      DOCUMENT: 'HIGH'
    },
    source_graph_relations: [
      { relation_type: 'SAME_GEOGRAPHY', target_universe: 'PBA_MUNICIPALITY_QUILMES' }
    ],
    overlap_memory: {
      overlap_with_ssot_history: [0.22],
      overlap_with_other_universes: {},
      true_net_new_history: [720],
      saturation_curve: [0.06],
      records_scanned: 1100,
      true_net_new_found: 858,
      estimated_unseen_population: 11142,
      net_new_yield_curve: [0.85]
    },
    field_telemetry: {
      useful_torque_sec: 2.40,
      field_slip_percent: 0.18,
      field_strength_score: 0.87,
      active_rotors: 2,
      max_rotors: 4,
      shardable: true,
      shards: ['unq_biotec', 'unq_sociales', 'unq_economia']
    },
    tesla_motor_capabilities: ['CAPABILITY_BULK_FETCH', 'CAPABILITY_SHARDABLE', 'CAPABILITY_SET_BASED_IDENTITY']
  }
];

async function seed() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();
  try {
    console.log(`[Seed] Inserting/updating ${INITIAL_SOURCES.length} source universes in atlas_source_knowledge_map...`);
    
    for (const src of INITIAL_SOURCES) {
      await client.query(`
        INSERT INTO public.atlas_source_knowledge_map (
          source_id,
          canonical_url,
          source_name,
          source_family,
          source_universe,
          owner_organization,
          geography_scope,
          protocol,
          access_method,
          public_status,
          permitted_status,
          schema_signature,
          supported_motor_template,
          estimated_records,
          estimated_unique_entities,
          update_frequency,
          reliability_score,
          quality_score,
          storage_amplification,
          current_status,
          entity_capabilities,
          source_graph_relations,
          overlap_memory,
          field_telemetry,
          tesla_motor_capabilities,
          last_profiled_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, now(), now()
        )
        ON CONFLICT (source_id) DO UPDATE SET
          source_name = EXCLUDED.source_name,
          source_universe = EXCLUDED.source_universe,
          geography_scope = EXCLUDED.geography_scope,
          protocol = EXCLUDED.protocol,
          supported_motor_template = EXCLUDED.supported_motor_template,
          estimated_records = EXCLUDED.estimated_records,
          estimated_unique_entities = EXCLUDED.estimated_unique_entities,
          current_status = EXCLUDED.current_status,
          entity_capabilities = EXCLUDED.entity_capabilities,
          source_graph_relations = EXCLUDED.source_graph_relations,
          overlap_memory = EXCLUDED.overlap_memory,
          field_telemetry = EXCLUDED.field_telemetry,
          tesla_motor_capabilities = EXCLUDED.tesla_motor_capabilities,
          updated_at = now();
      `, [
        src.source_id,
        src.canonical_url,
        src.source_name,
        src.source_family,
        src.source_universe,
        src.owner_organization,
        src.geography_scope,
        src.protocol,
        src.access_method,
        src.public_status,
        src.permitted_status,
        JSON.stringify(src.schema_signature),
        src.supported_motor_template,
        src.estimated_records,
        src.estimated_unique_entities,
        src.update_frequency,
        src.reliability_score,
        src.quality_score,
        src.storage_amplification,
        src.current_status,
        JSON.stringify(src.entity_capabilities),
        JSON.stringify(src.source_graph_relations),
        JSON.stringify(src.overlap_memory),
        JSON.stringify(src.field_telemetry),
        src.tesla_motor_capabilities
      ]);
      console.log(`  ✓ Synced: ${src.source_id} (${src.source_name})`);
    }

    const res = await client.query('SELECT count(*) FROM public.atlas_source_knowledge_map');
    console.log(`[Seed Complete] Total rows in atlas_source_knowledge_map: ${res.rows[0].count}`);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => {
  console.error('Failed to seed atlas_source_knowledge_map:', err);
  process.exit(1);
});
