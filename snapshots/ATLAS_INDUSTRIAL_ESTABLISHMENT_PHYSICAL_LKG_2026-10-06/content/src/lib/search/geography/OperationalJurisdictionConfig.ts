/**
 * Operational Jurisdiction & National Geography Architecture
 * Directives:
 * 1. ACTIVE_DISCOVERY_JURISDICTIONS = ["CABA"]
 * 3. NATIONAL GEOGRAPHIC MODEL (COUNTRY -> PROVINCE / AUTONOMOUS_CITY -> DEPARTMENT / PARTIDO / COMMUNE -> MUNICIPALITY / LOCALITY / CITY -> NEIGHBORHOOD)
 * 4. NATIONAL QUERY READINESS: resolve non-active jurisdictions with COVERAGE_NOT_ACTIVE without mass ingestion
 * 26 & 27. ARGENTINA ADDRESS RESOLVER INTERFACE & CABA IMPLEMENTATION
 */

import { CABA_48_NEIGHBORHOODS, CABA_COMMUNES, CabaNeighborhood } from './CabaGeographyCatalog';

export type NationalGeographyLevel = 
  | 'COUNTRY'
  | 'AUTONOMOUS_CITY'
  | 'PROVINCE'
  | 'DEPARTMENT'
  | 'PARTIDO'
  | 'COMMUNE'
  | 'MUNICIPALITY'
  | 'LOCALITY'
  | 'CITY'
  | 'NEIGHBORHOOD';

export const ACTIVE_DISCOVERY_JURISDICTIONS: readonly string[] = ['CABA'];

export interface OperationalCoverageCheck {
  is_active: boolean;
  jurisdiction: string;
  coverage_status: 'ACTIVE_DISCOVERY' | 'COVERAGE_NOT_ACTIVE';
  message: string;
}

export class OperationalJurisdictionManager {
  public static readonly ACTIVE_JURISDICTIONS = ['CABA'] as const;

  /**
   * Checks if a resolved geography falls within the active discovery jurisdiction.
   */
  public static checkJurisdictionCoverage(geographyNameOrId: string): OperationalCoverageCheck {
    const norm = (geographyNameOrId || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();

    // Check if within CABA or any CABA neighborhood/commune
    const isCaba = norm.includes('CABA') || 
                   norm.includes('BUENOS AIRES') && !norm.includes('PROVINCIA') && !norm.includes('LA PLATA') ||
                   norm.includes('CIUDAD AUTONOMA') ||
                   norm.includes('COMUNA ') ||
                   CABA_48_NEIGHBORHOODS.some(b => b.normalized_name === norm || b.aliases.includes(norm) || norm.includes(b.normalized_name));

    if (isCaba) {
      return {
        is_active: true,
        jurisdiction: 'CABA',
        coverage_status: 'ACTIVE_DISCOVERY',
        message: 'Jurisdicción activa de descubrimiento territorial (CABA — Comunas 1 a 15, 48 Barrios).'
      };
    }

    // Detected other Argentine jurisdictions (e.g. Córdoba, Rosario, Mendoza, La Plata)
    const detectedJurisdiction = norm.includes('CORDOBA') ? 'CÓRDOBA'
      : norm.includes('ROSARIO') || norm.includes('SANTA FE') ? 'SANTA FE / ROSARIO'
      : norm.includes('MENDOZA') ? 'MENDOZA'
      : norm.includes('LA PLATA') ? 'BUENOS AIRES (LA PLATA)'
      : 'ARGENTINA (OTRA)';

    return {
      is_active: false,
      jurisdiction: detectedJurisdiction,
      coverage_status: 'COVERAGE_NOT_ACTIVE',
      message: `Geografía reconocida (${detectedJurisdiction}) pero la cobertura masiva en vivo está actualmente inactiva. Cobertura activa exclusiva en CABA.`
    };
  }
}

export interface ResolvedArgentinaAddress {
  raw_address: string;
  normalized_street?: string;
  neighborhood?: string;
  commune_number?: number;
  commune_id?: string;
  city: string;
  province_or_autonomous_city: string;
  country: 'ARGENTINA';
  confidence: 'HIGH' | 'MEDIUM' | 'APPROXIMATE';
  evidence_anchor: string;
}

/**
 * Generic Argentina Address Resolver Interface (Directive Section 27)
 */
export interface ArgentinaAddressResolver {
  resolveAddress(rawAddress: string, contextCityOrProvince?: string): ResolvedArgentinaAddress;
}

/**
 * CABA Address Resolver Implementation (Directive Section 26 & 27)
 * Intersects street names / numbers against official CABA neighborhood and commune geometry/anchors.
 */
export class CabaAddressResolver implements ArgentinaAddressResolver {
  public resolveAddress(rawAddress: string, _context?: string): ResolvedArgentinaAddress {
    const norm = (rawAddress || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    // 1. Check explicit neighborhood match
    for (const b of CABA_48_NEIGHBORHOODS) {
      const bNorm = b.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (norm.includes(bNorm) || b.aliases.some(a => norm.includes(a.toLowerCase()))) {
        return {
          raw_address: rawAddress,
          neighborhood: b.name,
          commune_number: b.commune_number,
          commune_id: b.commune_id,
          city: 'Ciudad Autónoma de Buenos Aires',
          province_or_autonomous_city: 'CABA',
          country: 'ARGENTINA',
          confidence: 'HIGH',
          evidence_anchor: `Anclaje fáctico directo por mención de barrio oficial: ${b.name} (Comuna ${b.commune_number})`
        };
      }
    }

    // 2. Check key streets & spatial anchors per neighborhood
    for (const b of CABA_48_NEIGHBORHOODS) {
      for (const st of b.key_streets_anchors) {
        const stNorm = st.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (norm.includes(stNorm)) {
          return {
            raw_address: rawAddress,
            neighborhood: b.name,
            commune_number: b.commune_number,
            commune_id: b.commune_id,
            city: 'Ciudad Autónoma de Buenos Aires',
            province_or_autonomous_city: 'CABA',
            country: 'ARGENTINA',
            confidence: 'MEDIUM',
            evidence_anchor: `Anclaje por arteria o hito espacial: ${st} -> ${b.name} (Comuna ${b.commune_number})`
          };
        }
      }
    }

    // Default fallback to CABA generic
    return {
      raw_address: rawAddress,
      city: 'Ciudad Autónoma de Buenos Aires',
      province_or_autonomous_city: 'CABA',
      country: 'ARGENTINA',
      confidence: 'APPROXIMATE',
      evidence_anchor: 'Dirección física situada en Ciudad Autónoma de Buenos Aires'
    };
  }
}
