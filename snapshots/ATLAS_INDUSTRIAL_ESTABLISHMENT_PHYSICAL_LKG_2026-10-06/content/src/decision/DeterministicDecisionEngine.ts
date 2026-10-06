import crypto from 'crypto';

export interface CandidateContext {
    candidateId: string;
    
    // Phase 9A gate
    audienceMatchStatus: 'MATCH' | 'NOT_MATCH' | 'EXPIRED' | 'MISSING';
    
    // Hard Gates
    identityResolved: boolean;
    unresolvedDuplicate: boolean;
    evidenceSufficient: boolean;
    evidenceConflict: boolean;
    contactUsable: boolean;
    
    // External authoritative gates
    isSuppressed: boolean;
    complianceStatus: 'PASS' | 'REVIEW_REQUIRED' | 'BLOCKED';
    
    // Scoring signals (raw values to be scored)
    // Scale 0-100 or specific enumerated metrics
    icpFitScore: number;          // 0-25
    roleFitScore: number;         // 0-20
    companyFitScore: number;      // 0-15
    evidenceStrength: number;     // 0-15
    evidenceFreshness: number;    // 0-10
    contactVerification: number;  // 0-10
    priorLegitimateEngagement: number; // 0-5
}

export interface DecisionResult {
    decision: 'CONTACT_NOW' | 'REVIEW_REQUIRED' | 'DO_NOT_CONTACT';
    priority_score: number | null;
    priority_tier: 'PRIORITY_A' | 'PRIORITY_B' | 'PRIORITY_C' | 'LOW_PRIORITY' | null;
    hard_gates_passed: boolean;
    gate_results: Record<string, boolean | string>;
    decision_reasons: string[];
    blocking_reasons: string[];
    score_components: Record<string, number>;
    decision_policy_version: string;
    scoring_version: string;
    decision_hash: string;
}

export class DeterministicDecisionEngine {
    private policyVersion = 'decision_v1';
    private scoringVersion = 'priority_v1';

    public evaluate(context: CandidateContext): DecisionResult {
        const gate_results: Record<string, boolean | string> = {};
        const blocking_reasons: string[] = [];
        const decision_reasons: string[] = [];
        
        let decision: 'CONTACT_NOW' | 'REVIEW_REQUIRED' | 'DO_NOT_CONTACT' = 'CONTACT_NOW';
        
        // 1. Audience Match Gate
        gate_results.audience_match = context.audienceMatchStatus;
        if (context.audienceMatchStatus !== 'MATCH') {
            decision = 'DO_NOT_CONTACT';
            blocking_reasons.push(`AUDIENCE_${context.audienceMatchStatus}`);
        }

        // 2. Suppression Gate
        gate_results.suppressed = context.isSuppressed;
        if (context.isSuppressed) {
            decision = 'DO_NOT_CONTACT';
            blocking_reasons.push('CURRENT_SUPPRESSION');
        }

        // 3. Compliance Gate
        gate_results.compliance = context.complianceStatus;
        if (context.complianceStatus === 'BLOCKED') {
            decision = 'DO_NOT_CONTACT';
            blocking_reasons.push('COMPLIANCE_BLOCKED');
        } else if (context.complianceStatus === 'REVIEW_REQUIRED' && decision !== 'DO_NOT_CONTACT') {
            decision = 'REVIEW_REQUIRED';
            blocking_reasons.push('COMPLIANCE_REVIEW_REQUIRED');
        }

        // 4. Identity & Duplicates
        gate_results.identity_resolved = context.identityResolved;
        if (!context.identityResolved && decision !== 'DO_NOT_CONTACT') {
            decision = 'REVIEW_REQUIRED';
            blocking_reasons.push('IDENTITY_UNRESOLVED');
        }
        
        gate_results.unresolved_duplicate = context.unresolvedDuplicate;
        if (context.unresolvedDuplicate && decision !== 'DO_NOT_CONTACT') {
            decision = 'REVIEW_REQUIRED';
            blocking_reasons.push('UNRESOLVED_DUPLICATE');
        }

        // 5. Evidence
        gate_results.evidence_sufficient = context.evidenceSufficient;
        if (!context.evidenceSufficient && decision !== 'DO_NOT_CONTACT') {
            decision = 'REVIEW_REQUIRED';
            blocking_reasons.push('EVIDENCE_INSUFFICIENT');
        }
        
        gate_results.evidence_conflict = context.evidenceConflict;
        if (context.evidenceConflict && decision !== 'DO_NOT_CONTACT') {
            decision = 'REVIEW_REQUIRED';
            blocking_reasons.push('EVIDENCE_CONFLICT');
        }

        // 6. Contact Usability
        gate_results.contact_usable = context.contactUsable;
        if (!context.contactUsable && decision !== 'DO_NOT_CONTACT') {
            decision = 'REVIEW_REQUIRED';
            blocking_reasons.push('CONTACT_UNUSABLE');
        }

        const hard_gates_passed = decision === 'CONTACT_NOW';

        // Priority Scoring
        let priority_score: number | null = null;
        let priority_tier: 'PRIORITY_A' | 'PRIORITY_B' | 'PRIORITY_C' | 'LOW_PRIORITY' | null = null;
        const score_components: Record<string, number> = {};

        if (hard_gates_passed) {
            // Apply bounds to inputs just in case
            score_components.icp_fit = Math.min(25, Math.max(0, context.icpFitScore));
            score_components.role_fit = Math.min(20, Math.max(0, context.roleFitScore));
            score_components.company_fit = Math.min(15, Math.max(0, context.companyFitScore));
            score_components.evidence_strength = Math.min(15, Math.max(0, context.evidenceStrength));
            score_components.evidence_freshness = Math.min(10, Math.max(0, context.evidenceFreshness));
            score_components.contact_verification = Math.min(10, Math.max(0, context.contactVerification));
            score_components.prior_engagement = Math.min(5, Math.max(0, context.priorLegitimateEngagement));

            priority_score = Object.values(score_components).reduce((a, b) => a + b, 0);

            if (priority_score >= 90) priority_tier = 'PRIORITY_A';
            else if (priority_score >= 75) priority_tier = 'PRIORITY_B';
            else if (priority_score >= 50) priority_tier = 'PRIORITY_C';
            else priority_tier = 'LOW_PRIORITY';
            
            decision_reasons.push('All hard gates passed');
            decision_reasons.push(`Score: ${priority_score}/100 -> ${priority_tier}`);
        } else {
            decision_reasons.push('Failed one or more hard gates');
        }

        const rawDataToHash = {
            candidateId: context.candidateId,
            gate_results,
            priority_score,
            decision_policy_version: this.policyVersion,
            scoring_version: this.scoringVersion
        };
        const decision_hash = crypto.createHash('sha256').update(JSON.stringify(rawDataToHash)).digest('hex');

        return {
            decision,
            priority_score,
            priority_tier,
            hard_gates_passed,
            gate_results,
            decision_reasons,
            blocking_reasons,
            score_components,
            decision_policy_version: this.policyVersion,
            scoring_version: this.scoringVersion,
            decision_hash
        };
    }
}
