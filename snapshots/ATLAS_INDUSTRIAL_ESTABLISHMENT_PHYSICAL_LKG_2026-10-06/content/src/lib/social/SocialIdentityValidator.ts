export interface ValidationContext {
  subject_id: string;
  display_name: string | null;
  profession: string | null;
  role: string | null;
  organization: string | null;
  known_source_url?: string;
}

export interface CandidateSocial {
  platform: string;
  profile_url: string;
  handle?: string;
  discovery_source_url: string;
  evidence_type: 'JSON_LD' | 'REL_ME' | 'STAFF_PAGE' | 'PERSON_CARD_LINK' | 'ORCID' | 'CROSS_LINK' | 'PUBLIC_WEB_SEARCH';
  ai_confidence?: number;
}

export interface ValidationResult {
  identity_status: 'VERIFIED' | 'PROBABLE' | 'POSSIBLE' | 'REJECTED';
  reason_code: string;
}

export class SocialIdentityValidator {
  static validate(context: ValidationContext, candidate: CandidateSocial): ValidationResult {
    // Enforce invariants: No name-only auto-assignments if context is weak
    if (!context.organization && !context.role && !context.profession) {
      if (candidate.evidence_type === 'PUBLIC_WEB_SEARCH') {
        return { identity_status: 'REJECTED', reason_code: 'REJECTED_NAME_ONLY' };
      }
    }

    // Company social leak invariant
    if (this.isCompanySocialURL(candidate.profile_url, context.display_name)) {
      return { identity_status: 'REJECTED', reason_code: 'REJECTED_ORGANIZATION_PROFILE' };
    }

    // Deterministic strong signals
    if (candidate.evidence_type === 'JSON_LD' || candidate.evidence_type === 'REL_ME' || candidate.evidence_type === 'PERSON_CARD_LINK') {
      // If it comes directly from a validated structural source, we verify it
      return { identity_status: 'VERIFIED', reason_code: `VERIFIED_${candidate.evidence_type}` };
    }
    
    // Weak deterministic signal (page-wide links)
    if (candidate.evidence_type === 'STAFF_PAGE') {
      // Never verify STAFF_PAGE automatically without a structural person card.
      // But we can check if the handle strongly resembles the person's name as a weak signal.
      if (this.handleResemblesName(candidate.profile_url, context.display_name)) {
          return { identity_status: 'POSSIBLE', reason_code: 'POSSIBLE_HANDLE_SIMILARITY' };
      }
      return { identity_status: 'REJECTED', reason_code: 'REJECTED_OTHER_PERSON_CARD' };
    }

    if (candidate.evidence_type === 'ORCID') {
      return { identity_status: 'VERIFIED', reason_code: 'VERIFIED_ORCID_RESEARCHER_URL' };
    }

    if (candidate.evidence_type === 'CROSS_LINK') {
      return { identity_status: 'VERIFIED', reason_code: 'VERIFIED_CROSS_LINK' };
    }

    // Gemini/Public Web Search fallbacks
    if (candidate.evidence_type === 'PUBLIC_WEB_SEARCH') {
      // AI confidence must be extremely high and we need structural context
      if (candidate.ai_confidence && candidate.ai_confidence > 0.8) {
        if (context.organization || context.role) {
           return { identity_status: 'VERIFIED', reason_code: 'VERIFIED_MULTI_ATTRIBUTE_MATCH_HIGH_CONFIDENCE' };
        }
      }
      if (candidate.ai_confidence && candidate.ai_confidence > 0.6) {
        return { identity_status: 'PROBABLE', reason_code: 'PROBABLE_MULTI_ATTRIBUTE_MATCH' };
      }
      
      return { identity_status: 'POSSIBLE', reason_code: 'POSSIBLE_CONTEXT_MATCH' };
    }

    return { identity_status: 'REJECTED', reason_code: 'REJECTED_INSUFFICIENT_EVIDENCE' };
  }

  private static isCompanySocialURL(url: string, personName: string | null): boolean {
    const lowerUrl = url.toLowerCase();
    // Common company paths or keywords that suggest it's a corporate account
    if (lowerUrl.includes('/company/')) return true; // LinkedIn company page
    if (lowerUrl.includes('/school/')) return true; // LinkedIn school page
    
    // If the URL ends with terms like "ministerio", "gobierno", "argentina", "buenosaires"
    if (lowerUrl.match(/(ministerio|gobierno|argentina|buenosaires|gcba|agencia|secretaria)/i)) {
      // Exception: unless the person's name actually contains these (rare)
      if (personName && personName.toLowerCase().includes('ministerio')) return false;
      return true;
    }
    
    return false;
  }

  private static handleResemblesName(url: string, personName: string | null): boolean {
    if (!personName) return false;
    
    const urlParts = url.split('/');
    const handle = urlParts[urlParts.length - 1].toLowerCase().replace(/[^a-z0-9]/g, '');
    
    const nameParts = personName.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(p => p.length > 2);
    if (nameParts.length === 0) return false;
    
    // Weak signal: if handle contains both first and last name, or a strong combo
    let matchCount = 0;
    for (const part of nameParts) {
      if (handle.includes(part)) {
         matchCount++;
      }
    }
    
    return matchCount >= Math.min(2, nameParts.length);
  }
}
