import { AllowedFactSet, AIProposedDraft, PolicyRules, ChannelType } from './types';

export class AIDraftingInterface {
  static async generateDraft(
    factSet: AllowedFactSet,
    channel: ChannelType,
    policy: PolicyRules,
    language: string,
    tone: string
  ): Promise<{ draft: AIProposedDraft | null, errorType: 'OPERATIONAL' | 'SEMANTIC' | null, reason: string | null }> {
    
    // In a real implementation, this would call an LLM with strict system prompts:
    // "You are an AI drafter. You can only use the claims provided in the context."
    // "Return a JSON object with: { text, subject_line, used_claim_ids, used_cta_id, language, channel }"
    
    // For 10E-B certification, we mock the AI call to ensure 0 external requests 
    // and predictable responses for our matrix.
    
    // We will simulate AI output based on a specific test claim.
    const hasIntent = factSet.facts.find(f => f.claim_type === 'FIRST_PARTY_INTENT');
    const hasOffer = factSet.facts.find(f => f.claim_type === 'OFFER_PRICE');
    
    // Simulate failure fallback if policy disallows AI (treated as operational for testing deterministic fallback)
    if (policy.ai_generation_allowed === false) {
      return { draft: null, errorType: 'OPERATIONAL', reason: 'AI disabled' };
    }
    
    // Simulate an explicit OPERATIONAL failure if requested via test claims
    if (factSet.facts.find(f => f.claim_type === 'TEST_OPERATIONAL_FAILURE')) {
       return { draft: null, errorType: 'OPERATIONAL', reason: 'Provider Unavailable' };
    }

    // Simulate an explicit SEMANTIC failure if requested (e.g., hallucinated text but before reconciler)
    if (factSet.facts.find(f => f.claim_type === 'TEST_SEMANTIC_FAILURE')) {
       return { draft: null, errorType: 'SEMANTIC', reason: 'AI refused to draft or generated forbidden structure' };
    }

    const used_claim_ids: string[] = [];
    if (hasOffer) used_claim_ids.push(hasOffer.claim_id);
    if (hasIntent) used_claim_ids.push(hasIntent.claim_id);

    // If there is an unsupported test claim, the AI might hallucinate it. We'll simulate this if requested.
    const hallucinate = factSet.facts.find(f => f.claim_type === 'HALLUCINATED_TEST_CLAIM');
    if (hallucinate) {
      used_claim_ids.push('invalid-claim-id-123'); // AI hallucinated an unknown claim ID
    }

    let text = `AI Generated Content for ${channel}. `;
    if (hasOffer) text += `Price is ${hasOffer.structured_value?.price}. `;
    
    // Enforce max length mock
    if (policy.max_length && text.length > policy.max_length) {
      text = text.substring(0, policy.max_length);
    }

    return {
      draft: {
        text,
        subject_line: policy.subject_allowed ? 'AI Subject' : null,
        used_claim_ids,
        used_cta_id: policy.cta_allowed ? 'cta_123' : null,
        language,
        channel
      },
      errorType: null,
      reason: null
    };
  }
}
