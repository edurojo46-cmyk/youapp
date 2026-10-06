/**
 * ATLAS SOURCE BRIDGE VALIDATOR V1
 * @server/services/industrial/AtlasSourceBridgeValidator.ts
 * 
 * Constitutional validator that proves source feasibility before execution:
 * 1. Checks public taxonomy validity (via AtlasPublicTaxonomyValidator)
 * 2. Checks source availability in SSOT / public ecosystem
 * 3. Assesses connector executability vs connector missing (e.g. chamber public directory without parser)
 * 4. Ensures zero license cost and permitted public access
 * 5. Coordinates canary probe execution before committing to learning
 */

import type { AtlasMissionIR } from './AtlasMissionIR.ts';
import { AtlasPublicTaxonomyValidator, type TaxonomyValidationResult } from './AtlasPublicTaxonomyValidator.ts';
import { SourceKnowledgeMap, type SourceKnowledgeEntry } from '../../../src/lib/atlasPathfinder/sourceIntelligence/SourceKnowledgeMap.ts';
import { SourceQueryTranslator } from './SourceQueryTranslator.ts';
import { AtlasGeographyRegistry } from './AtlasGeographyRegistry.ts';
import { dbPool } from '../../db.ts';
import { AtlasSourceUnderstandingEngine } from './AtlasSourceUnderstandingEngine.ts';

export type SourceBridgeStatus =
  | 'SOURCE_READY'
  | 'VALIDATED'
  | 'NEEDS_PROBE'
  | 'REJECTED'
  | 'SEMANTICS_RESOLVED_SOURCE_BRIDGE_GAP'
  | 'KNOWN_SOURCE_CONNECTOR_MISSING'
  | 'KNOWN_SOURCE_REQUIRES_VALIDATION'
  | 'SOURCE_PROBE_FAILED'
  | 'SOURCE_BRIDGE_REQUIRES_REVIEW'
  | 'SOURCE_ACCESS_RESTRICTED'
  | 'NO_SOURCE_KNOWN'
  | 'NO_SUITABLE_SOURCE_FOUND';

export interface SourceHypothesis {
  source_family: string;
  known_atlas_source_id?: string;
  source_name?: string;
  protocol?: string;
  query_strategy: string;
  expected_evidence: string[];
  geographic_fit: string;
  confidence: number;
  reason_codes?: string[];
}

export interface BridgeValidationRequest {
  missionIR: AtlasMissionIR;
  taxonomyValidation: TaxonomyValidationResult;
  sourceHypotheses: SourceHypothesis[];
}

export interface BridgeValidationDecision {
  status: SourceBridgeStatus;
  primary_source_id?: string;
  selected_source_family?: string;
  query_strategy?: string;
  canary_query?: string;
  executable: boolean;
  probe_required: boolean;
  reason: string;
  known_chamber_match?: {
    source_id: string;
    source_name: string;
    has_connector: boolean;
  };
}

export class AtlasSourceBridgeValidator {
  private static instance: AtlasSourceBridgeValidator;

  public static getInstance(): AtlasSourceBridgeValidator {
    if (!this.instance) {
      this.instance = new AtlasSourceBridgeValidator();
    }
    return this.instance;
  }

  /**
   * Evaluates if proposed source bridge is valid, executable, or missing a connector.
   */
  public async evaluateBridge(request: BridgeValidationRequest): Promise<BridgeValidationDecision> {
    const { missionIR, taxonomyValidation, sourceHypotheses } = request;

    // 1. Taxonomy check: Fail closed if taxonomy validation failed completely
    if (!taxonomyValidation.valid && taxonomyValidation.sanitized_osm_tags.length === 0 && taxonomyValidation.sanitized_clae_codes.length === 0) {
      return {
        status: 'REJECTED',
        executable: false,
        probe_required: false,
        reason: `Taxonomy hypotheses rejected: ${taxonomyValidation.issues.join('; ')}`
      };
    }

    const knowledgeMap = SourceKnowledgeMap.getInstance();
    const allSources = knowledgeMap.getAllSources();
    const rawPhrase = (missionIR.object.raw_object_phrase || missionIR.object.canonical_name || '').toLowerCase();

    // 2. Chamber / Association audit (Requirement 19):
    // Check if a business chamber or sector association is known in the Source Knowledge Map
    const stopWords = new Set(['para', 'sobre', 'desde', 'argentina', 'nacional', 'buenos', 'aires', 'capital', 'gran', 'este', 'oeste', 'todas', 'todos']);
    const phraseTokens = rawPhrase.split(/\s+/).map(w => w.trim()).filter(w => w.length >= 4 && !stopWords.has(w));

    const chamberMatch = phraseTokens.length > 0 ? allSources.find(s => {
      const isChamberFamily = s.source_family.includes('CAMARA') ||
        s.source_family.includes('TRADE') ||
        s.source_family.includes('ASOC') ||
        s.source_family.includes('PROFESSIONAL') ||
        s.source_family.includes('FEDERACION');
      if (!isChamberFamily) return false;

      const nameLower = s.source_name.toLowerCase();
      return phraseTokens.some(tok => {
        const matchesTopic = s.topics.some(t => t.toLowerCase() === tok || (t.length >= 4 && t.toLowerCase().includes(tok)));
        const matchesName = nameLower.includes(tok);
        return matchesTopic || matchesName;
      });
    }) : undefined;

    if (chamberMatch) {
      const understandingEngine = AtlasSourceUnderstandingEngine.getInstance(dbPool);
      const capIR = await understandingEngine.understandSource({
        missionIR,
        candidate_source: chamberMatch,
        source_name: chamberMatch.source_name,
        url: chamberMatch.canonical_url
      });

      const isExecutable = capIR.enumeration_capability || capIR.bulk_capability || capIR.access_mode === 'DOWNLOADABLE_DATASET' || capIR.connector_family === 'PAGINATED_DIRECTORY' || capIR.connector_family === 'HTML_TABLE';

      if (isExecutable) {
        return {
          status: 'NEEDS_PROBE',
          primary_source_id: chamberMatch.source_id,
          selected_source_family: capIR.source_archetype,
          query_strategy: `CHAMBER_DIRECTORY_EXTRACTION::${capIR.connector_family}`,
          executable: true,
          probe_required: true,
          reason: `Known chamber/association [${chamberMatch.source_name}] identified in SSOT with executable connector [${capIR.connector_family}].`,
          known_chamber_match: {
            source_id: chamberMatch.source_id,
            source_name: chamberMatch.source_name,
            has_connector: true
          }
        };
      } else if (capIR.access_mode === 'INDIVIDUAL_LOOKUP' && taxonomyValidation.sanitized_osm_tags.length === 0) {
        return {
          status: 'KNOWN_SOURCE_CONNECTOR_MISSING',
          primary_source_id: chamberMatch.source_id,
          selected_source_family: capIR.source_archetype,
          executable: false,
          probe_required: false,
          reason: `Known chamber/association [${chamberMatch.source_name}] identified in SSOT knowledge map, but requires individual lookup.`,
          known_chamber_match: {
            source_id: chamberMatch.source_id,
            source_name: chamberMatch.source_name,
            has_connector: false
          }
        };
      }
    }

    // 3. Evaluate OSM / Overpass Bridge for Establishments / Facilities
    if (taxonomyValidation.sanitized_osm_tags.length > 0) {
      const osmTag = taxonomyValidation.sanitized_osm_tags[0];
      const [key, val] = osmTag.split('=');

      // Test query generation
      const translator = SourceQueryTranslator.getInstance();
      const mockConcept: any = {
        concept_id: `PROPOSED_${val.toUpperCase()}`,
        canonical_name: taxonomyValidation.canonical_candidate,
        osm_tags: taxonomyValidation.sanitized_osm_tags,
        categories: [missionIR.object.domain || 'GENERAL'],
        relations: [missionIR.intent.role || 'SERVICE_PROVIDER'],
        row_unit: missionIR.intent.row_unit || 'ESTABLISHMENT',
        confidence: 0.95
      };

      const geo = AtlasGeographyRegistry.getInstance().resolveCanonicalGeography(
        missionIR.geography.canonical_name || missionIR.geography.raw_geography_phrase || 'Argentina',
        { defaultToNational: true }
      );
      const isNational = !geo || geo.geography_id === 'ARG_NACIONAL' || geo.admin_level === 'NATIONAL';
      const bboxClause = isNational ? '(-34.70,-58.53,-34.53,-58.35)' : (geo.bbox?.clause || '(-34.70,-58.53,-34.53,-58.35)');
      const query = translator.buildOverpassQuery(mockConcept, {
        raw_objective: missionIR.raw_user_query,
        row_unit: missionIR.intent.row_unit || 'ESTABLISHMENT',
        entity_type: missionIR.intent.target_entity_type || 'ESTABLISHMENT',
        role: missionIR.intent.role || 'SERVICE_PROVIDER',
        action: missionIR.intent.action || 'PROVIDE_SERVICE',
        relation: missionIR.intent.relation || 'ESTABLISHMENT_SERVICE',
        category: missionIR.object.domain || 'COMMERCIAL',
        geography: geo.canonical_name,
        required_evidence: ['GEOGRAPHIC_COORDINATES', 'ADDRESS_OR_LOCALITY'],
        negative_semantics: [],
        confidence_score: 0.95
      }, 10, bboxClause);

      if (query) {
        return {
          status: 'NEEDS_PROBE',
          primary_source_id: 'SRC_OSM_PUBLIC_ESTABLISHMENTS',
          selected_source_family: 'OSM_OVERPASS',
          query_strategy: `OVERPASS_TAG_QUERY::${osmTag}`,
          canary_query: query,
          executable: true,
          probe_required: true,
          reason: `Valid public taxonomy mapping [${osmTag}] generated executable Overpass query for ${geo.canonical_name}. Probe required before learning.`
        };
      }
    }

    // 4. Evaluate CLAE / Registry Bridge
    if (taxonomyValidation.sanitized_clae_codes.length > 0) {
      const clae = taxonomyValidation.sanitized_clae_codes[0];
      return {
        status: 'NEEDS_PROBE',
        primary_source_id: 'SRC_BOLETIN_OFICIAL_NACION',
        selected_source_family: 'PUBLIC_REGISTRY',
        query_strategy: `CLAE_REGISTRY_LOOKUP::${clae}`,
        executable: true,
        probe_required: true,
        reason: `Valid CLAE code [${clae}] mapped to public corporate registry. Probe required.`
      };
    }

    // 5. Check if any known source hypothesis matches
    if (sourceHypotheses.length > 0) {
      const topHyp = sourceHypotheses[0];
      if (topHyp.known_atlas_source_id) {
        return {
          status: 'KNOWN_SOURCE_REQUIRES_VALIDATION',
          primary_source_id: topHyp.known_atlas_source_id,
          selected_source_family: topHyp.source_family,
          query_strategy: topHyp.query_strategy,
          executable: false,
          probe_required: true,
          reason: `Proposed source ${topHyp.known_atlas_source_id} requires canary probe calibration.`
        };
      }
    }

    // 6. Terminal classification: semantic meaning resolved, but source bridge missing
    return {
      status: 'SEMANTICS_RESOLVED_SOURCE_BRIDGE_GAP',
      executable: false,
      probe_required: false,
      reason: 'Semantic intention understood, but no verified public taxonomy or executable source bridge exists in Atlas.'
    };
  }

  /**
   * Executes a minimal canary probe over HTTP (Section 12: Probe before learning)
   */
  public async executeCanaryProbe(decision: BridgeValidationDecision): Promise<{
    success: boolean;
    http_status: number;
    rows_found: number;
    sample_records: any[];
    error?: string;
  }> {
    if (!decision.executable || !decision.canary_query) {
      return {
        success: false,
        http_status: 400,
        rows_found: 0,
        sample_records: [],
        error: 'Bridge is not executable or query is missing'
      };
    }

    const endpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://lz4.overpass-api.de/api/interpreter',
      'https://z.overpass-api.de/api/interpreter'
    ];

    for (const ep of endpoints) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(ep, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'User-Agent': 'AtlasAutonomousSourceBridge/1.0 (B2B Research Argentina; cert@atlas.youapp.tv)'
          },
          body: `data=${encodeURIComponent(decision.canary_query)}`,
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (res.ok) {
          const data: any = await res.json();
          const elements = Array.isArray(data.elements) ? data.elements : [];
          return {
            success: elements.length > 0,
            http_status: res.status,
            rows_found: elements.length,
            sample_records: elements.slice(0, 20).map((e: any) => ({
              id: e.id,
              name: e.tags?.name || e.tags?.brand || e.tags?.operator || 'SIN_NOMBRE',
              lat: e.lat || e.center?.lat,
              lon: e.lon || e.center?.lon,
              address: e.tags?.['addr:street'] ? `${e.tags['addr:street']} ${e.tags['addr:housenumber'] || ''}`.trim() : (e.tags?.['addr:city'] || undefined),
              tags: e.tags || {}
            }))
          };
        }
      } catch (err: any) {
        // Try standby endpoint
      }
    }

    return {
      success: false,
      http_status: 504,
      rows_found: 0,
      sample_records: [],
      error: 'All canary probe endpoints timed out or failed'
    };
  }
}
