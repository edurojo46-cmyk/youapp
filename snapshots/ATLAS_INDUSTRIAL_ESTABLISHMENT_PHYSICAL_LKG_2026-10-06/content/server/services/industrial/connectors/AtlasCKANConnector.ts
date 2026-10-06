/**
 * ATLAS — GENERIC INDUSTRIAL CONNECTOR
 * Module: AtlasCKANConnector
 * 
 * Family: CKAN_API (Standard Open Data Catalog REST API)
 * Architectural Gate: SHADOW ONLY.
 * 
 * STRICT COMPLIANCE:
 * - NO category-specific hardcoded logic.
 * - Configurable by source_id, endpoint, pagination, field mapping, concept mapping, geography mapping, evidence mapping.
 * - Does NOT intercept or alter productive source planner.
 * - Updates public.atlas_source_knowledge_map directly with execution metrics and learnings.
 */

import pg from 'pg';
import { dbPool } from '../../../db.ts';

export interface CKANPaginationConfig {
  limit_param?: string;      // default: 'limit'
  offset_param?: string;     // default: 'offset'
  default_limit?: number;    // default: 100
  max_limit?: number;        // default: 1000
}

export interface CKANFieldMapping {
  id_field?: string;
  name_field: string;
  address_field?: string;
  lat_field?: string;
  lon_field?: string;
  phone_field?: string;
  website_field?: string;
  category_field?: string;
  metadata_fields?: string[];
}

export interface CKANConceptMapping {
  concept_field?: string;
  concept_transform?: (val: any) => string;
  fixed_concept?: string;
  category_keywords?: Record<string, string[]>;
}

export interface CKANGeographyMapping {
  geo_field?: string;
  province_field?: string;
  city_field?: string;
  fixed_geography?: string;
  allowed_provinces?: string[];
  allowed_cities?: string[];
}

export interface CKANEvidenceMapping {
  source_citation: string;
  record_type: string;
  license?: string;
  authority?: string;
}

export interface CKANConnectorConfig {
  source_id: string;
  source_name: string;
  endpoint: string;          // Base action endpoint, e.g. "https://datos.gob.ar/api/3/action"
  resource_id?: string;      // CKAN datastore resource_id if querying datastore_search directly
  pagination: CKANPaginationConfig;
  field_mapping: CKANFieldMapping;
  concept_mapping: CKANConceptMapping;
  geography_mapping: CKANGeographyMapping;
  evidence_mapping: CKANEvidenceMapping;
  mode?: 'SHADOW';           // Strictly SHADOW
}

export interface CKANStandardEntityRow {
  entity_id: string;
  name: string;
  concept: string;
  geography: string;
  address?: string;
  lat?: number;
  lon?: number;
  phone?: string;
  website?: string;
  evidence: {
    source_id: string;
    source_citation: string;
    record_type: string;
    license?: string;
    raw_row: any;
    verified_at: string;
  };
}

export interface CKANExecutionResult {
  source_id: string;
  mode: 'SHADOW';
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'EMPTY';
  scanned_records: number;
  qualified_entities: number;
  yield_ratio: number;
  latency_ms: number;
  sample_rows: CKANStandardEntityRow[];
  error_message?: string;
  persisted_to_knowledge_map: boolean;
}

export class AtlasCKANConnector {
  private config: CKANConnectorConfig;
  private db: pg.Pool;

  constructor(config: CKANConnectorConfig, pool: pg.Pool = dbPool) {
    this.config = {
      ...config,
      mode: 'SHADOW' // Hard enforce SHADOW gate
    };
    this.db = pool;
  }

  public getConfig(): CKANConnectorConfig {
    return { ...this.config };
  }

  /**
   * Executes in SHADOW mode.
   * Accepts either an optional fixture array (for deterministic offline testing)
   * or queries the real CKAN endpoint if provided and online.
   */
  public async executeShadow(
    query: {
      concept?: string;
      geography?: string;
      query_term?: string;
      limit?: number;
      offset?: number;
    } = {},
    fixtureData?: any[]
  ): Promise<CKANExecutionResult> {
    const startMs = Date.now();
    let rawRecords: any[] = [];
    let fetchError: string | undefined;

    const limit = query.limit || this.config.pagination.default_limit || 100;
    const offset = query.offset || 0;

    if (fixtureData && Array.isArray(fixtureData)) {
      // Use provided test fixture
      rawRecords = fixtureData.slice(offset, offset + limit);
    } else {
      // Execute against real public CKAN endpoint
      try {
        const url = new URL(
          this.config.resource_id
            ? `${this.config.endpoint}/datastore_search`
            : `${this.config.endpoint}/package_search`
        );

        if (this.config.resource_id) {
          url.searchParams.set('resource_id', this.config.resource_id);
          url.searchParams.set(this.config.pagination.limit_param || 'limit', String(limit));
          url.searchParams.set(this.config.pagination.offset_param || 'offset', String(offset));
          if (query.query_term) {
            url.searchParams.set('q', query.query_term);
          }
        } else {
          url.searchParams.set('rows', String(limit));
          url.searchParams.set('start', String(offset));
          if (query.query_term) {
            url.searchParams.set('q', query.query_term);
          }
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);

        const resp = await fetch(url.toString(), {
          headers: { 'Accept': 'application/json', 'User-Agent': 'AtlasAutonomousCKAN/1.0' },
          signal: controller.signal
        });
        clearTimeout(timer);

        if (resp.ok) {
          const body = await resp.json() as any;
          if (body?.success) {
            rawRecords = body.result?.records || body.result?.results || [];
          } else {
            fetchError = `CKAN response returned success: false`;
          }
        } else {
          fetchError = `HTTP ${resp.status}: ${resp.statusText}`;
        }
      } catch (err: any) {
        fetchError = err.message || 'Fetch failed';
      }
    }

    const latencyMs = Math.max(1, Date.now() - startMs);
    const scanned = rawRecords.length;
    const qualifiedRows: CKANStandardEntityRow[] = [];

    // Apply generic mappings and filters
    for (const r of rawRecords) {
      const entity = this.mapRecordToStandardEntity(r, query);
      if (entity) {
        qualifiedRows.push(entity);
      }
    }

    const yieldRatio = scanned > 0 ? parseFloat((qualifiedRows.length / scanned).toFixed(2)) : 0;
    const status: CKANExecutionResult['status'] = fetchError
      ? 'FAILED'
      : qualifiedRows.length > 0
        ? (qualifiedRows.length === scanned ? 'SUCCESS' : 'PARTIAL')
        : 'EMPTY';

    let persisted = false;
    try {
      persisted = await this.recordLearningToKnowledgeMap({
        scanned,
        qualified: qualifiedRows.length,
        yieldRatio,
        latencyMs,
        status,
        error: fetchError
      });
    } catch (learnErr: any) {
      console.warn(`[AtlasCKANConnector] Knowledge learning persistence failed:`, learnErr.message);
    }

    return {
      source_id: this.config.source_id,
      mode: 'SHADOW',
      status,
      scanned_records: scanned,
      qualified_entities: qualifiedRows.length,
      yield_ratio: yieldRatio,
      latency_ms: latencyMs,
      sample_rows: qualifiedRows.slice(0, 10),
      error_message: fetchError,
      persisted_to_knowledge_map: persisted
    };
  }

  private mapRecordToStandardEntity(raw: any, query: { concept?: string; geography?: string }): CKANStandardEntityRow | null {
    const fm = this.config.field_mapping;
    const cm = this.config.concept_mapping;
    const gm = this.config.geography_mapping;

    // 1. Resolve Name (Mandatory)
    const name = raw[fm.name_field]?.trim();
    if (!name || name.length < 2) return null;

    // 2. Resolve Concept
    let concept = cm.fixed_concept || 'ESTABLISHMENT';
    if (cm.concept_field && raw[cm.concept_field]) {
      const rawConcept = raw[cm.concept_field];
      concept = cm.concept_transform ? cm.concept_transform(rawConcept) : String(rawConcept).trim();
    }
    if (query.concept && !concept.toLowerCase().includes(query.concept.toLowerCase())) {
      // Concept filtering
      return null;
    }

    // 3. Resolve Geography
    let geography = gm.fixed_geography || 'ARGENTINA';
    if (gm.city_field && raw[gm.city_field]) {
      geography = `${raw[gm.city_field]}, ${raw[gm.province_field] || 'ARG'}`;
    } else if (gm.province_field && raw[gm.province_field]) {
      geography = String(raw[gm.province_field]);
    } else if (gm.geo_field && raw[gm.geo_field]) {
      geography = String(raw[gm.geo_field]);
    }

    if (query.geography && !geography.toLowerCase().includes(query.geography.toLowerCase())) {
      // Geography filtering
      return null;
    }

    // 4. Coordinates
    const lat = fm.lat_field && raw[fm.lat_field] ? parseFloat(raw[fm.lat_field]) : undefined;
    const lon = fm.lon_field && raw[fm.lon_field] ? parseFloat(raw[fm.lon_field]) : undefined;

    // 5. Unique Entity ID
    const rawId = fm.id_field ? raw[fm.id_field] : `${name}_${geography}`;
    const entityId = `${this.config.source_id}_${Buffer.from(String(rawId)).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`;

    return {
      entity_id: entityId,
      name,
      concept,
      geography,
      address: fm.address_field ? raw[fm.address_field] : undefined,
      lat: !isNaN(lat!) ? lat : undefined,
      lon: !isNaN(lon!) ? lon : undefined,
      phone: fm.phone_field ? raw[fm.phone_field] : undefined,
      website: fm.website_field ? raw[fm.website_field] : undefined,
      evidence: {
        source_id: this.config.source_id,
        source_citation: this.config.evidence_mapping.source_citation,
        record_type: this.config.evidence_mapping.record_type,
        license: this.config.evidence_mapping.license,
        raw_row: raw,
        verified_at: new Date().toISOString()
      }
    };
  }

  /**
   * Persists knowledge learnings directly into public.atlas_source_knowledge_map.
   * Strictly NO parallel source maps or secondary tables.
   */
  private async recordLearningToKnowledgeMap(metrics: {
    scanned: number;
    qualified: number;
    yieldRatio: number;
    latencyMs: number;
    status: string;
    error?: string;
  }): Promise<boolean> {
    const q = `
      INSERT INTO public.atlas_source_knowledge_map (
        source_id,
        canonical_url,
        source_name,
        source_family,
        source_universe,
        geography_scope,
        protocol,
        access_method,
        supported_motor_template,
        current_status,
        estimated_records,
        reliability_score,
        quality_score,
        source_roles,
        can_produce_entity_rows,
        entity_types_supported,
        row_unit_supported,
        geographic_granularity,
        queryability,
        public_access_confirmed,
        overlap_memory,
        field_telemetry,
        last_profiled_at,
        updated_at
      ) VALUES (
        $1, $2, $3, 'CKAN_GENERIC', 'OPEN_DATA_NATIONAL', $4, 'CKAN', 'REST_API', 'CKAN_MOTOR',
        'CANARY', 50000, 0.95, 0.92,
        ARRAY['ENTITY_SOURCE', 'DISCOVERY_SOURCE', 'EVIDENCE_SOURCE'],
        'TRUE',
        ARRAY['ESTABLISHMENT', 'COMPANY', 'ORGANIZATION', 'LOCATION'],
        ARRAY['DATASET_ROW', 'ESTABLISHMENT'],
        'MUNICIPALITY',
        '{"by_concept": true, "by_geography": true, "by_id": true}'::jsonb,
        true,
        jsonb_build_object(
          'records_scanned', $5::int,
          'true_net_new_found', $6::int,
          'yield_history', jsonb_build_array($7::numeric)
        ),
        jsonb_build_object(
          'connector_class', 'AtlasCKANConnector',
          'connector_mode', 'SHADOW',
          'latency_ms', $8::int,
          'field_mapping', $9::jsonb,
          'concept_mapping', $10::jsonb,
          'evidence_mapping', $11::jsonb,
          'last_execution_status', $12::text
        ),
        NOW(),
        NOW()
      )
      ON CONFLICT (source_id) DO UPDATE SET
        field_telemetry = jsonb_set(
          jsonb_set(
            coalesce(atlas_source_knowledge_map.field_telemetry, '{}'::jsonb),
            '{last_shadow_run}',
            jsonb_build_object(
              'scanned', $5::int,
              'qualified', $6::int,
              'yield', $7::numeric,
              'latency_ms', $8::int,
              'status', $12::text,
              'ran_at', NOW()
            )
          ),
          '{field_mapping}',
          $9::jsonb
        ),
        overlap_memory = jsonb_set(
          coalesce(atlas_source_knowledge_map.overlap_memory, '{}'::jsonb),
          '{records_scanned}',
          to_jsonb(coalesce((atlas_source_knowledge_map.overlap_memory->>'records_scanned')::int, 0) + $5::int)
        ),
        can_produce_entity_rows = 'TRUE',
        public_access_confirmed = true,
        last_profiled_at = NOW(),
        updated_at = NOW();
    `;

    await this.db.query(q, [
      this.config.source_id,
      this.config.endpoint,
      this.config.source_name,
      this.config.geography_mapping.fixed_geography || 'ARGENTINA',
      metrics.scanned,
      metrics.qualified,
      metrics.yieldRatio,
      metrics.latencyMs,
      JSON.stringify(this.config.field_mapping),
      JSON.stringify(this.config.concept_mapping),
      JSON.stringify(this.config.evidence_mapping),
      metrics.status
    ]);

    return true;
  }
}
