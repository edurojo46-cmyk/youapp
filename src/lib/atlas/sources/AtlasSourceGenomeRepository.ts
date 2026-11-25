/**
 * ATLAS SOURCE GENOME V1
 * Module: AtlasSourceGenomeRepository.ts
 * Path: src/lib/atlas/sources/AtlasSourceGenomeRepository.ts
 * 
 * PostgreSQL & In-Memory Authority Repository for Source Genome V1.
 * 
 * Strict Truth Invariants:
 * 1. Physical Origin Integrity: Every source/route states its real physical location or API.
 * 2. Unobserved Metrics Invariant: If attempts = 0, historical_yield = UNKNOWN (null).
 *    SEEDED/UNKNOWN metrics can NEVER influence ranking as real historical performance.
 * 3. Capability != Coverage: Supported granularity (e.g. neighborhood) does NOT imply coverage.
 *    actual_geo_coverage governs where data physically exists.
 */

import type pg from 'pg';
import { dbPool } from '../../../../server/db.ts';
import type { 
  AtlasSource, 
  AtlasSourceRoute, 
  RankedRouteMatch 
} from './AtlasSourceGenome.ts';
import { 
  AtlasSourceCapabilityMatcher, 
  type MissionCompatibilitySpec 
} from './AtlasSourceCapability.ts';
import { 
  AtlasSourcePerformanceTracker, 
  type AtlasSourcePerformance, 
  type SourceExecutionObservation 
} from './AtlasSourcePerformance.ts';

export class AtlasSourceGenomeRepository {
  private static instance: AtlasSourceGenomeRepository;
  private pool: pg.Pool;
  private memorySources: Map<string, AtlasSource> = new Map();
  private memoryRoutes: Map<string, AtlasSourceRoute> = new Map();
  private memoryPerformance: Map<string, AtlasSourcePerformance> = new Map();
  private isBootstrapped = false;

  private constructor(pool?: pg.Pool) {
    this.pool = pool || dbPool;
  }

  public static getInstance(pool?: pg.Pool): AtlasSourceGenomeRepository {
    if (!this.instance) {
      this.instance = new AtlasSourceGenomeRepository(pool);
    }
    return this.instance;
  }

  /**
   * Initializes PostgreSQL tables if they don't already exist.
   */
  public async initSchema(): Promise<void> {
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS public.atlas_source_genome (
          source_id TEXT PRIMARY KEY,
          source_family TEXT NOT NULL,
          domain TEXT NOT NULL,
          access_method TEXT NOT NULL,
          format TEXT NOT NULL,
          entity_types TEXT[] NOT NULL DEFAULT '{}',
          geo_coverage TEXT[] NOT NULL DEFAULT '{}',
          attributes TEXT[] NOT NULL DEFAULT '{}',
          supports_person BOOLEAN NOT NULL DEFAULT FALSE,
          supports_company BOOLEAN NOT NULL DEFAULT FALSE,
          supports_email BOOLEAN NOT NULL DEFAULT FALSE,
          supports_phone BOOLEAN NOT NULL DEFAULT FALSE,
          supports_linkedin BOOLEAN NOT NULL DEFAULT FALSE,
          supports_geo_levels TEXT[] NOT NULL DEFAULT '{}',
          quality_score NUMERIC NOT NULL DEFAULT 0.5,
          quality_nature TEXT NOT NULL DEFAULT 'SEEDED',
          yield_history NUMERIC[] NOT NULL DEFAULT '{}',
          yield_nature TEXT NOT NULL DEFAULT 'UNKNOWN',
          success_rate NUMERIC,
          success_rate_nature TEXT NOT NULL DEFAULT 'UNKNOWN',
          latency INTEGER,
          latency_nature TEXT NOT NULL DEFAULT 'UNKNOWN',
          cost_class TEXT NOT NULL DEFAULT 'FREE',
          first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_probe TIMESTAMPTZ,
          last_success TIMESTAMPTZ,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          physical_origin TEXT,
          source_exists_physically BOOLEAN NOT NULL DEFAULT TRUE,
          metadata JSONB NOT NULL DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS public.atlas_source_routes (
          route_id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL REFERENCES public.atlas_source_genome(source_id) ON DELETE CASCADE,
          endpoint TEXT NOT NULL,
          adapter_id TEXT NOT NULL,
          capabilities JSONB NOT NULL DEFAULT '{}',
          executable BOOLEAN NOT NULL DEFAULT TRUE,
          last_probe TIMESTAMPTZ,
          yield NUMERIC,
          yield_nature TEXT NOT NULL DEFAULT 'UNKNOWN',
          attempts INTEGER NOT NULL DEFAULT 0,
          errors TEXT[] NOT NULL DEFAULT '{}',
          physical_origin TEXT,
          source_exists_physically BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS public.atlas_source_capabilities (
          id SERIAL PRIMARY KEY,
          source_id TEXT NOT NULL,
          route_id TEXT,
          capability_payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS public.atlas_source_performance (
          id SERIAL PRIMARY KEY,
          source_id TEXT NOT NULL,
          route_id TEXT,
          attempts INTEGER NOT NULL DEFAULT 0,
          success INTEGER NOT NULL DEFAULT 0,
          raw_rows BIGINT NOT NULL DEFAULT 0,
          admitted_rows BIGINT NOT NULL DEFAULT 0,
          certified_rows BIGINT NOT NULL DEFAULT 0,
          yield NUMERIC,
          yield_nature TEXT NOT NULL DEFAULT 'UNKNOWN',
          success_rate NUMERIC,
          success_rate_nature TEXT NOT NULL DEFAULT 'UNKNOWN',
          latency INTEGER,
          latency_nature TEXT NOT NULL DEFAULT 'UNKNOWN',
          error_class TEXT,
          last_success TIMESTAMPTZ,
          last_probe TIMESTAMPTZ,
          yield_history NUMERIC[] NOT NULL DEFAULT '{}',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Ensure columns exist even if tables were previously created with older schema
        ALTER TABLE public.atlas_source_genome ADD COLUMN IF NOT EXISTS quality_nature TEXT NOT NULL DEFAULT 'SEEDED';
        ALTER TABLE public.atlas_source_genome ADD COLUMN IF NOT EXISTS yield_nature TEXT NOT NULL DEFAULT 'UNKNOWN';
        ALTER TABLE public.atlas_source_genome ADD COLUMN IF NOT EXISTS success_rate_nature TEXT NOT NULL DEFAULT 'UNKNOWN';
        ALTER TABLE public.atlas_source_genome ADD COLUMN IF NOT EXISTS latency_nature TEXT NOT NULL DEFAULT 'UNKNOWN';
        ALTER TABLE public.atlas_source_genome ADD COLUMN IF NOT EXISTS physical_origin TEXT;
        ALTER TABLE public.atlas_source_genome ADD COLUMN IF NOT EXISTS source_exists_physically BOOLEAN NOT NULL DEFAULT TRUE;
        ALTER TABLE public.atlas_source_genome ALTER COLUMN success_rate DROP NOT NULL;
        ALTER TABLE public.atlas_source_genome ALTER COLUMN latency DROP NOT NULL;

        ALTER TABLE public.atlas_source_routes ADD COLUMN IF NOT EXISTS yield_nature TEXT NOT NULL DEFAULT 'UNKNOWN';
        ALTER TABLE public.atlas_source_routes ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE public.atlas_source_routes ADD COLUMN IF NOT EXISTS physical_origin TEXT;
        ALTER TABLE public.atlas_source_routes ADD COLUMN IF NOT EXISTS source_exists_physically BOOLEAN NOT NULL DEFAULT TRUE;
        ALTER TABLE public.atlas_source_routes ALTER COLUMN yield DROP NOT NULL;

        ALTER TABLE public.atlas_source_performance ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE public.atlas_source_performance ADD COLUMN IF NOT EXISTS success INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE public.atlas_source_performance ADD COLUMN IF NOT EXISTS raw_rows BIGINT NOT NULL DEFAULT 0;
        ALTER TABLE public.atlas_source_performance ADD COLUMN IF NOT EXISTS admitted_rows BIGINT NOT NULL DEFAULT 0;
        ALTER TABLE public.atlas_source_performance ADD COLUMN IF NOT EXISTS certified_rows BIGINT NOT NULL DEFAULT 0;
        ALTER TABLE public.atlas_source_performance ADD COLUMN IF NOT EXISTS yield NUMERIC;
        ALTER TABLE public.atlas_source_performance ADD COLUMN IF NOT EXISTS yield_nature TEXT NOT NULL DEFAULT 'UNKNOWN';
        ALTER TABLE public.atlas_source_performance ADD COLUMN IF NOT EXISTS success_rate NUMERIC;
        ALTER TABLE public.atlas_source_performance ADD COLUMN IF NOT EXISTS success_rate_nature TEXT NOT NULL DEFAULT 'UNKNOWN';
        ALTER TABLE public.atlas_source_performance ADD COLUMN IF NOT EXISTS latency INTEGER;
        ALTER TABLE public.atlas_source_performance ADD COLUMN IF NOT EXISTS latency_nature TEXT NOT NULL DEFAULT 'UNKNOWN';
        ALTER TABLE public.atlas_source_performance ADD COLUMN IF NOT EXISTS error_class TEXT;
        ALTER TABLE public.atlas_source_performance ADD COLUMN IF NOT EXISTS last_success TIMESTAMPTZ;
        ALTER TABLE public.atlas_source_performance ADD COLUMN IF NOT EXISTS last_probe TIMESTAMPTZ;
        ALTER TABLE public.atlas_source_performance ADD COLUMN IF NOT EXISTS yield_history NUMERIC[] NOT NULL DEFAULT '{}';
        ALTER TABLE public.atlas_source_performance ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      `);
    } catch (err: any) {
      console.warn('[AtlasSourceGenomeRepository] DB initSchema warning (using in-memory fallback):', err.message);
    }
  }

  /**
   * Bootstraps the Genome with real physical sources and routes.
   * Invariant: All metrics start strictly as UNKNOWN/unprobed (attempts = 0).
   */
  public async bootstrap(): Promise<{ sourcesCount: number; routesCount: number }> {
    if (this.isBootstrapped) {
      return { sourcesCount: this.memorySources.size, routesCount: this.memoryRoutes.size };
    }

    await this.initSchema();

    const initialSources: AtlasSource[] = [
      {
        source_id: 'SRC_LEGACY_PROVEEDORES',
        source_family: 'PUBLIC_ADMINISTRATION_REGISTRY',
        domain: 'compraspublicas.gob.ar',
        access_method: 'BULK_CSV_STREAM',
        format: 'CSV',
        entity_types: ['PERSON', 'COMPANY', 'ESTABLISHMENT'],
        geo_coverage: ['ALL', 'NACIONAL', 'ARGENTINA', 'CABA', 'Córdoba', 'Mendoza', 'Buenos Aires', 'Santa Fe', 'Río Negro'],
        attributes: ['name', 'cuit', 'tipo_personeria', 'localidad', 'provincia', 'email', 'phone', 'rubro', 'direccion'],
        supports_person: true,
        supports_company: true,
        supports_email: true,
        supports_phone: true,
        supports_linkedin: false,
        supports_geo_levels: ['COUNTRY', 'PROVINCE', 'CITY', 'LOCALITY', 'NEIGHBORHOOD'],
        quality_score: 0.99,
        quality_nature: 'SEEDED',
        yield_history: [],
        yield_nature: 'UNKNOWN',
        success_rate: null,
        success_rate_nature: 'UNKNOWN',
        latency: null,
        latency_nature: 'UNKNOWN',
        cost_class: 'FREE',
        first_seen: '2026-01-01T00:00:00.000Z',
        last_seen: new Date().toISOString(),
        last_probe: null,
        last_success: null,
        status: 'ACTIVE',
        physical_origin: 'Registro Histórico de Proveedores del Estado (scratch/physical_sources/proveedores_sistema_legacy.csv)',
        source_exists_physically: true
      },
      {
        source_id: 'SRC_SIPRO_CENTRAL',
        source_family: 'PUBLIC_SUPPLIER_REGISTRY',
        domain: 'compr.ar',
        access_method: 'BULK_CSV_STREAM',
        format: 'CSV',
        entity_types: ['PERSON', 'COMPANY'],
        geo_coverage: ['ALL', 'NACIONAL', 'ARGENTINA', 'CABA', 'Córdoba', 'Mendoza', 'Buenos Aires', 'Santa Fe'],
        attributes: ['name', 'cuit', 'tipo_personeria', 'localidad', 'provincia', 'website', 'rubro'],
        supports_person: true,
        supports_company: true,
        supports_email: false,
        supports_phone: false,
        supports_linkedin: false,
        supports_geo_levels: ['COUNTRY', 'PROVINCE', 'CITY'],
        quality_score: 0.96,
        quality_nature: 'SEEDED',
        yield_history: [],
        yield_nature: 'UNKNOWN',
        success_rate: null,
        success_rate_nature: 'UNKNOWN',
        latency: null,
        latency_nature: 'UNKNOWN',
        cost_class: 'FREE',
        first_seen: '2026-01-05T00:00:00.000Z',
        last_seen: new Date().toISOString(),
        last_probe: null,
        last_success: null,
        status: 'ACTIVE',
        physical_origin: 'Padrón Central SIPRO Contratistas Públicos (scratch/physical_sources/sipro_proveedores.csv)',
        source_exists_physically: true
      },
      {
        source_id: 'SRC_PALERMO_COMMUNITY_REGISTRY',
        source_family: 'MUNICIPAL_COMMUNAL_REGISTRY',
        domain: 'buenosaires.gob.ar',
        access_method: 'JSON_REPRESENTATION',
        format: 'JSON',
        entity_types: ['PERSON'],
        geo_coverage: ['Palermo'],
        attributes: ['name', 'role', 'localidad', 'barrio', 'ciudad', 'provincia', 'phone', 'email', 'instagram'],
        supports_person: true,
        supports_company: false,
        supports_email: true,
        supports_phone: true,
        supports_linkedin: false,
        supports_geo_levels: ['NEIGHBORHOOD'],
        quality_score: 0.99,
        quality_nature: 'SEEDED',
        yield_history: [],
        yield_nature: 'UNKNOWN',
        success_rate: null,
        success_rate_nature: 'UNKNOWN',
        latency: null,
        latency_nature: 'UNKNOWN',
        cost_class: 'FREE',
        first_seen: '2026-02-10T00:00:00.000Z',
        last_seen: new Date().toISOString(),
        last_probe: null,
        last_success: null,
        status: 'ACTIVE',
        physical_origin: 'Padrón Oficial Comuna 14 Palermo (data/palermo_verified_persons_731.json)',
        source_exists_physically: true
      },
      {
        source_id: 'SRC_RIO_NEGRO_OFFICIAL_REGISTRY',
        source_family: 'PROVINCIAL_OFFICIAL_REGISTRY',
        domain: 'rionegro.gov.ar',
        access_method: 'JSON_REPRESENTATION',
        format: 'JSON',
        entity_types: ['PERSON'],
        geo_coverage: ['Río Negro'],
        attributes: ['name', 'role', 'localidad', 'ciudad', 'provincia', 'phone', 'email', 'cuit'],
        supports_person: true,
        supports_company: false,
        supports_email: true,
        supports_phone: true,
        supports_linkedin: false,
        supports_geo_levels: ['PROVINCE', 'CITY'],
        quality_score: 0.98,
        quality_nature: 'SEEDED',
        yield_history: [],
        yield_nature: 'UNKNOWN',
        success_rate: null,
        success_rate_nature: 'UNKNOWN',
        latency: null,
        latency_nature: 'UNKNOWN',
        cost_class: 'FREE',
        first_seen: '2026-01-12T00:00:00.000Z',
        last_seen: new Date().toISOString(),
        last_probe: null,
        last_success: null,
        status: 'ACTIVE',
        physical_origin: 'Padrón Oficial Río Negro (data/rio_negro_verified_persons_2000.json)',
        source_exists_physically: true
      },
      {
        source_id: 'SRC_GCBA_GASTRONOMY_OFFICIAL',
        source_family: 'COMMERCIAL_MUNICIPAL_PADRON',
        domain: 'data.buenosaires.gob.ar',
        access_method: 'BULK_CSV_STREAM',
        format: 'CSV',
        entity_types: ['COMPANY', 'ESTABLISHMENT'],
        geo_coverage: ['CABA'],
        attributes: ['name', 'rubro', 'barrio', 'localidad', 'phone', 'direccion'],
        supports_person: false,
        supports_company: true,
        supports_email: false,
        supports_phone: true,
        supports_linkedin: false,
        supports_geo_levels: ['NEIGHBORHOOD', 'CITY'],
        quality_score: 0.97,
        quality_nature: 'SEEDED',
        yield_history: [],
        yield_nature: 'UNKNOWN',
        success_rate: null,
        success_rate_nature: 'UNKNOWN',
        latency: null,
        latency_nature: 'UNKNOWN',
        cost_class: 'FREE',
        first_seen: '2026-01-20T00:00:00.000Z',
        last_seen: new Date().toISOString(),
        last_probe: null,
        last_success: null,
        status: 'ACTIVE',
        physical_origin: 'Oferta Gastronómica GCBA (scratch/physical_sources/ba_oferta_gastronomica.csv)',
        source_exists_physically: true
      },
      {
        source_id: 'SRC_OSM_PUBLIC_SUBMESH',
        source_family: 'GEOSPATIAL_OVERPASS',
        domain: 'overpass-api.de',
        access_method: 'JSON_CACHE_AND_REST',
        format: 'JSON',
        entity_types: ['COMPANY', 'ESTABLISHMENT'],
        geo_coverage: ['ALL', 'CABA', 'Córdoba', 'Mendoza'],
        attributes: ['name', 'category', 'address', 'city', 'neighborhood', 'phone'],
        supports_person: false,
        supports_company: true,
        supports_email: false,
        supports_phone: true,
        supports_linkedin: false,
        supports_geo_levels: ['NEIGHBORHOOD', 'CITY', 'PROVINCE'],
        quality_score: 0.92,
        quality_nature: 'SEEDED',
        yield_history: [],
        yield_nature: 'UNKNOWN',
        success_rate: null,
        success_rate_nature: 'UNKNOWN',
        latency: null,
        latency_nature: 'UNKNOWN',
        cost_class: 'LOW',
        first_seen: '2026-01-01T00:00:00.000Z',
        last_seen: new Date().toISOString(),
        last_probe: null,
        last_success: null,
        status: 'ACTIVE',
        physical_origin: 'OpenStreetMap Sub-Mesh Cache (scratch/physical_sources/osm_public_establishments.json)',
        source_exists_physically: true
      },
      {
        source_id: 'SRC_REFAR_FARMACIAS',
        source_family: 'NATIONAL_HEALTHCARE_REGISTRY',
        domain: 'datos.salud.gob.ar',
        access_method: 'BULK_CSV_STREAM',
        format: 'CSV',
        entity_types: ['COMPANY', 'ESTABLISHMENT'],
        geo_coverage: ['ALL', 'NACIONAL', 'ARGENTINA', 'CABA', 'Córdoba', 'Mendoza', 'Buenos Aires', 'Santa Fe'],
        attributes: ['name', 'category', 'direccion', 'localidad', 'provincia', 'phone'],
        supports_person: false,
        supports_company: true,
        supports_email: false,
        supports_phone: true,
        supports_linkedin: false,
        supports_geo_levels: ['PROVINCE', 'CITY', 'NEIGHBORHOOD'],
        quality_score: 0.96,
        quality_nature: 'SEEDED',
        yield_history: [],
        yield_nature: 'UNKNOWN',
        success_rate: null,
        success_rate_nature: 'UNKNOWN',
        latency: null,
        latency_nature: 'UNKNOWN',
        cost_class: 'FREE',
        first_seen: '2026-01-18T00:00:00.000Z',
        last_seen: new Date().toISOString(),
        last_probe: null,
        last_success: null,
        status: 'ACTIVE',
        physical_origin: 'Registro Federal de Farmacias REFAR (scratch/physical_sources/refar_establecimientos_farmacias.csv)',
        source_exists_physically: true
      },
      {
        source_id: 'SRC_IDECOR_CORDOBA',
        source_family: 'CADASTRAL_AND_BUSINESS_GEOMAP',
        domain: 'idecor.cba.gov.ar',
        access_method: 'JSON_REPRESENTATION',
        format: 'GEOJSON',
        entity_types: ['COMPANY', 'ESTABLISHMENT'],
        geo_coverage: ['Córdoba'],
        attributes: ['name', 'rubro', 'localidad', 'provincia', 'phone'],
        supports_person: false,
        supports_company: true,
        supports_email: false,
        supports_phone: true,
        supports_linkedin: false,
        supports_geo_levels: ['PROVINCE', 'CITY'],
        quality_score: 0.95,
        quality_nature: 'SEEDED',
        yield_history: [],
        yield_nature: 'UNKNOWN',
        success_rate: null,
        success_rate_nature: 'UNKNOWN',
        latency: null,
        latency_nature: 'UNKNOWN',
        cost_class: 'FREE',
        first_seen: '2026-01-10T00:00:00.000Z',
        last_seen: new Date().toISOString(),
        last_probe: null,
        last_success: null,
        status: 'ACTIVE',
        physical_origin: 'IDECOR GeoJSON Local Cache (scratch/physical_sources/cordoba_veterinarias_idecor.json)',
        source_exists_physically: true
      },
      {
        source_id: 'SRC_CABA_LINKEDIN_VERIFIED',
        source_family: 'DIGITAL_FOOTPRINT_VERIFIED',
        domain: 'linkedin.com',
        access_method: 'JSON_REPRESENTATION',
        format: 'JSON',
        entity_types: ['COMPANY', 'ORGANIZATION'],
        geo_coverage: ['CABA'],
        attributes: ['name', 'company_name', 'linkedin', 'cuit', 'rubro'],
        supports_person: false,
        supports_company: true,
        supports_email: false,
        supports_phone: false,
        supports_linkedin: true,
        supports_geo_levels: ['CITY', 'PROVINCE'],
        quality_score: 0.90,
        quality_nature: 'SEEDED',
        yield_history: [],
        yield_nature: 'UNKNOWN',
        success_rate: null,
        success_rate_nature: 'UNKNOWN',
        latency: null,
        latency_nature: 'UNKNOWN',
        cost_class: 'LOW',
        first_seen: '2026-03-01T00:00:00.000Z',
        last_seen: new Date().toISOString(),
        last_probe: null,
        last_success: null,
        status: 'ACTIVE',
        physical_origin: 'Directorio Empresas con LinkedIn Verificado (scratch/physical_sources/caba_empresas_linkedin_verificadas.json)',
        source_exists_physically: true
      },
      {
        source_id: 'SRC_DATOS_GOB_AR',
        source_family: 'OPEN_DATA_PORTAL',
        domain: 'datos.gob.ar',
        access_method: 'REST_API_CKAN',
        format: 'JSON',
        entity_types: ['COMPANY', 'ORGANIZATION', 'ESTABLISHMENT'],
        geo_coverage: ['ALL', 'NACIONAL', 'ARGENTINA'],
        attributes: ['name', 'organization', 'url', 'notes'],
        supports_person: false,
        supports_company: true,
        supports_email: true,
        supports_phone: false,
        supports_linkedin: false,
        supports_geo_levels: ['COUNTRY', 'PROVINCE'],
        quality_score: 0.92,
        quality_nature: 'SEEDED',
        yield_history: [],
        yield_nature: 'UNKNOWN',
        success_rate: null,
        success_rate_nature: 'UNKNOWN',
        latency: null,
        latency_nature: 'UNKNOWN',
        cost_class: 'FREE',
        first_seen: '2026-01-01T00:00:00.000Z',
        last_seen: new Date().toISOString(),
        last_probe: null,
        last_success: null,
        status: 'ACTIVE',
        physical_origin: 'Portal Nacional de Datos Abiertos CKAN (https://datos.gob.ar/api/3/action/package_search)',
        source_exists_physically: true
      },
      {
        source_id: 'SRC_MENDOZA_PORTAL_DATOS',
        source_family: 'PROVINCIAL_OPEN_DATA',
        domain: 'datosabiertos.mendoza.gov.ar',
        access_method: 'REST_API_CKAN',
        format: 'JSON',
        entity_types: ['PERSON', 'COMPANY'],
        geo_coverage: ['Mendoza'],
        attributes: ['name', 'role', 'localidad', 'provincia', 'email', 'phone'],
        supports_person: true,
        supports_company: true,
        supports_email: true,
        supports_phone: true,
        supports_linkedin: false,
        supports_geo_levels: ['PROVINCE', 'CITY'],
        quality_score: 0.94,
        quality_nature: 'SEEDED',
        yield_history: [],
        yield_nature: 'UNKNOWN',
        success_rate: null,
        success_rate_nature: 'UNKNOWN',
        latency: null,
        latency_nature: 'UNKNOWN',
        cost_class: 'FREE',
        first_seen: '2026-01-15T00:00:00.000Z',
        last_seen: new Date().toISOString(),
        last_probe: null,
        last_success: null,
        status: 'ACTIVE',
        physical_origin: 'Portal de Datos Abiertos de Mendoza (https://datosabiertos.mendoza.gov.ar/api/3/action/package_search)',
        source_exists_physically: true
      },
      {
        source_id: 'SRC_CORPORATE_LINKEDIN_RADAR',
        source_family: 'DIGITAL_FOOTPRINT_UNGROUNDED',
        domain: 'linkedin.com',
        access_method: 'DISCOVERY_SEARCH',
        format: 'HTML',
        entity_types: ['COMPANY'],
        geo_coverage: ['Córdoba'],
        attributes: ['name', 'linkedin_url'],
        supports_person: false,
        supports_company: true,
        supports_email: false,
        supports_phone: false,
        supports_linkedin: true,
        supports_geo_levels: ['PROVINCE'],
        quality_score: 0.50,
        quality_nature: 'SEEDED',
        yield_history: [],
        yield_nature: 'UNKNOWN',
        success_rate: null,
        success_rate_nature: 'UNKNOWN',
        latency: null,
        latency_nature: 'UNKNOWN',
        cost_class: 'MEDIUM',
        first_seen: '2026-03-01T00:00:00.000Z',
        last_seen: new Date().toISOString(),
        last_probe: null,
        last_success: null,
        status: 'DISCOVERED_NOT_EXECUTABLE',
        physical_origin: 'Hipótesis no fundada (0 vínculos de LinkedIn reconciliados para Córdoba en fuentes físicas)',
        source_exists_physically: false
      }
    ];

    // Seed Routes with Strict Capabilities & Actual Coverage
    const initialRoutes: AtlasSourceRoute[] = [
      {
        route_id: 'ROUTE_LEGACY_PROVEEDORES_CSV',
        source_id: 'SRC_LEGACY_PROVEEDORES',
        endpoint: 'file://scratch/physical_sources/proveedores_sistema_legacy.csv',
        adapter_id: 'ADAPTER_BULK_CSV_CONNECTOR',
        capabilities: {
          supports_person: true,
          supports_company: true,
          supports_email: true,
          supports_phone: true,
          supports_linkedin: false,
          supported_entity_types: ['PERSON', 'COMPANY', 'EMPRESA', 'PROFESSIONAL'],
          supported_geo_levels: ['COUNTRY', 'PROVINCE', 'CITY', 'LOCALITY', 'NEIGHBORHOOD'],
          supported_provinces: ['ALL', 'CABA', 'Córdoba', 'Mendoza', 'Buenos Aires', 'Santa Fe', 'Río Negro'],
          actual_geo_coverage: ['ALL', 'CABA', 'CABALLITO', 'PALERMO', 'BELGRANO', 'FLORES', 'RECOLETA', 'Córdoba', 'Mendoza', 'Buenos Aires', 'Santa Fe', 'Río Negro'],
          has_neighborhood_evidence: true,
          has_email_evidence: true,
          has_phone_evidence: true,
          has_linkedin_evidence: false,
          verified_attributes: ['name', 'cuit', 'email', 'phone', 'localidad', 'barrio', 'provincia', 'rubro']
        },
        executable: true,
        last_probe: null,
        yield: null,
        yield_nature: 'UNKNOWN',
        attempts: 0,
        errors: [],
        cost_class: 'FREE',
        latency: null,
        quality_score: 0.99,
        physical_origin: 'scratch/physical_sources/proveedores_sistema_legacy.csv',
        source_exists_physically: true
      },
      {
        route_id: 'ROUTE_SIPRO_CENTRAL_CSV',
        source_id: 'SRC_SIPRO_CENTRAL',
        endpoint: 'file://scratch/physical_sources/sipro_proveedores.csv',
        adapter_id: 'ADAPTER_BULK_CSV_CONNECTOR',
        capabilities: {
          supports_person: true,
          supports_company: true,
          supports_email: false,
          supports_phone: false,
          supports_linkedin: false,
          supported_entity_types: ['PERSON', 'COMPANY'],
          supported_geo_levels: ['COUNTRY', 'PROVINCE', 'CITY'],
          supported_provinces: ['ALL', 'CABA', 'Córdoba', 'Mendoza'],
          actual_geo_coverage: ['ALL', 'CABA', 'Córdoba', 'Mendoza'],
          has_neighborhood_evidence: false,
          has_email_evidence: false,
          has_phone_evidence: false,
          has_linkedin_evidence: false,
          verified_attributes: ['name', 'cuit', 'localidad', 'provincia', 'website']
        },
        executable: true,
        last_probe: null,
        yield: null,
        yield_nature: 'UNKNOWN',
        attempts: 0,
        errors: [],
        cost_class: 'FREE',
        latency: null,
        quality_score: 0.96,
        physical_origin: 'scratch/physical_sources/sipro_proveedores.csv',
        source_exists_physically: true
      },
      {
        route_id: 'ROUTE_PALERMO_COMMUNITY_JSON',
        source_id: 'SRC_PALERMO_COMMUNITY_REGISTRY',
        endpoint: 'file://data/palermo_verified_persons_731.json',
        adapter_id: 'ADAPTER_OPEN_DATA_JSON',
        capabilities: {
          supports_person: true,
          supports_company: false,
          supports_email: true,
          supports_phone: true,
          supports_linkedin: false,
          supported_entity_types: ['PERSON', 'PROFESSIONAL'],
          supported_geo_levels: ['NEIGHBORHOOD'],
          supported_provinces: ['CABA'],
          // STRICT PHYSICAL INVARIANT: Evidence is ONLY Palermo. NOT Caballito, NOT universal CABA.
          actual_geo_coverage: ['PALERMO'],
          has_neighborhood_evidence: true,
          has_email_evidence: true,
          has_phone_evidence: true,
          has_linkedin_evidence: false,
          verified_attributes: ['name', 'role', 'localidad', 'barrio', 'phone', 'email']
        },
        executable: true,
        last_probe: null,
        yield: null,
        yield_nature: 'UNKNOWN',
        attempts: 0,
        errors: [],
        cost_class: 'FREE',
        latency: null,
        quality_score: 0.99,
        physical_origin: 'data/palermo_verified_persons_731.json',
        source_exists_physically: true
      },
      {
        route_id: 'ROUTE_RIO_NEGRO_OFFICIAL_JSON',
        source_id: 'SRC_RIO_NEGRO_OFFICIAL_REGISTRY',
        endpoint: 'file://data/rio_negro_verified_persons_2000.json',
        adapter_id: 'ADAPTER_OPEN_DATA_JSON',
        capabilities: {
          supports_person: true,
          supports_company: false,
          supports_email: true,
          supports_phone: true,
          supports_linkedin: false,
          supported_entity_types: ['PERSON'],
          supported_geo_levels: ['PROVINCE', 'CITY'],
          supported_provinces: ['Río Negro'],
          actual_geo_coverage: ['RÍO NEGRO'],
          has_neighborhood_evidence: false,
          has_email_evidence: true,
          has_phone_evidence: true,
          has_linkedin_evidence: false,
          verified_attributes: ['name', 'role', 'localidad', 'phone', 'email']
        },
        executable: true,
        last_probe: null,
        yield: null,
        yield_nature: 'UNKNOWN',
        attempts: 0,
        errors: [],
        cost_class: 'FREE',
        latency: null,
        quality_score: 0.98,
        physical_origin: 'data/rio_negro_verified_persons_2000.json',
        source_exists_physically: true
      },
      {
        route_id: 'ROUTE_GCBA_GASTRONOMY_CSV',
        source_id: 'SRC_GCBA_GASTRONOMY_OFFICIAL',
        endpoint: 'file://scratch/physical_sources/ba_oferta_gastronomica.csv',
        adapter_id: 'ADAPTER_OPEN_DATA_CSV',
        capabilities: {
          supports_person: false,
          supports_company: true,
          supports_email: false,
          supports_phone: true,
          supports_linkedin: false,
          supported_entity_types: ['COMPANY', 'ESTABLISHMENT'],
          supported_geo_levels: ['NEIGHBORHOOD', 'CITY'],
          supported_provinces: ['CABA'],
          actual_geo_coverage: ['CABA'],
          has_neighborhood_evidence: true,
          has_email_evidence: false,
          has_phone_evidence: true,
          has_linkedin_evidence: false,
          verified_attributes: ['name', 'rubro', 'barrio', 'phone']
        },
        executable: true,
        last_probe: null,
        yield: null,
        yield_nature: 'UNKNOWN',
        attempts: 0,
        errors: [],
        cost_class: 'FREE',
        latency: null,
        quality_score: 0.97,
        physical_origin: 'scratch/physical_sources/ba_oferta_gastronomica.csv',
        source_exists_physically: true
      },
      {
        route_id: 'ROUTE_OSM_PUBLIC_JSON',
        source_id: 'SRC_OSM_PUBLIC_SUBMESH',
        endpoint: 'file://scratch/physical_sources/osm_public_establishments.json',
        adapter_id: 'ADAPTER_OSM_OVERPASS',
        capabilities: {
          supports_person: false,
          supports_company: true,
          supports_email: false,
          supports_phone: true,
          supports_linkedin: false,
          supported_entity_types: ['COMPANY', 'ESTABLISHMENT'],
          supported_geo_levels: ['NEIGHBORHOOD', 'CITY'],
          supported_provinces: ['CABA', 'Córdoba', 'Mendoza'],
          actual_geo_coverage: ['CABA', 'CÓRDOBA', 'MENDOZA'],
          has_neighborhood_evidence: true,
          has_email_evidence: false,
          has_phone_evidence: true,
          has_linkedin_evidence: false,
          verified_attributes: ['name', 'address', 'neighborhood', 'phone']
        },
        executable: true,
        last_probe: null,
        yield: null,
        yield_nature: 'UNKNOWN',
        attempts: 0,
        errors: [],
        cost_class: 'LOW',
        latency: null,
        quality_score: 0.92,
        physical_origin: 'scratch/physical_sources/osm_public_establishments.json',
        source_exists_physically: true
      },
      {
        route_id: 'ROUTE_REFAR_FARMACIAS_CSV',
        source_id: 'SRC_REFAR_FARMACIAS',
        endpoint: 'file://scratch/physical_sources/refar_establecimientos_farmacias.csv',
        adapter_id: 'ADAPTER_OPEN_DATA_CSV',
        capabilities: {
          supports_person: false,
          supports_company: true,
          supports_email: false,
          supports_phone: true,
          supports_linkedin: false,
          supported_entity_types: ['COMPANY', 'ESTABLISHMENT'],
          supported_geo_levels: ['PROVINCE', 'CITY', 'NEIGHBORHOOD'],
          supported_provinces: ['ALL', 'CABA', 'Córdoba', 'Mendoza', 'Buenos Aires', 'Santa Fe'],
          actual_geo_coverage: ['ALL', 'CABA', 'CÓRDOBA', 'MENDOZA', 'BUENOS AIRES', 'SANTA FE'],
          has_neighborhood_evidence: true,
          has_email_evidence: false,
          has_phone_evidence: true,
          has_linkedin_evidence: false,
          verified_attributes: ['name', 'direccion', 'localidad', 'phone']
        },
        executable: true,
        last_probe: null,
        yield: null,
        yield_nature: 'UNKNOWN',
        attempts: 0,
        errors: [],
        cost_class: 'FREE',
        latency: null,
        quality_score: 0.96,
        physical_origin: 'scratch/physical_sources/refar_establecimientos_farmacias.csv',
        source_exists_physically: true
      },
      {
        route_id: 'ROUTE_IDECOR_CORDOBA_JSON',
        source_id: 'SRC_IDECOR_CORDOBA',
        endpoint: 'file://scratch/physical_sources/cordoba_veterinarias_idecor.json',
        adapter_id: 'ADAPTER_OPEN_DATA_JSON',
        capabilities: {
          supports_person: false,
          supports_company: true,
          supports_email: false,
          supports_phone: true,
          supports_linkedin: false,
          supported_entity_types: ['COMPANY', 'ESTABLISHMENT'],
          supported_geo_levels: ['PROVINCE', 'CITY'],
          supported_provinces: ['Córdoba'],
          actual_geo_coverage: ['CÓRDOBA'],
          has_neighborhood_evidence: false,
          has_email_evidence: false,
          has_phone_evidence: true,
          has_linkedin_evidence: false,
          verified_attributes: ['name', 'rubro', 'localidad', 'phone']
        },
        executable: true,
        last_probe: null,
        yield: null,
        yield_nature: 'UNKNOWN',
        attempts: 0,
        errors: [],
        cost_class: 'FREE',
        latency: null,
        quality_score: 0.95,
        physical_origin: 'scratch/physical_sources/cordoba_veterinarias_idecor.json',
        source_exists_physically: true
      },
      {
        route_id: 'ROUTE_CABA_LINKEDIN_JSON',
        source_id: 'SRC_CABA_LINKEDIN_VERIFIED',
        endpoint: 'file://scratch/physical_sources/caba_empresas_linkedin_verificadas.json',
        adapter_id: 'ADAPTER_PUBLIC_LINKEDIN_DISCOVERY',
        capabilities: {
          supports_person: false,
          supports_company: true,
          supports_email: false,
          supports_phone: false,
          supports_linkedin: true,
          supported_entity_types: ['COMPANY', 'ORGANIZATION'],
          supported_geo_levels: ['CITY', 'PROVINCE'],
          supported_provinces: ['CABA'],
          actual_geo_coverage: ['CABA'],
          has_neighborhood_evidence: false,
          has_email_evidence: false,
          has_phone_evidence: false,
          has_linkedin_evidence: true,
          verified_attributes: ['name', 'company_name', 'linkedin', 'cuit', 'rubro']
        },
        executable: true,
        last_probe: null,
        yield: null,
        yield_nature: 'UNKNOWN',
        attempts: 0,
        errors: [],
        cost_class: 'LOW',
        latency: null,
        quality_score: 0.90,
        physical_origin: 'scratch/physical_sources/caba_empresas_linkedin_verificadas.json',
        source_exists_physically: true
      },
      {
        route_id: 'ROUTE_DATOS_GOB_AR_CKAN',
        source_id: 'SRC_DATOS_GOB_AR',
        endpoint: 'https://datos.gob.ar/api/3/action/package_search',
        adapter_id: 'ADAPTER_CKAN_API',
        capabilities: {
          supports_person: false,
          supports_company: true,
          supports_email: true,
          supports_phone: false,
          supports_linkedin: false,
          supported_entity_types: ['COMPANY', 'ORGANIZATION'],
          supported_geo_levels: ['COUNTRY', 'PROVINCE'],
          supported_provinces: ['ALL', 'NACIONAL', 'ARGENTINA'],
          actual_geo_coverage: ['ALL', 'NACIONAL', 'ARGENTINA'],
          has_neighborhood_evidence: false,
          has_email_evidence: true,
          has_phone_evidence: false,
          has_linkedin_evidence: false,
          verified_attributes: ['name', 'organization']
        },
        executable: true,
        last_probe: null,
        yield: null,
        yield_nature: 'UNKNOWN',
        attempts: 0,
        errors: [],
        cost_class: 'FREE',
        latency: null,
        quality_score: 0.92,
        physical_origin: 'https://datos.gob.ar/api/3/action/package_search (API Pública Viva)',
        source_exists_physically: true
      },
      {
        route_id: 'ROUTE_MENDOZA_PORTAL_DATOS_CKAN',
        source_id: 'SRC_MENDOZA_PORTAL_DATOS',
        endpoint: 'https://datosabiertos.mendoza.gov.ar/api/3/action/package_search',
        adapter_id: 'ADAPTER_CKAN_API',
        capabilities: {
          supports_person: true,
          supports_company: true,
          supports_email: true,
          supports_phone: true,
          supports_linkedin: false,
          supported_entity_types: ['PERSON', 'COMPANY'],
          supported_geo_levels: ['PROVINCE', 'CITY'],
          supported_provinces: ['Mendoza'],
          actual_geo_coverage: ['MENDOZA'],
          has_neighborhood_evidence: false,
          has_email_evidence: true,
          has_phone_evidence: true,
          has_linkedin_evidence: false,
          verified_attributes: ['name', 'role', 'localidad', 'provincia', 'email', 'phone']
        },
        executable: true,
        last_probe: null,
        yield: null,
        yield_nature: 'UNKNOWN',
        attempts: 0,
        errors: [],
        cost_class: 'FREE',
        latency: null,
        quality_score: 0.94,
        physical_origin: 'https://datosabiertos.mendoza.gov.ar/api/3/action/package_search (API Pública Viva)',
        source_exists_physically: true
      },
      {
        route_id: 'ROUTE_CORDOBA_CORPORATE_LINKEDIN',
        source_id: 'SRC_CORPORATE_LINKEDIN_RADAR',
        endpoint: 'https://www.linkedin.com/company/location/argentina/cordoba',
        adapter_id: 'ADAPTER_PUBLIC_LINKEDIN_DISCOVERY',
        capabilities: {
          supports_person: false,
          supports_company: true,
          supports_email: false,
          supports_phone: false,
          supports_linkedin: true,
          supported_entity_types: ['COMPANY'],
          supported_geo_levels: ['PROVINCE'],
          supported_provinces: ['Córdoba'],
          actual_geo_coverage: ['CÓRDOBA'],
          has_neighborhood_evidence: false,
          has_email_evidence: false,
          has_phone_evidence: false,
          has_linkedin_evidence: true,
          verified_attributes: ['name', 'linkedin_url']
        },
        executable: false, // NOT EXECUTABLE: 0 physical data
        last_probe: null,
        yield: null,
        yield_nature: 'UNKNOWN',
        attempts: 0,
        errors: ['NO_OBSERVED_PHYSICAL_DATA_IN_CORDOBA'],
        cost_class: 'MEDIUM',
        latency: null,
        quality_score: 0.50,
        physical_origin: 'Hipótesis no fundada (0 vínculos reconciliados)',
        source_exists_physically: false
      }
    ];

    // Seed into Maps with UNKNOWN unprobed performance
    for (const src of initialSources) {
      this.memorySources.set(src.source_id, src);
      this.memoryPerformance.set(src.source_id, AtlasSourcePerformanceTracker.createInitial(src.source_id, undefined, src.quality_score));
    }

    for (const route of initialRoutes) {
      this.memoryRoutes.set(route.route_id, route);
      this.memoryPerformance.set(route.route_id, AtlasSourcePerformanceTracker.createInitial(route.source_id, route.route_id, route.quality_score || 0.5));
    }

    // Persist to PostgreSQL if connected
    try {
      for (const src of initialSources) {
        await this.pool.query(`
          INSERT INTO public.atlas_source_genome (
            source_id, source_family, domain, access_method, format,
            entity_types, geo_coverage, attributes,
            supports_person, supports_company, supports_email, supports_phone, supports_linkedin,
            supports_geo_levels, quality_score, quality_nature, yield_history, yield_nature,
            success_rate, success_rate_nature, latency, latency_nature, cost_class,
            first_seen, last_seen, last_probe, last_success, status, physical_origin, source_exists_physically
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
          ON CONFLICT (source_id) DO UPDATE SET
            last_seen = EXCLUDED.last_seen,
            status = EXCLUDED.status,
            quality_score = EXCLUDED.quality_score,
            physical_origin = EXCLUDED.physical_origin,
            source_exists_physically = EXCLUDED.source_exists_physically;
        `, [
          src.source_id, src.source_family, src.domain, src.access_method, src.format,
          src.entity_types, src.geo_coverage, src.attributes,
          src.supports_person, src.supports_company, src.supports_email, src.supports_phone, src.supports_linkedin,
          src.supports_geo_levels, src.quality_score, src.quality_nature, src.yield_history, src.yield_nature,
          src.success_rate, src.success_rate_nature, src.latency, src.latency_nature, src.cost_class,
          src.first_seen, src.last_seen, src.last_probe, src.last_success, src.status,
          src.physical_origin, src.source_exists_physically
        ]);
      }

      for (const r of initialRoutes) {
        await this.pool.query(`
          INSERT INTO public.atlas_source_routes (
            route_id, source_id, endpoint, adapter_id, capabilities, executable,
            last_probe, yield, yield_nature, attempts, errors, physical_origin, source_exists_physically
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          ON CONFLICT (route_id) DO UPDATE SET
            endpoint = EXCLUDED.endpoint,
            adapter_id = EXCLUDED.adapter_id,
            capabilities = EXCLUDED.capabilities,
            executable = EXCLUDED.executable,
            physical_origin = EXCLUDED.physical_origin,
            source_exists_physically = EXCLUDED.source_exists_physically;
        `, [
          r.route_id, r.source_id, r.endpoint, r.adapter_id, JSON.stringify(r.capabilities),
          r.executable, r.last_probe, r.yield, r.yield_nature, r.attempts, r.errors,
          r.physical_origin, r.source_exists_physically
        ]);
      }
    } catch (err: any) {
      console.warn('[AtlasSourceGenomeRepository] Postgres commit notice (in-memory authority preserved):', err.message);
    }

    this.isBootstrapped = true;
    return { sourcesCount: this.memorySources.size, routesCount: this.memoryRoutes.size };
  }

  public async getAllSources(): Promise<AtlasSource[]> {
    if (!this.isBootstrapped) await this.bootstrap();
    return Array.from(this.memorySources.values());
  }

  public async getAllRoutes(): Promise<AtlasSourceRoute[]> {
    if (!this.isBootstrapped) await this.bootstrap();
    return Array.from(this.memoryRoutes.values());
  }

  public getSource(source_id: string): AtlasSource | undefined {
    return this.memorySources.get(source_id);
  }

  public getRoute(route_id: string): AtlasSourceRoute | undefined {
    return this.memoryRoutes.get(route_id);
  }

  public async registerSource(src: AtlasSource): Promise<void> {
    if (!this.isBootstrapped) await this.bootstrap();
    this.memorySources.set(src.source_id, src);

    try {
      await this.pool.query(`
        INSERT INTO public.atlas_source_genome (
          source_id, source_family, domain, access_method, format,
          entity_types, geo_coverage, attributes,
          supports_person, supports_company, supports_email, supports_phone, supports_linkedin,
          supports_geo_levels, quality_score, quality_nature, yield_history, yield_nature,
          success_rate, success_rate_nature, latency, latency_nature, cost_class,
          first_seen, last_seen, last_probe, last_success, status, physical_origin, source_exists_physically
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
        ON CONFLICT (source_id) DO UPDATE SET
          last_seen = EXCLUDED.last_seen,
          status = EXCLUDED.status,
          quality_score = EXCLUDED.quality_score,
          physical_origin = EXCLUDED.physical_origin,
          source_exists_physically = EXCLUDED.source_exists_physically;
      `, [
        src.source_id, src.source_family, src.domain, src.access_method, src.format,
        src.entity_types, src.geo_coverage, src.attributes,
        src.supports_person, src.supports_company, src.supports_email, src.supports_phone, src.supports_linkedin,
        src.supports_geo_levels, src.quality_score, src.quality_nature, src.yield_history, src.yield_nature,
        src.success_rate, src.success_rate_nature, src.latency, src.latency_nature, src.cost_class,
        src.first_seen, src.last_seen, src.last_probe, src.last_success, src.status,
        src.physical_origin, src.source_exists_physically
      ]);
    } catch (err: any) {
      console.warn('[AtlasSourceGenomeRepository] registerSource postgres notice:', err.message);
    }
  }

  public async registerRoute(r: AtlasSourceRoute): Promise<void> {
    if (!this.isBootstrapped) await this.bootstrap();
    this.memoryRoutes.set(r.route_id, r);

    try {
      await this.pool.query(`
        INSERT INTO public.atlas_source_routes (
          route_id, source_id, endpoint, adapter_id, capabilities, executable,
          last_probe, yield, yield_nature, attempts, errors, physical_origin, source_exists_physically
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (route_id) DO UPDATE SET
          endpoint = EXCLUDED.endpoint,
          adapter_id = EXCLUDED.adapter_id,
          capabilities = EXCLUDED.capabilities,
          executable = EXCLUDED.executable,
          last_probe = EXCLUDED.last_probe,
          yield = EXCLUDED.yield,
          yield_nature = EXCLUDED.yield_nature,
          attempts = EXCLUDED.attempts,
          errors = EXCLUDED.errors,
          physical_origin = EXCLUDED.physical_origin,
          source_exists_physically = EXCLUDED.source_exists_physically;
      `, [
        r.route_id, r.source_id, r.endpoint, r.adapter_id, JSON.stringify(r.capabilities),
        r.executable, r.last_probe, r.yield, r.yield_nature, r.attempts, r.errors,
        r.physical_origin, r.source_exists_physically
      ]);

      await this.pool.query(`
        INSERT INTO public.atlas_source_capabilities (
          source_id, route_id, capability_payload
        ) VALUES ($1, $2, $3);
      `, [r.source_id, r.route_id, JSON.stringify(r.capabilities)]);
    } catch (err: any) {
      console.warn('[AtlasSourceGenomeRepository] registerRoute postgres notice:', err.message);
    }
  }

  /**
   * Retrieves best routes prioritized by capability, observed yield, quality, latency, and cost.
   * Invariant: SEEDED/UNKNOWN yields do NOT add historical bonus points.
   */
  public async getBestRoutes(missionSpec: MissionCompatibilitySpec): Promise<RankedRouteMatch[]> {
    if (!this.isBootstrapped) await this.bootstrap();

    const matches: RankedRouteMatch[] = [];

    for (const route of this.memoryRoutes.values()) {
      if (!route.executable) continue;
      const source = this.memorySources.get(route.source_id);
      if (!source || source.status === 'QUARANTINED' || source.status === 'DISCOVERED_NOT_EXECUTABLE') {
        continue;
      }

      // Evaluate capability match including actual_geo_coverage
      const evalRes = AtlasSourceCapabilityMatcher.evaluate(route.capabilities, missionSpec);
      if (!evalRes.compatible) continue;

      let rankScore = evalRes.score;

      // Yield bonus ONLY if OBSERVED
      const perf = this.memoryPerformance.get(route.route_id) || this.memoryPerformance.get(source.source_id);
      const isObservedYield = perf?.yield_nature === 'OBSERVED' && perf.yield !== null;
      if (isObservedYield && perf.yield !== null) {
        rankScore += perf.yield * 30;
      }

      // Quality bonus
      const q = route.quality_score ?? source.quality_score ?? 0.5;
      rankScore += q * 20;

      // Latency bonus ONLY if measured (OBSERVED)
      if (perf?.latency_nature === 'OBSERVED' && perf.latency !== null) {
        if (perf.latency < 100) rankScore += 10;
        else if (perf.latency < 300) rankScore += 5;
        else if (perf.latency > 1000) rankScore -= 5;
      }

      // Cost class bonus
      const cost = route.cost_class || source.cost_class || 'FREE';
      if (cost === 'FREE') rankScore += 10;
      else if (cost === 'LOW') rankScore += 5;
      else if (cost === 'HIGH') rankScore -= 10;

      const yieldText = isObservedYield 
        ? `Historical yield: OBSERVED (${Math.round((perf?.yield || 0) * 100)}%)` 
        : 'Historical yield: UNKNOWN (unprobed)';

      const reasons: string[] = [
        ...evalRes.reasons,
        yieldText,
        `Quality score: ${q} (${source.quality_nature})`,
        `Latency: ${perf?.latency !== null && perf?.latency !== undefined ? perf.latency + 'ms' : 'UNKNOWN'}`,
        `Cost class: ${cost}`
      ];

      matches.push({
        route,
        source,
        score: Math.round(rankScore * 10) / 10,
        reasons
      });
    }

    matches.sort((a, b) => b.score - a.score);
    return matches;
  }

  /**
   * Telemetry Feedback Loop:
   * Records observed execution results and updates performance & route yield without inventing data.
   */
  public async recordObservation(obs: SourceExecutionObservation): Promise<void> {
    if (!this.isBootstrapped) await this.bootstrap();

    const existingPerf = this.memoryPerformance.get(obs.route_id || obs.source_id) || 
      AtlasSourcePerformanceTracker.createInitial(obs.source_id, obs.route_id);
    
    const updatedPerf = AtlasSourcePerformanceTracker.applyObservation(existingPerf, obs);
    this.memoryPerformance.set(obs.source_id, updatedPerf);
    if (obs.route_id) {
      this.memoryPerformance.set(obs.route_id, updatedPerf);
    }

    // Update Route if route_id provided
    if (obs.route_id && this.memoryRoutes.has(obs.route_id)) {
      const r = this.memoryRoutes.get(obs.route_id)!;
      r.last_probe = obs.timestamp || new Date().toISOString();
      r.yield = updatedPerf.yield;
      r.yield_nature = 'OBSERVED';
      r.attempts = updatedPerf.attempts;
      r.latency = updatedPerf.latency;
      if (!obs.success && obs.error_class) {
        r.errors = [...r.errors, obs.error_class].slice(-5);
      }
      this.memoryRoutes.set(obs.route_id, r);
    }

    // Update Source status
    if (this.memorySources.has(obs.source_id)) {
      const s = this.memorySources.get(obs.source_id)!;
      s.last_probe = obs.timestamp || new Date().toISOString();
      s.yield_history = updatedPerf.yield_history;
      s.yield_nature = 'OBSERVED';
      s.success_rate = updatedPerf.success_rate;
      s.success_rate_nature = 'OBSERVED';
      s.latency = updatedPerf.latency;
      s.latency_nature = 'OBSERVED';
      if (obs.success) {
        s.last_success = obs.timestamp || new Date().toISOString();
      }
      if (updatedPerf.attempts >= 5 && (updatedPerf.success_rate ?? 0) < 0.2) {
        s.status = 'DEGRADED';
      }
      this.memorySources.set(obs.source_id, s);
    }

    // Write-through to PostgreSQL
    try {
      await this.pool.query(`
        INSERT INTO public.atlas_source_performance (
          source_id, route_id, attempts, success, raw_rows, admitted_rows, certified_rows,
          yield, yield_nature, success_rate, success_rate_nature, latency, latency_nature,
          error_class, last_success, last_probe, yield_history
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17);
      `, [
        obs.source_id, obs.route_id || null, updatedPerf.attempts, updatedPerf.success,
        updatedPerf.raw_rows, updatedPerf.admitted_rows, updatedPerf.certified_rows,
        updatedPerf.yield, updatedPerf.yield_nature, updatedPerf.success_rate, updatedPerf.success_rate_nature,
        updatedPerf.latency, updatedPerf.latency_nature,
        updatedPerf.error_class, updatedPerf.last_success, updatedPerf.last_probe,
        updatedPerf.yield_history
      ]);

      if (obs.route_id) {
        await this.pool.query(`
          UPDATE public.atlas_source_routes SET
            last_probe = $1,
            yield = $2,
            yield_nature = 'OBSERVED',
            attempts = $3
          WHERE route_id = $4;
        `, [obs.timestamp || new Date().toISOString(), updatedPerf.yield, updatedPerf.attempts, obs.route_id]);
      }
    } catch (err: any) {
      console.warn('[AtlasSourceGenomeRepository] Postgres write warning:', err.message);
    }
  }

  /**
   * Directly reads back performance telemetry from PostgreSQL for auditing.
   */
  public async readbackPerformanceFromPostgres(route_id: string): Promise<any> {
    const res = await this.pool.query(`
      SELECT attempts, success, raw_rows, admitted_rows, certified_rows, yield, yield_nature, latency, error_class
      FROM public.atlas_source_performance
      WHERE route_id = $1
      ORDER BY id DESC
      LIMIT 1;
    `, [route_id]);
    return res.rows[0] || null;
  }
}
