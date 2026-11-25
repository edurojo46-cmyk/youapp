/**
 * ATLAS GENERIC COVERAGE & GAP ENGINE V1
 * 
 * Generalizes attribute completeness and gap analysis across all DomainPacks.
 * Replaces hardcoded Person-specific dimensions with domain-declared dimensions.
 * 
 * Invariants:
 * - Zero hardcoding of Person fields for other domains.
 * - Gap states: KNOWN, UNKNOWN, STALE, CONFLICT, BLOCKED_AUTHORITY, NOT_APPLICABLE.
 * - Domain-independent completeness scoring.
 */

import type { AtlasEntity } from '../contracts/AtlasEntity';
import type { AtlasDomainPack } from '../contracts/AtlasDomainPack';

export type GapStatus = 
  | 'KNOWN'
  | 'UNKNOWN'
  | 'STALE'
  | 'CONFLICT'
  | 'BLOCKED_AUTHORITY'
  | 'NOT_APPLICABLE';

export interface DimensionCoverageAudit {
  dimension: string;
  status: GapStatus;
  evidence_present: boolean;
  notes?: string;
}

export interface EntityCoverageReport {
  entity_id: string;
  domain_id: string;
  entity_type: string;
  completeness_score: number;
  completeness_tier: 'RICH' | 'MEDIUM' | 'BASIC' | 'MINIMAL';
  dimensions: Record<string, DimensionCoverageAudit>;
  known_dimensions_count: number;
  total_dimensions_count: number;
  coverage_percentage: number;
}

export class AtlasGenericCoverageEngine {
  /**
   * Audits entity coverage against its DomainPack declared coverage dimensions.
   */
  public static auditEntityCoverage(entity: AtlasEntity, pack: AtlasDomainPack): EntityCoverageReport {
    const declaredDimensions = pack.coverage_dimensions;
    const dimensionsMap: Record<string, DimensionCoverageAudit> = {};
    let knownCount = 0;

    for (const dim of declaredDimensions) {
      const audit = this.evaluateDimension(entity, pack.domain_id, dim);
      dimensionsMap[dim] = audit;
      if (audit.status === 'KNOWN') {
        knownCount++;
      }
    }

    const totalCount = declaredDimensions.length;
    const coveragePct = totalCount > 0 ? Math.round((knownCount / totalCount) * 100) : 0;

    let tier: 'RICH' | 'MEDIUM' | 'BASIC' | 'MINIMAL';
    if (coveragePct >= 80) tier = 'RICH';
    else if (coveragePct >= 50) tier = 'MEDIUM';
    else if (coveragePct >= 25) tier = 'BASIC';
    else tier = 'MINIMAL';

    return {
      entity_id: entity.entity_id,
      domain_id: entity.domain_id,
      entity_type: entity.entity_type,
      completeness_score: coveragePct,
      completeness_tier: tier,
      dimensions: dimensionsMap,
      known_dimensions_count: knownCount,
      total_dimensions_count: totalCount,
      coverage_percentage: coveragePct
    };
  }

  private static evaluateDimension(entity: AtlasEntity, domainId: string, dimension: string): DimensionCoverageAudit {
    const attrs = entity.attributes;

    if (domainId === 'PEOPLE_ARGENTINA') {
      switch (dimension) {
        case 'Identity':
          return {
            dimension,
            status: attrs.full_name ? 'KNOWN' : 'UNKNOWN',
            evidence_present: !!attrs.identity_anchor_hash
          };
        case 'Work':
          return {
            dimension,
            status: (attrs.organization || attrs.job_title || attrs.normalized_profession) ? 'KNOWN' : 'UNKNOWN',
            evidence_present: !!attrs.source_id
          };
        case 'Geography':
          return {
            dimension,
            status: attrs.province ? 'KNOWN' : 'UNKNOWN',
            evidence_present: true
          };
        case 'Contact':
          return {
            dimension,
            status: (attrs.public_email || attrs.public_phone) ? 'KNOWN' : 'UNKNOWN',
            evidence_present: !!attrs.public_email
          };
        case 'Social':
          return {
            dimension,
            status: (attrs.social_profiles && attrs.social_profiles.length > 0) ? 'KNOWN' : 'UNKNOWN',
            evidence_present: attrs.social_profiles && attrs.social_profiles.length > 0
          };
        case 'Evidence':
          return {
            dimension,
            status: attrs.source_id ? 'KNOWN' : 'UNKNOWN',
            evidence_present: !!attrs.source_id
          };
        default:
          return { dimension, status: 'NOT_APPLICABLE', evidence_present: false };
      }
    } else if (domainId === 'PROCUREMENT_ARGENTINA') {
      switch (dimension) {
        case 'Agency':
          return {
            dimension,
            status: attrs.agency ? 'KNOWN' : 'UNKNOWN',
            evidence_present: !!attrs.agency
          };
        case 'Jurisdiction':
          return {
            dimension,
            status: attrs.jurisdiction ? 'KNOWN' : 'UNKNOWN',
            evidence_present: !!attrs.jurisdiction
          };
        case 'Sector':
          return {
            dimension,
            status: attrs.sector ? 'KNOWN' : 'UNKNOWN',
            evidence_present: !!attrs.sector
          };
        case 'Amount':
          return {
            dimension,
            status: (attrs.amount !== undefined && attrs.amount !== null && attrs.amount > 0) ? 'KNOWN' : 'UNKNOWN',
            evidence_present: !!attrs.amount
          };
        case 'Dates':
          return {
            dimension,
            status: (attrs.publication_date || attrs.closing_date) ? 'KNOWN' : 'UNKNOWN',
            evidence_present: !!attrs.closing_date
          };
        case 'Status':
          return {
            dimension,
            status: attrs.status ? 'KNOWN' : 'UNKNOWN',
            evidence_present: !!attrs.status
          };
        case 'Evidence':
          return {
            dimension,
            status: (attrs.source_url && attrs.process_number) ? 'KNOWN' : 'UNKNOWN',
            evidence_present: !!attrs.source_url
          };
        default:
          return { dimension, status: 'NOT_APPLICABLE', evidence_present: false };
      }
    }

    // Generic fallback
    const val = attrs[dimension.toLowerCase()];
    return {
      dimension,
      status: val ? 'KNOWN' : 'UNKNOWN',
      evidence_present: !!val
    };
  }
}
