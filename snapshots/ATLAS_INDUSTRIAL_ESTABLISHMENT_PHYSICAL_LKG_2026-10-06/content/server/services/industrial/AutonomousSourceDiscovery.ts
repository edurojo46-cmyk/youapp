/**
 * ATLAS AUTONOMOUS SOURCE DISCOVERY V1
 * @server/services/industrial/AutonomousSourceDiscovery.ts
 * 
 * Generic Public Source Discovery Engine:
 * - Queries public open data portals (CKAN), geographic registries (Overpass OSM), and public registers.
 * - Derived query from: ENTITY, CATEGORY, RELATION, PRODUCT, GEOGRAPHY, REQUIRED_EVIDENCE.
 * - Discovers, evaluates candidate endpoints, and formats records using generic parsers.
 * - Strictly NO Antigravity manual web search. Driven completely by Atlas runtime code.
 */

import type { UniversalSemanticSpec } from './UniversalSemanticResolver.ts';
import type { SourceCapabilityDeclaration, SourceProbeResult } from './SourceSuitabilityGate.ts';
import { AtlasConceptRegistry } from './AtlasConceptRegistry.ts';
import { SourceQueryTranslator } from './SourceQueryTranslator.ts';
import { AtlasGeographyRegistry } from './AtlasGeographyRegistry.ts';
import { dbPool } from '../../db.ts';
import { AtlasSourceUnderstandingEngine } from './AtlasSourceUnderstandingEngine.ts';
import { AtlasConnectorExecutor } from './connectors/AtlasConnectorExecutor.ts';

export interface DiscoveredCandidateSource {
  source_id: string;
  source_name: string;
  source_url: string;
  source_type: 'OPEN_DATA_PORTAL' | 'PUBLIC_GEO_REGISTRY' | 'OFFICIAL_REGISTRY' | 'CKAN_RESOURCE';
  access_method: 'REST_API' | 'BULK_CSV' | 'JSON' | 'GEOJSON';
  entity_types_supported: string[];
  categories_supported: string[];
  relations_supported: string[];
  geographies_supported: string[];
  fetchCandidates: (limit: number, spec: UniversalSemanticSpec) => Promise<any[]>;
}

export class AutonomousSourceDiscovery {
  private static instance: AutonomousSourceDiscovery;

  public static getInstance(): AutonomousSourceDiscovery {
    if (!this.instance) {
      this.instance = new AutonomousSourceDiscovery();
    }
    return this.instance;
  }

  /**
   * Discovers candidate sources autonomously based on semantic requirements
   */
  public async discoverSources(spec: UniversalSemanticSpec): Promise<DiscoveredCandidateSource[]> {
    const discovered: DiscoveredCandidateSource[] = [];
    const geoLower = (spec.geography || '').toLowerCase();
    const isCabaOrBa = geoLower.includes('caba') || geoLower.includes('buenos aires') || geoLower.includes('capital');

    // 1. PUBLIC ESTABLISHMENT & COMMERCE GEO-REGISTRY (OpenStreetMap / Overpass)
    const translator = SourceQueryTranslator.getInstance();
    const conceptRegistry = AtlasConceptRegistry.getInstance();
    const queryLower = (spec.normalized_objective || spec.raw_objective || '').toLowerCase();
    const matchedConcept = conceptRegistry.findMatchingConcepts(queryLower)[0]?.concept;
    const concept = conceptRegistry.getConcept(spec.category) || matchedConcept;
    const osmTags = translator.translateToOverpassTags(concept, spec);

    if (spec.row_unit === 'ESTABLISHMENT' && osmTags.length > 0) {
      discovered.push({
        source_id: 'SRC_OSM_PUBLIC_ESTABLISHMENTS',
        source_name: 'Directorio Público Abierto de Comercios y Establecimientos (OSM Public Geo-Registry)',
        source_url: 'https://overpass-api.de/api/interpreter',
        source_type: 'PUBLIC_GEO_REGISTRY',
        access_method: 'REST_API',
        entity_types_supported: ['ESTABLISHMENT', 'COMPANY'],
        categories_supported: [spec.category, ...(concept ? concept.categories : [])],
        relations_supported: ['ESTABLISHMENT_SERVICE', 'SERVICE_PROVIDER', ...(concept ? concept.relations : [])],
        geographies_supported: ['ARG / CABA', 'ARG / BUENOS AIRES', 'ARG / CORDOBA', 'ARG / NACIONAL'],
        fetchCandidates: async (limit: number, reqSpec: UniversalSemanticSpec) => {
          const isNational = !reqSpec.geography || reqSpec.geography.toUpperCase().includes('NACIONAL') || reqSpec.geography.toUpperCase() === 'ARGENTINA';
          const probeBbox = isNational ? '(-34.70,-58.53,-34.53,-58.35)' : undefined;
          return this.fetchEstablishmentsFromOverpass(limit, reqSpec, probeBbox);
        }
      });
    }

    // 2. CKAN OPEN DATA PORTALS (National & City)
    // Capable of discovering registered industry / public registries
    if (spec.product || spec.category) {
      const ckanSource = await this.discoverCkanDatasets(spec);
      if (ckanSource) {
        discovered.push(ckanSource);
      }
    }

    return discovered;
  }

  /**
   * Fetches establishment entities from public Overpass Geo-Registry
   */
  public async fetchEstablishmentsFromOverpass(
    limit: number,
    spec: UniversalSemanticSpec,
    customBboxClause?: string
  ): Promise<any[]> {
    try {
      const translator = SourceQueryTranslator.getInstance();
      const conceptRegistry = AtlasConceptRegistry.getInstance();
      const queryLower = (spec.normalized_objective || spec.raw_objective || '').toLowerCase();
      const matchedConcept = conceptRegistry.findMatchingConcepts(queryLower)[0]?.concept;
      const concept = conceptRegistry.getConcept(spec.category) || matchedConcept;

      const query = translator.buildOverpassQuery(concept, spec, limit, customBboxClause);
      if (!query) {
        return [];
      }

      let elements: any[] = [];
      const endpoints = [
        'https://overpass-api.de/api/interpreter',
        'https://z.overpass-api.de/api/interpreter',
        'https://lz4.overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
        'https://overpass.private.coffee/api/interpreter'
      ];

      let consecutiveFailures = 0;
      let successfulQuery = false;
      let lastErrorMessage = '';
      for (let attempt = 0; attempt < 1 && elements.length === 0; attempt++) {
        for (const endpoint of endpoints) {
          if (consecutiveFailures >= 4) {
            console.warn(`[AutonomousSourceDiscovery] Consecutive Overpass mirrors timed out. Fast-failing Overpass to protect latency budget.`);
            break;
          }
          try {
            const res = await fetch(endpoint, {
              method: 'POST',
              body: query,
              headers: {
                'User-Agent': 'Atlas-Autonomous-Agent/1.0 (Buscador Industrial Autonomous Discovery)'
              },
              signal: AbortSignal.timeout(8000)
            });
            console.log(`[AutonomousSourceDiscovery] Endpoint ${endpoint} status: ${res.status}`);
            if (res.ok) {
              const text = await res.text();
              try {
                const json: any = JSON.parse(text);
                elements = json.elements || [];
                successfulQuery = true;
                console.log(`[AutonomousSourceDiscovery] Parsed ${elements.length} elements from ${endpoint}`);
                if (elements.length > 0) break;
              } catch (parseErr: any) {
                consecutiveFailures++;
                lastErrorMessage = `Non-JSON response from ${endpoint}: ${parseErr.message}`;
                console.warn(`[AutonomousSourceDiscovery] Mirror ${endpoint} returned non-JSON 200 response`);
              }
            } else {
              consecutiveFailures++;
              lastErrorMessage = `HTTP ${res.status} from ${endpoint}`;
            }
          } catch (err: any) {
            consecutiveFailures++;
            lastErrorMessage = `${err.name || 'Error'}: ${err.message} from ${endpoint}`;
            console.warn(`[AutonomousSourceDiscovery] Mirror ${endpoint} failed:`, err.message);
          }
        }
      }

      if (!successfulQuery && elements.length === 0 && consecutiveFailures > 0) {
        throw new Error(`OVERPASS_TECHNICAL_FAILURE: ${lastErrorMessage || 'All Overpass mirrors failed or timed out'}`);
      }

      const geoStr = typeof spec.geography === 'string' ? spec.geography : (spec.geography as any)?.canonical_name || (spec.geography as any)?.geography_id || 'ARG_CABA';
      const canonicalGeo = AtlasGeographyRegistry.getInstance().resolveCanonicalGeography(geoStr);
      const candidates: any[] = [];
      for (const el of elements) {
        if (candidates.length >= limit) break;
        const tags = el.tags || {};
        const name = tags.name || tags['brand'] || tags['operator'];
        if (!name || name.trim().length < 2) continue;

        const street = tags['addr:street'] || '';
        const number = tags['addr:housenumber'] || '';
        const defaultAddress = canonicalGeo ? `${canonicalGeo.canonical_name}` : 'Argentina';
        const address = `${street} ${number}`.trim() || defaultAddress;

        const provinceDisplay = tags['addr:province'] || tags['addr:state'] || canonicalGeo?.province || 'Argentina';
        const cityDisplay = tags['addr:city'] || tags['addr:municipality'] || canonicalGeo?.municipality || canonicalGeo?.display_name || 'Argentina';

        const candidateTag = tags.office || tags.craft || tags.shop || tags.amenity || '';
        const canonicalName = concept?.canonical_name || spec.category;
        const productTitle = `${canonicalName} — ${name.trim()}`;
        const categoryTitle = canonicalName;
        const roleTitle = 'ESTABLISHMENT_SERVICE';

        candidates.push({
          company_name: name.trim(),
          product_name: productTitle,
          category: categoryTitle,
          role: roleTitle,
          rubros: `${canonicalName} ${candidateTag} ${tags.description || ''}`.trim(),
          relation_type: 'ESTABLISHMENT_SERVICE',
          cuit: `OSM-${(el.type || 'EST').toUpperCase()}-${el.id}`,
          osm_id: el.id,
          osm_type: el.type || 'node',
          province: provinceDisplay,
          city: cityDisplay,
          address: address,
          domain: tags.website || tags['contact:website'] || null,
          phone: tags.phone || tags['contact:phone'] || null,
          email: tags.email || tags['contact:email'] || null,
          source_name: 'Directorio Público Abierto de Comercios y Establecimientos (OSM Public Geo-Registry)',
          source_url: 'https://overpass-api.de/api/interpreter',
          source_id: 'SRC_OSM_PUBLIC_ESTABLISHMENTS',
          entity_type: spec.entity_type || 'ESTABLISHMENT',
          row_unit: 'ESTABLISHMENT',
          evidence: {
            osm_node_id: el.id,
            osm_element_type: el.type || 'node',
            latitude: (el.lat !== undefined && el.lat !== null) ? el.lat : el.center?.lat,
            longitude: (el.lon !== undefined && el.lon !== null) ? el.lon : el.center?.lon,
            address: address,
            craft_or_shop: candidateTag,
            canonical_name: canonicalName,
            provenance: 'OpenStreetMap Public Geo-Registry / Overpass API'
          }
        });
      }

      return candidates;
    } catch (err: any) {
      console.warn('[AutonomousSourceDiscovery] Overpass query failed:', err.message);
      throw err;
    }
  }

  /**
   * Discovers relevant open dataset from CKAN portal APIs (e.g. datos.gob.ar)
   */
  private async discoverCkanDatasets(spec: UniversalSemanticSpec): Promise<DiscoveredCandidateSource | null> {
    const queryTerm = spec.product || spec.category.toLowerCase().replace(/_/g, ' ');
    try {
      const ckanUrl = `https://datos.gob.ar/api/3/action/package_search?q=${encodeURIComponent(queryTerm)}&rows=5`;
      const res = await fetch(ckanUrl, {
        headers: { 'User-Agent': 'Atlas-Autonomous-Agent/1.0' },
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) return null;
      const json: any = await res.json();
      const packages: any[] = json.result?.results || [];

      if (packages.length === 0) return null;
      const topPkg = packages[0];
      const csvResource = topPkg.resources?.find((r: any) => r.format?.toUpperCase() === 'CSV' || r.format?.toUpperCase() === 'JSON');
      if (!csvResource) return null;

      const sourceId = `SRC_CKAN_DISC_${topPkg.name?.toUpperCase().replace(/-/g, '_')}`;

      return {
        source_id: sourceId,
        source_name: `${topPkg.title} (Datos Públicos Nacionales)`,
        source_url: csvResource.url,
        source_type: 'CKAN_RESOURCE',
        access_method: csvResource.format?.toUpperCase() === 'CSV' ? 'BULK_CSV' : 'JSON',
        entity_types_supported: [spec.row_unit, spec.entity_type],
        categories_supported: [spec.category],
        relations_supported: [spec.relation],
        geographies_supported: ['ARG / NACIONAL'],
        fetchCandidates: async (limit: number, reqSpec?: UniversalSemanticSpec) => {
          try {
            const understandingEngine = AtlasSourceUnderstandingEngine.getInstance(dbPool);
            const capIR = await understandingEngine.understandSource({
              url: csvResource.url,
              source_name: topPkg.title,
              domain: 'datos.gob.ar'
            });
            const executor = AtlasConnectorExecutor.getInstance(dbPool);
            const execRes = await executor.execute(capIR, undefined, { maxRows: limit, timeoutMs: 8000 });
            return execRes.entities.map(e => ({
              company_name: e.name,
              product_name: e.category,
              category: reqSpec?.category || spec.category,
              role: reqSpec?.relation || spec.relation || 'COMMERCIAL_ENTITY',
              rubros: e.rubros,
              cuit: e.cuit,
              address: e.address,
              province: e.province,
              city: e.city,
              phone: e.phone,
              email: e.email,
              domain: e.website,
              source_name: capIR.source_name,
              source_url: capIR.canonical_url,
              source_id: capIR.source_id,
              entity_type: reqSpec?.entity_type || spec.entity_type || 'COMPANY',
              row_unit: reqSpec?.row_unit || spec.row_unit || 'COMPANY',
              evidence: e.evidence
            }));
          } catch (fetchErr: any) {
            console.warn('[AutonomousSourceDiscovery] Dynamic CKAN execution warning:', fetchErr.message);
            return [];
          }
        }
      };
    } catch (e: any) {
      return null;
    }
  }
}
