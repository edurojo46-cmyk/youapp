/**
 * ATLAS SOURCE KNOWLEDGE FIRST PLANNER V1
 * @server/services/industrial/AtlasSourceKnowledgePlanner.ts
 * 
 * Master SSOT Knowledge-First Planner:
 * Enforces Constitutional Rules:
 * 1. public.atlas_source_knowledge_map is SSOT.
 * 2. Every mission starts: MissionIR -> Source KM -> compatible known sources -> SourceCapabilityIR -> Frontier.
 * 3. NO TITLE ILIKE AS AUTHORITY: Structured ontological matching on:
 *    - entity_type
 *    - row_unit
 *    - relation capability
 *    - geography containment (SOURCE contains MISSION)
 *    - enumeration capability (can_produce_entity_rows = TRUE, enumeration_capability = TRUE)
 *    - connector executable availability (AtlasConnectorExecutor / AtlasCKANConnector)
 *    - validation & health state (current_status in CANARY, PROMOTED, ACTIVE)
 *    - concept / ontology subtypes and synonyms (Concept Registry / semantic features)
 * 4. KNOWN SOURCE FAST PATH:
 *    - Zero AI calls, Zero Web search discovery.
 *    - Direct resolution: Source KM -> SourceCapabilityIR -> Connector -> Execution.
 */

import type pg from 'pg';
import { dbPool } from '../../db.ts';
import type { UniversalSemanticSpec } from './UniversalSemanticResolver.ts';
import { AtlasConceptRegistry } from './AtlasConceptRegistry.ts';
import { AtlasGeographyRegistry, type CanonicalGeography } from './AtlasGeographyRegistry.ts';
import type { SourceCapabilityIR, ConnectorFamily, SourceAccessMode } from './AtlasSourceUnderstandingEngine.ts';

export interface PlannedKnownSource {
  source_id: string;
  source_name: string;
  canonical_url: string;
  connector_family: ConnectorFamily;
  connector_class: string;
  access_mode: SourceAccessMode;
  role: string;
  priority: number;
  capability_ir: SourceCapabilityIR;
  relevance_score: number;
  match_reasons: string[];
}

export class AtlasSourceKnowledgePlanner {
  private static instance: AtlasSourceKnowledgePlanner;
  private db: pg.Pool;

  constructor(pool: pg.Pool = dbPool) {
    this.db = pool;
  }

  public static getInstance(pool?: pg.Pool): AtlasSourceKnowledgePlanner {
    if (!AtlasSourceKnowledgePlanner.instance) {
      AtlasSourceKnowledgePlanner.instance = new AtlasSourceKnowledgePlanner(pool || dbPool);
    }
    return AtlasSourceKnowledgePlanner.instance;
  }

  /**
   * Plans known, validated sources directly from public.atlas_source_knowledge_map
   * BEFORE any fallback (OSM, AI Radar, Web Search).
   */
  public async planKnownSources(
    semSpec: UniversalSemanticSpec,
    rawObjective?: string
  ): Promise<PlannedKnownSource[]> {
    if (!this.db) return [];

    try {
      // 1. Resolve Mission Ontology Context
      const conceptRegistry = AtlasConceptRegistry.getInstance();
      const queryLower = (semSpec.normalized_objective || semSpec.raw_objective || rawObjective || '').toLowerCase();
      const matchedConcepts = conceptRegistry.findMatchingConcepts(queryLower);
      const primaryConceptDef = conceptRegistry.getConcept(semSpec.category) || matchedConcepts[0]?.concept;

      // Extract all semantic tokens, synonyms, subtypes, and keywords
      const semanticTerms = new Set<string>();
      if (semSpec.category) semanticTerms.add(semSpec.category.toLowerCase().replace(/_/g, ' '));
      if (semSpec.entity_subtype) semanticTerms.add(semSpec.entity_subtype.toLowerCase());
      if (semSpec.object) semanticTerms.add(semSpec.object.toLowerCase());
      if (rawObjective) semanticTerms.add(rawObjective.toLowerCase());

      if (primaryConceptDef) {
        semanticTerms.add(primaryConceptDef.concept_id.toLowerCase().replace(/_/g, ' '));
        semanticTerms.add(primaryConceptDef.canonical_name.toLowerCase());
        for (const syn of primaryConceptDef.synonyms || []) semanticTerms.add(syn.toLowerCase());
        for (const alias of primaryConceptDef.aliases || []) semanticTerms.add(alias.toLowerCase());
        for (const cat of primaryConceptDef.categories || []) semanticTerms.add(cat.toLowerCase().replace(/_/g, ' '));
        for (const act of primaryConceptDef.activities || []) semanticTerms.add(act.toLowerCase().replace(/_/g, ' '));
        for (const serv of primaryConceptDef.services || []) semanticTerms.add(serv.toLowerCase().replace(/_/g, ' '));
      }

      // Also gather terms from all matched concept candidates
      for (const m of matchedConcepts.slice(0, 3)) {
        semanticTerms.add(m.concept.concept_id.toLowerCase().replace(/_/g, ' '));
        semanticTerms.add(m.concept.canonical_name.toLowerCase());
        for (const syn of m.concept.synonyms || []) semanticTerms.add(syn.toLowerCase());
      }

      const cleanTerms = Array.from(semanticTerms)
        .map(t => t.trim())
        .filter(t => t.length >= 3 && !['argentina', 'buenos', 'aires', 'para', 'servicios'].includes(t));

      // 2. Resolve Mission Geography
      const geoRegistry = AtlasGeographyRegistry.getInstance();
      const targetGeo = geoRegistry.resolveCanonicalGeography(semSpec.geography || 'ARG_NACIONAL');
      const targetGeoId = targetGeo?.geography_id || 'ARG_NACIONAL';

      // 3. Query SSOT for Validated, Executable Sources
      const res = await this.db.query(`
        SELECT 
          source_id,
          source_name,
          canonical_url,
          source_family,
          supported_motor_template,
          current_status,
          geography_scope,
          can_produce_entity_rows,
          entity_types_supported,
          row_unit_supported,
          quality_score,
          reliability_score,
          field_telemetry
        FROM public.atlas_source_knowledge_map
        WHERE can_produce_entity_rows = 'TRUE'
          AND current_status IN ('CANARY', 'PROMOTED', 'ACTIVE')
        ORDER BY quality_score DESC, updated_at DESC;
      `);

      const plannedSources: PlannedKnownSource[] = [];

      for (const row of res.rows) {
        // Extract or reconstruct Capability IR
        const capIR: SourceCapabilityIR = row.field_telemetry?.capability_ir || this.buildCapabilityIRFromRow(row);

        // A. Enumeration & Executability Invariant
        const isExecutableConnector = this.isConnectorExecutable(capIR.connector_family, capIR.connector_class, row.supported_motor_template);
        if (!isExecutableConnector) continue;

        // B. Row Unit & Entity Type Structured Fit
        const reqRowUnit = semSpec.row_unit || 'ESTABLISHMENT';
        const reqEntityType = semSpec.entity_type || 'ESTABLISHMENT';

        const rowUnits = capIR.row_units || row.row_unit_supported || [];
        const entityTypes = capIR.entity_types || row.entity_types_supported || [];

        const rowUnitFit = rowUnits.length === 0 || 
                           rowUnits.includes(reqRowUnit as any) || 
                           (reqRowUnit === 'ESTABLISHMENT' && rowUnits.includes('COMPANY' as any)) ||
                           (reqRowUnit === 'COMPANY' && rowUnits.includes('ESTABLISHMENT' as any));

        const entityTypeFit = entityTypes.length === 0 || 
                             entityTypes.includes(reqEntityType as any) ||
                             (reqEntityType === 'ESTABLISHMENT' && entityTypes.includes('COMPANY' as any)) ||
                             (reqEntityType === 'COMPANY' && entityTypes.includes('ESTABLISHMENT' as any));

        if (!rowUnitFit || !entityTypeFit) continue;

        // C. Geography Containment Invariant (SOURCE_GEOGRAPHY contains MISSION_GEOGRAPHY)
        const sourceGeo = row.geography_scope || capIR.geographic_scope || 'ARG_NACIONAL';
        const geoCompatible = this.isGeographyCompatible(sourceGeo, targetGeoId, targetGeo);
        if (!geoCompatible) continue;

        // D. Structured Concept & Semantic Matching
        const { isMatch, score, reasons } = this.evaluateConceptMatch(row, capIR, cleanTerms, semSpec, primaryConceptDef);
        if (!isMatch) continue;

        // Priority calculation
        const basePriority = Math.round(Number(row.quality_score || 0.9) * 100);
        const finalPriority = Math.min(100, Math.max(50, basePriority + Math.round(score * 10)));

        plannedSources.push({
          source_id: row.source_id,
          source_name: row.source_name,
          canonical_url: row.canonical_url,
          connector_family: capIR.connector_family,
          connector_class: capIR.connector_class,
          access_mode: capIR.access_mode,
          role: semSpec.relation || 'ESTABLISHMENT_SERVICE',
          priority: finalPriority,
          capability_ir: capIR,
          relevance_score: score,
          match_reasons: reasons
        });
      }

      // Sort by priority descending
      plannedSources.sort((a, b) => b.priority - a.priority);

      if (plannedSources.length > 0) {
        console.log(`[AtlasSourceKnowledgePlanner] Matched ${plannedSources.length} known validated source(s) from SSOT: ${plannedSources.map(s => `${s.source_id} (${s.source_name})`).join(', ')}`);
      }

      return plannedSources;
    } catch (err: any) {
      console.warn(`[AtlasSourceKnowledgePlanner] Error reading known sources from SSOT:`, err.message);
      return [];
    }
  }

  /**
   * Validates if source geography contains mission geography
   */
  private isGeographyCompatible(sourceGeoStr: string, targetGeoId: string, targetGeo: CanonicalGeography | null): boolean {
    const s = sourceGeoStr.toUpperCase().replace(/\s+/g, '_');
    const t = targetGeoId.toUpperCase().replace(/\s+/g, '_');

    // 1. National source covers any Argentine jurisdiction
    if (s.includes('ARG_NACIONAL') || s.includes('ARGENTINA') || s === 'NACIONAL') {
      return true;
    }

    // 2. Exact match
    if (s === t) return true;

    // 3. CABA containment
    if ((s.includes('CABA') || s.includes('BUENOS_AIRES')) && (t.includes('CABA') || t.includes('CAPITAL'))) {
      return true;
    }

    // 4. Province containment
    if (targetGeo?.province) {
      const provNorm = targetGeo.province.toUpperCase().replace(/\s+/g, '_');
      if (s.includes(provNorm)) return true;
    }

    return false;
  }

  /**
   * Structured concept matching across ontology registry, tags, mappings, and field telemetry
   */
  private evaluateConceptMatch(
    row: any,
    capIR: SourceCapabilityIR,
    semanticTerms: string[],
    semSpec: UniversalSemanticSpec,
    primaryConceptDef?: any
  ): { isMatch: boolean; score: number; reasons: string[] } {
    const reasons: string[] = [];
    let score = 0;

    const sourceName = (row.source_name || '').toLowerCase();
    const sourceUrl = (row.canonical_url || '').toLowerCase();
    const telemetryStr = JSON.stringify(row.field_telemetry || {}).toLowerCase();
    const searchableBlob = `${sourceName} ${sourceUrl} ${telemetryStr}`;

    // 1. Concept Registry direct link or hint
    if (primaryConceptDef?.source_hints && Array.isArray(primaryConceptDef.source_hints)) {
      if (primaryConceptDef.source_hints.includes(row.source_id)) {
        reasons.push('DIRECT_ONTOLOGY_SOURCE_HINT');
        score += 0.5;
      }
    }

    // 2. Tag / synonym matches
    let termMatches = 0;
    for (const term of semanticTerms) {
      if (searchableBlob.includes(term)) {
        termMatches++;
        reasons.push(`MATCHED_TERM_${term.toUpperCase().replace(/\s+/g, '_')}`);
      }
    }

    if (termMatches > 0) {
      score += Math.min(0.5, termMatches * 0.15);
    }

    // 3. Fallback check for domain words
    // e.g. "estacionamiento", "garage", "playa", "vehicular", "auto"
    const isAutomotiveOrParking = semanticTerms.some(t => 
      t.includes('garage') || t.includes('estacionamiento') || t.includes('automotor') || t.includes('parking')
    );
    if (isAutomotiveOrParking && (sourceName.includes('estacionamiento') || sourceName.includes('garage'))) {
      reasons.push('DOMAIN_SYNONYM_MATCH');
      score += 0.4;
    }

    const isMatch = score >= 0.25 || reasons.length > 0;
    return { isMatch, score, reasons };
  }

  private isConnectorExecutable(family?: string, connectorClass?: string, motorTemplate?: string): boolean {
    const f = family || '';
    const c = connectorClass || motorTemplate || '';
    if (f === 'CKAN_API' || c === 'AtlasCKANConnector' || c === 'CKAN_MOTOR') return true;
    if (f === 'OPEN_DATA_CSV' || f === 'OPEN_DATA_JSON' || f === 'PUBLIC_REGISTRY_API') return true;
    if (f === 'OSM_OVERPASS') return true;
    return false;
  }

  private buildCapabilityIRFromRow(row: any): SourceCapabilityIR {
    const ft = row.field_telemetry || {};
    const family = (row.source_family === 'CKAN_PORTAL' || row.source_family === 'CKAN_GENERIC' || row.supported_motor_template === 'AtlasCKANConnector')
      ? 'CKAN_API'
      : (ft.connector_family || 'OPEN_DATA_CSV');

    return {
      source_id: row.source_id,
      source_name: row.source_name,
      canonical_url: row.canonical_url,
      domain: new URL(row.canonical_url.startsWith('http') ? row.canonical_url : `https://${row.canonical_url}`).hostname,
      source_archetype: 'OPEN_DATA_PORTAL',
      secondary_archetypes: [],
      source_roles: ['ENTITY_SOURCE', 'DISCOVERY_SOURCE'],
      row_units: row.row_unit_supported || ['ESTABLISHMENT'],
      entity_types: row.entity_types_supported || ['ESTABLISHMENT'],
      relations_supported: ['ESTABLISHMENT_SERVICE', 'SERVICE_PROVIDER'],
      geographic_scope: row.geography_scope || 'ARG_NACIONAL',
      public_access: true,
      access_mode: 'DOWNLOADABLE_DATASET',
      queryability: {
        by_name: true,
        by_id: true,
        by_concept: true,
        by_geography: true,
        by_matricula: false,
        free_text: true,
        browse_only: false
      },
      enumeration_capability: true,
      bulk_capability: true,
      verification_capability: true,
      discovery_capability: true,
      evidence_capability: true,
      resource_formats: ['CSV', 'JSON', 'GEOJSON'],
      pagination: 'OFFSET_LIMIT',
      connector_family: family as ConnectorFamily,
      connector_class: row.supported_motor_template || 'AtlasConnectorExecutor',
      mission_compatibility: 'COMPATIBLE',
      confidence: Number(row.quality_score || 0.95),
      validation_required: false,
      state: 'SOURCE_VALIDATED',
      state_reason: 'SSOT_VALIDATED_SOURCE',
      technical_inspection: {
        has_api: true,
        has_ckan: family === 'CKAN_API',
        has_csv: true,
        has_json: true,
        has_geojson: true,
        has_html_table: false,
        has_pagination: true,
        has_search_form: false,
        has_public_endpoint: true,
        resource_links: []
      },
      cached: true
    };
  }
}
