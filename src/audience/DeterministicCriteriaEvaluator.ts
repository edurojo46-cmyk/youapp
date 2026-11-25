import { RegistryAttribute } from './AudienceCriteriaNormalizer';

export interface CandidateEvidence {
    attribute: string;
    value: any;
    assertion_type: string;
    source_type?: string;
    observed_at: string;
    expires_at?: string;
}

export interface EvaluatedCriterion {
    attribute: string;
    operator: string;
    expected_value: any;
    required: boolean;
    state: 'CONFIRMED_MATCH' | 'CONFIRMED_NOT_MATCH' | 'UNKNOWN' | 'CONFLICT';
    reason?: string;
}

export interface EvaluationResult {
    match_status: 'MATCH' | 'NOT_MATCH';
    evaluation_state: 'COMPLETE' | 'INCOMPLETE' | 'CONFLICT' | 'REVIEW_REQUIRED';
    criteria_total: number;
    criteria_confirmed: number;
    criteria_not_match: number;
    criteria_unknown: number;
    criteria_conflict: number;
    evaluation_reasons: any[];
    evaluation_version: string;
    criteria_hash: string;
    details: EvaluatedCriterion[];
}

export class DeterministicCriteriaEvaluator {
    private version = '1.0';

    constructor(private registry: Record<string, RegistryAttribute>) {}

    public evaluate(
        criteriaSpec: any,
        criteriaHash: string,
        evidence: CandidateEvidence[]
    ): EvaluationResult {
        const now = new Date().toISOString();
        
        // Group valid evidence by attribute
        const evidenceByAttr: Record<string, CandidateEvidence[]> = {};
        for (const e of evidence) {
            // Check expiration
            if (e.expires_at && e.expires_at < now) {
                continue; // Ignore expired evidence
            }
            if (!evidenceByAttr[e.attribute]) {
                evidenceByAttr[e.attribute] = [];
            }
            evidenceByAttr[e.attribute].push(e);
        }

        const criteria = criteriaSpec.criteria || [];
        const details: EvaluatedCriterion[] = [];
        
        let match_status: 'MATCH' | 'NOT_MATCH' = 'MATCH';
        let evaluation_state: 'COMPLETE' | 'INCOMPLETE' | 'CONFLICT' | 'REVIEW_REQUIRED' = 'COMPLETE';
        const evaluation_reasons: any[] = [];
        
        let criteria_confirmed = 0;
        let criteria_not_match = 0;
        let criteria_unknown = 0;
        let criteria_conflict = 0;

        for (const c of criteria) {
            const reg = this.registry[c.attribute];
            const attrEvidences = evidenceByAttr[c.attribute] || [];
            
            let state: 'CONFIRMED_MATCH' | 'CONFIRMED_NOT_MATCH' | 'UNKNOWN' | 'CONFLICT' = 'UNKNOWN';
            let reason = '';

            if (attrEvidences.length === 0) {
                state = 'UNKNOWN';
                reason = 'NO_VALID_EVIDENCE';
            } else {
                // Check for conflict among sources
                const uniqueValues = new Set(attrEvidences.map(e => JSON.stringify(e.value)));
                if (uniqueValues.size > 1) {
                    state = 'CONFLICT';
                    reason = 'CONTRADICTORY_SOURCES';
                } else {
                    const e = attrEvidences[0]; // All agree, just take first
                    
                    // Check INFERRED restriction for personal attributes
                    if (e.assertion_type === 'INFERRED' && c.required && reg && reg.entity_type === 'PERSON') {
                        // User constraint: Inferred values cannot silently satisfy mandatory personal criteria
                        state = 'UNKNOWN';
                        reason = 'INFERRED_PERSONAL_ATTRIBUTE_NOT_ALLOWED';
                    } else {
                        // Evaluate operator
                        const isMatch = this.evaluateOperator(e.value, c.operator, c.expected_value);
                        state = isMatch ? 'CONFIRMED_MATCH' : 'CONFIRMED_NOT_MATCH';
                    }
                }
            }

            // Apply invariant logic
            if (c.required) {
                if (state === 'UNKNOWN') {
                    match_status = 'NOT_MATCH';
                    if (evaluation_state === 'COMPLETE') evaluation_state = 'INCOMPLETE';
                    evaluation_reasons.push({ attribute: c.attribute, reason: 'MANDATORY_CRITERION_UNKNOWN', detail: reason });
                } else if (state === 'CONFLICT') {
                    match_status = 'NOT_MATCH';
                    evaluation_state = 'CONFLICT';
                    evaluation_reasons.push({ attribute: c.attribute, reason: 'MANDATORY_CRITERION_CONFLICT', detail: reason });
                } else if (state === 'CONFIRMED_NOT_MATCH') {
                    match_status = 'NOT_MATCH';
                    evaluation_reasons.push({ attribute: c.attribute, reason: 'MANDATORY_CRITERION_FAILED' });
                }
            }

            // Stats update
            if (state === 'CONFIRMED_MATCH') criteria_confirmed++;
            else if (state === 'CONFIRMED_NOT_MATCH') criteria_not_match++;
            else if (state === 'UNKNOWN') criteria_unknown++;
            else if (state === 'CONFLICT') criteria_conflict++;

            details.push({
                attribute: c.attribute,
                operator: c.operator,
                expected_value: c.expected_value,
                required: c.required,
                state,
                reason
            });
        }

        return {
            match_status,
            evaluation_state,
            criteria_total: criteria.length,
            criteria_confirmed,
            criteria_not_match,
            criteria_unknown,
            criteria_conflict,
            evaluation_reasons,
            evaluation_version: this.version,
            criteria_hash: criteriaHash,
            details
        };
    }

    private evaluateOperator(actual: any, operator: string, expected: any): boolean {
        switch(operator) {
            case 'EQ': return actual === expected;
            case 'NEQ': return actual !== expected;
            case 'IN': return Array.isArray(expected) && expected.includes(actual);
            case 'NOT_IN': return Array.isArray(expected) && !expected.includes(actual);
            case 'GT': return actual > expected;
            case 'GTE': return actual >= expected;
            case 'LT': return actual < expected;
            case 'LTE': return actual <= expected;
            case 'BETWEEN': return Array.isArray(expected) && expected.length === 2 && actual >= expected[0] && actual <= expected[1];
            case 'EXISTS': return actual !== undefined && actual !== null;
            default: return false;
        }
    }
}
