/**
 * src/lib/atlas/discovery/SourceMapSearch.mjs
 * 
 * ATLAS_SOURCE_MAP_SEARCH
 * Internal high-performance query and filter engine over atlas_source_knowledge_map.
 * 
 * Strict Isolation:
 * Source Knowledge Map is shared knowledge about WHERE data exists & HOW to access it.
 * But People Search, Video Search, and future Company/Document search remain strictly
 * isolated in indexing, ranking, and identity resolution.
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from '../../../../scripts/export_search_projection_v2.mjs';

dotenv.config();

export class AtlasSourceMapSearch {
  constructor(pool = null) {
    this.pool = pool || new pg.Pool({ ...parseDbUrl(), max: 4 });
    this.ownsPool = !pool;
  }

  async close() {
    if (this.ownsPool && this.pool) {
      await this.pool.end();
    }
  }

  /**
   * Search source knowledge map with multifaceted filtering
   * 
   * @param {Object} criteria
   * @param {string} [criteria.entity_type] - e.g. 'PERSON', 'ORGANIZATION', 'COMPANY', 'HOSPITAL', 'DOCUMENT'
   * @param {string} [criteria.geography] - e.g. 'CABA', 'PBA', 'ARGENTINA'
   * @param {string} [criteria.protocol] - e.g. 'CKAN', 'OAI_PMH', 'SPARQL', 'REST_API'
   * @param {string} [criteria.source_family] - e.g. 'CONICET', 'UNLP', 'BA_DATA'
   * @param {number} [criteria.min_estimated_size] - minimum estimated records
   * @param {number} [criteria.max_overlap] - maximum allowed SSOT overlap (e.g. 0.60 for <= 60% overlap)
   * @param {number} [criteria.min_quality] - minimum quality score (0.0 to 1.0)
   * @param {string} [criteria.status] - e.g. 'ACTIVE', 'SEMANTIC_MOTOR', 'EXHAUSTED', 'DORMANT'
   * @param {string} [criteria.keyword] - free text search over name/org/universe
   * @param {number} [criteria.limit] - max results (default 50)
   */
  async searchSources(criteria = {}) {
    const client = await this.pool.connect();
    try {
      const conditions = [];
      const values = [];
      let idx = 1;

      if (criteria.entity_type) {
        conditions.push(`(entity_capabilities ? $${idx})`);
        values.push(criteria.entity_type.toUpperCase());
        idx++;
      }

      if (criteria.geography) {
        if (criteria.geography === 'PBA' || criteria.geography === 'CABA') {
          conditions.push(`(geography_scope = $${idx} OR geography_scope = 'ARGENTINA')`);
          values.push(criteria.geography.toUpperCase());
          idx++;
        } else {
          conditions.push(`geography_scope = $${idx}`);
          values.push(criteria.geography.toUpperCase());
          idx++;
        }
      }

      if (criteria.protocol) {
        conditions.push(`protocol = $${idx}`);
        values.push(criteria.protocol.toUpperCase());
        idx++;
      }

      if (criteria.source_family) {
        conditions.push(`source_family ILIKE $${idx}`);
        values.push(`%${criteria.source_family}%`);
        idx++;
      }

      if (criteria.status) {
        conditions.push(`current_status = $${idx}`);
        values.push(criteria.status.toUpperCase());
        idx++;
      }

      if (criteria.min_estimated_size) {
        conditions.push(`estimated_records >= $${idx}`);
        values.push(criteria.min_estimated_size);
        idx++;
      }

      if (criteria.min_quality) {
        conditions.push(`quality_score >= $${idx}`);
        values.push(criteria.min_quality);
        idx++;
      }

      if (criteria.keyword) {
        conditions.push(`(
          source_name ILIKE $${idx} OR 
          owner_organization ILIKE $${idx} OR 
          source_universe ILIKE $${idx}
        )`);
        values.push(`%${criteria.keyword}%`);
        idx++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limitVal = criteria.limit || 50;
      values.push(limitVal);

      const query = `
        SELECT 
          source_id,
          source_name,
          source_family,
          source_universe,
          owner_organization,
          geography_scope,
          protocol,
          supported_motor_template,
          estimated_records,
          estimated_unique_entities,
          quality_score,
          reliability_score,
          current_status,
          entity_capabilities,
          source_graph_relations,
          overlap_memory,
          field_telemetry,
          tesla_motor_capabilities,
          last_profiled_at
        FROM public.atlas_source_knowledge_map
        ${whereClause}
        ORDER BY 
          (field_telemetry->>'field_strength_score')::numeric DESC NULLS LAST,
          estimated_records DESC
        LIMIT $${idx}
      `;

      const result = await client.query(query, values);
      let rows = result.rows;

      // Filter in memory for complex JSON overlap criteria if requested
      if (criteria.max_overlap !== undefined) {
        rows = rows.filter(r => {
          const overlapHist = r.overlap_memory?.overlap_with_ssot_history || [];
          const currentOverlap = overlapHist.length > 0 ? overlapHist[overlapHist.length - 1] : 0.5;
          return currentOverlap <= criteria.max_overlap;
        });
      }

      return rows;
    } finally {
      client.release();
    }
  }

  /**
   * Search for large, low-overlap source universes (the high-novelty fuel)
   */
  async findLargeLowOverlapUniverses({ geography = null, minSize = 10000, maxOverlap = 0.60 } = {}) {
    return this.searchSources({
      entity_type: 'PERSON',
      geography,
      min_estimated_size: minSize,
      max_overlap: maxOverlap,
      status: 'ACTIVE'
    });
  }

  /**
   * Calculate global coverage and capacity breakdown from Source Map
   */
  async getSourceMapCoverageAndCapacity() {
    const client = await this.pool.connect();
    try {
      const summaryQuery = `
        SELECT 
          count(*) as total_sources,
          count(DISTINCT source_universe) as total_universes,
          count(DISTINCT protocol) as total_protocols,
          sum(CASE WHEN geography_scope = 'CABA' THEN 1 ELSE 0 END) as caba_sources,
          sum(CASE WHEN geography_scope = 'PBA' THEN 1 ELSE 0 END) as pba_sources,
          sum(CASE WHEN geography_scope = 'ARGENTINA' THEN 1 ELSE 0 END) as national_sources,
          sum(CASE WHEN estimated_records >= 10000 AND estimated_records < 50000 THEN 1 ELSE 0 END) as large_10k,
          sum(CASE WHEN estimated_records >= 50000 AND estimated_records < 100000 THEN 1 ELSE 0 END) as large_50k,
          sum(CASE WHEN estimated_records >= 100000 AND estimated_records < 500000 THEN 1 ELSE 0 END) as large_100k,
          sum(CASE WHEN estimated_records >= 500000 THEN 1 ELSE 0 END) as large_500k,
          sum(estimated_records) as total_estimated_records,
          sum(estimated_unique_entities) as total_estimated_unique_entities,
          sum((overlap_memory->>'estimated_unseen_population')::bigint) as total_available_net_new
        FROM public.atlas_source_knowledge_map
      `;

      const res = await client.query(summaryQuery);
      const row = res.rows[0];

      // Entity capability breakdown
      const entQuery = `
        SELECT key as entity_type, count(*) as count
        FROM public.atlas_source_knowledge_map,
        jsonb_each_text(entity_capabilities)
        GROUP BY key
      `;
      const entRes = await client.query(entQuery);
      const entityCapabilities = {};
      for (const e of entRes.rows) {
        entityCapabilities[e.entity_type] = parseInt(e.count, 10);
      }

      // Protocols supported
      const protoQuery = `
        SELECT protocol, count(*) as count
        FROM public.atlas_source_knowledge_map
        GROUP BY protocol
      `;
      const protoRes = await client.query(protoQuery);
      const protocols = {};
      for (const p of protoRes.rows) {
        protocols[p.protocol] = parseInt(p.count, 10);
      }

      return {
        known_sources: parseInt(row.total_sources || 0, 10),
        known_source_universes: parseInt(row.total_universes || 0, 10),
        known_datasets: parseInt(row.total_sources || 0, 10),
        supported_protocols: protocols,
        known_entity_capabilities: entityCapabilities,
        source_map_coverage_caba: parseInt(row.caba_sources || 0, 10),
        source_map_coverage_pba: parseInt(row.pba_sources || 0, 10),
        source_map_coverage_argentina: parseInt(row.national_sources || 0, 10),
        large_universes_10k: parseInt(row.large_10k || 0, 10),
        large_universes_50k: parseInt(row.large_50k || 0, 10),
        large_universes_100k: parseInt(row.large_100k || 0, 10),
        large_universes_500k: parseInt(row.large_500k || 0, 10),
        total_estimated_records: parseInt(row.total_estimated_records || 0, 10),
        total_estimated_unique_entities: parseInt(row.total_estimated_unique_entities || 0, 10),
        estimated_available_net_new: parseInt(row.total_available_net_new || 0, 10)
      };
    } finally {
      client.release();
    }
  }
}
