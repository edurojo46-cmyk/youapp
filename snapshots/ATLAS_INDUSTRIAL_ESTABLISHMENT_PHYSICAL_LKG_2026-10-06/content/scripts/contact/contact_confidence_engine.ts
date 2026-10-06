import { PersonCandidate, Evidence } from './sources/contact_source_adapter';

export enum ConfidenceLevel {
    HIGH_CONFIDENCE = 'HIGH_CONFIDENCE',
    CONTACT_READY = 'CONTACT_READY',
    REVIEW_REQUIRED = 'REVIEW_REQUIRED',
    REJECTED = 'REJECTED'
}

export interface ScoringResult {
    score: number;
    level: ConfidenceLevel;
    hard_gates_passed: boolean;
    promotion_eligible: boolean;
    reasons: string[];
}

export class ContactConfidenceEngine {
    
    evaluate(person: PersonCandidate, identityResolved: boolean, duplicateStatus: string, isSuppressed: boolean = false): ScoringResult {
        let score = 0;
        const reasons: string[] = [];

        // Base Scoring
        const hasName = !!person.full_name;
        const hasCompany = !!person.company_name;
        const hasRole = !!person.job_title;
        const hasEmail = !!person.email;

        if (hasName && person.evidence.some(e => e.field === 'full_name' || e.field === 'name')) score += 0.15;
        if (hasCompany && person.evidence.some(e => e.field === 'company_name' || e.field === 'company')) score += 0.20;
        if (hasRole && person.evidence.some(e => e.field === 'job_title' || e.field === 'role')) score += 0.20;
        if (hasEmail && person.evidence.some(e => e.field === 'email')) score += 0.20;
        if (hasEmail && person.evidence.some(e => e.field === 'email_verification')) score += 0.15;
        
        // Add source recency if applicable (simplified for test)
        if (person.evidence.length > 0) {
            score += 0.10;
        }

        // We can trust the dummy source adapter to return > 0.75 for good cases, 
        // but let's base our actual score on the engine's calculation.
        // Or if we want to honor the adapter's base confidence as a starting point:
        if (score === 0 && person.confidence > 0) {
            score = person.confidence;
        }

        let level = ConfidenceLevel.REJECTED;
        if (score >= 0.90) level = ConfidenceLevel.HIGH_CONFIDENCE;
        else if (score >= 0.75) level = ConfidenceLevel.CONTACT_READY;
        else if (score >= 0.50) level = ConfidenceLevel.REVIEW_REQUIRED;

        // HARD GATES
        // 1. confidence >= 0.75 (implied by level)
        // 2. identity_resolved = TRUE
        // 3. unresolved_contradiction = FALSE
        // 4. evidence_count >= 1
        // 5. source_traceability = TRUE (meaning all evidences have source_url)
        // 6. duplicate_status != REVIEW
        // 7. is_suppressed = FALSE

        const hasContradiction = this.checkContradictions(person.evidence);
        const hasTraceability = person.evidence.length > 0 && person.evidence.every(e => e.source_url && e.source_url !== '');
        
        let hardGatesPassed = true;

        
        if (score < 0.75) { hardGatesPassed = false; reasons.push("Score below 0.75"); }
        if (!identityResolved) { hardGatesPassed = false; reasons.push("Identity not resolved"); }
        if (hasContradiction) { hardGatesPassed = false; reasons.push("Unresolved contradiction in evidence"); }
        if (person.evidence.length < 1) { hardGatesPassed = false; reasons.push("No evidence provided"); }
        if (!hasTraceability) { hardGatesPassed = false; reasons.push("Missing source traceability"); }
        if (duplicateStatus === 'REVIEW') { hardGatesPassed = false; reasons.push("Duplicate status requires review"); }
        if (isSuppressed) { hardGatesPassed = false; reasons.push("Contact is suppressed"); }

        
        if (hasEmail) {
            // Simulated: if email is present, must be verified/evidenced
            const emailEvidenced = person.evidence.some(e => e.field === 'email');
            if (!emailEvidenced) {
                hardGatesPassed = false;
                reasons.push("Email exists but lacks evidence");
            }
        }

        return {
            score,
            level,
            hard_gates_passed: hardGatesPassed,
            promotion_eligible: hardGatesPassed, // Final decision
            reasons
        };
    }

    private checkContradictions(evidence: Evidence[]): boolean {
        // Group by field
        const grouped: Record<string, string[]> = {};
        for (const e of evidence) {
            if (!grouped[e.field]) grouped[e.field] = [];
            grouped[e.field].push(e.value.toLowerCase());
        }
        
        // If a field has two different values, it's contradictory
        for (const field in grouped) {
            const values = new Set(grouped[field]);
            if (values.size > 1) return true;
        }
        return false;
    }
}
