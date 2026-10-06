import type { GeminiCandidate } from './GeminiSchemas';

export interface ValidationConstraints {
  requiredProfession?: string;
  requiredLocation?: string;
}

export class GeminiEvidenceValidator {
  
  /**
   * Validates a Gemini candidate against hard constraints.
   * A candidate may NOT reach unified search solely because Gemini returned it.
   */
  public static validate(candidate: GeminiCandidate, constraints: ValidationConstraints): boolean {
    // 1. Must have evidence URLs
    if (!candidate.evidence || candidate.evidence.length === 0) {
      return false;
    }
    
    // Validate URLs actually exist and have domains
    const hasValidUrl = candidate.evidence.some(e => e.url && e.domain);
    if (!hasValidUrl) {
      return false;
    }

    // 2. Must match required profession
    if (constraints.requiredProfession) {
      const required = constraints.requiredProfession.toLowerCase();
      // If candidate has a profession claim, it should match or be somewhat semantically close.
      // For V1, we do a basic lexical check on the claim or role. In reality, we'd use the ProfessionConceptResolver.
      const profClaim = (candidate.professionClaim || '').toLowerCase();
      const roleClaim = (candidate.roleClaim || '').toLowerCase();
      
      if (!profClaim.includes(required) && !roleClaim.includes(required)) {
        return false;
      }
    }

    // 3. Must match required location
    if (constraints.requiredLocation) {
       const requiredLoc = constraints.requiredLocation.toLowerCase().trim();
       const locClaim = (candidate.locationClaim || '').toLowerCase().trim();
       
       const isBsAs = (s: string) => s.includes('caba') || s.includes('buenos aires') || s.includes('capital federal');
       if (isBsAs(requiredLoc) && isBsAs(locClaim)) {
         return true;
       }

       if (!locClaim.includes(requiredLoc) && !requiredLoc.includes(locClaim)) {
         return false;
       }
    }

    return true;
  }
}
