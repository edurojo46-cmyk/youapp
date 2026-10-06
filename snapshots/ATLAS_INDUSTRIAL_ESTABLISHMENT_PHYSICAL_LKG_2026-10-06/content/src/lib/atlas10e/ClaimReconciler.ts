import { AllowedFactSet, AIProposedDraft, StructuredClaim, SupportStatus } from './types';
import * as crypto from 'crypto';

export class ClaimReconciler {
  static reconcile(
    aiDraft: AIProposedDraft,
    factSet: AllowedFactSet
  ): { isValid: boolean, claims: StructuredClaim[], reason: string | null } {
    
    const structuredClaims: StructuredClaim[] = [];

    // 1. Verify that every used_claim_id actually exists in the AllowedFactSet
    for (const claimId of aiDraft.used_claim_ids) {
      const canonicalFact = factSet.facts.find(f => f.claim_id === claimId);
      
      if (!canonicalFact) {
        return { 
          isValid: false, 
          claims: [], 
          reason: `AI hallucinated unknown claim ID: ${claimId}` 
        };
      }

      // Convert canonical fact to StructuredClaim for downstream validation
      structuredClaims.push({
        id: crypto.randomUUID(),
        type: canonicalFact.claim_type,
        text: JSON.stringify(canonicalFact.structured_value),
        value: canonicalFact.structured_value,
        support_status: canonicalFact.freshness === 'STALE' ? 'STALE' : 'SUPPORTED',
        evidence_links: canonicalFact.evidence_ref ? [canonicalFact.evidence_ref] : []
      });
    }

    // 2. Add stylistic claim for the generic AI text
    structuredClaims.push({
      id: crypto.randomUUID(),
      type: 'AI_GENERATED_TEXT',
      text: aiDraft.text,
      value: null,
      support_status: 'STYLISTIC',
      evidence_links: []
    });

    return { isValid: true, claims: structuredClaims, reason: null };
  }
}
