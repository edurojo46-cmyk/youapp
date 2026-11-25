import { StructuredClaim, PolicyRules } from './types';

export class ClaimValidator {
  
  static validate(claims: StructuredClaim[], policy: PolicyRules): { isValid: boolean, reason: string | null } {
    for (const claim of claims) {
      if (claim.support_status === 'STYLISTIC') {
        continue;
      }
      
      if (this.isSensitiveInferredClaim(claim.type)) {
        return { isValid: false, reason: `Sensitive inferred claim type ${claim.type} is strictly prohibited` };
      }

      if (policy.forbidden_claim_types.includes(claim.type)) {
        return { isValid: false, reason: `Claim type ${claim.type} is explicitly FORBIDDEN by policy` };
      }

      if (claim.support_status === 'UNSUPPORTED' || 
          claim.support_status === 'CONFLICT' || 
          claim.support_status === 'STALE' || 
          claim.support_status === 'FORBIDDEN') {
        return { isValid: false, reason: `Claim ${claim.id} of type ${claim.type} is ${claim.support_status}` };
      }
    }

    return { isValid: true, reason: null };
  }

  private static isSensitiveInferredClaim(type: string): boolean {
    const sensitive = [
      'POLITICAL_IDEOLOGY',
      'RELIGION',
      'HEALTH_STATUS',
      'RACE',
      'SEXUAL_ORIENTATION',
      'INTIMATE_LIFE',
      'AFFORDABILITY_INFERRED'
    ];
    return sensitive.includes(type);
  }
}
