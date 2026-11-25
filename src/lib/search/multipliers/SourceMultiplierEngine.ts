/**
 * Source Multiplier Engine — Flywheel Architecture for Exponential Discovery
 * 
 * CORE FLYWHEEL:
 * DISCOVER ORGANIZATION
 * ↓
 * DISCOVER PEOPLE
 * ↓
 * VALIDATE PEOPLE
 * ↓
 * DISCOVER ADDITIONAL SOURCES
 * ↓
 * ENRICH PEOPLE
 * ↓
 * CROSS-SOURCE VERIFY
 * ↓
 * DISCOVER MORE ORGANIZATIONS
 * ↓
 * REPEAT
 */

export type SourceScaleCategory = 
  | 'MICRO_SOURCE'    // 1–24 people
  | 'SMALL_SOURCE'    // 25–99 people
  | 'MEDIUM_SOURCE'   // 100–999 people
  | 'LARGE_SOURCE'    // 1,000–9,999 people
  | 'MASS_SOURCE';    // 10,000+ people

export interface MultiplierOrganization {
  organization_id: string;
  name: string;
  type: 'HOSPITAL' | 'UNIVERSITY' | 'FACULTY' | 'INSTITUTE' | 'COMPANY' | 'CHAMBER' | 'ASSOCIATION' | 'EVENT' | 'RESEARCH_CENTER';
  website_url: string;
  caba_neighborhood: string;
  street_address?: string;
  has_team_page: boolean;
  team_page_url?: string;
  has_staff_directory: boolean;
  staff_directory_url?: string;
  has_public_social: boolean;
  social_urls?: string[];
  has_publications: boolean;
  has_events: boolean;
  discovered_people_count: number;
}

export interface SourceCandidate {
  source_id: string;
  source_name: string;
  source_type: string;
  domain: string;
  geographic_scope: 'CABA' | 'NEIGHBORHOOD' | 'ARGENTINA';
  estimated_universe: number;
  is_enumerable: boolean;
  is_paginated: boolean;
  is_structured: boolean;
  public_access: 'OPEN' | 'LOOKUP_ONLY' | 'ACCESS_REQUIRED';
  scale_category: SourceScaleCategory;
  raw_records_yield: number;
  validated_people_yield: number;
  activation_status: 'CONFIGURED' | 'DISCOVERED_UNVERIFIED' | 'VERIFIED' | 'PHYSICALLY_ACTIVE' | 'ENUMERABLE';
}

export interface MultiplierRunMetrics {
  organizations_discovered: number;
  organizations_with_team_page: number;
  organizations_with_directory: number;
  new_persons_from_org_multiplier: number;
  new_sources_discovered_from_multiplier: number;
  persons_enriched_cross_source: number;
}

export class SourceMultiplierEngine {
  private static organizations: Map<string, MultiplierOrganization> = new Map();
  private static sources: Map<string, SourceCandidate> = new Map();

  /**
   * Registers a newly discovered organization into the multiplier pool.
   */
  public static registerOrganization(org: MultiplierOrganization): void {
    SourceMultiplierEngine.organizations.set(org.organization_id, org);
  }

  /**
   * Evaluates scale category based on empirical or reported retrievable universe.
   */
  public static calculateScaleCategory(count: number): SourceScaleCategory {
    if (count >= 10000) return 'MASS_SOURCE';
    if (count >= 1000) return 'LARGE_SOURCE';
    if (count >= 100) return 'MEDIUM_SOURCE';
    if (count >= 25) return 'SMALL_SOURCE';
    return 'MICRO_SOURCE';
  }

  /**
   * Returns current multiplier telemetry.
   */
  public static getMetrics(): MultiplierRunMetrics {
    const orgs = Array.from(SourceMultiplierEngine.organizations.values());
    return {
      organizations_discovered: orgs.length,
      organizations_with_team_page: orgs.filter(o => o.has_team_page).length,
      organizations_with_directory: orgs.filter(o => o.has_staff_directory).length,
      new_persons_from_org_multiplier: orgs.reduce((acc, o) => acc + o.discovered_people_count, 0),
      new_sources_discovered_from_multiplier: SourceMultiplierEngine.sources.size,
      persons_enriched_cross_source: 0
    };
  }
}
