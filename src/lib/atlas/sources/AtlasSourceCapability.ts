/**
 * ATLAS SOURCE GENOME V1
 * Module: AtlasSourceCapability.ts
 * Path: src/lib/atlas/sources/AtlasSourceCapability.ts
 * 
 * Declarative capability schema for Sources and Source Routes.
 * Invariants:
 * 1. No synthetic capabilities.
 * 2. CAPABILITY != COVERAGE: Having neighborhood granularity (capability)
 *    is NOT enough if actual_geo_coverage has data only in Palermo and mission requests Caballito.
 */

export type SourceEntityType = 'PERSON' | 'COMPANY' | 'ORGANIZATION' | 'ESTABLISHMENT' | 'PROFESSIONAL';
export type SourceGeoLevel = 'COUNTRY' | 'PROVINCE' | 'CITY' | 'LOCALITY' | 'NEIGHBORHOOD';
export type SourceSignal = 'EMAIL' | 'PHONE' | 'LINKEDIN' | 'WEBSITE' | 'FACEBOOK' | 'INSTAGRAM';

export interface TypedGeoCoverage {
  level: SourceGeoLevel;
  canonical_id: string;
  name: string;
  parent_id?: string;
}

export function normalizeGeoCoverage(coverage: (string | TypedGeoCoverage)[]): TypedGeoCoverage[] {
  return (coverage || []).map(item => {
    if (typeof item === 'object' && item !== null && 'level' in item && 'name' in item) {
      return item as TypedGeoCoverage;
    }
    const raw = String(item).trim();
    const str = raw.toUpperCase();
    if (['ARGENTINA', 'NACIONAL', 'ALL', 'AR'].includes(str)) {
      return { level: 'COUNTRY', canonical_id: 'AR', name: 'Argentina' };
    }
    if (['CABA', 'BUENOS AIRES', 'CÓRDOBA', 'CORDOBA', 'MENDOZA', 'SANTA FE', 'RÍO NEGRO', 'RIO NEGRO', 'ENTRE RÍOS', 'ENTRE RIOS'].includes(str)) {
      return { level: 'PROVINCE', canonical_id: str, name: raw, parent_id: 'AR' };
    }
    if (['PALERMO', 'CABALLITO', 'BELGRANO', 'RECOLETA', 'FLORES', 'SAN NICOLÁS', 'SAN NICOLAS'].includes(str)) {
      return { level: 'NEIGHBORHOOD', canonical_id: str, name: raw, parent_id: 'CABA' };
    }
    return { level: 'CITY', canonical_id: str, name: raw, parent_id: 'AR' };
  });
}

export interface AtlasSourceCapability {
  supports_person: boolean;
  supports_company: boolean;
  supports_email: boolean;
  supports_phone: boolean;
  supports_linkedin: boolean;
  supports_website?: boolean;
  supports_facebook?: boolean;
  supports_instagram?: boolean;
  supported_entity_types: string[];
  supported_geo_levels: string[];
  supported_provinces: string[];

  /**
   * ACTUAL PHYSICAL COVERAGE (TYPED):
   * Structured geographic coverage separating levels explicitly.
   */
  actual_geo_coverage: (string | TypedGeoCoverage)[];
  typed_geo_coverage?: TypedGeoCoverage[];

  has_neighborhood_evidence: boolean;
  has_email_evidence: boolean;
  has_phone_evidence: boolean;
  has_linkedin_evidence: boolean;
  verified_attributes: string[];
}

export interface MissionCompatibilitySpec {
  entity_type?: string;
  geo_country?: string;
  geo_province?: string;
  geo_city?: string;
  geo_neighborhood?: string | null;
  required_geo_level?: string;
  required_signals?: string[];
  target?: number;
}

export interface CompatibilityEvaluation {
  compatible: boolean;
  score: number; // 0 to 100
  reasons: string[];
  entity_match: boolean;
  geo_match: boolean;
  signal_match: boolean;
}

export class AtlasSourceCapabilityMatcher {
  /**
   * Universal evaluator checking whether source capability satisfies a mission spec.
   * Strictly enforces: CAPABILITY != COVERAGE.
   */
  public static evaluate(
    cap: AtlasSourceCapability,
    spec: MissionCompatibilitySpec
  ): CompatibilityEvaluation {
    const reasons: string[] = [];
    let score = 50;

    // 1. Entity Type Matching
    const requestedEntity = (spec.entity_type || 'COMPANY').toUpperCase();
    let entityMatch = false;
    if (requestedEntity === 'PERSON' || requestedEntity === 'PERSONA' || requestedEntity === 'PROFESSIONAL') {
      entityMatch = cap.supports_person || cap.supported_entity_types.includes('PERSON') || cap.supported_entity_types.includes('PROFESSIONAL');
    } else {
      entityMatch = cap.supports_company || cap.supported_entity_types.includes('COMPANY') || cap.supported_entity_types.includes('EMPRESA') || cap.supported_entity_types.includes('ESTABLISHMENT');
    }

    if (!entityMatch) {
      reasons.push(`Incompatible entity: source does not support ${requestedEntity}`);
      return { compatible: false, score: 0, reasons, entity_match: false, geo_match: false, signal_match: false };
    }
    score += 15;

    // 2. Geographic Granularity Matching
    const reqGeoLevel = (spec.required_geo_level || 'PROVINCE').toUpperCase();
    if (reqGeoLevel === 'NEIGHBORHOOD' && !cap.has_neighborhood_evidence) {
      reasons.push('Requires neighborhood-level evidence but source lacks neighborhood granularity');
      return { compatible: false, score: 0, reasons, entity_match: true, geo_match: false, signal_match: false };
    }

    // 3. Province Matching
    const reqProv = spec.geo_province ? spec.geo_province.toUpperCase().trim() : null;
    if (reqProv && !cap.supported_provinces.includes('ALL') && !cap.supported_provinces.includes('NACIONAL') && !cap.supported_provinces.includes('ARGENTINA')) {
      const provMatch = cap.supported_provinces.some(p => p.toUpperCase() === reqProv || reqProv.includes(p.toUpperCase()) || p.toUpperCase().includes(reqProv));
      if (!provMatch) {
        reasons.push(`Source provinces [${cap.supported_provinces.join(', ')}] do not include requested province ${reqProv}`);
        return { compatible: false, score: 0, reasons, entity_match: true, geo_match: false, signal_match: false };
      }
    }

    // 4. ACTUAL GEO COVERAGE vs REQUESTED LOCALITY / NEIGHBORHOOD
    // Strict Invariant: Having neighborhood capability does NOT mean having Caballito data if actual coverage is only Palermo!
    const reqNeighborhood = spec.geo_neighborhood ? spec.geo_neighborhood.toUpperCase().trim() : null;
    const typedCoverage = normalizeGeoCoverage(cap.actual_geo_coverage || []);

    if (reqNeighborhood) {
      const coversNeighborhood = typedCoverage.some(cov => {
        if (cov.level === 'COUNTRY' && ['AR', 'ALL', 'ARGENTINA'].includes(cov.canonical_id)) return true;
        if (cov.canonical_id === 'CABA' && cov.level === 'PROVINCE') return true;
        return cov.canonical_id === reqNeighborhood || cov.name.toUpperCase() === reqNeighborhood;
      });

      if (!coversNeighborhood) {
        reasons.push(`Actual coverage does not contain requested neighborhood ${reqNeighborhood}`);
        return { compatible: false, score: 0, reasons, entity_match: true, geo_match: false, signal_match: false };
      }
    }

    score += 15;

    // 5. Required Signals Matching
    let signalMatch = true;
    const reqSignals = (spec.required_signals || []).map(s => s.toUpperCase());
    for (const sig of reqSignals) {
      if (sig === 'EMAIL' && !cap.supports_email) {
        signalMatch = false;
        reasons.push('Missing required signal: EMAIL');
      } else if (sig === 'PHONE' && !cap.supports_phone) {
        signalMatch = false;
        reasons.push('Missing required signal: PHONE');
      } else if (sig === 'LINKEDIN' && !cap.supports_linkedin) {
        signalMatch = false;
        reasons.push('Missing required signal: LINKEDIN');
      }
    }

    if (!signalMatch) {
      return { compatible: false, score: 0, reasons, entity_match: true, geo_match: true, signal_match: false };
    }
    score += 20;

    return {
      compatible: true,
      score: Math.min(100, score),
      reasons: ['Satisfies entity, actual geographic coverage, and required signals'],
      entity_match: true,
      geo_match: true,
      signal_match: true
    };
  }
}
