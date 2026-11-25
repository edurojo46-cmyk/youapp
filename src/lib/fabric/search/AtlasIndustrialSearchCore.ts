/**
 * ATLAS INDUSTRIAL SEARCH CORE V1
 * 
 * Generic, domain-agnostic industrial search engine.
 * Powered by DomainPack declarations:
 * - Operates uniformly on AtlasEntity
 * - Uses domain-declared searchable_fields, facets, and ranking_policy
 * - Zero hardcoded assumptions of 'name' or 'profession'
 * - Strict latency semantics: separates cache_lookup_latency, query_execution_latency, total_latency
 */

import type { AtlasEntity } from '../contracts/AtlasEntity';
import type { AtlasDomainPack } from '../contracts/AtlasDomainPack';
import type { AtlasEntityEvidence } from '../contracts/AtlasEntityEvidence';
import type { AtlasEntityRelationship } from '../contracts/AtlasEntityRelationship';

export interface SearchQuery {
  domain_id: string;
  query?: string;
  filters?: Record<string, any>;
  page?: number;
  page_size?: number;
  min_confidence?: number;
  sort_by?: string;
  sort_direction?: 'asc' | 'desc';
}

export interface SearchFacetBucket {
  value: string;
  count: number;
}

export interface SearchResultItem {
  entity: AtlasEntity;
  relevance_score: number;
  matched_fields: string[];
  evidence_count: number;
  relationships_count: number;
}

export interface SearchResponse {
  domain_id: string;
  total_results: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: SearchResultItem[];
  facets: Record<string, SearchFacetBucket[]>;
  latency_metrics: {
    cache_lookup_latency_ms: number;
    query_execution_latency_ms: number;
    total_latency_ms: number;
  };
}

export class AtlasIndustrialSearchCore {
  private domainPacks: Map<string, AtlasDomainPack> = new Map();
  private entityIndex: Map<string, AtlasEntity[]> = new Map(); // domain_id -> entities
  private evidenceIndex: Map<string, AtlasEntityEvidence[]> = new Map(); // entity_id -> evidence list
  private relationshipIndex: Map<string, AtlasEntityRelationship[]> = new Map(); // entity_id -> relationships

  public registerDomainPack(pack: AtlasDomainPack): void {
    this.domainPacks.set(pack.domain_id, pack);
    if (!this.entityIndex.has(pack.domain_id)) {
      this.entityIndex.set(pack.domain_id, []);
    }
  }

  public indexEntity(entity: AtlasEntity, evidence?: AtlasEntityEvidence[], relationships?: AtlasEntityRelationship[]): void {
    const list = this.entityIndex.get(entity.domain_id) || [];
    // Update or insert
    const idx = list.findIndex(e => e.entity_id === entity.entity_id);
    if (idx >= 0) {
      list[idx] = entity;
    } else {
      list.push(entity);
    }
    this.entityIndex.set(entity.domain_id, list);

    if (evidence && evidence.length > 0) {
      this.evidenceIndex.set(entity.entity_id, evidence);
    }
    if (relationships && relationships.length > 0) {
      this.relationshipIndex.set(entity.entity_id, relationships);
    }
  }

  public bulkIndexEntities(domain_id: string, entities: AtlasEntity[]): void {
    const list = this.entityIndex.get(domain_id) || [];
    for (const ent of entities) {
      const idx = list.findIndex(e => e.entity_id === ent.entity_id);
      if (idx >= 0) {
        list[idx] = ent;
      } else {
        list.push(ent);
      }
    }
    this.entityIndex.set(domain_id, list);
  }

  public search(params: SearchQuery): SearchResponse {
    const startTime = performance.now();
    const cacheLookupLatency = 0; // In-memory lookup: explicitly 0 ms as cache check

    const pack = this.domainPacks.get(params.domain_id);
    if (!pack) {
      throw new Error(`[AtlasIndustrialSearchCore] DomainPack '${params.domain_id}' not found.`);
    }

    const allEntities = this.entityIndex.get(params.domain_id) || [];
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.max(1, Math.min(100, params.page_size || 20));
    const rawQuery = (params.query || '').toLowerCase().trim();
    const queryTokens = rawQuery ? rawQuery.split(/\s+/).filter(t => t.length > 1) : [];

    // 1. Filter and score
    const matched: SearchResultItem[] = [];

    for (const entity of allEntities) {
      // Check filters
      if (params.filters) {
        let passesFilters = true;
        for (const [key, filterVal] of Object.entries(params.filters)) {
          if (filterVal === undefined || filterVal === null || filterVal === '') continue;
          const entityVal = entity.attributes[key];
          if (Array.isArray(filterVal)) {
            if (!filterVal.includes(entityVal)) {
              passesFilters = false;
              break;
            }
          } else if (typeof filterVal === 'string') {
            if (!entityVal || String(entityVal).toLowerCase() !== filterVal.toLowerCase()) {
              passesFilters = false;
              break;
            }
          } else if (entityVal !== filterVal) {
            passesFilters = false;
            break;
          }
        }
        if (!passesFilters) continue;
      }

      // Check min confidence
      if (params.min_confidence && entity.completeness_score < params.min_confidence) {
        continue;
      }

      // Calculate score and matched fields using domain's declared searchable_fields & ranking_policy
      let relevanceScore = 0;
      const matchedFields: string[] = [];

      if (queryTokens.length === 0) {
        // No text query: base ranking on completeness score
        relevanceScore = entity.completeness_score;
      } else {
        let totalTokenMatches = 0;
        for (const field of pack.searchable_fields) {
          const val = entity.attributes[field];
          if (!val) continue;
          const strVal = String(val).toLowerCase();

          for (const token of queryTokens) {
            if (strVal.includes(token)) {
              totalTokenMatches++;
              if (!matchedFields.includes(field)) {
                matchedFields.push(field);
              }
              // Add domain factor weight
              const factor = pack.ranking_policy.factors.find(f => f.field === field);
              const weight = factor ? factor.weight : 0.2;
              relevanceScore += (100 * weight);
            }
          }
        }

        // If query was provided but no token matched, exclude
        if (totalTokenMatches === 0) {
          continue;
        }
      }

      // Incorporate domain-specific ranking bonus
      relevanceScore = this.applyDomainRankingBonus(entity, pack, relevanceScore);

      const evidenceCount = this.evidenceIndex.get(entity.entity_id)?.length || 1;
      const relationshipsCount = this.relationshipIndex.get(entity.entity_id)?.length || 0;

      matched.push({
        entity,
        relevance_score: Math.round(relevanceScore),
        matched_fields: matchedFields,
        evidence_count: evidenceCount,
        relationships_count: relationshipsCount
      });
    }

    // 2. Sort results
    const sortBy = params.sort_by || pack.ranking_policy.default_sort.field;
    const sortDir = params.sort_direction || pack.ranking_policy.default_sort.direction;

    matched.sort((a, b) => {
      if (params.query && !params.sort_by) {
        // Default to relevance score when query provided
        return b.relevance_score - a.relevance_score;
      }
      const valA = a.entity.attributes[sortBy] ?? '';
      const valB = b.entity.attributes[sortBy] ?? '';
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return b.relevance_score - a.relevance_score;
    });

    // 3. Facet Aggregations
    const facets: Record<string, SearchFacetBucket[]> = {};
    for (const facetField of pack.facets) {
      const counts: Map<string, number> = new Map();
      for (const item of matched) {
        const val = item.entity.attributes[facetField];
        if (val) {
          const sVal = String(val);
          counts.set(sVal, (counts.get(sVal) || 0) + 1);
        }
      }
      facets[facetField] = Array.from(counts.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);
    }

    // 4. Pagination
    const totalResults = matched.length;
    const totalPages = Math.ceil(totalResults / pageSize);
    const offset = (page - 1) * pageSize;
    const paginatedItems = matched.slice(offset, offset + pageSize);

    const endTime = performance.now();
    const queryExecutionLatency = Math.round((endTime - startTime) * 100) / 100;
    const totalLatency = Math.round((cacheLookupLatency + queryExecutionLatency) * 100) / 100;

    return {
      domain_id: pack.domain_id,
      total_results: totalResults,
      page,
      page_size: pageSize,
      total_pages: totalPages,
      results: paginatedItems,
      facets,
      latency_metrics: {
        cache_lookup_latency_ms: cacheLookupLatency,
        query_execution_latency_ms: queryExecutionLatency,
        total_latency_ms: totalLatency
      }
    };
  }

  /**
   * Domain-Specific Ranking Bonus (Phase 14)
   * Tailored bonuses according to domain entity semantics
   */
  private applyDomainRankingBonus(entity: AtlasEntity, pack: AtlasDomainPack, baseScore: number): number {
    let score = baseScore;

    if (pack.domain_id === 'PEOPLE_ARGENTINA') {
      // People ranking factors: verified email, social presence, completeness
      if (entity.attributes.public_email) score += 15;
      if (entity.attributes.social_profiles && entity.attributes.social_profiles.length > 0) score += 10;
      if (entity.completeness_tier === 'RICH') score += 20;
    } else if (pack.domain_id === 'PROCUREMENT_ARGENTINA') {
      // Procurement ranking factors: status = OPEN, recent publication, specified amount
      if (entity.attributes.status === 'OPEN') score += 25;
      if (entity.attributes.amount && entity.attributes.amount > 0) score += 15;
      if (entity.attributes.closing_date) {
        const closing = new Date(entity.attributes.closing_date).getTime();
        const now = Date.now();
        if (closing > now) {
          score += 20; // Urgent open tender
        }
      }
    }

    return score;
  }
}
