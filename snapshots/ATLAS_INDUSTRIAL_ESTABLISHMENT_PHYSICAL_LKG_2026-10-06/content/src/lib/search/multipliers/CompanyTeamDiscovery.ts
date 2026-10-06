/**
 * Company Team Discovery Engine
 * Directives:
 * 13. PRIORITY 5 — COMPANIES (public company websites: /team, /equipo, /nosotros, /leadership, /staff)
 * 14. COMPANY TEAM PAGE DISCOVERY (CompanyTeamDiscovery capability)
 * 16. BUSINESS_LISTING_AS_PERSON = 0 (never treat company name or listing as person)
 * 24. BUSINESS_AS_PERSON_FALSE_POSITIVES = 0
 * 70. PERSON_WITHOUT_EVIDENCE = 0
 */

import { SocialEntityClassifier } from '../social/SocialEntityClassifier';

export interface CompanyTeamMemberCandidate {
  person_name: string;
  role: string;
  organization: string;
  organization_domain: string;
  source_page_url: string;
  source_page_type: 'TEAM' | 'LEADERSHIP' | 'ABOUT' | 'STAFF' | 'PARTNERS';
  geographic_evidence: string;
  neighborhood: string;
  public_email?: string;
  public_phone?: string;
  linkedin_url?: string;
  fetched_at: string;
}

export interface CompanyTeamPageScanResult {
  organization_name: string;
  domain: string;
  caba_neighborhood: string;
  pages_scanned: string[];
  team_members_discovered: CompanyTeamMemberCandidate[];
  is_caba_located: boolean;
}

export class CompanyTeamDiscovery {
  /**
   * Recognized team and leadership page path patterns.
   */
  public static readonly TEAM_PATH_PATTERNS = [
    '/team',
    '/equipo',
    '/nosotros',
    '/leadership',
    '/management',
    '/staff',
    '/professionals',
    '/partners',
    '/about',
    '/quienes-somos',
    '/directorio'
  ];

  /**
   * Validates whether candidate name represents a genuine human individual and not a business or department.
   */
  public static validatePersonName(candidateName: string, contextText: string = ''): boolean {
    if (!candidateName || candidateName.trim().length < 4) return false;
    const cl = SocialEntityClassifier.classify(candidateName, contextText);
    return cl.is_person && cl.entity_type === 'PERSON';
  }

  /**
   * Extracts clean human members from structured team profiles.
   */
  public static filterValidMembers(rawMembers: CompanyTeamMemberCandidate[]): CompanyTeamMemberCandidate[] {
    return rawMembers.filter(m => {
      // 1. Name must be certified as PERSON
      if (!CompanyTeamDiscovery.validatePersonName(m.person_name, `${m.role} en ${m.organization}`)) {
        return false;
      }
      // 2. Geographic evidence must exist in CABA
      if (!m.neighborhood || !m.geographic_evidence) {
        return false;
      }
      // 3. Must have source page URL
      if (!m.source_page_url || !m.source_page_url.startsWith('http')) {
        return false;
      }
      return true;
    });
  }
}
