/**
 * ATLAS GENERIC SOURCE QUERY TRANSLATOR V1
 * @server/services/industrial/SourceQueryTranslator.ts
 * 
 * CORE ARCHITECTURAL INVARIANT:
 * Translates abstract Atlas Semantic Concepts and dynamic PublicTaxonomy into source-native query grammar
 * purely via DATA-DRIVEN dynamic mappings.
 * 
 * NO domain-specific "if ferreteria", "if peluqueria", "if zapateria" branches.
 * Category patches in code = STRICTLY FORBIDDEN.
 */

import type { UniversalSemanticSpec } from './UniversalSemanticResolver.ts';
import { AtlasConceptRegistry, type AtlasConceptDefinition } from './AtlasConceptRegistry.ts';
import { AtlasGeographyRegistry, type CanonicalGeography } from './AtlasGeographyRegistry.ts';
import { isGenericFamilyTaxonomy } from './AtlasPublicTaxonomyValidator.ts';
import type { PublicTaxonomyEntry } from './AtlasMissionIR.ts';

export interface BoundingBoxCoordinates {
  south: number;
  west: number;
  north: number;
  east: number;
  clause: string;
}

export class SourceQueryTranslator {
  private static instance: SourceQueryTranslator;

  public static getInstance(): SourceQueryTranslator {
    if (!this.instance) {
      this.instance = new SourceQueryTranslator();
    }
    return this.instance;
  }

  /**
   * Data-driven translation of Atlas concept / dynamic public taxonomy to Overpass / OSM tag filter clauses
   * No category-specific hardcoded branches.
   */
  public translateToOverpassTags(concept?: AtlasConceptDefinition | null, spec?: UniversalSemanticSpec): string[] {
    const clauses: string[] = [];

    // Helper: append key=value clauses if valid and not a generic family placeholder
    const appendTagClauses = (tag: string) => {
      if (typeof tag === 'string' && tag.includes('=')) {
        if (isGenericFamilyTaxonomy(tag)) {
          // Reject generic placeholders like shop=yes, amenity=yes
          return;
        }
        const [key, value] = tag.split('=').map(s => s.trim().toLowerCase());
        if (key && value) {
          clauses.push(`node["${key}"="${value}"]`);
          clauses.push(`way["${key}"="${value}"]`);
          clauses.push(`relation["${key}"="${value}"]`);
        }
      }
    };

    // 1. Dynamic Public Taxonomy from MissionSpec / CapabilityIR (Requirement 12)
    const dynamicTaxonomy: PublicTaxonomyEntry[] = (spec as any)?.public_taxonomy || [];
    if (Array.isArray(dynamicTaxonomy) && dynamicTaxonomy.length > 0) {
      for (const entry of dynamicTaxonomy) {
        if (entry.system === 'OSM' && entry.key && entry.value) {
          appendTagClauses(`${entry.key}=${entry.value}`);
        }
      }
    }

    const registry = AtlasConceptRegistry.getInstance();
    const resolvedConcept = concept || 
      (spec?.category ? registry.getConcept(spec.category) : null) || 
      ((spec as any)?.object?.concept_id ? registry.getConcept((spec as any).object.concept_id) : null) ||
      (spec?.raw_objective ? registry.matchConcept(spec.raw_objective) : null) ||
      ((spec as any)?.raw_query ? registry.matchConcept((spec as any).raw_query) : null);

    // 2. Direct semantic features declared in Concept Registry (SSOT)
    if (clauses.length === 0 && resolvedConcept) {
      const directTags = resolvedConcept.osm_tags || (Array.isArray(resolvedConcept.semantic_features?.osm_tags) ? resolvedConcept.semantic_features?.osm_tags : []);
      if (directTags && Array.isArray(directTags) && directTags.length > 0) {
        for (const tag of directTags) {
          appendTagClauses(tag);
        }
      }
    }

    // 3. Inheritance from parent concepts if not declared on concept itself
    if (clauses.length === 0 && resolvedConcept?.parent_concepts && resolvedConcept.parent_concepts.length > 0) {
      for (const parentId of resolvedConcept.parent_concepts) {
        const parent = registry.getConcept(parentId);
        const parentTags = parent?.osm_tags || (Array.isArray(parent?.semantic_features?.osm_tags) ? parent?.semantic_features?.osm_tags : []);
        if (parentTags && Array.isArray(parentTags)) {
          for (const tag of parentTags) {
            appendTagClauses(tag);
          }
        }
      }
    }

    return Array.from(new Set(clauses));
  }

  /**
   * Resolves geographic bounding box for Overpass API
   * Fail-Closed: Never defaults silently to CABA!
   */
  public resolveOverpassBoundingBox(geography?: any): BoundingBoxCoordinates {
    const geoRegistry = AtlasGeographyRegistry.getInstance();
    const geoStr = typeof geography === 'string' 
      ? geography 
      : (geography?.canonical_name || geography?.geography_id || 'ARG_CABA');
    const resolved = geoRegistry.resolveCanonicalGeography(geoStr);

    if (!resolved) {
      throw new Error(`GEOGRAPHY_CONTRACT_VIOLATION: No canonical spatial geography resolved for '${geography || 'EMPTY'}'. Cannot execute spatial query.`);
    }

    return {
      south: resolved.bbox.south,
      west: resolved.bbox.west,
      north: resolved.bbox.north,
      east: resolved.bbox.east,
      clause: resolved.bbox.clause
    };
  }

  /**
   * Generates complete Overpass QL query string
   */
  public buildOverpassQuery(
    concept: AtlasConceptDefinition | null | undefined,
    spec: UniversalSemanticSpec,
    limit: number = 35,
    customBboxClause?: string
  ): string {
    const clauses = this.translateToOverpassTags(concept, spec);
    const bboxClause = customBboxClause || this.resolveOverpassBoundingBox(spec.geography).clause;

    if (clauses.length === 0) {
      return '';
    }

    const subQueries = clauses.map(c => `  ${c}${bboxClause};`).join('\n');
    return `
[out:json][timeout:15];
(
${subQueries}
);
out center ${Math.max(limit, 35)};
    `.trim();
  }
}
