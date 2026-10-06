import { FactPack } from './evidence_resolver';
import { LLMClaim } from './llm_adapter';

export interface ValidatedClaim extends LLMClaim {
    validation_status: 'SUPPORTED' | 'UNSUPPORTED' | 'AMBIGUOUS';
    evidence_id: string | null;
    confidence: number | null;
}

export class ClaimValidator {
    
    validate(claims: LLMClaim[], factPack: FactPack): ValidatedClaim[] {
        const validated: ValidatedClaim[] = [];

        for (const claim of claims) {
            let matchedFact: { value: string, confidence: number, evidence_id: string } | undefined;

            if (claim.claim_type === 'NAME') matchedFact = factPack.name;
            else if (claim.claim_type === 'COMPANY') matchedFact = factPack.company;
            else if (claim.claim_type === 'ROLE') matchedFact = factPack.role;
            else if (claim.claim_type === 'INDUSTRY') matchedFact = factPack.industry;

            if (!matchedFact) {
                // LLM claimed something that wasn't in the fact pack!
                validated.push({
                    ...claim,
                    validation_status: 'UNSUPPORTED',
                    evidence_id: null,
                    confidence: null
                });
            } else {
                // In a real AI validation, we would use an LLM or embeddings to compare semantic similarity.
                // For the dummy, we do a simple substring/exact check.
                const isSupported = claim.claim_text.toLowerCase() === matchedFact.value.toLowerCase() || 
                                    matchedFact.value.toLowerCase().includes(claim.claim_text.toLowerCase());

                validated.push({
                    ...claim,
                    validation_status: isSupported ? 'SUPPORTED' : 'UNSUPPORTED',
                    evidence_id: matchedFact.evidence_id,
                    confidence: matchedFact.confidence
                });
            }
        }

        return validated;
    }
}
